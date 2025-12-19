
import { db } from './firebase';
import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { generateCoachReview } from './geminiService'; // Import from geminiService

const USERS_COLLECTION = 'users';
const ASSET_SUMMARIES = 'asset_summaries';
const USER_METRICS_DOC = 'ai_user_metrics/summary';

/**
 * Runs the AI Coach "Review & Adjustments" process for a specific asset.
 * Fetches UserSummary and AssetSummary, calls AI, and updates the AssetSummary doc.
 * 
 * @param {string} userId
 * @param {string} assetSymbol
 * @returns {Promise<Object>} The generated review data
 */
export const runCoachReview = async (userId, assetSymbol) => {
    if (!userId || !assetSymbol) return null;
    const upperAsset = assetSymbol.toUpperCase();

    try {
        // 1. Fetch User Summary (Global Context)
        const userSummaryRef = doc(db, USERS_COLLECTION, userId, USER_METRICS_DOC);
        const userSummarySnap = await getDoc(userSummaryRef);
        const userSummary = userSummarySnap.exists() ? userSummarySnap.data() : {};

        // 2. Fetch Asset Summary (Specific Context)
        const assetSummaryRef = doc(db, USERS_COLLECTION, userId, ASSET_SUMMARIES, upperAsset);
        const assetSummarySnap = await getDoc(assetSummaryRef);

        if (!assetSummarySnap.exists()) {
            throw new Error(`Summary not found for ${upperAsset}. Please repair database or add transactions.`);
        }
        const assetSummary = assetSummarySnap.data();

        // 3. Generate AI Review
        console.log(`[AI Coach] Generating review for ${upperAsset}...`);
        const aiReview = await generateCoachReview(userSummary, assetSummary);

        if (!aiReview) {
            throw new Error('AI Coach failed to generate review.');
        }

        // 4. Update Asset Summary with new fields
        const updates = {
            ai_behavior_summary: aiReview.behavior_summary,
            ai_recommended_playbook: aiReview.recommended_playbook,
            ai_last_review_at: new Date().toISOString(),
            ai_model_version: 'v2.5-flash-lite'
        };

        await updateDoc(assetSummaryRef, updates);
        console.log(`[AI Coach] Review saved for ${upperAsset}`);

        return updates;

    } catch (error) {
        console.error(`[AI Coach] Error running review for ${upperAsset}:`, error);
        throw error;
    }
};
/**
 * Runs the AI Coach for a specific transaction DRAFT (Pre-trade or Pre-save).
 * Does NOT persist to DB immediately, just returns the advice for the UI.
 *
 * @param {string} userId
 * @param {string} assetSymbol
 * @param {Object} transactionData
 * @returns {Promise<Object>}
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
        // Check both camelCase and snake_case to avoid overwriting valid DB data
        const hasValidSummary = assetSummary && (assetSummary.totalTrades || assetSummary.total_trades);

        if (!hasValidSummary && allTransactions && allTransactions.length > 0) {
            const assetTxs = allTransactions.filter(t => t.asset === upperAsset && t.status === 'closed');
            if (assetTxs.length > 0) {
                const totalRealized = assetTxs.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
                const wins = assetTxs.filter(t => Number(t.pnl) > 0).length;
                const winRate = assetTxs.length > 0 ? Math.round((wins / assetTxs.length) * 100) : 0;

                assetSummary = {
                    assetSymbol: upperAsset,
                    realizedPnL: totalRealized.toFixed(2),
                    winRate: winRate,
                    totalTrades: assetTxs.length,
                    avgHoldTime: 0, // Complex to calc, skip for fallback
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

        // Ensure assetSymbol is present (DB might not store it if it's the doc ID)
        if (assetSummary) {
            assetSummary.assetSymbol = assetSummary.assetSymbol || upperAsset;
        }

        // 3. Generate Review with Transaction Context
        console.log(`[AI Coach] Generating PRE-TRADE review for ${upperAsset} (Trades: ${assetSummary?.totalTrades || assetSummary?.total_trades || 0})...`);

        // DEBUG: Log raw objects to trace "undefined" issues
        console.log('[AI Coach] Raw User Summary:', JSON.stringify(userSummary, null, 2));
        console.log('[AI Coach] Raw Asset Summary:', JSON.stringify(assetSummary, null, 2));

        const aiReview = await generateCoachReview(userSummary, assetSummary, transactionData);

        return aiReview;

    } catch (error) {
        console.error(`[AI Coach] Error running pre-trade review:`, error);
        return null; // Fail gracefully
    }
};
/**
 * Persists the Pre-Trade Review to the Asset Summary.
 * Called after user accepts the trade and saves it.
 *
 * @param {string} userId
 * @param {string} assetSymbol
 * @param {Object} reviewData - The AI review object (behavior_summary, recommended_playbook)
 */
export const savePreTradeReviewToSummary = async (userId, assetSymbol, reviewData) => {
    if (!userId || !assetSymbol || !reviewData) return;
    const upperAsset = assetSymbol.toUpperCase();

    try {
        const assetSummaryRef = doc(db, USERS_COLLECTION, userId, ASSET_SUMMARIES, upperAsset);

        // Ensure doc exists (it should if they have history, but prebooking a trade might be first)
        // If it doesn't exist, we might need to wait for recalculateAssetSummary to create it,
        // OR we just use setDoc with merge to be safe.

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
        // Non-critical error, don't block
    }
};
