import { db } from './firebase';
import { collection, query, where, getDocs, doc, setDoc, deleteDoc, writeBatch, getDoc } from 'firebase/firestore';
import { createAssetSummary, createUserSummary } from '../types/summary';
import { generateAssetNoteSummary } from './geminiService';

const ASSET_SUMMARIES = 'asset_summaries';
const USER_METRICS_DOC = 'user_metrics';

/**
 * Calculate standard asset metrics from a list of transactions.
 * Matches Desktop logic exactly.
 * 
 * @param {Array} transactions 
 * @param {number} currentPrice - Latest market price
 * @returns {Object} Metric fields for AssetSummary
 */
export const calculateAssetMetrics = (transactions, currentPrice = 0) => {
    if (!transactions || transactions.length === 0) return {};

    // Sort valid transactions
    const sorted = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    // Initialize State
    let current_size = 0;
    let total_cost_basis = 0; // For current holdings
    let lifetime_invested_cost = 0; // Total capital EVER put in (for realized PnL pct)
    let realized_pnl_abs = 0;

    // Round Trip Tracking
    let round_trips = 0;
    let profitable_round_trips = 0;
    let losing_round_trips = 0;
    let breakeven_round_trips = 0;
    let round_trip_pnls = []; // Store % return of each completed cycle

    // Holding Time Tracking
    let open_cycle_start = null;
    let total_holding_hours = 0;
    let completed_holding_periods = 0;
    let max_holding_hours = 0;

    // Cycle State
    let cycle_open_cost = 0;
    let cycle_open_size = 0;

    // Time tracking
    const first_trade_at = sorted[0].date;
    const last_trade_at = sorted[sorted.length - 1].date;
    let last_opened_at = null;
    let last_closed_at = null;

    // Iterate
    sorted.forEach((tx, index) => {
        const amount = Number(tx.amount) || 0;
        const price = Number(tx.price) || 0;
        const type = tx.type?.toLowerCase();
        const date = new Date(tx.date);

        if (type === 'buy') {
            // New Cycle Check
            if (current_size === 0) {
                last_opened_at = tx.date;
                open_cycle_start = date;
                cycle_open_cost = 0;
                cycle_open_size = 0;
            }

            // Update Cost Basis
            total_cost_basis += (amount * price);
            current_size += amount;
            lifetime_invested_cost += (amount * price);

            // Update Cycle State
            cycle_open_cost += (amount * price);
            cycle_open_size += amount;

        } else if (type === 'sell') {
            if (current_size > 0) {
                // Determine Cost of Sold Portion (Weighted Average)
                const avg_price = total_cost_basis / current_size;
                const cost_sold = amount * avg_price;

                // Realized PnL
                const pnl = (amount * price) - cost_sold;
                realized_pnl_abs += pnl;

                // Update State
                total_cost_basis -= cost_sold;
                current_size -= amount;

                // Cycle Close Check (Roughly 0 to handle floats)
                if (current_size < 0.00000001) {
                    current_size = 0;
                    total_cost_basis = 0;
                    last_closed_at = tx.date;
                    round_trips++;

                    // Calculate Cycle PnL %
                    // Check profit behavior
                    if (pnl > 0) profitable_round_trips++;
                    else if (pnl < 0) losing_round_trips++;
                    else breakeven_round_trips++;

                    // Store PnL % for this 'Trip'
                    const trade_ret_pct = (price - avg_price) / avg_price;
                    round_trip_pnls.push(trade_ret_pct);

                    // Holding Time
                    if (open_cycle_start) {
                        const hours = (date - open_cycle_start) / (1000 * 60 * 60);
                        total_holding_hours += hours;
                        completed_holding_periods++;
                        if (hours > max_holding_hours) max_holding_hours = hours;
                    }
                    open_cycle_start = null;
                }
            }
        }
    });

    // Post-Iteration Calculations
    const avg_entry_price = current_size > 0 ? total_cost_basis / current_size : 0;

    // Unrealized PnL
    const unrealized_pnl_abs = current_size > 0 ? (current_size * (currentPrice - avg_entry_price)) : 0;
    const unrealized_pnl_pct = (current_size > 0 && avg_entry_price > 0) ? ((currentPrice - avg_entry_price) / avg_entry_price) : 0;

    // Lifetime Totals
    const lifetime_pnl_abs = realized_pnl_abs + unrealized_pnl_abs;
    // const lifetime_pnl_pct = lifetime_invested_cost > 0 ? (lifetime_pnl_abs / lifetime_invested_cost) : 0;

    // Desktop logic uses realized_pnl_pct_metric based on cost sold? No.
    const realized_pnl_pct_metric = lifetime_invested_cost > 0 ? (realized_pnl_abs / lifetime_invested_cost) : 0;

    // Recalculate lifetime_pnl_pct correctly as intended in desktop code inspection
    const lifetime_pnl_pct = lifetime_invested_cost > 0 ? (lifetime_pnl_abs / lifetime_invested_cost) : 0;


    // Behavioral Stats
    const total_trades = sorted.length;
    const avg_holding_hours = completed_holding_periods > 0 ? total_holding_hours / completed_holding_periods : 0;

    // Round Trip Stats
    const wins = round_trip_pnls.filter(p => p > 0);
    const losses = round_trip_pnls.filter(p => p < 0);

    const round_trip_win_rate = round_trip_pnls.length > 0 ? wins.length / round_trip_pnls.length : 0;
    const avg_round_trip_pnl_pct = round_trip_pnls.length > 0 ? round_trip_pnls.reduce((a, b) => a + b, 0) / round_trip_pnls.length : 0;
    const avg_win_round_trip_pnl_pct = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
    const avg_loss_round_trip_pnl_pct = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
    const round_trip_expectancy_pct = (round_trip_win_rate * avg_win_round_trip_pnl_pct) - ((1 - round_trip_win_rate) * Math.abs(avg_loss_round_trip_pnl_pct));

    // Status
    const status = current_size > 0 ? 'open' : (total_trades > 0 ? 'closed' : 'flat');

    // Open Cycle Metadata
    let open_cycle = null;
    if (status === 'open') {
        open_cycle = {
            opened_at: last_opened_at || first_trade_at,
            size: current_size,
            avg_entry_price: avg_entry_price,
            unrealized_pnl_abs,
            unrealized_pnl_pct,
            max_unrealized_gain_pct: 0, // Placeholder
            max_unrealized_drawdown_pct: 0 // Placeholder
        };

        // Estimate current holding hours if open
        if (open_cycle_start) {
            const current_hours = (new Date() - open_cycle_start) / (1000 * 60 * 60);
            if (current_hours > max_holding_hours) max_holding_hours = current_hours;
        }
    }

    return {
        // Position
        current_size,
        avg_entry_price,
        total_cost: current_size * avg_entry_price, // Current cost basis value
        status,

        // PnL
        realized_pnl_abs,
        realized_pnl_pct: realized_pnl_pct_metric,
        unrealized_pnl_abs,
        unrealized_pnl_pct,
        lifetime_pnl_abs,
        lifetime_pnl_pct,
        lifetime_invested_cost,

        // Time
        first_trade_at,
        last_trade_at,
        last_opened_at,
        last_closed_at,

        // Stats
        total_trades,
        round_trips,
        profitable_round_trips,
        losing_round_trips,
        breakeven_round_trips,

        round_trip_win_rate,
        avg_round_trip_pnl_pct,
        avg_win_round_trip_pnl_pct,
        avg_loss_round_trip_pnl_pct,
        round_trip_expectancy_pct,

        avg_holding_hours,
        max_holding_hours,

        open_cycle
    };
};

