import { db } from './firebase';
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    getDocs
} from 'firebase/firestore';

/**
 * Fetch all notes for a specific user.
 * @param {string} userId - The user's UID.
 * @returns {Promise<Array>} List of note objects.
 */
export const getNotes = async (userId) => {
    if (!userId) return [];
    try {
        // Desktop uses 'createdAt' (ISO string). Queries might fail if mixed, but 'createdAt' is the target.
        // We order by createdAt descending.
        const q = query(
            collection(db, 'users', userId, 'notes'),
            orderBy('createdAt', 'desc')
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => {
            const data = doc.data();
            // Normalize date for UI consumption
            let dateObj = new Date();
            if (data.createdAt) {
                dateObj = new Date(data.createdAt);
            } else if (data.date) {
                dateObj = data.date?.toDate ? data.date.toDate() : new Date(data.date);
            }

            return {
                id: doc.id,
                ...data,
                date: dateObj // Ensure UI always has a valid Date object
            };
        });
    } catch (error) {
        console.error("Error fetching notes:", error);
        throw error;
    }
};

/**
 * Add a new note for a user.
 * @param {string} userId - The user's UID.
 * @param {Object} note - The note data.
 * @returns {Promise<Object>} The added note with its new ID.
 */
export const addNote = async (userId, note) => {
    if (!userId) throw new Error("User not authenticated");
    try {
        const nowISO = new Date().toISOString();

        // Desktop Compliant Schema
        const noteData = {
            userId: userId,
            title: note.title || 'Untitled Note',
            content: note.content || '',
            tags: Array.isArray(note.tags) ? note.tags : [],

            // Standard Fields
            asset: note.asset || 'Global',
            type: note.type || 'note', // 'token', 'note', etc.
            kind: 'note',
            noteCategory: note.noteCategory || 'general', // 'highlight', 'investment_note', etc.
            importance: note.importance || 3,

            // Meta
            createdAt: nowISO,
            updatedAt: nowISO,
            schemaVersion: 1,
            forTraining: false,

            // Detailed refs (optional but good for schema matching)
            coinId: note.coinId || null,
            txId: null,

            // Legacy/Mobile compat (optional, but keeping color)
            color: note.color || "var(--accent-primary)",

            // Source Reference (if coming from Feed)
            ...(note.sourceRef ? { sourceRef: note.sourceRef } : {})
        };

        const docRef = await addDoc(collection(db, 'users', userId, 'notes'), noteData);
        return { id: docRef.id, ...noteData, date: new Date(nowISO) };
    } catch (error) {
        console.error("Error adding note:", error);
        throw error;
    }
};

/**
 * Update an existing note.
 * @param {string} userId - The user's UID.
 * @param {string} noteId - The note's ID.
 * @param {Object} updates - Fields to update.
 */
export const updateNote = async (userId, noteId, updates) => {
    if (!userId) return;
    try {
        const noteRef = doc(db, 'users', userId, 'notes', noteId);
        await updateDoc(noteRef, updates);
    } catch (error) {
        console.error("Error updating note:", error);
        throw error;
    }
};

/**
 * Delete a note.
 * @param {string} userId - The user's UID.
 * @param {string} noteId - The note's ID.
 */
export const deleteNote = async (userId, noteId) => {
    if (!userId) return;
    try {
        await deleteDoc(doc(db, 'users', userId, 'notes', noteId));
    } catch (error) {
        console.error("Error deleting note:", error);
        throw error;
    }
};
