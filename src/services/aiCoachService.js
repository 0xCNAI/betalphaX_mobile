
import { fetchOHLC } from './marketDataServiceNew';
import { generateGeminiContent } from './geminiService';

/**
 * Generates the AI Coach Review using the Desktop Prompt Logic.
 * Matches desktop: src/services/geminiService.js -> generateCoachReview
 */
async function generateCoachReview(userSummary, assetSummary, currentTransaction) {
    const prompt = `
Role: Professional Crypto Trading Coach (Persona: Strict, data-driven, focused on behavioral psychology and system discipline).
Task: Review the user's trading pattern for ${assetSummary?.assetSymbol || 'this asset'} and provide a critical "Review & Adjustments" assessment.
${currentTransaction ? `Wait! The user is about to SAVE A NEW TRANSACTION for ${currentTransaction.asset}. Review this SPECIFIC trade setup against their history.` : ''}

Input Data:
1. User Profile (Global Stats & Psychology):
${JSON.stringify(userSummary || {}, null, 2)}

2. Asset Context (History for ${assetSummary?.assetSymbol}):
${JSON.stringify(assetSummary || {}, null, 2)}

3. CURRENT TRANSACTION DRAFT (PRE-TRADE):
${JSON.stringify(currentTransaction, null, 2)}

Output Format (Strict JSON):
{
    "behavior_summary": "A single, conversational paragraph (approx 3-5 sentences) acting as a direct human coach. Critique the trade setup or validate it based on the data. Be natural, insightful, and direct ('说人话'). Do NOT use bullet points here. Focus on the psychology and system alignment. Example: 'Looking at your history, this setup seems solid. You usually hesitate here, but the data supports a long. Just watch out for that stop loss level as you tend to set it too tight.'",
    "recommended_playbook": [
        {
            "rule": "Short, actionable rule title (e.g. 'Define Invalidation Point')",
            "reasoning": "Brief explanation of why this applies now."
        },
        {
            "rule": "Another rule...",
            "reasoning": "..."
        }
    ]
}
`;

    try {
        console.log(`[AI Coach] Calling Gemini...`);
        const generatedText = await generateGeminiContent(prompt);
        if (!generatedText) return null;

        const jsonString = generatedText.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(jsonString);

    } catch (error) {
        console.error("AI Coach Generation Failed:", error);
        return {
            behavior_summary: "AI Coach is currently offline. Please stick to your trading layout.",
            recommended_playbook: []
        };
    }
}

/**
 * Get AI Coach advice for a trade (Client-Side Logic)
 * @param {string} symbol - Asset symbol
 * @param {string} action - 'BUY' or 'SELL'
 * @param {Array} transactions - User's full transaction history
 * @param {Object} formData - Current form data (price, amount, notes)
 * @returns {Promise<Object>} Diagnosis object matching desktop schema
 */
export async function getCoachAdvice(symbol, action, transactions = [], formData = {}) {
    try {
        // 1. Calculate Statistics (Emulate User/Asset Summary)
        const allTrades = transactions || [];
        const assetTrades = allTrades.filter(t => t.asset === symbol);

        // Global Stats
        const totalRealizedPnL = allTrades.reduce((acc, t) => acc + (parseFloat(t.realizedPnL) || 0), 0);
        const winCount = allTrades.filter(t => (parseFloat(t.realizedPnL) || 0) > 0).length;
        const lossCount = allTrades.filter(t => (parseFloat(t.realizedPnL) || 0) < 0).length;

        const userSummary = {
            totalTrades: allTrades.length,
            totalRealizedPnL: totalRealizedPnL,
            winRate: allTrades.length > 0 ? winCount / allTrades.length : 0,
            winCount,
            lossCount
        };

        // Asset Stats
        const assetRealizedPnL = assetTrades.reduce((acc, t) => acc + (parseFloat(t.realizedPnL) || 0), 0);
        const assetWins = assetTrades.filter(t => (parseFloat(t.realizedPnL) || 0) > 0).length;

        const assetSummary = {
            assetSymbol: symbol,
            totalTrades: assetTrades.length,
            realizedPnL: assetRealizedPnL,
            winRate: assetTrades.length > 0 ? assetWins / assetTrades.length : 0,
            lastTradeDate: assetTrades.length > 0 ? assetTrades[assetTrades.length - 1].date : null
        };

        // Current Transaction Context
        const currentTransaction = {
            asset: symbol,
            action: action,
            price: formData.price,
            amount: formData.amount,
            notes: formData.investmentNotes,
            tags: formData.tags
        };

        // 2. Generate Advice
        const advice = await generateCoachReview(userSummary, assetSummary, currentTransaction);

        if (advice) {
            // Map to expected format if needed, or return as is
            // Desktop returns { behavior_summary, recommended_playbook }
            return advice;
        }

        return null;

    } catch (error) {
        console.error('Error getting coach advice:', error);
        return null;
    }
}

function calculateATR(ohlc, period = 14) {
    if (ohlc.length < period + 1) return 0;

    let trSum = 0;
    for (let i = ohlc.length - period; i < ohlc.length; i++) {
        const current = ohlc[i];
        const prev = ohlc[i - 1];

        const high = current[2];
        const low = current[3];
        const prevClose = prev[4];

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trSum += tr;
    }

    return trSum / period;
}
