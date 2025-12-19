import { db } from './firebase';
import {
    collection,
    addDoc,
    query,
    where,
    getDocs,
    orderBy,
    Timestamp,
    doc,
    updateDoc,
    deleteDoc
} from 'firebase/firestore';
import { createNote } from '../types/note';
import { recalculateAssetSummary } from './summaryService';

/**
 * Add a new note to Firestore
 * @param {string} userId 
 * @param {Object} noteData 
 * @returns {Promise<Object>} Created note with ID
 */
export const addNote = async (userId, noteData) => {
    try {
        const note = createNote({ ...noteData, userId });
        const notesRef = collection(db, 'users', userId, 'notes');
        const docRef = await addDoc(notesRef, note);

        // Trigger Summary Update if it's an asset note
        if (note.asset) {
            // Fire and forget to keep UI responsive
            recalculateAssetSummary(userId, note.asset).catch(e => console.error("Summary update failed", e));
        }

        return { id: docRef.id, ...note };
    } catch (error) {
        console.error("Error adding note:", error);
        throw error;
    }
};

/**
 * Get all notes for a user
 * @param {string} userId 
 * @returns {Promise<Array>} List of notes
 */
export const getNotes = async (userId) => {
    try {
        const notesRef = collection(db, 'users', userId, 'notes');
        const q = query(notesRef, orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching notes:", error);
        throw error;
    }
};

/**
 * Get notes for a specific asset
 * @param {string} userId 
 * @param {string} asset 
 * @returns {Promise<Array>} List of notes for the asset
 */
export const getNotesForAsset = async (userId, asset) => {
    try {
        const notesRef = collection(db, 'users', userId, 'notes');
        // Note: Composite index might be required for type + asset + orderBy
        // For now, we filter in memory if needed, or rely on simple queries
        const q = query(
            notesRef,
            where('type', '==', 'token'),
            where('asset', '==', asset)
        );
        const snapshot = await getDocs(q);
        const notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return notes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
        console.error(`Error fetching notes for ${asset}:`, error);
        throw error;
    }
};

/**
 * Update an existing note
 * @param {string} userId 
 * @param {string} noteId 
 * @param {Object} updates 
 */
export const updateNote = async (userId, noteId, updates) => {
    try {
        const noteRef = doc(db, 'users', userId, 'notes', noteId);

        const updatedData = {
            ...updates,
            updatedAt: new Date().toISOString()
        };

        await updateDoc(noteRef, updatedData);
        return { id: noteId, ...updatedData };
    } catch (error) {
        console.error("Error updating note:", error);
        throw error;
    }
};

/**
 * Delete a note
 * @param {string} userId 
 * @param {string} noteId 
 */
export const deleteNote = async (userId, noteId) => {
    try {
        const noteRef = doc(db, 'users', userId, 'notes', noteId);
        await deleteDoc(noteRef);
        return true;
    } catch (error) {
        console.error("Error deleting note:", error);
        throw error;
    }
};