/**
 * Update Asset Summary in Firestore
 */
export const recalculateAssetSummary = async (userId, asset, fallbackPrice = 0) => {
    if (!userId || !asset) return;
    const normalizedAsset = asset.toUpperCase();

    try {
        // 1. Fetch Transactions
        const txRef = collection(db, 'transactions');
        const q = query(txRef, where('userId', '==', userId), where('asset', '==', normalizedAsset));
        const snapshot = await getDocs(q);
        const transactions = snapshot.docs.map(d => d.data());

        // Check if existing summary exists (to preserve AI coach history)
        const summaryDocRef = doc(db, 'users', userId, ASSET_SUMMARIES, normalizedAsset);
        const existingSummarySnap = await getDoc(summaryDocRef);
        const existingSummary = existingSummarySnap.exists() ? existingSummarySnap.data() : null;

        if (transactions.length === 0) {
            console.log(`[SummaryService] No transactions found for ${normalizedAsset}. Deleting summary.`);
            await deleteDoc(summaryDocRef);
            return null;
        }

        // 2. Fetch Notes (for AI Summary)
        const notesRef = collection(db, 'users', userId, 'notes');
        const qNotes = query(notesRef, where('asset', '==', normalizedAsset));
        const notesSnap = await getDocs(qNotes);
        const dbNotes = notesSnap.docs.map(d => ({ ...d.data(), id: d.id, source: 'note_doc' }));

        const allNotes = [...dbNotes];
        allNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // 3. Current Price
        let currentPrice = fallbackPrice;
        if (currentPrice <= 0) {
            // Fallback to last tx price
            const sortedTxs = [...transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // DESC
            currentPrice = Number(sortedTxs[0]?.price) || 0;
        }

        // 4. Calculate Metrics
        const metrics = calculateAssetMetrics(transactions, currentPrice);

        // 4.1 Generate AI Summary (Restored)
        let aiSummary = {
            key_updates: [],
            core_thesis: null,
            major_mistakes: [],
            exit_conditions: []
        };

        if (allNotes.length > 0) {
            console.log(`[SummaryService] Generating AI Note Summary for ${normalizedAsset} (${allNotes.length} notes)...`);
            try {
                const generated = await generateAssetNoteSummary(normalizedAsset, allNotes);
                if (generated) {
                    aiSummary = generated;
                }
            } catch (aiError) {
                console.warn(`[SummaryService] AI Summary generation failed for ${normalizedAsset}:`, aiError);
            }
        }

        // 5. Construct Object
        const summaryData = createAssetSummary({
            asset: normalizedAsset,
            coinId: transactions[0]?.coinId || '',
            chain: transactions[0]?.chain || '',

            ...metrics,

            last_price: currentPrice,
            last_price_at: new Date().toISOString(),

            // Notes metadata
            notes_count: allNotes.length,
            last_note_at: allNotes[0]?.createdAt || null,
            last_note_preview: allNotes[0]?.content?.substring(0, 100) || null,
            notes_summary_updated_at: new Date().toISOString(),

            // AI Fields (Note Summary)
            key_updates: aiSummary.key_updates || [],
            core_thesis: aiSummary.core_thesis || null,
            major_mistakes: aiSummary.major_mistakes || [],
            exit_conditions: aiSummary.exit_conditions || [],

            // AI Coach Fields (Preserve existing if not updating)
            ai_behavior_summary: existingSummary?.ai_behavior_summary || null,
            ai_recommended_playbook: existingSummary?.ai_recommended_playbook || null,
            ai_last_review_at: existingSummary?.ai_last_review_at || null,
            ai_model_version: existingSummary?.ai_model_version || null,
        });

        // 6. Save to Firestore
        await setDoc(summaryDocRef, summaryData, { merge: true });

        console.log(`[SummaryService] Updated summary for ${normalizedAsset}`);
        return summaryData;

    } catch (error) {
        console.error(`Error recalculating summary for ${normalizedAsset}:`, error);
        return null;
    }
};

/**
 * Internal helper to update AI Archetype (Separated to allow independent trigger)
 */
const updateAIArchetype = async (userId, currentSummary, assets) => {
    try {
        const { generateUserArchetype } = await import('./geminiService');

        // 1. Fetch Transactions for "Recent Activity" evidence
        const txRef = collection(db, 'transactions');
        const q = query(txRef, where('userId', '==', userId));
        const snapshot = await getDocs(q);
        const allTxs = snapshot.docs.map(d => d.data());

        // Sort in memory (descending date) and take top 20
        const recentTxs = allTxs
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 20);

        // 2. Get Current Profile (Prior)
        const currentProfile = currentSummary.ai_behavior_archetype;

        // 3. Generate New Profile
        const newProfile = await generateUserArchetype(currentProfile, recentTxs, currentSummary);

        return newProfile;

    } catch (e) {
        console.error("[SummaryService] Failed to update AI Archetype:", e);
        return currentSummary.ai_behavior_archetype; // Return old on error
    }
}

