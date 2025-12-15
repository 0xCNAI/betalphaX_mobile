import { db } from './firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { generateGeminiContent } from './geminiService';

const USERS_COLLECTION = 'users';
const ASSET_SUMMARIES = 'asset_summaries';
const USER_METRICS_DOC = 'ai_user_metrics/summary';

// --- Desktop: src/services/geminiService.js -> generateCoachReview ---
export const generateCoachReview = async (userSummary, assetSummary, currentTransaction = null) => {
    const prompt = `
Role: Professional Crypto Trading Coach (Persona: Strict, data-driven, focused on behavioral psychology and system discipline).
Task: Review the user's trading pattern for ${assetSummary?.assetSymbol || 'this asset'} and provide a critical "Review & Adjustments" assessment.
${currentTransaction ? `Wait! The user is about to SAVE A NEW TRANSACTION for ${currentTransaction.asset}. Review this SPECIFIC trade setup against their history.` : ''}

Input Data:
1. User Profile (Global Stats & Psychology):
${JSON.stringify(userSummary || {}, null, 2)}

2. Asset Context (History for ${assetSummary?.assetSymbol}):
${JSON.stringify(assetSummary || {}, null, 2)}

${currentTransaction ? `
3. CURRENT TRANSACTION DRAFT (PRE-TRADE):
${JSON.stringify(currentTransaction, null, 2)}
` : ''}

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
};

/**
 * Runs the AI Coach for a specific transaction DRAFT (Pre-trade or Pre-save).
 * Does NOT persist to DB immediately, just returns the advice for the UI.
 * Matches Desktop: src/services/aiCoachService.js -> runPreTradeReview
 */
export const runPreTradeReview = async (userId, assetSymbol, transactionData, allTransactions = []) => {
    if (!userId || !assetSymbol) return null;
    const upperAsset = assetSymbol.toUpperCase();

    try {
        // 1. Fetch User Summary
        const userSummaryRef = doc(db, USERS_COLLECTION, userId, USER_METRICS_DOC);
        const userSummarySnap = await getDoc(userSummaryRef);
        const userSummary = userSummarySnap.exists() ? userSummarySnap.data() : {};

        // 2. Fetch Asset Summary
        const assetSummaryRef = doc(db, USERS_COLLECTION, userId, ASSET_SUMMARIES, upperAsset);
        const assetSummarySnap = await getDoc(assetSummaryRef);
        let assetSummary = assetSummarySnap.exists() ? assetSummarySnap.data() : null;

        // 2b. Synthesize Summary if missing (Fallback using client-side history)
        const hasValidSummary = assetSummary && (assetSummary.totalTrades || assetSummary.total_trades);

        if (!hasValidSummary && allTransactions && allTransactions.length > 0) {
            const assetTxs = allTransactions.filter(t => t.asset === upperAsset);
            if (assetTxs.length > 0) {
                const totalRealized = assetTxs.reduce((sum, t) => sum + (Number(t.realizedPnL) || 0), 0);
                const wins = assetTxs.filter(t => Number(t.realizedPnL) > 0).length;
                const winRate = assetTxs.length > 0 ? Math.round((wins / assetTxs.length) * 100) : 0;

                // Simple check for accumulation if holding > 0 (heuristic for fallback)
                // Note: Desktop fallback might be simpler, but we duplicate what's there
                assetSummary = {
                    assetSymbol: upperAsset,
                    realizedPnL: totalRealized.toFixed(2),
                    winRate: winRate,
                    totalTrades: assetTxs.length,
                    avgHoldTime: 0,
                    maxDrawdown: 0,
                    mistakes: []
                };
                console.log(`[AI Coach] Synthesized fallback summary based on ${assetTxs.length} local transactions.`);
            }
        }

        // If still no summary, default to empty object but with symbol
        if (!assetSummary) {
            assetSummary = { assetSymbol: upperAsset, note: "No prior history found." };
        }

        // Ensure assetSymbol is present
        if (assetSummary) {
            assetSummary.assetSymbol = assetSummary.assetSymbol || upperAsset;
        }

        // 3. Generate Review with Transaction Context
        console.log(`[AI Coach] Generating PRE-TRADE review for ${upperAsset}...`);
        const aiReview = await generateCoachReview(userSummary, assetSummary, transactionData);

        return aiReview;

    } catch (error) {
        console.error(`[AI Coach] Error running pre-trade review:`, error);
        return null;
    }
};

/**
 * Persists the Pre-Trade Review to the Asset Summary.
 * Matches Desktop: src/services/aiCoachService.js -> savePreTradeReviewToSummary
 */
export const savePreTradeReviewToSummary = async (userId, assetSymbol, reviewData) => {
    if (!userId || !assetSymbol || !reviewData) return;
    const upperAsset = assetSymbol.toUpperCase();

    try {
        const assetSummaryRef = doc(db, USERS_COLLECTION, userId, ASSET_SUMMARIES, upperAsset);

        const updates = {
            ai_behavior_summary: reviewData.behavior_summary,
            ai_recommended_playbook: reviewData.recommended_playbook,
            ai_last_review_at: new Date().toISOString(),
            ai_model_version: 'v2.5-flash-lite'
        };

        await setDoc(assetSummaryRef, updates, { merge: true });
        console.log(`[AI Coach] Pre-trade review saved for ${upperAsset}`);

    } catch (error) {
        console.error(`[AI Coach] Error saving pre-trade review for ${upperAsset}:`, error);
    }
};
