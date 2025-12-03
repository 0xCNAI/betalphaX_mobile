import { fetchOHLC } from './marketDataServiceNew';
import { fetchOHLC as fetchCoinGeckoOHLC } from './coinGeckoApi'; // Keep for fallback if needed, though marketDataService handles it
import * as TI from 'technicalindicators';

const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * Analyze Technicals for a given symbol
 * @param {string} symbol - Ticker symbol (e.g. 'ETH')
 * @returns {Promise<Object>} - Technical analysis result
 */
/**
 * Analyze Technicals for a given symbol (Pro Trader Level)
 * @param {string} symbol - Ticker symbol (e.g. 'ETH')
 * @returns {Promise<Object>} - Technical analysis result
 */
export async function analyzeTechnicals(symbol, currentPrice = null) {
    // Bump version to v10 to clear corrupt cache (missing keyLevels) and ensure contract-based fetching
    const cacheKey = `ta_diagnosis_v10_${symbol.toUpperCase()}`;

    try {
        // 1. Check Cache
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const { timestamp, data, source } = JSON.parse(cached);
                // Validate cached data structure
                if (data && data.score !== undefined && data.verdicts && data.signals && data.keyLevels) {
                    const duration = (source === 'Binance' || source === 'GeckoTerminal') ? 60 * 1000 : 15 * 60 * 1000;
                    if (Date.now() - timestamp < duration) {
                        console.log(`[Technical] Returning cached analysis for ${symbol} (Source: ${source})`);
                        return { ...data, dataSource: source };
                    }
                } else {
                    console.warn(`[Technical] Invalid cached data for ${symbol}, ignoring.`);
                    localStorage.removeItem(cacheKey);
                }
            } catch (e) {
                console.warn(`[Technical] Error parsing cache for ${symbol}, clearing.`);
                localStorage.removeItem(cacheKey);
            }
        }

        console.log(`[Technical] Analyzing ${symbol} with target price: ${currentPrice}...`);

        let ohlc1h, ohlc4h, ohlc1d, dataSource;

        try {
            const [res1h, res4h, res1d] = await Promise.all([
                fetchOHLC(symbol, '1h', 'eth', currentPrice),
                fetchOHLC(symbol, '4h', 'eth', currentPrice),
                fetchOHLC(symbol, '1d', 'eth', currentPrice)
            ]);

            ohlc1h = res1h.data;
            ohlc4h = res4h.data;
            ohlc1d = res1d.data;
            dataSource = res4h.source;

            if (res1h.source !== res4h.source || res4h.source !== res1d.source) {
                dataSource = `${res4h.source} (Mixed)`;
            }

        } catch (error) {
            console.error('[Technical] Data fetch failed:', error);
            throw error;
        }

        if (!ohlc1h?.length || !ohlc4h?.length || !ohlc1d?.length) {
            throw new Error('Insufficient data for analysis');
        }

        // Extract Close prices
        const closes1h = ohlc1h.map(c => c[4]);
        const closes4h = ohlc4h.map(c => c[4]);
        const closes1d = ohlc1d.map(c => c[4]);
        const latestPrice = closes1h[closes1h.length - 1];

        // --- 2. Compute Indicators & Advanced Logic ---

        // A. Divergence Detection (1h RSI vs Price)
        const rsi1hValues = TI.RSI.calculate({ period: 14, values: closes1h });
        const divergence = detectDivergence(closes1h, rsi1hValues);

        // B. Volatility Squeeze (4h Bollinger Bands)
        const bb4hValues = TI.BollingerBands.calculate({ period: 20, stdDev: 2, values: closes4h });
        const lastBB = bb4hValues[bb4hValues.length - 1];
        const volatility = analyzeVolatility(bb4hValues);

        // C. Trend Quality (4h EMAs)
        const ema20 = TI.EMA.calculate({ period: 20, values: closes4h });
        const ema50 = TI.EMA.calculate({ period: 50, values: closes4h });
        const ema200 = TI.EMA.calculate({ period: 200, values: closes4h });

        const lastEMA20 = ema20[ema20.length - 1];
        const lastEMA50 = ema50[ema50.length - 1];
        const lastEMA200 = ema200[ema200.length - 1];

        const trend = analyzeTrendQuality(latestPrice, lastEMA20, lastEMA50, lastEMA200);

        // D. Key Levels & R:R (Daily)
        const recentDaily = ohlc1d.slice(-30);
        const highs = recentDaily.map(c => c[2]);
        const lows = recentDaily.map(c => c[3]);
        const resistance = Math.max(...highs);
        const support = Math.min(...lows);

        const rrAnalysis = calculateRiskReward(latestPrice, support, resistance);

        // --- 3. Construct Pro Verdict ---

        // Base Score
        let score = 50;
        const signals = [];

        // Apply Divergence
        if (divergence) {
            if (divergence.type === 'Bullish') {
                score += 15;
                signals.push({ type: 'Alpha', msg: 'Bullish Divergence (RSI)', sentiment: 'Bullish' });
            } else {
                score -= 15;
                signals.push({ type: 'Alpha', msg: 'Bearish Divergence (RSI)', sentiment: 'Bearish' });
            }
        }

        // Apply Trend
        if (trend.status === 'Strong Uptrend') {
            score += 20;
            signals.push({ type: 'Trend', msg: 'Strong Uptrend (EMA Aligned)', sentiment: 'Bullish' });
        } else if (trend.status === 'Strong Downtrend') {
            score -= 20;
            signals.push({ type: 'Trend', msg: 'Strong Downtrend (EMA Aligned)', sentiment: 'Bearish' });
        } else {
            signals.push({ type: 'Trend', msg: `Market is ${trend.status}`, sentiment: 'Neutral' });
        }

        // Apply Volatility
        if (volatility.isSqueeze) {
            signals.push({ type: 'Volatility', msg: 'Volatility Squeeze (Prepare for move)', sentiment: 'Neutral' });
        }

        // Apply R:R
        if (rrAnalysis.ratio > 2.0) {
            score += 10;
            signals.push({ type: 'Setup', msg: `High R:R Setup (${rrAnalysis.ratio.toFixed(1)}R)`, sentiment: 'Bullish' });
        } else if (rrAnalysis.ratio < 1.0) {
            score -= 10;
            signals.push({ type: 'Setup', msg: `Poor R:R (${rrAnalysis.ratio.toFixed(1)}R)`, sentiment: 'Bearish' });
        }

        // RSI Check
        const lastRSI = rsi1hValues[rsi1hValues.length - 1];
        if (lastRSI > 70) score -= 10;
        if (lastRSI < 30) score += 10;

        // Clamp Score
        score = Math.max(0, Math.min(100, score));

        // Determine Action
        let action = 'Hold';
        if (score >= 75) action = 'Strong Buy';
        else if (score >= 60) action = 'Accumulate';
        else if (score <= 25) action = 'Strong Sell';
        else if (score <= 40) action = 'Reduce';

        // Generate Insights
        const insights = [
            divergence ? `${divergence.type} Divergence detected on 1H chart.` : null,
            volatility.isSqueeze ? "Volatility Squeeze detected - expect a breakout soon." : null,
            `Trend is ${trend.status}.`,
            `Risk/Reward is ${rrAnalysis.ratio.toFixed(1)}, with ${((latestPrice - support) / latestPrice * 100).toFixed(1)}% risk to support.`
        ].filter(Boolean);

        // Construct Verdicts (for UI compatibility)
        const verdicts = {
            short: 'Neutral',
            mid: 'Neutral',
            long: 'Neutral'
        };

        // Short-term Verdict (1H)
        if (divergence) {
            verdicts.short = divergence.type; // 'Bullish' or 'Bearish'
        } else if (lastRSI > 70) verdicts.short = 'Bearish';
        else if (lastRSI < 30) verdicts.short = 'Bullish';

        // Mid-term Verdict (4H)
        if (trend.status.includes('Uptrend')) verdicts.mid = 'Bullish';
        else if (trend.status.includes('Downtrend')) verdicts.mid = 'Bearish';

        // Long-term Verdict (1D)
        // Simple SMA200 check
        if (closes1d.length > 0 && lastEMA200) { // Using EMA200 as proxy or calculate SMA200 if needed. 
            // We calculated EMA200 on 4h. Let's use the 1d SMA logic if we want to be precise, 
            // but for now let's use the trend status which incorporates EMA200.
            // Actually, let's just check price vs support/resistance for long term context
            if (latestPrice > resistance * 0.95) verdicts.long = 'Bullish'; // Near resistance (breakout?) - actually usually bearish resistance.
            // Let's stick to the simple logic:
            // If score is high, long is likely bullish.
            // Let's use the previous logic: Price > SMA200 (1d)
            // We need to calculate SMA200 for 1d if we want to be accurate, or just infer.
            // We fetched 1d data. Let's quickly calc SMA200 1d if not already.
        }

        // Re-calculate SMA200 1d for Verdict
        const sma200_1d = TI.SMA.calculate({ period: 200, values: closes1d });
        const lastSMA200_1d = sma200_1d.length > 0 ? sma200_1d[sma200_1d.length - 1] : null;

        if (lastSMA200_1d) {
            verdicts.long = latestPrice > lastSMA200_1d ? 'Bullish' : 'Bearish';
        }

        const result = {
            score,
            action,
            proAnalysis: {
                setupQuality: rrAnalysis.ratio > 2 ? 'High' : rrAnalysis.ratio > 1 ? 'Medium' : 'Low',
                primarySignal: divergence ? `${divergence.type} Divergence` : trend.status,
                marketStructure: trend.status,
                riskRewardRatio: rrAnalysis.ratio,
                volatility: volatility.isSqueeze ? 'Squeeze' : 'Normal',
                insights
            },
            signals,
            verdicts, // Restored field
            levels: {
                shortTerm: {
                    support: lastBB ? lastBB.lower : support,
                    resistance: lastBB ? lastBB.upper : resistance,
                    stop: support * 0.97,
                    target: resistance
                },
                longTerm: {
                    support,
                    resistance,
                    stop: support * 0.95,
                    target: resistance
                }
            },
            keyLevels: {
                support,
                resistance
            },
            indicators: {
                rsi: lastRSI,
                macd: 0 // Simplified for now
            },
            dataSource
        };

        // Validate result before caching
        if (result.score !== undefined && result.verdicts && result.signals && result.keyLevels) {
            // Save to Cache
            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                data: result,
                source: dataSource
            }));
        } else {
            console.warn('[Technical] Generated result is invalid, skipping cache.');
        }

        return result;

    } catch (error) {
        console.error('Technical Analysis Failed:', error);
        throw error;
    }
}

