import { db } from './firebase';
import {
    collection,
    doc,
    setDoc,
    getDocs,
    getDoc,
    query,
    where,
    writeBatch,

    deleteDoc,
    limit,
    orderBy
} from 'firebase/firestore';
import { createAssetSummary, createUserSummary } from '../types/summary';
import { generateAssetNoteSummary } from './geminiService';

const ASSET_SUMMARIES = 'asset_summaries';
const USER_METRICS_DOC = 'ai_user_metrics/summary';

/**
 * Core Logic: Calculate metrics from a list of transactions
 * @param {Array} transactions - Sorted by date ASC (Oldest first)
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
                    const cycleId = round_trips;

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
    const lifetime_pnl_pct = lifetime_invested_cost > 0 ? (lifetime_pnl_abs / lifetime_invested_cost) : 0;

    const realized_pnl_pct_metric = lifetime_invested_cost > 0 ? (realized_pnl_abs / lifetime_invested_cost) : 0;

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
        const max_gain = 0; // TODO: Would need history of price to calc max gain/drawdown during cycle
        const max_drawdown = 0;

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
            // Don't add to avg yet until closed
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

        if (transactions.length === 0) {
            console.log(`[SummaryService] No transactions found for ${normalizedAsset}. Deleting summary.`);
            const docRef = doc(db, 'users', userId, ASSET_SUMMARIES, normalizedAsset);
            await deleteDoc(docRef);
            return null;
        }

        // 1.1 Fetch Existing Summary (to preserve AI fields)
        const summaryDocRef = doc(db, 'users', userId, ASSET_SUMMARIES, normalizedAsset);
        const summaryDocSnap = await getDoc(summaryDocRef);
        const existingSummary = summaryDocSnap.exists() ? summaryDocSnap.data() : null;

        // 2. Fetch Notes from Collection
        const notesRef = collection(db, 'users', userId, 'notes');
        const notesQuery = query(
            notesRef,
            where('asset', '==', normalizedAsset)
            // whereClause for userId is redundant in subcollection but harmless if included, 
            // but standard practice for subcollection is just collection(db, 'users', userId, 'notes')
        );
        const notesSnapshot = await getDocs(notesQuery);
        const dbNotes = notesSnapshot.docs.map(d => ({ ...d.data(), id: d.id, source: 'note_doc' }));

        // 2.1 Extract Notes from Transactions
        const txNotes = transactions.flatMap(tx => {
            const extracted = [];
            const date = tx.date || tx.createdAt;

            // Investment Notes (Array or String Support)
            if (tx.investmentNotes) {
                const notes = Array.isArray(tx.investmentNotes) ? tx.investmentNotes : [tx.investmentNotes];
                notes.forEach((note, idx) => {
                    if (note && typeof note === 'string' && note.trim()) {
                        extracted.push({
                            id: `tx_${tx.id}_inv_note_${idx}`,
                            createdAt: date,
                            content: `[Investment Note] ${note}`,
                            tags: tx.tags || [], // Share main tags
                            type: 'investment_note',
                            source: 'transaction'
                        });
                    }
                });
            }

            // Exit Notes (Array or String Support)
            if (tx.exitNotes) {
                const notes = Array.isArray(tx.exitNotes) ? tx.exitNotes : [tx.exitNotes];
                notes.forEach((note, idx) => {
                    if (note && typeof note === 'string' && note.trim()) {
                        extracted.push({
                            id: `tx_${tx.id}_exit_note_${idx}`,
                            createdAt: date,
                            content: `[Exit Note] ${note}`,
                            tags: tx.exitTags || [],
                            type: 'exit_note',
                            source: 'transaction'
                        });
                    }
                });
            }

            // Entry Memo (Legacy / Single Field)
            if (tx.memo && tx.memo.trim()) {
                extracted.push({
                    id: `tx_${tx.id}_memo`,
                    createdAt: date,
                    content: `[Transaction Memo] ${tx.memo}`,
                    tags: tx.tags || [],
                    type: 'transaction_memo',
                    source: 'transaction'
                });
            }

            // Exit Memo (Legacy / Single Field)
            if (tx.exitMemo && tx.exitMemo.trim()) {
                extracted.push({
                    id: `tx_${tx.id}_exit_memo`,
                    createdAt: date,
                    content: `[Exit Memo] ${tx.exitMemo}`,
                    tags: tx.exitTags || [],
                    type: 'transaction_memo',
                    source: 'transaction'
                });
            }

            // Reasons (Legacy)
            if (Array.isArray(tx.reasons) && tx.reasons.length > 0) {
                extracted.push({
                    id: `tx_${tx.id}_reasons`,
                    createdAt: date,
                    content: `[Trade Reasons] ${tx.reasons.join(', ')}`,
                    tags: ['Reason'],
                    type: 'transaction_reason',
                    source: 'transaction'
                });
            }

            return extracted;
        });

        // 2.2 Persist Missing Transaction Notes to DB
        // Format for DB: Standard Note Object
        const newNotesBatch = [];

        for (const txNote of txNotes) {
            // Check if this specific source ID (e.g., tx_123_memo) already exists in DB notes
            // We assume if a note was created from this tx, it would have this ID as document ID
            // OR we check if any existing note has the same content/timestamp? 
            // Better: Use deterministic ID for the document itself.

            const deterministicId = `note_${txNote.id}`; // e.g., note_tx_123_memo
            const exists = dbNotes.some(n => n.id === deterministicId);

            if (!exists) {
                newNotesBatch.push({
                    docId: deterministicId,
                    data: {
                        userId,
                        asset: normalizedAsset,
                        content: txNote.content,
                        tags: txNote.tags,
                        type: txNote.type, // 'transaction_memo', 'transaction_reason'
                        sourceId: txNote.id, // tx_123_memo
                        createdAt: txNote.createdAt,
                        updatedAt: new Date().toISOString()
                    }
                });
            }
        }

        if (newNotesBatch.length > 0) {
            console.log(`[SummaryService] Backfilling ${newNotesBatch.length} transaction notes to DB (users/${userId}/notes)...`);
            const batch = writeBatch(db);
            newNotesBatch.forEach(item => {
                const ref = doc(db, 'users', userId, 'notes', item.docId);
                batch.set(ref, item.data);
            });
            await batch.commit();

            // Add these new notes to our local list for current summary calculation
            newNotesBatch.forEach(item => {
                dbNotes.push({ ...item.data, id: item.docId, source: 'note_doc' });
            });
        }

        // Merge and Sort
        // dbNotes now contains original DB notes + newly persisted tx notes
        // txNotes (raw extraction) is no longer needed to be merged separately since we just backfilled them
        const allNotes = [...dbNotes];
        allNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // 3. Current Price
        // If passed 0, try to get from last transaction price
        let currentPrice = fallbackPrice;
        if (currentPrice <= 0) {
            // Fallback to last tx price
            const sortedTxs = [...transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
        const docRef = doc(db, 'users', userId, ASSET_SUMMARIES, normalizedAsset);
        await setDoc(docRef, summaryData, { merge: true });

        console.log(`[SummaryService] Updated summary for ${normalizedAsset}`);
        return summaryData;

    } catch (error) {
        console.error(`Error recalculating summary for ${normalizedAsset}:`, error);
        return null;
    }
};

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

        // Sector / Asset Performance Arrays
        const assetPerformances = [];

        assets.forEach(a => {
            lifetime_pnl_abs += (a.lifetime_pnl_abs || 0);
            total_invested += (a.lifetime_invested_cost || 0);

            total_round_trips += (a.round_trips || 0);
            if (a.status === 'open') open_positions_count++;

            try {
                if (a.avg_holding_hours > 0) {
                    // ... holding logic
                    const trips = a.round_trips || a.total_trades; // Fallback
                    total_holding_hours_sum += (a.avg_holding_hours * trips);
                    total_holding_count += trips;
                }
                if (a.max_holding_hours > max_holding_hours) max_holding_hours = a.max_holding_hours;
                if (a.max_holding_hours > 0 && a.max_holding_hours < min_holding_hours) min_holding_hours = a.max_holding_hours;

                // Round Trips
                if (a.round_trips > 0) {
                    global_round_trip_wins += (a.profitable_round_trips || 0);
                    global_round_trip_total += a.round_trips;
                    weighted_pnl_pct_sum += (a.avg_round_trip_pnl_pct * a.round_trips);
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
        // We do this BEFORE saving if we want it atomic, or AFTER if we want speed.
        // Given user wants "every transaction" to update it, we should try to include it.
        // Be careful of latency.
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
 * Internal helper to update AI Archetype (Separated to allow independent trigger)
 * This is called automatically by recalculateUserSummary, but logic is complex so we isolate it.
 */
