import { db } from './firebase';
import { doc, setDoc, getDoc, collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'firebase/firestore';

const COLLECTION_NAME = 'ai_reports';

/**
 * Save a generated AI report for a user.
 * Saves to a subcollection 'ai_reports' under the user document.
 * Also updates a 'latest_ai_report' field on the user document for quick access if needed,
 * or we can just query the subcollection.
 * 
 * Strategy: Save to `users/{userId}/ai_reports` and also update a distinct `latest` document or field
 * to avoid costly queries if we just want the last one.
 */
export const saveAIReport = async (userId, reportData) => {
    if (!userId) return;

    try {
        const reportRef = collection(db, 'users', userId, COLLECTION_NAME);
        const timestamp = serverTimestamp();

        const dataToSave = {
            ...reportData,
            createdAt: timestamp,
            type: 'portfolio_overview'
        };

        // 1. Add to history
        await addDoc(reportRef, dataToSave);

        // 2. Update 'latest' pointer or document for easy retrieval
        // We'll store the latest report in a specific document ID 'latest' for O(1) fetch
        const latestRef = doc(db, 'users', userId, COLLECTION_NAME, 'latest');
        await setDoc(latestRef, { ...dataToSave, updatedAt: timestamp });

        return true;
    } catch (error) {
        console.error("Error saving AI report:", error);
        throw error;
    }
};

/**
 * Get the latest AI report for a user.
 */
export const getLatestAIReport = async (userId) => {
    if (!userId) return null;

    try {
        const latestRef = doc(db, 'users', userId, COLLECTION_NAME, 'latest');
        const docSnap = await getDoc(latestRef);

        if (docSnap.exists()) {
            return docSnap.data();
        } else {
            return null;
        }
    } catch (error) {
        console.error("Error fetching latest AI report:", error);
        return null;
    }
};
