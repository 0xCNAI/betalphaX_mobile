import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Get the list of handles a user is tracking for a specific symbol
 * @param {string} userId - User ID
 * @param {string} symbol - Token symbol (e.g., 'BTC')
 * @returns {Promise<Array<string>>} - List of twitter handles (e.g., ['@vitalik', '@hsaka'])
 */
export async function getUserTrackingList(userId, symbol) {
    if (!userId || !symbol) return [];

    try {
        const docRef = doc(db, 'users', userId, 'tracking', symbol.toUpperCase());
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            return docSnap.data().handles || [];
        }
        return [];
    } catch (error) {
        console.error('Error fetching user tracking list:', error);
        return [];
    }
}

/**
 * Update the list of handles a user is tracking for a specific symbol
 * @param {string} userId - User ID
 * @param {string} symbol - Token symbol
 * @param {Array<string>} newList - New list of handles
 */
export async function updateUserTrackingList(userId, symbol, newList) {
    if (!userId || !symbol) throw new Error('Invalid user or symbol');

    // Constraint: Max 5 slots
    if (newList.length > 5) {
        throw new Error('Maximum 5 tracked accounts allowed.');
    }

    try {
        const docRef = doc(db, 'users', userId, 'tracking', symbol.toUpperCase());
        await setDoc(docRef, {
            handles: newList,
            updatedAt: new Date().toISOString()
        }, { merge: true });

        return true;
    } catch (error) {
        console.error('Error updating user tracking list:', error);
        throw error;
    }
}



