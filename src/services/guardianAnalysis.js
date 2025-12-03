import { RSI } from 'technicalindicators';

/**
 * Analyze maximum risk for an asset based on holding cost and support levels
 * @param {string} symbol - Asset symbol
 * @param {Array} transactions - User's transactions for this asset
 * @param {number} currentPrice - Current market price
 * @returns {Promise<Object>} Risk analysis object
 */
export async function analyzeMaximumRisk(symbol, transactions, currentPrice) {
    try {
        // Calculate average holding cost
        const buyTransactions = transactions.filter(tx => tx.type === 'buy');

        if (buyTransactions.length === 0) {
            return {
                hasRisk: false,
                message: "No buy transactions found for risk analysis."
            };
        }

        let totalCost = 0;
        let totalAmount = 0;

        buyTransactions.forEach(tx => {
            totalCost += tx.amount * tx.price;
            totalAmount += tx.amount;
        });

        const avgHoldingCost = totalAmount > 0 ? totalCost / totalAmount : 0;

        // Get historical data for support level analysis
        // Use marketDataServiceNew for robust fallback (CoinGecko -> Binance -> GeckoTerminal)
        const { fetchOHLC } = await import('./marketDataServiceNew');
        const ohlcResult = await fetchOHLC(symbol, '1d');

        // Convert OHLC [time, open, high, low, close] to [time, price] format
        const historicalData = ohlcResult.data.map(candle => [candle[0], candle[4]]);

        let supportLevel = null;
        if (historicalData.length >= 7) {
            const recentPrices = historicalData.slice(-7).map(([_, price]) => price);
            supportLevel = Math.min(...recentPrices);
        }

        // Determine psychological support (could be user-defined in future)
        const psychologicalSupport = avgHoldingCost * 0.95; // 5% below holding cost

        // Check if price has broken below support
        const isBelowSupport = currentPrice < psychologicalSupport;
        const isBelowHoldingCost = currentPrice < avgHoldingCost;

        if (isBelowSupport) {
            const dropPercent = ((avgHoldingCost - currentPrice) / avgHoldingCost * 100).toFixed(1);
            return {
                hasRisk: true,
                level: 'high',
                message: `${symbol}: Holding cost $${avgHoldingCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, currently below your psychological support at $${psychologicalSupport.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (-${dropPercent}%)`,
                avgCost: avgHoldingCost,
                supportLevel: psychologicalSupport,
                currentPrice
            };
        } else if (isBelowHoldingCost) {
            const dropPercent = ((avgHoldingCost - currentPrice) / avgHoldingCost * 100).toFixed(1);
            return {
                hasRisk: true,
                level: 'medium',
                message: `${symbol}: Current price $${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is below holding cost $${avgHoldingCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (-${dropPercent}%)`,
                avgCost: avgHoldingCost,
                supportLevel: psychologicalSupport,
                currentPrice
            };
        } else {
            const gainPercent = ((currentPrice - avgHoldingCost) / avgHoldingCost * 100).toFixed(1);
            return {
                hasRisk: false,
                level: 'low',
                message: `${symbol}: Current price $${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} is above holding cost (+${gainPercent}%), risk is manageable`,
                avgCost: avgHoldingCost,
                supportLevel: psychologicalSupport,
                currentPrice
            };
        }

    } catch (error) {
        console.error('Error analyzing maximum risk:', error);
        return {
            hasRisk: false,
            message: "Risk analysis temporarily unavailable."
        };
    }
}

/**
 * Analyze profit target based on historical successful trades
 * @param {string} symbol - Asset symbol
 * @param {Array} transactions - User's transactions for this asset
 * @param {number} currentPrice - Current market price
 * @returns {Object} Profit target analysis
 */
