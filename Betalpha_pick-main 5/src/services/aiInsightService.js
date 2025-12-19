import {
    collection,
    addDoc,
    query,
    where,
    getDocs,
    orderBy,
    limit
} from 'firebase/firestore';
import { db } from './firebase';
import { createAiInsight } from '../types/aiInsight';

const INSIGHTS_COLLECTION = 'ai_insights';

/**
 * Save a new AI insight.
 * 
 * @param {string} userId 
 * @param {Object} insightData 
 * @returns {Promise<Object>} The created insight with ID.
 */
export const saveAiInsight = async (userId, insightData) => {
    const insight = createAiInsight({
        ...insightData,
        userId
    });

    try {
        const docRef = await addDoc(collection(db, `users/${userId}/${INSIGHTS_COLLECTION}`), insight);
        return { id: docRef.id, ...insight };
    } catch (error) {
        console.error("Error saving AI insight:", error);
        throw error;
    }
};

/**
 * Get recent AI insights for a user.
 * 
 * @param {string} userId 
 * @param {number} limitCount 
 * @returns {Promise<Array>} List of insights.
 */
export const getRecentInsights = async (userId, limitCount = 5) => {
    try {
        const q = query(
            collection(db, `users/${userId}/${INSIGHTS_COLLECTION}`),
            orderBy('generatedAt', 'desc'),
            limit(limitCount)
        );

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching recent insights:", error);
        return [];
    }
};
