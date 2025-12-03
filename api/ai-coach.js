
import { OpenAI } from 'openai';
import { Index } from '@upstash/vector';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// Clients will be initialized inside handler to avoid crash on missing env vars
let openai;
let index;
let genAI;

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
        const { symbol, ohlc, ohlc_4h, ohlc_1h, action, currentPrice, atr } = req.body;
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
                c[5] / meanVolume // Volume
            ]);
        };

        const context = {
            D1: normalizeOHLC(ohlc),
            H4: normalizeOHLC(ohlc_4h || []),
            H1: normalizeOHLC(ohlc_1h || [])
        };

        // Sanitize Env Vars (remove quotes if present)
        const sanitize = (val) => val ? val.replace(/^"|"$/g, '').replace(/^'|'$/g, '') : val;
        const OPENAI_KEY = sanitize(process.env.OPENAI_API_KEY);
        const UPSTASH_URL = sanitize(process.env.UPSTASH_VECTOR_REST_URL);
        const UPSTASH_TOKEN = sanitize(process.env.UPSTASH_VECTOR_REST_TOKEN);
        const GEMINI_KEY = sanitize(process.env.GEMINI_API_KEY);

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
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            // Check for data quality issues (missing outcomes)
            const missingDataRatio = queryResult.length > 0 ? (queryResult.length - matchesWithOutcome) / queryResult.length : 0;
            let dataQualityNote = "";
            if (missingDataRatio > 0.5) {
                dataQualityNote = "CRITICAL CONTEXT: Most historical matches are missing outcome data due to a system update. The '0% win rate' is likely due to missing records, NOT necessarily a bad strategy. Please state 'Insufficient historical data to determine win rate' instead of claiming failure.";
            }

            const prompt = `
Context: The RAG system has completed statistical analysis. The final stage requires the Gemini 2.5 Flash LLM to adopt the "Intuitive Coach" persona.

Task: Generate a final, cohesive, and easy-to-understand diagnosis. Structure the output into three parts that flow naturally, adhering strictly to the constraints below.

LLM Constraints & Persona:
- Persona: Intuitive Trading Coach (Pragmatic and Warning-Focused).
- Jargon Exclusion: DO NOT use the terms ATR, PnL, Volatility Ratio, or explicit Beta values.
- Style: Use simple language and short, impactful sentences.
- Output Language: English (Must be in English).

${dataQualityNote}

Three-Part Synthesis Structure (Required Output Flow):

Part 1: The Probability Statement (Data First):
State the total number of similar cases found, the success count for the opposite action (if relevant), and the resulting Win Rate.
Focus: Establish the negative/positive bias based on the historical record.
Example: In the past ${totalBuyAttempts + totalSellAttempts} similar market setups, expert traders successfully sold for profit X times. Therefore, your buy decision has a historical win rate of only ${(buyWinRate * 100).toFixed(0)}%.

Part 2: The Risk Story (Warning Intensity):
CRITICAL INSTRUCTION: Use the volatility_modifier value (${volatility_modifier.toFixed(2)}) as a Dial for Warning Intensity.
- If Modifier is Low (< 1.2): Use calm, stabilizing language (e.g., "The market is steady, allowing tight stops.").
- If Modifier is High (> 2.0): Use urgent, dramatic language to describe the risk. Translate the high ratio into concrete market behavior consequences (e.g., 'your stops will be swept', 'extreme chop', 'sudden crash risk').
Focus: Translate the raw risk number into an intuitive, non-technical warning about market instability.

Part 3: Actionable Verdict (Clear Instruction & Timeline):
Provide clear instructions regarding the best action and necessary risk adjustment.
**MANDATORY TIMELINE:**
- If 'Successful Holding Median' is > 0: You MUST include "Expected holding time is around X hours" (convert to days if > 48h).
- If 'Successful Holding Median' is 0 (No successful trades): You MUST state "Insufficient historical data to project a holding timeline."
Example: I recommend entering now. Expected holding time is around 12 hours.

**Input Data:**
- Symbol: ${symbol}
- Action: ${action}
- Buy Win Rate: ${(buyWinRate * 100).toFixed(1)}% (Wins: ${buySuccessCount}/${totalBuyAttempts})
- Sell Win Rate: ${(sellWinRate * 100).toFixed(1)}% (Wins: ${sellSuccessCount}/${totalSellAttempts})
- Volatility Modifier: ${volatility_modifier.toFixed(2)}
- Successful Holding Median: ${medianHoldingHours.toFixed(1)} hours
- Data Quality Warning: ${missingDataRatio > 0.5 ? "HIGH (Missing Outcomes)" : "None"}

**Output JSON Schema:**
{
  "final_verdict": "BUY" | "SELL" | "WAIT",
  "buy_success_rate": number, // 0.0 - 1.0
  "sell_success_rate": number, // 0.0 - 1.0
  "confidence_score": number, // 0.0 - 1.0
  "risk_ratio": number,
  "volatility_modifier": number,
  "reasoning_summary": "string" // The synthesized 3-part text goes here
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
                throw new Error(`Invalid JSON from Gemini: ${responseText.substring(0, 50)}...`);
            }

            // Ensure rates match our calc (or let LLM adjust)
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
                reasoning_summary: `AI Analysis failed: ${geminiError.message}. However, historical win rates are: Buy ${(buyWinRate * 100).toFixed(0)}%, Sell ${(sellWinRate * 100).toFixed(0)}%.`
            });
        }

    } catch (error) {
        console.error('AI Coach API Critical Error:', error);
        res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
}