export function analyzeProfitTarget(symbol, transactions, currentPrice) {
    try {
        // Find successful trades (buy-sell pairs with profit)
        const buyTransactions = transactions.filter(tx => tx.type === 'buy');
        const sellTransactions = transactions.filter(tx => tx.type === 'sell');

        if (buyTransactions.length === 0) {
            return {
                hasTarget: false,
                message: "No transaction history for profit analysis."
            };
        }

        // Calculate average buy cost
        let totalCost = 0;
        let totalAmount = 0;
        buyTransactions.forEach(tx => {
            totalCost += tx.amount * tx.price;
            totalAmount += tx.amount;
        });
        const avgBuyPrice = totalAmount > 0 ? totalCost / totalAmount : 0;

        // If there are sell transactions, calculate historical profit ratios
        let avgProfitRatio = 0.25; // Default 25% profit target
        let successfulTradesCount = 0;

        if (sellTransactions.length > 0) {
            let totalProfitRatio = 0;

            sellTransactions.forEach(sellTx => {
                // Find corresponding buy transactions (simplified - assumes FIFO)
                const correspondingBuys = buyTransactions.filter(buyTx =>
                    new Date(buyTx.date) < new Date(sellTx.date)
                );

                if (correspondingBuys.length > 0) {
                    const avgBuyForSell = correspondingBuys.reduce((sum, tx) => sum + tx.price, 0) / correspondingBuys.length;
                    const profitRatio = (sellTx.price - avgBuyForSell) / avgBuyForSell;

                    if (profitRatio > 0) {
                        totalProfitRatio += profitRatio;
                        successfulTradesCount++;
                    }
                }
            });

            if (successfulTradesCount > 0) {
                avgProfitRatio = totalProfitRatio / successfulTradesCount;
            }
        }

        const targetPrice = avgBuyPrice * (1 + avgProfitRatio);
        const currentGainPercent = ((currentPrice - avgBuyPrice) / avgBuyPrice * 100).toFixed(1);
        const targetGainPercent = (avgProfitRatio * 100).toFixed(0);

        // Calculate suggested reduction percentage
        const reductionPercent = currentPrice >= targetPrice ? 20 : 10;

        if (successfulTradesCount >= 3) {
            return {
                hasTarget: true,
                message: `${symbol}: Consider trimming ${reductionPercent}% at $${targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, based on your ${successfulTradesCount} successful trades' average profit (+${targetGainPercent}%)`,
                targetPrice,
                currentPrice,
                avgBuyPrice,
                reductionPercent,
                historicalTrades: successfulTradesCount
            };
        } else {
            return {
                hasTarget: true,
                message: `${symbol}: Consider trimming ${reductionPercent}% at $${targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (target profit +${targetGainPercent}%, current ${currentGainPercent >= 0 ? '+' : ''}${currentGainPercent}%)`,
                targetPrice,
                currentPrice,
                avgBuyPrice,
                reductionPercent,
                historicalTrades: successfulTradesCount
            };
        }

    } catch (error) {
        console.error('Error analyzing profit target:', error);
        return {
            hasTarget: false,
            message: "Profit target analysis temporarily unavailable."
        };
    }
}

/**
 * Analyze potential opportunities using pattern matching
 * @param {string} symbol - Asset symbol
 * @param {Array} transactions - User's transactions for this asset
 * @param {number} currentPrice - Current market price
 * @returns {Promise<Object>} Opportunity analysis
 */
export async function analyzePotentialOpportunity(symbol, transactions, currentPrice) {
    try {
        // Get historical price data
        const { fetchOHLC } = await import('./marketDataServiceNew');
        const ohlcResult = await fetchOHLC(symbol, '1d');
        const historicalData = ohlcResult.data.map(candle => [candle[0], candle[4]]);

        if (historicalData.length < 14) {
            return {
                hasOpportunity: false,
                message: "Insufficient data for opportunity analysis."
            };
        }

        const prices = historicalData.map(([_, price]) => price);

        // Calculate current RSI
        const rsiValues = RSI.calculate({ values: prices, period: 14 });
        const currentRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;

        // Find successful buy transactions
        const successfulBuys = transactions.filter(tx => tx.type === 'buy');

        if (successfulBuys.length === 0) {
            return {
                hasOpportunity: false,
                message: "No historical trades for pattern matching."
            };
        }

        // Pattern matching: Check if current conditions match past successful buys
        // For simplicity, we'll check RSI oversold conditions
        let matchingPattern = null;

        for (const buyTx of successfulBuys) {
            // Check if this was a successful trade (price went up after buy)
            const buyPrice = buyTx.price;
            const priceIncrease = ((currentPrice - buyPrice) / buyPrice * 100);

            // If RSI is oversold (< 35) similar to past successful entries
            if (currentRSI && currentRSI < 35) {
                // Find a successful trade reference (e.g., SOL mentioned in requirements)
                const referenceAsset = buyTx.asset;
                matchingPattern = {
                    type: 'oversold',
                    referenceAsset,
                    referenceDate: buyTx.date,
                    message: `${symbol}: RSI entered oversold zone (${currentRSI.toFixed(1)}), matching the technical environment when you successfully bought ${referenceAsset} last week`
                };
                break;
            }
        }

        // Check for other patterns
        if (!matchingPattern) {
            // Check if price is near recent lows (potential bounce)
            const recentLow = Math.min(...prices.slice(-7));
            const nearLow = currentPrice <= recentLow * 1.02;

            if (nearLow && currentRSI && currentRSI < 45) {
                matchingPattern = {
                    type: 'support_bounce',
                    message: `${symbol}: Price near recent low $${recentLow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}, RSI ${currentRSI.toFixed(1)}, potential bounce opportunity`
                };
            }
        }

        if (matchingPattern) {
            return {
                hasOpportunity: true,
                ...matchingPattern,
                currentRSI,
                currentPrice
            };
        } else {
            return {
                hasOpportunity: false,
                message: `${symbol}: No clear opportunity signals detected in current market conditions`,
                currentRSI,
                currentPrice
            };
        }

    } catch (error) {
        console.error('Error analyzing potential opportunity:', error);
        return {
            hasOpportunity: false,
            message: "Opportunity analysis temporarily unavailable."
        };
    }
}

