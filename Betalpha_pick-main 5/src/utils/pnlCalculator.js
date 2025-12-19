/**
 * Caclulates P&L using STRICT Moving Weighted Average Cost (WAC) method.
 *
 * Core Variables maintained:
 * 1. currentQty (Holdings)
 * 2. totalCost (Unrealized Cost Basis)
 * 3. avgCost (Moving Average Price)
 * 4. realizedPnL (Realized Profit/Loss)
 *
 * Sorting Rules (Critical):
 * 1. Timestamp (Ascending)
 * 2. BUY before SELL (if timestamp same)
 * 3. ID (Deterministic tie-breaker)
 */
export const calculateAssetPnL = (transactions, currentPrice) => {
    if (!transactions || transactions.length === 0) {
        return { realizedPnL: 0, unrealizedPnL: 0, totalPnL: 0, holdings: 0, avgBuyPrice: 0, totalCost: 0 };
    }

    // 1. Strict Stable Sort
    const sortedTx = [...transactions].sort((a, b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();

        // Level 1: Primary Date/Time
        if (dateA !== dateB) {
            return dateA - dateB;
        }

        // Level 2: CreatedAt (if available) - refined timestamp
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (createdA !== createdB) {
            return createdA - createdB;
        }

        // Level 3: BUY before SELL (Inventory must exist before disposal)
        if (a.type === 'buy' && b.type !== 'buy') return -1;
        if (a.type !== 'buy' && b.type === 'buy') return 1;

        // Level 4: ID Tie-breaker (Deterministic Fallback)
        if (a.id && b.id) {
            return a.id.localeCompare(b.id);
        }
        return 0;
    });

    // 2. State Variables
    let currentQty = 0;
    let totalCost = 0;
    let realizedPnL = 0;
    let avgCost = 0;

    // 3. Sequential Processing
    sortedTx.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0;
        const price = parseFloat(tx.price) || 0;

        if (tx.type === 'buy') {
            // [WAC Algorithm - BUY Logic]
            // 1. Add Cost
            totalCost += (amount * price);
            // 2. Add Qty
            currentQty += amount;
            // 3. Recalculate Avg Cost
            if (currentQty > 0) {
                avgCost = totalCost / currentQty;
            }

        } else if (tx.type === 'sell') {
            // [WAC Algorithm - SELL Logic]
            // 1. Calculate Realized PnL (vs Current Avg Cost)
            realizedPnL += (price - avgCost) * amount;

            // 2. Remove Cost Basis (Avg Cost * Qty Sold)
            const costRemoved = avgCost * amount;
            totalCost -= costRemoved;

            // 3. Reduce Qty
            currentQty -= amount;

            // 4. Avg Cost remains UNCHANGED
        }
    });

    // Safety checks for floating point precision
    if (currentQty <= 1e-9) {
        currentQty = 0;
        totalCost = 0; // Reset cost if holdings are empty
        avgCost = 0;   // Reset avg if holdings are empty
    }

    // 4. Final Unrealized Calc
    const marketValue = currentQty * currentPrice;
    const unrealizedPnL = marketValue - totalCost;

    return {
        realizedPnL,
        unrealizedPnL,
        totalPnL: realizedPnL + unrealizedPnL,
        holdings: currentQty,
        avgBuyPrice: avgCost,
        totalCost: totalCost
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