/**
 * Aggregates all Asset Summaries into a User Summary
 */
export const recalculateUserSummary = async (userId) => {
    if (!userId) return;

    try {
        // 1. Fetch all Asset Summaries
        const summaryRef = collection(db, 'users', userId, ASSET_SUMMARIES);
        const snapshot = await getDocs(summaryRef);
        const assets = snapshot.docs.map(d => d.data());

        // 2. Aggregate Metrics
        let lifetime_pnl_abs = 0;
        let total_invested = 0;

        let total_round_trips = 0;
        let open_positions_count = 0;

        let total_holding_hours_sum = 0;
        let total_holding_count = 0;
        let max_holding_hours = 0;
        let min_holding_hours = 999999;

        // Round Trip Aggregation (Weighted by # of trips?)
        // Or sum totals
        let global_round_trip_wins = 0;
        let global_round_trip_total = 0;
        let weighted_pnl_pct_sum = 0;

        const assetPerformances = []; // For Best/Worst sorting

        assets.forEach(a => {
            try {
                lifetime_pnl_abs += (Number(a.lifetime_pnl_abs) || 0);
                total_invested += (Number(a.lifetime_invested_cost) || 0);

                total_round_trips += (Number(a.round_trips) || 0);
                if (a.status === 'open') open_positions_count++;

                // Holding Times
                if (a.avg_holding_hours > 0 && a.round_trips > 0) {
                    total_holding_hours_sum += (a.avg_holding_hours * a.round_trips);
                    total_holding_count += a.round_trips;
                }
                if (a.max_holding_hours > max_holding_hours) max_holding_hours = a.max_holding_hours;
                if (a.avg_holding_hours > 0 && a.avg_holding_hours < min_holding_hours) min_holding_hours = a.avg_holding_hours;

                // Round Trip Stats
                if (a.round_trips > 0) {
                    const trips = Number(a.round_trips);
                    const win_rate = Number(a.round_trip_win_rate) || 0;
                    const wins = Math.round(trips * win_rate);
                    global_round_trip_wins += wins;
                    global_round_trip_total += trips;

                    // Weighted PnL %
                    const avg_pnl = Number(a.avg_round_trip_pnl_pct) || 0;
                    weighted_pnl_pct_sum += (avg_pnl * trips);
                }

                assetPerformances.push({
                    asset: a.asset,
                    lifetime_pnl_pct: a.lifetime_pnl_pct
                });
            } catch (err) {
                console.warn(`[SummaryService] Skipping malformed asset summary for ${a.asset}:`, err);
            }
        });

        // 3. Sorting Best/Worst
        assetPerformances.sort((a, b) => b.lifetime_pnl_pct - a.lifetime_pnl_pct);
        const best_assets = assetPerformances.slice(0, 3);
        const worst_assets = assetPerformances.slice(-3).reverse();

        // 4. Calculations
        // Prevent division by zero and default to 0 for NaNs
        const safeDiv = (num, den) => (den && den > 0) ? (num / den) : 0;
        const safeNum = (val) => (val && !isNaN(val)) ? Number(val) : 0;

        const lifetime_pnl_pct = safeDiv(lifetime_pnl_abs, total_invested);
        const avg_holding_hours = safeDiv(total_holding_hours_sum, total_holding_count);

        const round_trip_win_rate = safeDiv(global_round_trip_wins, global_round_trip_total);
        const avg_round_trip_pnl_pct = safeDiv(weighted_pnl_pct_sum, global_round_trip_total);

        // 5. Construct Object
        const userSummary = createUserSummary({
            userId,
            lifetime_pnl_abs: safeNum(lifetime_pnl_abs),
            lifetime_pnl_pct: safeNum(lifetime_pnl_pct),

            total_assets_traded: safeNum(assets.length),
            total_round_trips: safeNum(total_round_trips),
            open_positions_count: safeNum(open_positions_count),

            round_trip_win_rate: safeNum(round_trip_win_rate),
            avg_round_trip_pnl_pct: safeNum(avg_round_trip_pnl_pct),

            // These would need more complex aggregation, defaulting to 0 for now
            avg_win_round_trip_pnl_pct: 0,
            avg_loss_round_trip_pnl_pct: 0,
            round_trip_expectancy_pct: 0,

            avg_holding_hours: safeNum(avg_holding_hours),
            max_holding_hours: safeNum(max_holding_hours),
            min_holding_hours: min_holding_hours === 999999 ? 0 : safeNum(min_holding_hours),

            best_assets: best_assets.map(a => ({ asset: a.asset, lifetime_pnl_pct: safeNum(a.lifetime_pnl_pct) })),
            worst_assets: worst_assets.map(a => ({ asset: a.asset, lifetime_pnl_pct: safeNum(a.lifetime_pnl_pct) }))
        });

        // 5.1 Deep Sanitize "undefined" from object (Firebase hates undefined)
        const sanitizeForFirebase = (obj) => {
            if (obj === null || obj === undefined) return null;
            if (typeof obj !== 'object') return obj;

            if (Array.isArray(obj)) {
                return obj.map(item => sanitizeForFirebase(item));
            }

            const newObj = {};
            Object.keys(obj).forEach(key => {
                const val = obj[key];
                if (val === undefined) {
                    newObj[key] = null;
                } else {
                    newObj[key] = sanitizeForFirebase(val);
                }
            });
            return newObj;
        };

        const sanitizedSummary = sanitizeForFirebase(userSummary);

        // 5.5 AI Archetype Update (Recursive)
        console.log('[SummaryService] Updating AI Behavior Archetype...');
        const newArchetype = await updateAIArchetype(userId, sanitizedSummary, assets);

        if (newArchetype) {
            sanitizedSummary.ai_behavior_archetype = newArchetype;
        }

        // 6. Save
        const docRef = doc(db, 'users', userId, USER_METRICS_DOC);
        await setDoc(docRef, sanitizedSummary, { merge: true });

        console.log(`[SummaryService] Updated User Summary`);
        return userSummary;

    } catch (error) {
        console.error("Error calculating user summary:", error);
        throw error;
    }
};

/**
 * Utility: Repair/Regenerate ALL summaries for a user
 */
export const recalculateAllSummaries = async (userId) => {
    if (!userId) return;
    console.log(`[SummaryService] Starting FULL summary recalculation for ${userId}...`);

    try {
        const uniqueAssets = new Set();
        const txRef = collection(db, 'transactions');
        const q = query(txRef, where('userId', '==', userId));
        const txSnapshot = await getDocs(q);

        txSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.asset) uniqueAssets.add(data.asset.toUpperCase());
        });

        const summaryRef = collection(db, 'users', userId, ASSET_SUMMARIES);
        const summarySnapshot = await getDocs(summaryRef);
        summarySnapshot.docs.forEach(doc => uniqueAssets.add(doc.id));

        const allAssets = Array.from(uniqueAssets);
        let processed = 0;

        for (const asset of allAssets) {
            await recalculateAssetSummary(userId, asset);
            processed++;
        }

        await recalculateUserSummary(userId);
        console.log(`Recalculation complete for ${processed} assets.`);

    } catch (error) {
        console.error("Error in recalculateAllSummaries:", error);
    }
};
