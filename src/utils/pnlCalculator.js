
/**
 * Calculates P&L metrics for a set of transactions using FIFO (First-In, First-Out) method.
 * 
 * @param {Array} transactions - List of transaction objects.
 * @param {number} currentPrice - Current market price of the asset.
 * @returns {Object} - { realizedPnL, unrealizedPnL, totalPnL, holdings, avgBuyPrice }
 */
export const calculateAssetPnL = (transactions, currentPrice) => {
    if (!transactions || transactions.length === 0) {
        return { realizedPnL: 0, unrealizedPnL: 0, totalPnL: 0, holdings: 0, avgBuyPrice: 0 };
    }

    // Sort transactions by date (oldest first)
    const sortedTx = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    let holdings = 0;
    let realizedPnL = 0;
    let costBasisQueue = []; // Queue to track buy lots: { amount, price }

    sortedTx.forEach(tx => {
        const amount = parseFloat(tx.amount);
        const price = parseFloat(tx.price);

        if (tx.type === 'buy') {
            holdings += amount;
            costBasisQueue.push({ amount, price });
        } else if (tx.type === 'sell') {
            let amountToSell = amount;
            let sellRevenue = amount * price;
            let costOfSold = 0;

            // FIFO Logic: Consume from the oldest buy lots
            while (amountToSell > 0 && costBasisQueue.length > 0) {
                const oldestLot = costBasisQueue[0];

                if (oldestLot.amount <= amountToSell) {
                    // Consume entire lot
                    costOfSold += oldestLot.amount * oldestLot.price;
                    amountToSell -= oldestLot.amount;
                    costBasisQueue.shift(); // Remove empty lot
                } else {
                    // Consume partial lot
                    costOfSold += amountToSell * oldestLot.price;
                    oldestLot.amount -= amountToSell; // Update remaining amount in lot
                    amountToSell = 0;
                }
            }

            // If we sold more than we have recorded in queue (shouldn't happen with validation, but safe to handle)
            // We assume cost basis of 0 for the excess (or handle as error, but 0 is safer for display)

            realizedPnL += (sellRevenue - costOfSold);
            holdings -= amount;
        }
    });

    // Calculate Unrealized P&L for remaining holdings
    // Cost basis of remaining holdings is the sum of (amount * price) of items left in queue
    let totalCostBasisRemaining = 0;
    let totalAmountRemaining = 0;

    costBasisQueue.forEach(lot => {
        totalCostBasisRemaining += lot.amount * lot.price;
        totalAmountRemaining += lot.amount;
    });

    // Sanity check: totalAmountRemaining should roughly equal holdings (floating point errors possible)

    const marketValue = holdings * currentPrice;
    const unrealizedPnL = marketValue - totalCostBasisRemaining;
    const avgBuyPrice = holdings > 0 ? totalCostBasisRemaining / holdings : 0;

    return {
        realizedPnL,
        unrealizedPnL,
        totalPnL: realizedPnL + unrealizedPnL,
        holdings,
        avgBuyPrice
    };
};

/**
 * Calculates Portfolio-wide P&L metrics.
 * 
 * @param {Array} allTransactions - Flat list of all transactions for all assets.
 * @param {Object} priceMap - Map of ticker -> currentPrice.
 * @returns {Object} - { realizedPnL, unrealizedPnL, totalPnL }
 */
export const calculatePortfolioPnL = (allTransactions, priceMap) => {
    const assets = {};

    // Group transactions by asset
    allTransactions.forEach(tx => {
        if (!assets[tx.asset]) {
            assets[tx.asset] = [];
        }
        assets[tx.asset].push(tx);
    });

    let portfolioRealized = 0;
    let portfolioUnrealized = 0;

    Object.keys(assets).forEach(ticker => {
        const currentPrice = priceMap[ticker] || 0;
        const { realizedPnL, unrealizedPnL } = calculateAssetPnL(assets[ticker], currentPrice);
        portfolioRealized += realizedPnL;
        portfolioUnrealized += unrealizedPnL;
    });

    return {
        realizedPnL: portfolioRealized,
        unrealizedPnL: portfolioUnrealized,
        totalPnL: portfolioRealized + portfolioUnrealized
    };
};
