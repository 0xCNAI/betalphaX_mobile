import { RSI, SMA, EMA, MACD, BollingerBands } from 'technicalindicators';

/**
 * Analyze technical indicators for a given ticker
 * @param {string} ticker - The ticker symbol
 * @returns {Promise<Array<string>>} - Array of technical analysis reasons
 */
export async function analyzeTechnicals(ticker) {
    try {
        // Fetch 30 days of price data for indicators
        // Use marketDataServiceNew for robust fallback (CoinGecko -> Binance -> GeckoTerminal)
        const { fetchOHLC } = await import('./marketDataServiceNew');
        const ohlcResult = await fetchOHLC(ticker, '1d');

        // Convert OHLC [time, open, high, low, close] to prices array (close price)
        if (ohlcResult && ohlcResult.data && ohlcResult.data.length >= 14) {
            prices = ohlcResult.data.map(candle => candle[4]);
        }

        if (prices.length < 14) {
            // Not enough data for analysis
            return [
                "Insufficient historical data for technical analysis.",
                "New asset - technical indicators not yet available."
            ];
        }

        const currentPrice = prices[prices.length - 1];
        const reasons = [];

        // 1. RSI Analysis
        const rsiValues = RSI.calculate({
            values: prices,
            period: 14
        });

        if (rsiValues.length > 0) {
            const currentRSI = rsiValues[rsiValues.length - 1];

            if (currentRSI < 30) {
                reasons.push(`RSI at ${currentRSI.toFixed(1)} - oversold conditions detected.`);
            } else if (currentRSI > 70) {
                reasons.push(`RSI at ${currentRSI.toFixed(1)} - overbought territory.`);
            } else if (currentRSI < 40) {
                reasons.push(`RSI at ${currentRSI.toFixed(1)} - approaching oversold levels.`);
            } else if (currentRSI > 60) {
                reasons.push(`RSI at ${currentRSI.toFixed(1)} - strong momentum detected.`);
            }
        }

        // 2. Moving Average Analysis
        const sma50 = SMA.calculate({ period: 20, values: prices }); // Using 20 as proxy for 50
        const sma200 = SMA.calculate({ period: 30, values: prices }); // Using 30 as proxy for 200

        if (sma50.length > 0) {
            const currentSMA50 = sma50[sma50.length - 1];

            if (currentPrice > currentSMA50) {
                const percentAbove = ((currentPrice - currentSMA50) / currentSMA50 * 100).toFixed(1);
                reasons.push(`Price ${percentAbove}% above 50-day moving average.`);
            } else {
                reasons.push(`Price testing support at 50-day moving average.`);
            }
        }

        // 3. Golden Cross / Death Cross Detection
        if (sma50.length > 1 && sma200.length > 1) {
            const currentSMA50 = sma50[sma50.length - 1];
            const prevSMA50 = sma50[sma50.length - 2];
            const currentSMA200 = sma200[sma200.length - 1];
            const prevSMA200 = sma200[sma200.length - 2];

            // Golden Cross: 50 crosses above 200
            if (prevSMA50 <= prevSMA200 && currentSMA50 > currentSMA200) {
                reasons.push("Golden cross formation detected - bullish signal.");
            }
            // Death Cross: 50 crosses below 200
            else if (prevSMA50 >= prevSMA200 && currentSMA50 < currentSMA200) {
                reasons.push("Death cross formation - bearish signal.");
            }
        }

        // 4. Support/Resistance Analysis (from OHLC)
        // Use 4h candles for recent support/resistance
        const ohlc4hResult = await fetchOHLC(ticker, '4h');
        const ohlcData = ohlc4hResult.data || [];

        if (ohlcData.length > 0) {
            const highs = ohlcData.map(candle => candle[2]); // High prices
            const lows = ohlcData.map(candle => candle[3]);  // Low prices

            const recentHigh = Math.max(...highs);
            const recentLow = Math.min(...lows);

            // Check if price is near resistance
            if (currentPrice >= recentHigh * 0.98) {
                reasons.push(`Testing resistance at $${recentHigh.toFixed(2)}.`);
            }

            // Check if price is near support
            if (currentPrice <= recentLow * 1.02) {
                reasons.push(`Holding support at $${recentLow.toFixed(2)}.`);
            }

            // Breakout detection
            if (currentPrice > recentHigh) {
                const breakoutPercent = ((currentPrice - recentHigh) / recentHigh * 100).toFixed(1);
                reasons.push(`Breakout above recent high by ${breakoutPercent}%.`);
            }
        }

        // 5. Price Trend Analysis
        const recentPrices = prices.slice(-7); // Last 7 days
        const priceChange = ((recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0] * 100);

        if (priceChange > 10) {
            reasons.push(`Strong uptrend: +${priceChange.toFixed(1)}% over 7 days.`);
        } else if (priceChange < -10) {
            reasons.push(`Downtrend: ${priceChange.toFixed(1)}% over 7 days.`);
        }

        // 6. MACD Analysis
        const macdInput = {
            values: prices,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        };
        const macdResult = MACD.calculate(macdInput);

        if (macdResult.length > 0) {
            const currentMACD = macdResult[macdResult.length - 1];
            if (currentMACD.MACD > currentMACD.signal && currentMACD.histogram > 0) {
                reasons.push("MACD bullish crossover detected.");
            } else if (currentMACD.MACD < currentMACD.signal && currentMACD.histogram < 0) {
                reasons.push("MACD bearish crossover detected.");
            }
        }

        // 7. Bollinger Bands Analysis
        const bbInput = {
            period: 20,
            values: prices,
            stdDev: 2
        };
        const bbResult = BollingerBands.calculate(bbInput);

        if (bbResult.length > 0) {
            const currentBB = bbResult[bbResult.length - 1];
            // Price near lower band (potential buy)
            if (currentPrice <= currentBB.lower * 1.02) {
                reasons.push("Price near lower Bollinger Band - potential bounce.");
            }
            // Price near upper band (potential sell/overbought)
            if (currentPrice >= currentBB.upper * 0.98) {
                reasons.push("Price near upper Bollinger Band - potential resistance.");
            }
            // Band squeeze (volatility incoming)
            const bandWidth = (currentBB.upper - currentBB.lower) / currentBB.middle;
            if (bandWidth < 0.10) { // Arbitrary threshold for squeeze
                reasons.push("Bollinger Bands squeeze - expect volatility.");
            }
        }

        // If no specific signals, provide general analysis
        if (reasons.length === 0) {
            reasons.push("Price action showing consolidation pattern.");
            reasons.push("Technical indicators in neutral territory.");
        }

        // Limit to 5 most relevant reasons
        return reasons.slice(0, 5);

    } catch (error) {
        console.error('Error analyzing technicals:', error);
        // Fallback to generic reasons
        return [
            "Technical analysis temporarily unavailable.",
            "Price showing normal market behavior.",
            "Monitor key support and resistance levels."
        ];
    }
}