// --- Helper Functions ---

function detectDivergence(prices, rsiValues) {
    if (!prices || !rsiValues || prices.length < 10) return null;

    // Simple lookback for last 2 valleys/peaks
    // This is a simplified logic for demonstration. Real divergence needs pivot detection.
    // We'll compare current low vs low 5-10 candles ago.

    const len = prices.length;
    const rsiLen = rsiValues.length;

    const currPrice = prices[len - 1];
    const prevPrice = prices[len - 6]; // approx 5 candles ago

    const currRSI = rsiValues[rsiLen - 1];
    const prevRSI = rsiValues[rsiLen - 6];

    // Bullish Divergence: Price Lower Low, RSI Higher Low
    if (currPrice < prevPrice && currRSI > prevRSI && currRSI < 40) {
        return { type: 'Bullish' };
    }

    // Bearish Divergence: Price Higher High, RSI Lower High
    if (currPrice > prevPrice && currRSI < prevRSI && currRSI > 60) {
        return { type: 'Bearish' };
    }

    return null;
}

function analyzeVolatility(bbValues) {
    if (!bbValues || bbValues.length === 0) return { isSqueeze: false };
    const last = bbValues[bbValues.length - 1];
    const bandwidth = (last.upper - last.lower) / last.middle;

    // Heuristic: Bandwidth < 0.1 (10%) usually indicates squeeze for crypto majors
    // For alts it might be higher, but let's stick to a baseline.
    return { isSqueeze: bandwidth < 0.10 };
}

function analyzeTrendQuality(price, ema20, ema50, ema200) {
    if (!ema20 || !ema50 || !ema200) return { status: 'Unclear' };

    if (price > ema20 && ema20 > ema50 && ema50 > ema200) {
        return { status: 'Strong Uptrend' };
    }
    if (price < ema20 && ema20 < ema50 && ema50 < ema200) {
        return { status: 'Strong Downtrend' };
    }
    if (price > ema200) {
        return { status: 'Uptrend (Weak)' };
    }
    if (price < ema200) {
        return { status: 'Downtrend (Weak)' };
    }
    return { status: 'Choppy / Range' };
}

function calculateRiskReward(price, support, resistance) {
    if (!support || !resistance || price <= support || price >= resistance) {
        return { ratio: 0, distToSupport: 0, distToResistance: 0 };
    }

    const distToSupport = (price - support) / price;
    const distToResistance = (resistance - price) / price;

    const ratio = distToResistance / distToSupport;
    return { ratio, distToSupport, distToResistance };
}
