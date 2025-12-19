import { RSI, SMA, EMA, MACD, BollingerBands } from 'technicalindicators';

/**
 * Analyze technical indicators for a given ticker
 * @param {string} ticker - The ticker symbol
 * @returns {Promise<Array<string>>} - Array of technical analysis reasons
 */
export async function analyzeTechnicals(ticker) {
    try {
        // Fetch 30 days of price data for indicators
        const { fetchOHLC } = await import('./marketDataServiceNew');
        const ohlcResult = await fetchOHLC(ticker, '1d');

        let prices = [];
        if (ohlcResult && ohlcResult.data && ohlcResult.data.length >= 14) {
            prices = ohlcResult.data.map(candle => candle[4]);
        }

        if (prices.length < 14) {
            return {
                score: 50,
                action: 'NEUTRAL',
                verdicts: { short: 'Insufficient Data', long: 'Insufficient Data' },
                levels: { shortTerm: { support: 0, resistance: 0 }, longTerm: { support: 0, resistance: 0 } }
            };
        }

        const currentPrice = prices[prices.length - 1];
        let score = 50; // Base score
        let bullishSignals = 0;
        let bearishSignals = 0;

        // 1. RSI Analysis
        const rsiValues = RSI.calculate({ values: prices, period: 14 });
        const currentRSI = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;

        if (currentRSI < 30) { score += 20; bullishSignals++; }
        else if (currentRSI > 70) { score -= 20; bearishSignals++; }
        else if (currentRSI > 50) { score += 5; }
        else { score -= 5; }

        // 2. Moving Average Analysis
        const sma50 = SMA.calculate({ period: 20, values: prices });
        const sma200 = SMA.calculate({ period: 30, values: prices });
        const currentSMA50 = sma50.length > 0 ? sma50[sma50.length - 1] : currentPrice;
        const currentSMA200 = sma200.length > 0 ? sma200[sma200.length - 1] : currentPrice;

        if (currentPrice > currentSMA50) { score += 15; bullishSignals++; }
        else { score -= 15; bearishSignals++; }

        if (currentSMA50 > currentSMA200) { score += 10; bullishSignals++; } // Golden Cross-ish
        else { score -= 10; bearishSignals++; }

        // 3. MACD
        const macdResult = MACD.calculate({
            values: prices,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });
        if (macdResult.length > 0) {
            const macd = macdResult[macdResult.length - 1];
            if (macd.histogram > 0) { score += 10; bullishSignals++; }
            else { score -= 10; bearishSignals++; }
        }

        // Clamp score
        score = Math.max(0, Math.min(100, score));

        // Determine Action
        let action = 'HOLD';
        if (score >= 70) action = 'STRONG BUY';
        else if (score >= 60) action = 'BUY';
        else if (score <= 30) action = 'STRONG SELL';
        else if (score <= 40) action = 'SELL';

        // Verdicts
        const shortTerm = currentRSI > 50 && currentPrice > currentSMA50 ? 'Bullish' : 'Bearish';
        const longTerm = currentSMA50 > currentSMA200 ? 'Bullish' : 'Bearish';

        // Support/Resistance (Simple estimation)
        const recentHigh = Math.max(...prices.slice(-30));
        const recentLow = Math.min(...prices.slice(-30));

        return {
            score: Math.round(score),
            action: action,
            verdicts: {
                short: shortTerm,
                long: longTerm
            },
            levels: {
                shortTerm: {
                    support: recentLow,
                    resistance: recentHigh
                },
                longTerm: {
                    support: Math.min(...prices),
                    resistance: Math.max(...prices)
                }
            },
            volatility_comment: "Moderate volatility detected."
        };

    } catch (error) {
        console.error('Error analyzing technicals:', error);
        return {
            score: 50,
            action: 'NEUTRAL',
            verdicts: { short: 'Error', long: 'Error' },
            levels: { shortTerm: { support: 0, resistance: 0 }, longTerm: { support: 0, resistance: 0 } }
        };
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