/**
 * Generate sell signals based on technical analysis
 * @param {string} ticker - The ticker symbol
 * @returns {Promise<Array<string>>} - Array of technical sell signals
 */
export async function generateSellSignals(ticker) {
    try {
        const { fetchOHLC } = await import('./marketDataServiceNew');
        const ohlcResult = await fetchOHLC(ticker, '1d');
        const historicalData = ohlcResult.data.map(candle => [candle[0], candle[4]]);

        if (historicalData.length < 14) {
            return [
                "Set stop loss at -10% from entry.",
                "Take profit at +20% gain.",
                "Monitor RSI for overbought conditions."
            ];
        }

        const prices = historicalData.map(([_, price]) => price);
        const signals = [];

        // RSI-based exit
        const rsiValues = RSI.calculate({ values: prices, period: 14 });
        if (rsiValues.length > 0) {
            const currentRSI = rsiValues[rsiValues.length - 1];
            if (currentRSI > 70) {
                signals.push(`Exit if RSI exceeds ${(currentRSI + 5).toFixed(0)} (overbought).`);
            }
        }

        // MA-based exit
        const sma50 = SMA.calculate({ period: 20, values: prices });
        if (sma50.length > 0) {
            signals.push("Exit if price breaks below 50-day MA.");
        }

        // Standard signals
        signals.push("Take profit at +25% gain.");
        signals.push("Stop loss at -15% from entry.");
        signals.push("Exit on death cross formation.");

        return signals.slice(0, 5);

    } catch (error) {
        console.error('Error generating sell signals:', error);
        return [
            "Set stop loss at -10%.",
            "Take profit at +20%.",
            "Monitor for trend reversal."
        ];
    }
}

/**
 * Analyze technical indicators for selling (opposite of buying signals)
 * @param {string} ticker - The ticker symbol
 * @returns {Promise<Array<string>>} - Array of technical sell reasons
 */
