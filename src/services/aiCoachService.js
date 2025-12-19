import { db } from './firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { generateGeminiContent } from './geminiService';

const USERS_COLLECTION = 'users';
const ASSET_SUMMARIES = 'asset_summaries';
const USER_METRICS_DOC = 'ai_user_metrics/summary';

// --- Desktop: src/services/geminiService.js -> generateCoachReview ---
export const generateCoachReview = async (userSummary, assetSummary, currentTransaction = null, language = 'en') => {
    const isChinese = language === 'zh-TW';
    const roleDesc = isChinese
        ? "角色：專業加密貨幣交易教練 (性格：嚴格、數據驅動、專注於行為心理學和紀律)。"
        : "Role: Professional Crypto Trading Coach (Persona: Strict, data-driven, focused on behavioral psychology and system discipline).";

    const taskDesc = isChinese
        ? `任務：審查用戶對 ${assetSummary?.assetSymbol || '此資產'} 的交易模式，並提供批判性的「審查與調整」評估。`
        : `Task: Review the user's trading pattern for ${assetSummary?.assetSymbol || 'this asset'} and provide a critical "Review & Adjustments" assessment.`;

    const extraContext = currentTransaction
        ? (isChinese ? `等等！用戶正準備儲存 ${currentTransaction.asset} 的新交易。請針對此特定的交易設置對比其歷史進行審查。` : `Wait! The user is about to SAVE A NEW TRANSACTION for ${currentTransaction.asset}. Review this SPECIFIC trade setup against their history.`)
        : '';

    const outputInstruction = isChinese
        ? `輸出格式 (嚴格 JSON):
{
    "behavior_summary": "一段像真人教練般的對話段落 (約 3-5 句話)。根據數據批評交易設置或給予肯定。請自然、有洞察力且直接 ('說人話')。不要使用條列式。專注於心理和系統一致性。例如：'看你的歷史，這個設置看起來很穩。你通常在這裡會猶豫，但數據支持做多。只是要注意止損位，你傾向於設得太緊。'",
    "recommended_playbook": [
        {
            "rule": "簡短且可執行的規則標題 (例如 '定義失效點')",
            "reasoning": "簡要解釋為什麼這現在適用。"
        }
    ]
}`
        : `Output Format (Strict JSON):
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
${isChinese ? 'Strictly output ONLY in Traditional Chinese (繁體中文). Do not use English unless it is a specific proper noun.' : 'Output in English.'}
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