const updateAIArchetype = async (userId, currentSummary, assets) => {
    try {
        const { generateUserArchetype } = await import('./geminiService');

        // 1. Fetch LAST 20 Transactions for "Recent Activity" evidence
        // We need to query the transactions collection again to get the raw feed
        // 1. Fetch Transactions for "Recent Activity" evidence
        const txRef = collection(db, 'transactions');

        // Use a simple equality query to avoid needing a composite index
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
 * Utility: Repair/Regenerate ALL summaries for a user
 * Useful if data gets out of sync (e.g. ghost assets)
 */
export const recalculateAllSummaries = async (userId) => {
    if (!userId) return;
    console.log(`[SummaryService] Starting FULL summary recalculation for ${userId}...`);

    try {
        // A. Identify ALL unique assets from both Transactions AND Existing Summaries
        const uniqueAssets = new Set();

        // 1. Scan Transactions (Accessing 'transactions' collection directly)
        const txRef = collection(db, 'transactions');
        const q = query(txRef, where('userId', '==', userId));
        const txSnapshot = await getDocs(q);

        txSnapshot.docs.forEach(doc => {
            const data = doc.data();
            if (data.asset) uniqueAssets.add(data.asset.toUpperCase());
        });

        // 2. Scan Existing Summaries (to catch ghosts with 0 txs)
        const summaryRef = collection(db, 'users', userId, ASSET_SUMMARIES);
        const summarySnapshot = await getDocs(summaryRef);
        summarySnapshot.docs.forEach(doc => uniqueAssets.add(doc.id));

        const allAssets = Array.from(uniqueAssets);
        console.log(`[SummaryService] Found ${allAssets.length} unique assets to process.`);

        let processed = 0;
        let deleted = 0;
        let created = 0; // Tracking newly covered assets

        for (const asset of allAssets) {
            // Check if it was missing from existing summaries (heuristic)
            const wasMissing = !summarySnapshot.docs.some(d => d.id === asset);

            const result = await recalculateAssetSummary(userId, asset);

            if (result === null) deleted++;
            else if (wasMissing) created++;

            processed++;
        }

        // B. Update User Summary
        await recalculateUserSummary(userId);

        const msg = `Database Repair Complete.\nFound ${allAssets.length} assets.\nProcessed: ${processed}.\nRestored: ${created} missing summaries.\nCleaned: ${deleted} ghost assets.\nUser Summary updated.`;
        console.log(msg);
        alert(msg);

    } catch (error) {
        console.error("Error in recalculateAllSummaries:", error);
        alert("Repair failed: " + error.message);
    }
};
/**
 * Fetch a specific asset summary
 */
export const getAssetSummary = async (userId, asset) => {
    if (!userId || !asset) return null;
    try {
        const docRef = doc(db, 'users', userId, ASSET_SUMMARIES, asset.toUpperCase());
        const snap = await getDoc(docRef);
        return snap.exists() ? snap.data() : null;
    } catch (error) {
        console.error("Error fetching asset summary:", error);
        return null;
    }
};