/**
 * Calculate attention level for an asset
 * @param {Object} asset - Asset object with holdings, price, etc.
 * @param {Array} transactions - User's transactions for this asset
 * @param {number} currentPrice - Current market price
 * @returns {Promise<Object>} Attention level analysis
 */
export async function calculateAttentionLevel(asset, transactions, currentPrice) {
    try {
        // Calculate average buy price
        const buyTransactions = transactions.filter(tx => tx.type === 'buy' && tx.asset === asset.symbol);

        if (buyTransactions.length === 0) {
            return {
                level: 'none',
                label: 'No Attention Needed',
                color: 'green',
                reason: 'No position'
            };
        }

        let totalCost = 0;
        let totalAmount = 0;
        buyTransactions.forEach(tx => {
            totalCost += tx.amount * tx.price;
            totalAmount += tx.amount;
        });
        const avgBuyPrice = totalAmount > 0 ? totalCost / totalAmount : 0;

        // Calculate price deviation
        const priceDeviation = ((currentPrice - avgBuyPrice) / avgBuyPrice * 100);

        // Get technical data
        const { fetchOHLC } = await import('./marketDataServiceNew');
        const ohlcResult = await fetchOHLC(asset.symbol, '1d');
        const historicalData = ohlcResult.data.map(candle => [candle[0], candle[4]]);
        let currentRSI = null;

        if (historicalData.length >= 14) {
            const prices = historicalData.map(([_, price]) => price);
            const rsiValues = RSI.calculate({ values: prices, period: 14 });
            currentRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : null;
        }

        // Determine attention level
        // Extreme Attention: Large deviation (>20% or <-15%) or extreme RSI
        if (priceDeviation > 20 || priceDeviation < -15 || (currentRSI && (currentRSI > 75 || currentRSI < 25))) {
            return {
                level: 'extreme',
                label: 'Extreme Attention',
                color: 'red',
                reason: priceDeviation > 20
                    ? `Price up ${priceDeviation.toFixed(1)}%, approaching profit target`
                    : priceDeviation < -15
                        ? `Price down ${Math.abs(priceDeviation).toFixed(1)}%, far from entry price`
                        : currentRSI > 75
                            ? `RSI overbought (${currentRSI.toFixed(1)}), consider taking profits`
                            : `RSI oversold (${currentRSI.toFixed(1)}), may need stop-loss or add position`,
                priceDeviation,
                currentRSI
            };
        }

        // Attention Needed: Moderate deviation (10-20% or -5% to -15%)
        if ((priceDeviation >= 10 && priceDeviation <= 20) || (priceDeviation >= -15 && priceDeviation <= -5)) {
            return {
                level: 'needed',
                label: 'Attention Needed',
                color: 'yellow',
                reason: priceDeviation > 0
                    ? `Price up ${priceDeviation.toFixed(1)}%, consider partial profit-taking`
                    : `Price down ${Math.abs(priceDeviation).toFixed(1)}%, needs monitoring`,
                priceDeviation,
                currentRSI
            };
        }

        // No Attention: Stable, near buy price (-5% to 10%)
        return {
            level: 'none',
            label: 'No Attention Needed',
            color: 'green',
            reason: 'Price stable, near entry price',
            priceDeviation,
            currentRSI
        };

    } catch (error) {
        console.error('Error calculating attention level:', error);
        return {
            level: 'none',
            label: 'No Attention Needed',
            color: 'green',
            reason: 'Analysis unavailable'
        };
    }
}
