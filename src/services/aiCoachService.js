import { db } from './firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { generateGeminiContent } from './geminiService';
import { translateText } from './translationService';

const USERS_COLLECTION = 'users';
const ASSET_SUMMARIES = 'asset_summaries';
const USER_METRICS_DOC = 'ai_user_metrics/summary';

// --- Desktop: src/services/geminiService.js -> generateCoachReview ---
export const generateCoachReview = async (userSummary, assetSummary, currentTransaction = null, language = 'en') => {
    const isChinese = language === 'zh-TW' || (language && language.startsWith('zh'));

    // Always use English for generation consistency
    const roleDesc = "Role: Professional Crypto Trading Coach (Persona: Strict, data-driven, focused on behavioral psychology and system discipline).";

    const taskDesc = `Task: Review the user's trading pattern for ${assetSummary?.assetSymbol || 'this asset'} and provide a critical "Review & Adjustments" assessment.`;

    const extraContext = currentTransaction
        ? `Wait! The user is about to SAVE A NEW TRANSACTION for ${currentTransaction.asset}. Review this SPECIFIC trade setup against their history.`
        : '';

    const outputInstruction = `Output Format (Strict JSON):
{
    "behavior_summary": "A single, conversational paragraph (approx 3-5 sentences) acting as a direct human coach. Critique the trade setup or validate it based on the data. Be natural, insightful, and direct ('说人话'). Do NOT use bullet points here. Focus on the psychology and system alignment.",
    "recommended_playbook": [
        {
            "rule": "Short, actionable rule title",
            "reasoning": "Brief explanation."
        }
    ]
}`;

    const prompt = `
${roleDesc}
${taskDesc}
${extraContext}

Input Data:
1. User Profile:
${JSON.stringify(userSummary || {}, null, 2)}

2. Asset Context:
${JSON.stringify(assetSummary || {}, null, 2)}

${currentTransaction ? `
3. CURRENT TRANSACTION DRAFT:
${JSON.stringify(currentTransaction, null, 2)}
` : ''}


${outputInstruction}

IMPORTANT:
IMPORTANT:
Output in English.
`;

    try {
        console.log(`[AI Coach] Calling Gemini...`);
        const generatedText = await generateGeminiContent(prompt);
        if (!generatedText) return null;

        const jsonString = generatedText.replace(/```json\n?|\n?```/g, '').trim();
        const result = JSON.parse(jsonString);

        // --- Translation Layer ---
        if (isChinese) {
            console.log('[AI Coach] Applying translation layer...');
            if (result.behavior_summary) {
                const translatedSummary = await translateText(result.behavior_summary, 'zh-TW');
                if (translatedSummary) result.behavior_summary = translatedSummary;
            }
            if (result.recommended_playbook && Array.isArray(result.recommended_playbook)) {
                await Promise.all(result.recommended_playbook.map(async (item) => {
                    if (item.rule) {
                        const tRule = await translateText(item.rule, 'zh-TW');
                        if (tRule) item.rule = tRule;
                    }
                    if (item.reasoning) {
                        const tReason = await translateText(item.reasoning, 'zh-TW');
                        if (tReason) item.reasoning = tReason;
                    }
                }));
            }
        }

        return result;

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
export const runPreTradeReview = async (userId, assetSymbol, transactionData, allTransactions = [], language = 'en') => {
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
        console.log(`[AI Coach] Generating PRE-TRADE review for ${upperAsset} (Language: ${language})...`);
        const aiReview = await generateCoachReview(userSummary, assetSummary, transactionData, language);

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
