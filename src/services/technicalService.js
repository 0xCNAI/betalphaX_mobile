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
export async function analyzeTechnicals(symbol, currentPrice = null, forceRefresh = false) {
    // Bump version to v10 to clear corrupt cache (missing keyLevels) and ensure contract-based fetching
    const cacheKey = `ta_diagnosis_v10_${symbol.toUpperCase()}`;
    console.log(`[Technical] analyzeTechnicals called for ${symbol}, forceRefresh:`, forceRefresh);

    try {
        // 1. Check Cache (skip if forceRefresh is true)
        if (!forceRefresh) {
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

        // --- Patch OHLC with Real-time Price ---
        if (currentPrice && currentPrice > 0) {
            console.log(`[Technical] Patching latest candles with real-time price: ${currentPrice}`);

            const patchCandle = (candles) => {
                if (!candles || candles.length === 0) return;
                const last = candles[candles.length - 1];

                // Update Close
                last[4] = currentPrice;

                // Update High/Low if price broke bounds
                if (currentPrice > last[2]) last[2] = currentPrice;
                if (currentPrice < last[3]) last[3] = currentPrice;

                // Ensure volume exists (index 5), default to 0 if undefined
                if (last[5] === undefined) last[5] = 0;
            };

            patchCandle(ohlc1h);
            patchCandle(ohlc4h);
            patchCandle(ohlc1d);
        }

        // Extract Close prices
        const closes1h = ohlc1h.map(c => c[4]);
        const closes4h = ohlc4h.map(c => c[4]);
        const closes1d = ohlc1d.map(c => c[4]);
        const latestPrice = closes1h[closes1h.length - 1];

        // --- 2. Compute Indicators & Advanced Logic ---

        // A. Indicators Calculation
        // RSI (14)
        const rsi1hValues = TI.RSI.calculate({ period: 14, values: closes1h });
        const rsi4hValues = TI.RSI.calculate({ period: 14, values: closes4h });

        // MACD (12, 26, 9)
        const macd1h = TI.MACD.calculate({ values: closes1h, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });
        const macd4h = TI.MACD.calculate({ values: closes4h, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false });

        // EMAs (20, 50, 200) for Trend (4H)
        const ema20_4h = TI.EMA.calculate({ period: 20, values: closes4h });
        const ema50_4h = TI.EMA.calculate({ period: 50, values: closes4h });
        const ema200_4h = TI.EMA.calculate({ period: 200, values: closes4h });

        // EMAs (50, 200) for Long Term Trend (1D)
        const ema50_1d = TI.EMA.calculate({ period: 50, values: closes1d });
        const ema200_1d = TI.EMA.calculate({ period: 200, values: closes1d });

        // Bollinger Bands (20, 2)
        const bb4h = TI.BollingerBands.calculate({ period: 20, stdDev: 2, values: closes4h });

        // --- 3. Run Rule Modules ---

        // Module 1: Price-Volume Analysis
        const pvAnalysis = analyzePriceVolume(ohlc1h, ohlc4h);

        // Module 2: Momentum (RSI)
        const momAnalysis = analyzeMomentumRSI(rsi1hValues, rsi4hValues);

        // Module 3: MACD Momentum
        const macdAnalysis = analyzeMACD(macd1h, macd4h);

        // Module 4: Market Structure
        const structAnalysis = analyzeMarketStructure(ohlc1h, ohlc4h);

        // Module 5: Key Levels & Long Term Trend
        const levelAnalysis = analyzeKeyLevels(latestPrice, ohlc1d, bb4h, ema50_1d, ema200_1d);

        // --- 4. Synthesize Verdict & Insights ---

        const synthesis = synthesizeVerdict(pvAnalysis, momAnalysis, macdAnalysis, structAnalysis, levelAnalysis);

        const result = {
            score: synthesis.score, // 0-100
            action: synthesis.action, // STRONG BUY, BUY, HOLD, SELL, STRONG SELL
            proAnalysis: {
                setupQuality: synthesis.setupQuality,
                primarySignal: synthesis.primarySignal,
                marketStructure: structAnalysis.verdict,
                riskRewardRatio: levelAnalysis.rrRatio,
                volatility: analyzeVolatility(bb4h).isSqueeze ? 'Squeeze' : 'Normal',
                insights: synthesis.insights // Array of strings
            },
            signals: synthesis.signals, // Array of objects { type, msg, sentiment }
            verdicts: {
                short: momAnalysis.shortTermVerdict,
                mid: structAnalysis.verdict,
                long: levelAnalysis.longTermVerdict
            },
            levels: {
                shortTerm: levelAnalysis.shortTermLevels,
                longTerm: levelAnalysis.longTermLevels
            },
            keyLevels: {
                support: levelAnalysis.longTermLevels.support,
                resistance: levelAnalysis.longTermLevels.resistance
            },
            indicators: {
                rsi: rsi1hValues[rsi1hValues.length - 1],
                macd: macd1h[macd1h.length - 1]?.histogram || 0
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

// --- Rule Modules ---

function analyzePriceVolume(ohlc1h, ohlc4h) {
    // Rules:
    // 1. Rising volume + Trend -> Confirmation
    // 2. Falling volume + Trend -> Weakness
    // 3. Rejection + Rising Volume -> Reversal
    // 4. Breakout + Falling Volume -> Weak Breakout

    // Simplified logic: Check last 3 candles volume trend vs price trend
    const analyze = (candles) => {
        if (candles.length < 5) return { sentiment: 'Neutral', msg: 'Insufficient Data' };

        const last3 = candles.slice(-3);
        const vols = last3.map(c => c[5]);
        const closes = last3.map(c => c[4]);

        const volTrend = vols[2] > vols[1] && vols[1] > vols[0] ? 'Rising' :
            vols[2] < vols[1] && vols[1] < vols[0] ? 'Falling' : 'Flat';

        const priceTrend = closes[2] > closes[0] ? 'Up' : 'Down';

        if (priceTrend === 'Up' && volTrend === 'Rising') return { sentiment: 'Bullish', msg: 'Rising volume confirms 1H uptrend' };
        if (priceTrend === 'Down' && volTrend === 'Rising') return { sentiment: 'Bearish', msg: 'Rising volume confirms 1H downtrend' };
        if (priceTrend === 'Up' && volTrend === 'Falling') return { sentiment: 'Bearish', msg: '1H Uptrend weakening (falling volume)' };
        if (priceTrend === 'Down' && volTrend === 'Falling') return { sentiment: 'Bullish', msg: '1H Downtrend weakening (falling volume)' };

        return { sentiment: 'Neutral', msg: '1H Volume trend inconclusive' };
    };

    return analyze(ohlc1h); // Focus on 1H for immediate volume action
}

function analyzeMomentumRSI(rsi1h, rsi4h) {
    // Rules:
    // 1. Rollover > 70 -> Bearish
    // 2. Recovery < 30 -> Bullish
    // 3. Divergence (Simplified)
    // 4. 50-70 Uptrend, 30-50 Downtrend

    const analyze = (rsi, timeframe) => {
        if (!rsi || rsi.length < 2) return 'Neutral';
        const curr = rsi[rsi.length - 1];
        const prev = rsi[rsi.length - 2];

        if (curr < 70 && prev >= 70) return `Bearish (Rollover)`;
        if (curr > 30 && prev <= 30) return `Bullish (Recovery)`;
        if (curr > 70) return `Overbought`;
        if (curr < 30) return `Oversold`;
        if (curr > 50) return `Bullish Bias`;
        return `Bearish Bias`;
    };

    const shortTerm = analyze(rsi1h, '1H');
    const midTerm = analyze(rsi4h, '4H');

    // Detect simple divergence (Price Lower Low, RSI Higher Low) - Placeholder logic
    // Real divergence needs pivot detection, keeping it simple for now

    return {
        shortTermVerdict: shortTerm.includes('Bullish') ? 'Bullish' : shortTerm.includes('Bearish') ? 'Bearish' : 'Neutral',
        details: `1H RSI: ${shortTerm}, 4H RSI: ${midTerm}`
    };
}

function analyzeMACD(macd1h, macd4h) {
    // Rules:
    // 1. Crosses
    // 2. Histogram expansion/shrinking

    const analyze = (macd, timeframe) => {
        if (!macd || macd.length < 2) return 'Neutral';
        const curr = macd[macd.length - 1];
        const prev = macd[macd.length - 2];

        // Crossover
        if (curr.histogram > 0 && prev.histogram <= 0) return 'Bullish Cross';
        if (curr.histogram < 0 && prev.histogram >= 0) return 'Bearish Cross';

        // Histogram Trend
        if (curr.histogram > 0 && curr.histogram > prev.histogram) return 'Bullish Momentum Strengthening';
        if (curr.histogram > 0 && curr.histogram < prev.histogram) return 'Bullish Momentum Weakening';
        if (curr.histogram < 0 && curr.histogram < prev.histogram) return 'Bearish Momentum Strengthening'; // More negative
        if (curr.histogram < 0 && curr.histogram > prev.histogram) return 'Bearish Momentum Weakening'; // Less negative

        return 'Neutral';
    };

    return {
        shortTerm: analyze(macd1h, '1H'),
        midTerm: analyze(macd4h, '4H')
    };
}

function analyzeMarketStructure(ohlc1h, ohlc4h) {
    // Rules: HH+HL (Bullish), LH+LL (Bearish)
    // Simple pivot detection on last 10 candles

    const analyze = (candles, timeframe) => {
        if (candles.length < 10) return 'Neutral';
        const highs = candles.slice(-10).map(c => c[2]);
        const lows = candles.slice(-10).map(c => c[3]);

        const maxHigh = Math.max(...highs);
        const minLow = Math.min(...lows);
        const currClose = candles[candles.length - 1][4];

        if (currClose > maxHigh * 0.99) return `Bullish (Testing ${timeframe} Highs)`;
        if (currClose < minLow * 1.01) return `Bearish (Testing ${timeframe} Lows)`;

        // Check recent sequence (last 3 candles)
        const last3 = candles.slice(-3);
        if (last3[2][2] > last3[1][2] && last3[1][2] > last3[0][2]) return `Bullish Structure (HH)`;
        if (last3[2][3] < last3[1][3] && last3[1][3] < last3[0][3]) return `Bearish Structure (LL)`;

        return 'Neutral (Consolidation)';
    };

    return {
        verdict: analyze(ohlc4h, '4H'), // 4H structure is more reliable
        details: analyze(ohlc1h, '1H')
    };
}

function analyzeKeyLevels(price, ohlc1d, bb4h, ema50, ema200) {
    // Daily Support/Resistance
    const recentDaily = ohlc1d.slice(-30);
    const highs = recentDaily.map(c => c[2]);
    const lows = recentDaily.map(c => c[3]);

    const resistance = Math.max(...highs);
    const support = Math.min(...lows);

    // 1H/Short Term Levels (using BB or recent 1H pivots)
    const shortRes = bb4h[bb4h.length - 1]?.upper || resistance;
    const shortSup = bb4h[bb4h.length - 1]?.lower || support;

    // R:R Calculation
    const distToRes = resistance - price;
    const distToSup = price - support;
    const rrRatio = distToSup === 0 ? 0 : distToRes / distToSup;

    // --- Determine Long Term Verdict (1D) ---
    // Logic:
    // 1. Trend (EMA50/200) is primary.
    // 2. Position relative to Support/Resistance is secondary context.

    let longTermVerdict = 'Neutral';
    const lastEMA50 = ema50 && ema50.length > 0 ? ema50[ema50.length - 1] : null;
    const lastEMA200 = ema200 && ema200.length > 0 ? ema200[ema200.length - 1] : null;

    // 1. Trend Check
    let trend = 'Neutral';
    if (lastEMA50 && price > lastEMA50) trend = 'Bullish';
    else if (lastEMA50 && price < lastEMA50) trend = 'Bearish';

    // 2. Level Check
    if (trend === 'Bullish') {
        if (price < support * 1.02) longTermVerdict = 'Bullish (Buy Zone)'; // Pullback to support in uptrend
        else if (price > resistance * 0.98) longTermVerdict = 'Bullish (Testing Resistance)';
        else longTermVerdict = 'Bullish';
    } else if (trend === 'Bearish') {
        if (price < support * 1.02) longTermVerdict = 'Bearish (Testing Support)'; // Danger of breakdown
        else if (price > resistance * 0.98) longTermVerdict = 'Bearish (Rejection Zone)'; // Rally to resistance in downtrend
        else longTermVerdict = 'Bearish';
    } else {
        // Neutral Trend
        if (price < support * 1.02) longTermVerdict = 'Neutral (At Support)';
        else if (price > resistance * 0.98) longTermVerdict = 'Neutral (At Resistance)';
    }

    return {
        longTermLevels: { support, resistance },
        shortTermLevels: { support: shortSup, resistance: shortRes },
        rrRatio,
        longTermVerdict: longTermVerdict.includes('Bullish') ? 'Bullish' : longTermVerdict.includes('Bearish') ? 'Bearish' : 'Neutral',
        details: longTermVerdict
    };
}

function synthesizeVerdict(pv, mom, macd, struct, levels) {
    let score = 50;
    const signals = [];
    const findings = []; // { msg, weight }

    // --- 1. Momentum Scoring & Findings ---
    if (mom.shortTermVerdict === 'Bullish') {
        score += 10;
        findings.push({ msg: `1H Momentum is bullish with RSI recovering/uptrending.`, weight: 8 });
    } else if (mom.shortTermVerdict === 'Bearish') {
        score -= 10;
        findings.push({ msg: `1H Momentum is bearish with RSI rolling over/downtrending.`, weight: 8 });
    }

    if (macd.shortTerm.includes('Bullish')) {
        score += 10;
        findings.push({ msg: `1H MACD shows bullish momentum building.`, weight: 7 });
    } else if (macd.shortTerm.includes('Bearish')) {
        score -= 10;
        findings.push({ msg: `1H MACD shows bearish momentum building.`, weight: 7 });
    }

    // Divergence (High Importance)
    if (mom.details.includes('Divergence')) {
        findings.push({ msg: `1H RSI Divergence detected.`, weight: 10 });
    }

    // --- 2. Structure Scoring & Findings ---
    if (struct.verdict.includes('Bullish')) {
        score += 15;
        findings.push({ msg: `4H Market structure is bullish (Higher Highs/Lows).`, weight: 9 });
    } else if (struct.verdict.includes('Bearish')) {
        score -= 15;
        findings.push({ msg: `4H Market structure is bearish (Lower Highs/Lows).`, weight: 9 });
    } else {
        findings.push({ msg: `4H Market structure is neutral/consolidating.`, weight: 5 });
    }

    // --- 3. Price-Volume Scoring & Findings ---
    if (pv.sentiment === 'Bullish') {
        score += 10;
        findings.push({ msg: pv.msg, weight: 8 });
    } else if (pv.sentiment === 'Bearish') {
        score -= 10;
        findings.push({ msg: pv.msg, weight: 8 });
    } else {
        findings.push({ msg: `1H Volume trend is inconclusive.`, weight: 3 });
    }

    // --- 4. Key Levels Scoring & Findings ---
    if (levels.longTermVerdict === 'Bullish') {
        score += 5;
        findings.push({ msg: `1D Trend is bullish, holding above key support.`, weight: 6 });
    } else if (levels.longTermVerdict === 'Bearish') {
        score -= 5;
        findings.push({ msg: `1D Trend is bearish, risking breakdown at support.`, weight: 6 });
    } else {
        findings.push({ msg: `1D Trend is neutral.`, weight: 4 });
    }

    // R:R Analysis
    if (levels.rrRatio > 2) {
        score += 5;
        findings.push({ msg: `Favorable Risk/Reward setup (>2R) identified.`, weight: 7 });
    } else if (levels.rrRatio < 1) {
        score -= 5;
        findings.push({ msg: `Poor Risk/Reward ratio at current levels.`, weight: 6 });
    }

    // Clamp Score
    score = Math.max(0, Math.min(100, score));

    // Determine Action
    let action = 'HOLD';
    if (score >= 75) action = 'STRONG BUY';
    else if (score >= 60) action = 'BUY';
    else if (score <= 25) action = 'STRONG SELL';
    else if (score <= 40) action = 'SELL';

    // Sort Findings by Weight (Descending)
    findings.sort((a, b) => b.weight - a.weight);

    // Select Top 3 Insights
    const topInsights = findings.slice(0, 3).map(f => f.msg);

    // Add Conclusion
    const conclusion = generateConclusion(action, mom, macd, struct, levels, pv);
    topInsights.push(conclusion);

    // Signals for UI chips (Keep existing logic for compatibility)
    if (pv.sentiment !== 'Neutral') signals.push({ type: 'Volume', msg: pv.msg, sentiment: pv.sentiment });
    if (mom.shortTermVerdict !== 'Neutral') signals.push({ type: 'RSI', msg: mom.details, sentiment: mom.shortTermVerdict });
    if (struct.verdict !== 'Neutral') signals.push({ type: 'Structure', msg: struct.verdict, sentiment: struct.verdict.includes('Bullish') ? 'Bullish' : 'Bearish' });

    return {
        score,
        action,
        insights: topInsights,
        signals,
        setupQuality: levels.rrRatio > 2 ? 'High' : 'Medium',
        primarySignal: struct.verdict
    };
}

function generateConclusion(action, mom, macd, struct, levels, pv) {
    const bullishFactors = [];
    const bearishFactors = [];

    // Collect Factors (Natural Language)
    if (mom.shortTermVerdict === 'Bullish') bullishFactors.push('recovering short-term strength');
    if (mom.shortTermVerdict === 'Bearish') bearishFactors.push('fading short-term strength');

    if (macd.shortTerm.includes('Bullish')) bullishFactors.push('growing upward momentum');
    if (macd.shortTerm.includes('Bearish')) bearishFactors.push('growing downward momentum');

    if (struct.verdict.includes('Bullish')) bullishFactors.push('an established uptrend pattern');
    if (struct.verdict.includes('Bearish')) bearishFactors.push('a downtrend pattern');

    if (levels.longTermVerdict === 'Bullish') bullishFactors.push('a solid price floor');
    if (levels.longTermVerdict === 'Bearish') bearishFactors.push('a tough price ceiling');

    if (pv.sentiment === 'Bullish') bullishFactors.push('strong buyer interest');
    if (pv.sentiment === 'Bearish') bearishFactors.push('heavy selling pressure');

    let conclusion = '';

    if (action.includes('BUY')) {
        const mainReasons = bullishFactors.slice(0, 2).join(' and ');
        conclusion = `The ${action.toLowerCase()} verdict is supported by ${mainReasons || 'general bullish signs'}`;
        if (bearishFactors.length > 0) conclusion += `, despite ${bearishFactors[0]}.`;
        else conclusion += '.';
    } else if (action.includes('SELL')) {
        const mainReasons = bearishFactors.slice(0, 2).join(' and ');
        conclusion = `The ${action.toLowerCase()} verdict is driven by ${mainReasons || 'general weakness'}`;
        if (bullishFactors.length > 0) conclusion += `, outweighing ${bullishFactors[0]}.`;
        else conclusion += '.';
    } else {
        // HOLD
        if (bullishFactors.length > 0 && bearishFactors.length > 0) {
            conclusion = `Market is indecisive as ${bullishFactors[0]} conflicts with ${bearishFactors[0]}.`;
        } else {
            conclusion = `Market lacks clear direction with neutral structure and momentum.`;
        }
    }

    return conclusion.charAt(0).toUpperCase() + conclusion.slice(1);
}

function analyzeVolatility(bbValues) {
    if (!bbValues || bbValues.length === 0) return { isSqueeze: false };
    const last = bbValues[bbValues.length - 1];
    const bandwidth = (last.upper - last.lower) / last.middle;
    return { isSqueeze: bandwidth < 0.10 };
}
