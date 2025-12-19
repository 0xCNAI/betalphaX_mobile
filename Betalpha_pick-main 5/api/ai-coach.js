
import { OpenAI } from 'openai';
import { Index } from '@upstash/vector';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// Clients will be initialized inside handler to avoid crash on missing env vars
let openai;
let index;
let genAI;

// Helper to sanitize input for Prompt Injection
function sanitize(str) {
    if (!str) return "N/A";
    return String(str).replace(/["`\n]/g, " ").substring(0, 150).trim();
}

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { symbol, ohlc, ohlc_4h, ohlc_1h, action, currentPrice, atr, userProfile, marketContext } = req.body;
        const normalizedAction = action ? action.toUpperCase() : 'UNKNOWN';

        if (!symbol || !ohlc) {
            return res.status(400).json({ error: 'Missing required fields: symbol, ohlc' });
        }

        // --- Normalization Logic (Must match Python ETL) ---
        const normalizeOHLC = (data) => {
            if (!data || data.length === 0) return [];
            const basePrice = data[0][1]; // Open of first candle
            const volumes = data.map(c => c[5]);
            const meanVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length || 1;

            return data.map(c => [
                c[1] / basePrice, // Open
                c[2] / basePrice, // High
                c[3] / basePrice, // Low
                c[4] / basePrice, // Close
                c[5] / meanVolume // Vol
            ]);
        };

        // Initialize Clients Safely
        const client_openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const client_index = new Index({ url: process.env.UPSTASH_VECTOR_REST_URL, token: process.env.UPSTASH_VECTOR_REST_TOKEN });
        const client_genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

        // Safe Context Extraction
        const safeDesc = sanitize(marketContext?.fundamental?.description);
        const safeTvl = sanitize(marketContext?.fundamental?.tvl);
        const safeTechScore = sanitize(marketContext?.technical?.score);
        const safeTechAction = sanitize(marketContext?.technical?.action);
        const safeNewsSentiment = sanitize(marketContext?.news?.sentiment);
        const safeNewsHeadline = sanitize(marketContext?.news?.headline);

        const context = {
            D1: normalizeOHLC(ohlc),
            H4: normalizeOHLC(ohlc_4h || []),
            H1: normalizeOHLC(ohlc_1h || [])
        };

        // Sanitize Env Vars (remove quotes if present)
        const cleanEnv = (val) => val ? val.replace(/^"|"$/g, '').replace(/^'|'$/g, '') : val;
        const OPENAI_KEY = cleanEnv(process.env.OPENAI_API_KEY);
        const UPSTASH_URL = cleanEnv(process.env.UPSTASH_VECTOR_REST_URL);
        const UPSTASH_TOKEN = cleanEnv(process.env.UPSTASH_VECTOR_REST_TOKEN);
        const GEMINI_KEY = cleanEnv(process.env.GEMINI_API_KEY);

        // Check Env Vars
        if (!OPENAI_KEY || !UPSTASH_URL || !GEMINI_KEY) {
            console.error('Missing Environment Variables');
            return res.status(500).json({
                error: 'Server Configuration Error',
                details: 'Missing API Keys. Please configure OPENAI_API_KEY, UPSTASH_VECTOR_REST_URL, and GEMINI_API_KEY in Vercel settings.'
            });
        }

        // Initialize Clients
        if (!openai) openai = new OpenAI({ apiKey: OPENAI_KEY });
        if (!index) index = new Index({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
        if (!genAI) genAI = new GoogleGenerativeAI(GEMINI_KEY);

        // --- Step A: Embedding (Current Market State) ---
        let vector;
        try {
            // Construct a text representation similar to how we indexed the data
            // We use the last candle or a summary of recent price action
            const lastCandle = ohlc[ohlc.length - 1]; // [time, open, high, low, close]

            // Calculate Rank (Stochastic Position)
            // Rank = (Close - LowestLow) / (HighestHigh - LowestLow)
            const calculateRank = (data) => {
                if (!data || data.length === 0) return 0.5;
                const closes = data.map(c => c[4]);
                const lows = data.map(c => c[3]);
                const highs = data.map(c => c[2]);

                const currentClose = closes[closes.length - 1];
                const lowestLow = Math.min(...lows);
                const highestHigh = Math.max(...highs);

                if (highestHigh === lowestLow) return 0.5;
                return (currentClose - lowestLow) / (highestHigh - lowestLow);
            };

            const d1Rank = calculateRank(ohlc);
            const h4Rank = calculateRank(ohlc_4h);

            // Construct query text
            // CRITICAL: Must match the format used in scripts/vectorize_data.js (JSON structure)
            // Training format:
            // Symbol: ${data.symbol}
            // Timestamp: ${data.timestamp}
            // Action: ${data.action}
            // Market State: ${JSON.stringify(data.market_state)}
            // Outcome: ${JSON.stringify(data.outcome)}
            // Context: ${JSON.stringify(data.context)}

            // We exclude Symbol to allow generalization, but keep the rest of the structure.
            // We mock Outcome and Context as they are unknown for the current state.
            // ALIGNMENT FIX: Training data ONLY has D1_rank and H4_rank in market_state.
            const marketState = {
                D1_rank: parseFloat(d1Rank.toFixed(4)),
                H4_rank: parseFloat(h4Rank.toFixed(4))
            };

            // DEBUG: Log calculated market state to verify Vercel execution
            console.log('--- DEBUG MARKET STATE ---');
            console.log('D1 Rank:', marketState.D1_rank);
            console.log('H4 Rank:', marketState.H4_rank);

            const queryText = `
Symbol: ${symbol}
Timestamp: ${new Date().toISOString()}
Action: ${normalizedAction}
Market State: ${JSON.stringify(marketState)}
Outcome: "UNKNOWN"
Context: ${JSON.stringify({ D1: [], H4: [], H1: [] })}
`.trim();

            const embeddingResponse = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: queryText,
            });
            vector = embeddingResponse.data[0].embedding;
        } catch (err) {
            console.error("Step A (Embedding) Failed:", err);
            return res.status(200).json({
                final_verdict: "WAIT",
                confidence_score: 0,
                reasoning_summary: `Analysis failed at Embedding step: ${err.message}. Please check OpenAI API Key.`
            });
        }

        // --- Step B: RAG Retrieval (Top 10) ---
        let queryResult = [];
        try {
            queryResult = await index.query({
                vector: vector,
                topK: 10,
                includeMetadata: true,
                includeVectors: false,
                filter: `action = '${normalizedAction}'` // Strict filtering by action
            });
        } catch (err) {
            console.error("Step B (RAG) Failed:", err);
            // We can continue without RAG, just using Gemini? Or fail?
            // Let's fail gracefully for now as RAG is core.
            return res.status(200).json({
                final_verdict: "WAIT",
                confidence_score: 0,
                reasoning_summary: `Analysis failed at Retrieval step: ${err.message}. Please check Upstash configuration.`
            });
        }

        // --- Step C: Statistical Analysis ---
        // 3. Analyze Matches & Calculate Win Rate
        let buySuccessCount = 0;
        let totalBuyAttempts = 0;
        let sellSuccessCount = 0;
        let totalSellAttempts = 0;

        // Track holding times for successful trades
        let successfulHoldingTimes = [];

        // Debug Counters
        let matchesWithOutcome = 0;
        let matchesParsed = 0;

        if (queryResult) {
            queryResult.forEach((match, index) => {
                const meta = match.metadata;
                if (!meta) return;

                // DEBUG: Log first match details
                if (index === 0) {
                    console.log('--- DEBUG MATCH #0 ---');
                    console.log('Raw Action:', meta.action);
                    console.log('Raw Outcome Type:', typeof meta.outcome);
                    console.log('Raw Outcome Value:', meta.outcome);
                }

                // Parse outcome if it's a string (from our vectorization script)
                let outcome = meta.outcome;
                if (outcome) {
                    matchesWithOutcome++;
                    if (typeof outcome === 'string') {
                        try {
                            // Handle potential double-stringification or simple string
                            if (outcome.startsWith('"') || outcome.startsWith("'")) {
                                outcome = JSON.parse(outcome); // First unquote if needed
                            }
                            outcome = JSON.parse(outcome);
                            matchesParsed++;
                        } catch (e) {
                            console.error('Failed to parse outcome JSON', e);
                            // Try one more time if it was double stringified
                            try {
                                outcome = JSON.parse(outcome);
                            } catch (e2) { }
                        }
                    } else {
                        matchesParsed++;
                    }
                }

                if (index === 0) console.log('Parsed Outcome:', outcome);

                // Parse action
                const matchAction = meta.action ? meta.action.toUpperCase() : '';

                if (matchAction === 'BUY') {
                    totalBuyAttempts++;
                    // Data has 'realized_pnl'
                    if (outcome && (outcome.profit > 0 || outcome.roi > 0 || outcome.result === 'WIN' || outcome.realized_pnl > 0)) {
                        buySuccessCount++;
                        if (outcome.holding_period_hours) successfulHoldingTimes.push(outcome.holding_period_hours);
                    }
                } else if (matchAction === 'SELL') {
                    totalSellAttempts++;
                    if (outcome && (outcome.profit > 0 || outcome.roi > 0 || outcome.result === 'WIN' || outcome.realized_pnl > 0)) {
                        sellSuccessCount++;
                        if (outcome.holding_period_hours) successfulHoldingTimes.push(outcome.holding_period_hours);
                    }
                }
            });
        }

        const debugInfo = {
            total_matches: queryResult.length,
            matches_with_outcome: matchesWithOutcome,
            matches_parsed: matchesParsed,
            data_status: matchesWithOutcome < queryResult.length ? "PARTIAL_DATA_MISSING" : "OK"
        };

        const buyWinRate = totalBuyAttempts > 0 ? (buySuccessCount / totalBuyAttempts) : 0;
        const sellWinRate = totalSellAttempts > 0 ? (sellSuccessCount / totalSellAttempts) : 0;

        // Calculate Median Holding Time
        successfulHoldingTimes.sort((a, b) => a - b);
        let medianHoldingHours = 0;
        if (successfulHoldingTimes.length > 0) {
            const mid = Math.floor(successfulHoldingTimes.length / 2);
            medianHoldingHours = successfulHoldingTimes.length % 2 !== 0
                ? successfulHoldingTimes[mid]
                : (successfulHoldingTimes[mid - 1] + successfulHoldingTimes[mid]) / 2;
        }

        // --- Step D: Volatility Context ---
        // Calculate Volatility Ratio (Current ATR / Avg Historical ATR)
        // Heuristic: Baseline volatility for crypto is approx 2.5% (0.025)
        const volatilityRatio = (atr && currentPrice) ? (atr / currentPrice) : 0;
        const volatility_modifier = volatilityRatio > 0 ? (volatilityRatio / 0.025) : 1.0;

        // --- Step E: Gemini Analysis ---
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

            // Check for data quality issues (missing outcomes)
            // Check for data quality issues (missing outcomes)
            const missingDataRatio = queryResult.length > 0 ? (queryResult.length - matchesWithOutcome) / queryResult.length : 0;
            let dataQualityNote = "";
            if (missingDataRatio > 0.5) {
                dataQualityNote = "CRITICAL CONTEXT: Most historical matches are missing outcome data due to a system update. The '0% win rate' is likely due to missing records, NOT necessarily a bad strategy. Please state 'Insufficient historical data to determine win rate' instead of claiming failure.";
            }

            // Helper to format percentages safely
            const formatPct = (val) => (val !== null && val !== undefined) ? (val * 100).toFixed(0) + '%' : 'N/A';

            // --- 2. Construct Prompt ---
            const prompt = `
Context: You are an internal "Senior Trading Mentor" auditing a user's proposed trade. You have access to Global Market Stats (RAG) and the User's Personal History.

Task: Provide a "Fu Pan" (Replay Review) diagnosis.
**Persona Rules (CRITICAL):**
1. **NO PREAMBLE**: Do NOT start with "Based on...", "According to...", or "The data shows...". Start directly with the insight.
2. **Direct & Punchy**: Use short, professional sentences. Be ruthless but constructive.
3. **Thesis vs Reality**: Your main job is to check if their "Investment Note" matches the "Market Intelligence".
4. **PnL Over Win Rate**: Focus on **Realized PnL** and **Unrealized PnL** as performance indicators, NOT win rate percentages. Win rate is misleading for accumulation strategies.

${dataQualityNote}

**Output Sections:**

**1. Market Reality Check (The Global View)**
- State the **Global Win Rate** for this setup immediately.
- Define the **Expected Holding Time** (if clear).
- *Style*: "Globally, this setup wins 60% of the time. Expect to hold for ~40 hours."

**2. Personal Performance Review (PnL-Based)**
- **IF (Has Note/Tags)**:
    - *Action*: Compare their Note to the **Market Intelligence** below.
    - *Positive Example*: "Your thesis on 'Revenue Tokenomics' is solid. Fundamentals show TVL is indeed up 15%."
    - *Negative Example*: "You cite 'News Catalyst', but News Sentiment is Neutral. You might be front-running."
- **IF (No Note/Tags)**:
    - *Action*: Scold them gently. "You are trading naked. No thesis provided."
- **IF (Accumulation Mode - Unrealized PnL exists)**:
    - *Action*: Focus on **Unrealized PnL** quality. "You are accumulating. Paper gains are +10%, so your entries are decent."
    - *Negative*: "You are accumulating but down -15% on paper. Your average entry is poor."
- **IF (Active Trading - Realized PnL exists)**:
    - *Action*: Reference **Total Realized PnL** and **Behavioral Patterns**. "Your realized PnL on this asset is +$500. You profit when buying dips."
    - *Negative*: "Your realized PnL is -$200. You consistently lose when chasing breakouts."

**Input Data:**
- Symbol: ${symbol}
- Action: ${action}
- Global Buy Win Rate: ${(buyWinRate * 100).toFixed(1)}% (Wins: ${buySuccessCount}/${totalBuyAttempts})
- Global Sell Win Rate: ${(sellWinRate * 100).toFixed(1)}% (Wins: ${sellSuccessCount}/${totalSellAttempts})
- Volatility Modifier: ${volatility_modifier.toFixed(2)}
- Successful Holding Median: ${medianHoldingHours.toFixed(1)} hours

**Market Intelligence (The Reality):**
- **Fundamentals**: ${safeDesc} | TVL: ${safeTvl}
- **Technicals**: Score: ${safeTechScore}/100 | Action: ${safeTechAction}
- **News**: Sentiment: ${safeNewsSentiment} | Key Event: "${safeNewsHeadline}"

**User Personal Profile:**
${userProfile ? `
- Account Mode: ${userProfile.positionStats?.isAccumulating ? "ACCUMULATION (Holding)" : "ACTIVE TRADING"}
- Unrealized PnL (Paper Gain): ${(userProfile.positionStats?.unrealizedPnLPercent * 100).toFixed(2)}%
- Holding Ratio: ${(userProfile.positionStats?.holdingRatio * 100).toFixed(0)}%
- Win Count: ${userProfile.winCount || 0} | Loss Count: ${userProfile.lossCount || 0}

**Current Trade Context (Audit This):**
- **Action**: ${action}
- **Proposed Tags**: ${userProfile.currentThesis?.tags?.join(', ') || "None"}
- **Investment Note**: "${sanitize(userProfile.currentThesis?.notes)}"

**Past Narrative Logs:**
${userProfile.narrativeHistory?.map(n => `- ${n.date}: ${n.action} (${n.tags.join(', ')}) "${sanitize(n.note)}"`).join('\n') || "None"}

${userProfile.totalTrades > 0 ? `**Behavioral Patterns (Focus on PnL, not just Win Rate):**
- RSI < 30 Performance: ${formatPct(userProfile.behavioralStats?.rsi?.low_wr)} (${userProfile.behavioralStats?.rsi?.low_wr !== null ? 'Use PnL to judge quality' : 'No data'})
- RSI > 70 Performance: ${formatPct(userProfile.behavioralStats?.rsi?.high_wr)}
- High Volatility Performance: ${formatPct(userProfile.behavioralStats?.volatility?.high_vol_wr)}` : ""}
` : "No personal history."}

**Output JSON Schema:**
{
  "final_verdict": "BUY" | "SELL" | "WAIT",
  "global_analysis": "string",
  "personal_advice": "string",
  "buy_success_rate": number,
  "sell_success_rate": number,
  "confidence_score": number,
  "risk_ratio": number,
  "volatility_modifier": number
}

Return ONLY the JSON.
`;

            console.log('--- Step E: Gemini Analysis ---');
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            console.log('Gemini Raw Response:', responseText);

            // Clean up markdown if present
            const jsonString = responseText.replace(/```json/g, '').replace(/```/g, '').trim();

            let diagnosis;
            try {
                diagnosis = JSON.parse(jsonString);
            } catch (parseError) {
                console.error('JSON Parse Error:', parseError);
                console.error('Raw Output causing error:', responseText);

                // Fallback struct with EXPLICIT Error for debugging
                return res.status(200).json({
                    final_verdict: "WAIT",
                    global_analysis: "Global analysis unavailable due to processing error.",
                    personal_advice: `System Error: AI Output Invalid. Details: ${parseError.message.substring(0, 50)}. Raw: ${responseText.substring(0, 30)}...`,
                    buy_success_rate: 0,
                    sell_success_rate: 0,
                    confidence_score: 0,
                    risk_ratio: 0,
                    volatility_modifier: 0
                });
            }

            // Ensure rates match our calc (or let LLM adjust)
            // ... (rest of logic)
            // We'll override with our hard stats to be safe, or trust LLM?
            // Let's trust LLM but ensure fields exist
            diagnosis.buy_success_rate = diagnosis.buy_success_rate ?? buyWinRate;
            diagnosis.sell_success_rate = diagnosis.sell_success_rate ?? sellWinRate;
            diagnosis.successful_holding_median = medianHoldingHours; // Add this line

            // Attach Debug Info
            diagnosis.debug_info = debugInfo;

            res.status(200).json(diagnosis);

        } catch (geminiError) {
            console.error("Step E (Gemini) Failed:", geminiError);
            // Return fallback diagnosis instead of 500
            res.status(200).json({
                final_verdict: "WAIT",
                confidence_score: 0,
                buy_success_rate: buyWinRate,
                sell_success_rate: sellWinRate,
                global_analysis: `Based on 5 years of historical data, this setup has a global win rate of ${(buyWinRate * 100).toFixed(0)}%.`,
                personal_advice: `System Error: AI Service Failed. Details: ${geminiError.message || "Unknown Error"}. Please retry.`
            });
        }

    } catch (error) {
        console.error('AI Coach API Critical Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
