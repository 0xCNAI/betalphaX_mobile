import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { generateGeminiContent } from './geminiService';
import { analyzeTechnicals } from './technicalService';

/**
 * Step A2: Prepare Data for AI
 * Transforms raw transaction/market data into a clean, context-rich prompt object.
 * 
 * @param {Object} transaction 
 * @param {Object} position 
 * @param {Object} market_snapshot 
 * @param {Object} pro_ta 
 * @param {Object} inputData - Contains events and fundamentalData
 * @returns {Object} Structured input for AI
 */
export const prepareAiInput = (transaction, position, market_snapshot, pro_ta, inputData = {}) => {
    // 1. Reconstruct "Snapshot" if missing (using current data as fallback)
    const snapshot = market_snapshot || {
        price_at_execution: transaction.price,
        timestamp: transaction.date,
        // If we have pro_ta passed in, use it, otherwise empty
        technicals: pro_ta ? {
            score: pro_ta.score,
            action: pro_ta.action,
            rsi: pro_ta.oscillators?.rsi,
            trend_short: pro_ta.trends?.shortTerm,
            trend_long: pro_ta.trends?.longTerm,
            key_levels: pro_ta.keyLevels
        } : null
    };

    // 2. Format
    return {
        transaction: {
            type: transaction.type,
            asset: transaction.asset,
            price: transaction.price,
            amount: transaction.amount,
            date: transaction.date,
            total_value: transaction.price * transaction.amount
        },
        strategy_context: {
            tags: transaction.tags || [],
            notes: transaction.memo || transaction.notes || '',
            conviction: transaction.conviction || 'Medium', // Default
            timeframe: transaction.timeframe || 'Swing'
        },
        position: position ? {
            current_size: position.current_size,
            avg_entry_price: position.avg_entry_price,
            total_realized_pnl: position.realized_pnl_abs
        } : null,
        market_snapshot: {
            price_at_execution: snapshot.price_at_execution,
            technicals: snapshot.technicals || (pro_ta ? {
                score: pro_ta.score,
                action: pro_ta.action,
                rsi: pro_ta.oscillators?.rsi,
                trend_short: pro_ta.trends?.shortTerm,
                trend_long: pro_ta.trends?.longTerm,
                key_levels: pro_ta.keyLevels
            } : null),
            fundamentals: (inputData.fundamentalData ? {
                rank: inputData.fundamentalData.rank,
                mcap: inputData.fundamentalData.mcap,
                fdv: inputData.fundamentalData.fdv
            } : null),
            news: snapshot.news || null,
            sentiment: snapshot.social_sentiment || null
        },

        // Legacy/Live Injections (if snapshot is empty)
        events_live: inputData.events || []
    };
};

/**
 * Step A3: Generate AI Analysis
 * Calls Gemini API to get structured analysis.
 * 
 * @param {Object} input - The structured input from prepareAiInput
 * @returns {Promise<Object>} Structured AI output
 */
