import {
    collection,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    increment,
    serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { createMetricsSummary } from '../types/metrics';

const METRICS_COLLECTION = 'metrics_summary';

/**
 * Update daily metrics for a user.
 * This should be called whenever a transaction is closed or PnL is realized.
 * 
 * @param {string} userId 
 * @param {Object} tx - The transaction triggering the update
 */
export const updateDailyMetrics = async (userId, tx) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const docId = `daily_${today}`;
        const docRef = doc(db, METRICS_COLLECTION, userId, 'daily', docId);

        // We use setDoc with merge: true to handle both create and update
        // But for counters, we might want to use increment.
        // However, increment works on existing fields.
        // Let's try a simple read-modify-write or set with merge for now.

        // For simplicity in this "minimal" version, we'll just increment tx count
        // and add PnL if it's a realized PnL transaction.

        const updates = {
            userId,
            date: today,
            updatedAt: new Date().toISOString(),
            daily_tx_count: increment(1),
            daily_volume: increment(Number(tx.amount) * Number(tx.price))
        };

        if (tx.pnl) {
            updates.daily_realized_pnl = increment(Number(tx.pnl));
        }

        await setDoc(docRef, updates, { merge: true });

    } catch (error) {
        console.error("Error updating daily metrics:", error);
    }
};

/**
 * Update global metrics (cumulative).
 * This might be a separate document like 'latest' or 'global'.
 * 
 * @param {string} userId 
 * @param {Object} tx 
 */
export const updateGlobalMetrics = async (userId, tx) => {
    try {
        const docRef = doc(db, METRICS_COLLECTION, userId, 'global', 'latest');

        const updates = {
            userId,
            updatedAt: new Date().toISOString(),
            total_tx_count: increment(1),
        };

        if (tx.pnl) {
            updates.total_realized_pnl = increment(Number(tx.pnl));
            if (Number(tx.pnl) > 0) {
                updates.win_count = increment(1);
            } else {
                updates.loss_count = increment(1);
            }
        }

        await setDoc(docRef, updates, { merge: true });
    } catch (error) {
        console.error("Error updating global metrics:", error);
    }
}