export async function analyzeSellTechnicals(ticker) {
    try {
        let prices = [];

        // Use marketDataServiceNew for robust fallback
        const { fetchOHLC } = await import('./marketDataServiceNew');
        const ohlcResult = await fetchOHLC(ticker, '1d');

        if (ohlcResult && ohlcResult.data && ohlcResult.data.length >= 14) {
            prices = ohlcResult.data.map(candle => candle[4]);
        }

        if (prices.length < 14) {
            return [
                "Insufficient historical data for technical analysis.",
                "Consider setting standard stop loss levels."
            ];
        }

        const currentPrice = prices[prices.length - 1];
        const reasons = [];

        // 1. RSI Analysis (for selling)
        const rsiValues = RSI.calculate({ values: prices, period: 14 });

        if (rsiValues.length > 0) {
            const currentRSI = rsiValues[rsiValues.length - 1];

            if (currentRSI > 70) {
                reasons.push(`RSI at ${currentRSI.toFixed(1)} - overbought, good time to take profits.`);
            } else if (currentRSI < 30) {
                reasons.push(`RSI at ${currentRSI.toFixed(1)} - oversold, may want to hold.`);
            } else if (currentRSI > 65) {
                reasons.push(`RSI at ${currentRSI.toFixed(1)} - approaching overbought levels.`);
            }
        }

        // 2. Moving Average Analysis (for selling)
        const sma50 = SMA.calculate({ period: 20, values: prices });
        const sma200 = SMA.calculate({ period: 30, values: prices });

        if (sma50.length > 0) {
            const currentSMA50 = sma50[sma50.length - 1];

            if (currentPrice < currentSMA50) {
                const percentBelow = ((currentSMA50 - currentPrice) / currentSMA50 * 100).toFixed(1);
                reasons.push(`Price ${percentBelow}% below 50-day MA - downtrend confirmed.`);
            } else {
                reasons.push(`Price still above 50-day MA - consider trailing stop.`);
            }
        }

        // 3. Death Cross Detection (bearish for selling)
        if (sma50.length > 1 && sma200.length > 1) {
            const currentSMA50 = sma50[sma50.length - 1];
            const prevSMA50 = sma50[sma50.length - 2];
            const currentSMA200 = sma200[sma200.length - 1];
            const prevSMA200 = sma200[sma200.length - 2];

            if (prevSMA50 >= prevSMA200 && currentSMA50 < currentSMA200) {
                reasons.push("Death cross detected - strong sell signal.");
            }
        }

        // 4. Resistance/Support Analysis (for selling)
        const ohlc4hResult = await fetchOHLC(ticker, '4h');
        const ohlcData = ohlc4hResult.data || [];

        if (ohlcData.length > 0) {
            const highs = ohlcData.map(candle => candle[2]);
            const lows = ohlcData.map(candle => candle[3]);

            const recentHigh = Math.max(...highs);
            const recentLow = Math.min(...lows);

            // Breakdown detection
            if (currentPrice < recentLow) {
                const breakdownPercent = ((recentLow - currentPrice) / recentLow * 100).toFixed(1);
                reasons.push(`Breakdown below support by ${breakdownPercent}% - exit signal.`);
            }

            // Near resistance (good sell point)
            if (currentPrice >= recentHigh * 0.98) {
                reasons.push(`Near resistance at $${recentHigh.toFixed(2)} - consider taking profits.`);
            }
        }

        // 5. Price Trend Analysis (for selling)
        const recentPrices = prices.slice(-7);
        const priceChange = ((recentPrices[recentPrices.length - 1] - recentPrices[0]) / recentPrices[0] * 100);

        if (priceChange < -10) {
            reasons.push(`Strong downtrend: ${priceChange.toFixed(1)}% over 7 days - exit recommended.`);
        } else if (priceChange > 10) {
            reasons.push(`Strong uptrend: +${priceChange.toFixed(1)}% over 7 days - set trailing stop.`);
        }

        // If no specific signals
        if (reasons.length === 0) {
            reasons.push("Price in consolidation - monitor for breakdown.");
            reasons.push("No strong technical sell signals currently.");
        }

        return reasons.slice(0, 5);

    } catch (error) {
        console.error('Error analyzing sell technicals:', error);
        return [
            "Technical analysis temporarily unavailable.",
            "Consider standard profit-taking levels.",
            "Monitor key support levels for breakdown."
        ];
    }
}