export const generateAiAnalysis = async (input) => {
    const { transaction, strategy_context, position, market_snapshot } = input;

    const prompt = `
    You are an expert crypto trading coach. Analyze this transaction and provide immediate feedback based on the "Reconstructed Context" of the trade.
    
    **1. TRADE EXECUTION**
    - ${transaction.type.toUpperCase()} ${transaction.asset} @ $${transaction.price}
    - Date: ${transaction.date}
    
    **2. STRATEGY & INTENT (User's Script)**
    - Thesis Tags: ${strategy_context.tags?.join(', ') || 'None'}
    - User Notes: "${strategy_context.notes || 'No notes provided'}"
    - Conviction: ${strategy_context.conviction || 'N/A'}
    
    **3. MARKET SCENE (At Moment of Trade)**
    - Market Price: $${market_snapshot.price_at_execution || 'N/A'}
    
    [Technical Environment]
    ${market_snapshot.technicals ? `
    - Score: ${market_snapshot.technicals.score}/100 (${market_snapshot.technicals.action})
    - RSI: ${market_snapshot.technicals.rsi || market_snapshot.technicals.rsi_1h || 'N/A'}
    - Trend: Short(${market_snapshot.technicals.trend_short || 'N/A'}), Long(${market_snapshot.technicals.trend_long || 'N/A'})
    - Key Levels: Support ${market_snapshot.technicals.key_levels?.support || 'N/A'}, Res ${market_snapshot.technicals.key_levels?.resistance || 'N/A'}
    ` : '- No detailed technical context captured.'}

    [News & Sentiment]
    ${market_snapshot.news ? `- Headlines:\n${market_snapshot.news.map(n => `  * ${n.headline}`).join('\n')}` : '- No news headlines captured.'}
    ${market_snapshot.sentiment ? `- Sentiment Score: ${market_snapshot.sentiment.score} (${market_snapshot.sentiment.verdict})` : '- Sentiment N/A'}
    
    **4. POSITION CONTEXT**
    ${position ? `- Current Size: ${position.current_size}\n- Avg Entry: ${position.avg_entry_price}\n- Realized PnL: ${position.total_realized_pnl}` : '- No prior position data.'}
    
    **Your Task:**
    Provide a structured diagnosis.
    
    1. **ai_entry_summary**: Assess WHY the trade was taken. Does the "Strategy" match the "Market Scene"? (e.g. "User bought on breakout (Tag), and Technicals confirm strong momentum (Score 80).")
    2. **ai_risk_comment**: Identify risks. (e.g. "High Risk: Buying into resistance with bearish divergence visible in snapshot.")
    3. **ai_exit_plan**: Concrete advice.
    4. **ai_ta_snapshot**: reconstruct trend/verdicts from the provided data.
    
    JSON Output Format:
    {
        "ai_entry_summary": "string",
        "ai_exit_plan": "string",
        "ai_risk_comment": "string",
        "ai_ta_snapshot": {
            "short_term": { "trend": "bullish"|"bearish", "support": "string", "resistance": "string" },
            "long_term": { "trend": "bullish"|"bearish", "support": "string", "resistance": "string" },
            "overall_verdict": "buy"|"sell"|"hold"
        },
        "ai_fundamental_insights": { "items": [] }, 
        "ai_events_insights": { "items": [] }
    }
    `;

    console.log("[AI Analysis] Prompt constructed with Pro TA:", !!input.pro_ta);

    try {
        // Use Gemini (Mobile Manager Logic)
        const generatedText = await generateGeminiContent(prompt);

        if (!generatedText) throw new Error("No response from Gemini");

        const jsonString = generatedText.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(jsonString);

    } catch (error) {
        console.error("Error generating AI analysis:", error);

        let errorMessage = "AI analysis unavailable.";

        // Check for specific rate limit or exhaustion errors
        if (error.message.includes('exhausted') || error.message.includes('Rate limit') || error.message.includes('429') || error.message.includes('503')) {
            errorMessage = "⚠️ AI Service Cooling Down (Rate Limit Reached). Please try again later.";
        }

        return {
            ai_entry_summary: errorMessage,
            ai_exit_plan: null,
            ai_risk_comment: null,
            ai_ta_snapshot: {
                short_term: { trend: null, support: null, resistance: null },
                long_term: { trend: null, support: null, resistance: null },
                overall_verdict: null,
                volatility_comment: null
            }
        };
    }
};

/**
 * Step A4: Write-back Analysis
 * Updates the transaction document with the AI results.
 * 
 * @param {string} userId 
 * @param {string} txId 
 * @param {Object} aiResult 
 */
export const writeBackAnalysis = async (userId, txId, aiResult) => {
    try {
        const txRef = doc(db, 'transactions', txId);

        await updateDoc(txRef, {
            ai_entry_summary: aiResult.ai_entry_summary,
            ai_exit_plan: aiResult.ai_exit_plan,
            ai_risk_comment: aiResult.ai_risk_comment,
            ai_ta_snapshot: aiResult.ai_ta_snapshot
        });

        console.log(`AI analysis written back to transaction ${txId}`);
    } catch (error) {
        console.error("Error writing back AI analysis:", error);
    }
};

/**
 * Generate AI analysis preview (without saving to DB)
 * @param {Object} transactionData 
 * @param {Object} positionData 
 * @param {Object} proTaData 
 * @param {Object} fundamentalData 
 * @param {Array} events 
 * @returns {Promise<Object>} The generated AI analysis JSON
 */
export async function previewAiAnalysis(transactionData, positionData, proTaData, fundamentalData, events) {
    try {
        // marketContext is not available for preview, pass null
        const input = prepareAiInput(transactionData, positionData, null, proTaData, { fundamentalData, events });
        const analysis = await generateAiAnalysis(input);
        return analysis;
    } catch (error) {
        console.error("Error generating AI preview:", error);
        throw error;
    }
}

/**
 * Orchestrator function to run the full AI analysis flow.
 * 
 * @param {string} userId 
 * @param {string} transactionId 
 * @param {Object} transactionData 
 * @param {Object} positionData 
 */
export const runPostTransactionAnalysis = async (userId, transactionId, transactionData, positionData) => {
    try {
        // 1. Fetch Pro Technical Analysis
        let proTaData = null;
        try {
            console.log(`[AI Analysis] Fetching Pro TA for ${transactionData.asset}...`);
            proTaData = await analyzeTechnicals(transactionData.asset, transactionData.price);
            console.log(`[AI Analysis] Pro TA fetched:`, proTaData ? 'Success' : 'Null');
        } catch (taError) {
            console.warn("[AI Analysis] Failed to fetch Pro TA data, proceeding without it:", taError);
        }

        // 2. Prepare Input with Pro TA
        const input = prepareAiInput(transactionData, positionData, null, proTaData, {
            fundamentalData: transactionData.ai_fundamental,
            events: transactionData.ai_events
        });

        // 3. Generate Analysis
        const result = await generateAiAnalysis(input);

        // 4. Write Back
        await writeBackAnalysis(userId, transactionId, result);

    } catch (error) {
        console.error("Failed to run post-transaction analysis:", error);
    }
};
