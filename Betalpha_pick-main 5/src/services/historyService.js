import { db } from './firebase';
import { collection, doc, setDoc, getDocs, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';

/**
 * Save a daily snapshot of the user's portfolio.
 * Document ID is strictly YYYY-MM-DD to ensure one snapshot per day.
 * 
 * @param {string} userId 
 * @param {number} totalBalance 
 * @param {number} totalPnL 
 * @param {Object} assets Summary of assets (optional, for granular history)
 */
export const saveDailySnapshot = async (userId, totalBalance, totalPnL, assets = {}) => {
    if (!userId) return;

    try {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const docId = dateStr;

        const historyRef = doc(db, 'users', userId, 'portfolio_history', docId);

        const snapshotData = {
            date: dateStr,
            timestamp: Timestamp.now(),
            totalBalance: parseFloat(totalBalance.toFixed(2)),
            totalPnL: parseFloat(totalPnL.toFixed(2)),
            assetCount: Object.keys(assets).length,
            // We can optionally store top assets or breakdown here if needed later
        };

        // setDoc with merge: true allows updating the snapshot throughout the day 
        // if we decide to call this more often. For now, it ensures we write 'today'.
        await setDoc(historyRef, snapshotData, { merge: true });
        console.log(`[History] Saved snapshot for ${dateStr}: $${totalBalance}`);
    } catch (error) {
        console.error("Error saving daily snapshot:", error);
    }
};

/**
 * Get portfolio history for the chart.
 * @param {string} userId 
 * @param {number} days 
 * @returns {Promise<Array>} Array of history objects sorted by date
 */
export const getPortfolioHistory = async (userId, days = 30) => {
    if (!userId) return [];

    try {
        const historyRef = collection(db, 'users', userId, 'portfolio_history');

        // Calculate start date
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];

        const q = query(
            historyRef,
            where('date', '>=', startDateStr),
            orderBy('date', 'asc')
        );

        const querySnapshot = await getDocs(q);
        const history = [];

        querySnapshot.forEach((doc) => {
            history.push(doc.data());
        });

        return history;
    } catch (error) {
        console.error("Error fetching portfolio history:", error);
        return [];
    }
};
