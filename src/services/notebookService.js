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
        const q = query(
            collection(db, 'users', userId, 'notes'),
            orderBy('date', 'desc')
        );
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            date: doc.data().date?.toDate ? doc.data().date.toDate() : new Date(doc.data().date)
        }));
    } catch (error) {
        console.error("Error fetching notes:", error);
        throw error;
    }
};

/**
 * Add a new note for a user.
 * @param {string} userId - The user's UID.
 * @param {Object} note - The note data { title, content, tags }.
 * @returns {Promise<Object>} The added note with its new ID.
 */
export const addNote = async (userId, note) => {
    if (!userId) throw new Error("User not authenticated");
    try {
        const noteData = {
            ...note,
            date: new Date(),
            color: note.color || "var(--accent-primary)"
        };

        const docRef = await addDoc(collection(db, 'users', userId, 'notes'), noteData);
        return { id: docRef.id, ...noteData };
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
