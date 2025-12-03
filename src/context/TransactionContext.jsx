import React, { createContext, useState, useContext, useEffect } from 'react';
import { db } from '../services/firebase';
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    query,
    where,
    onSnapshot,
    orderBy,
    writeBatch
} from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { clearOverviewCache } from '../services/analysisService';
import { getTokenFundamentals } from '../services/fundamentalService';

const TransactionContext = createContext();

export const useTransactions = () => useContext(TransactionContext);

export const TransactionProvider = ({ children }) => {
    const [transactions, setTransactions] = useState([]);
    const { user } = useAuth();
    const [isOffline, setIsOffline] = useState(false);

    // Load from local storage if offline
    useEffect(() => {
        if (isOffline && user) {
            const localData = localStorage.getItem(`transactions_${user.uid}`);
            if (localData) {
                setTransactions(JSON.parse(localData));
            }
        }
    }, [isOffline, user]);

    useEffect(() => {
        if (!user) {
            setTransactions([]);
            return;
        }

        // Subscribe to user's transactions
        const q = query(
            collection(db, "transactions"),
            where("userId", "==", user.uid)
            // orderBy("date", "desc") // Removed to avoid missing index issues
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const dbTxs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Merge with local transactions
            const localData = localStorage.getItem(`transactions_${user.uid}`);
            let localTxs = [];
            if (localData) {
                const parsed = JSON.parse(localData);
                localTxs = parsed.filter(tx => tx.id.toString().startsWith('local_'));
            }

            // Combine and Deduplicate by ID
            const allTxsMap = new Map();

            // Add DB transactions first (source of truth)
            dbTxs.forEach(tx => allTxsMap.set(tx.id, tx));

            // Add local transactions only if not already present (though IDs shouldn't clash)
            localTxs.forEach(tx => {
                if (!allTxsMap.has(tx.id)) {
                    allTxsMap.set(tx.id, tx);
                }
            });

            const allTxs = Array.from(allTxsMap.values())
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            setTransactions(allTxs);

            // Cache the latest server state to local storage as well (for offline read)
            localStorage.setItem(`transactions_${user.uid}`, JSON.stringify(allTxs));

            setIsOffline(false);
        }, (error) => {
            console.error("Error fetching transactions (falling back to local):", error);
            setIsOffline(true);
            const localData = localStorage.getItem(`transactions_${user.uid}`);
            if (localData) {
                setTransactions(JSON.parse(localData));
            }
        });

        return () => unsubscribe();
    }, [user]);

    const addTransaction = async (transaction) => {
        if (!user) return;

        // Fetch fundamental data for snapshot
        let marketSnapshot = null;
        try {
            // Run in parallel with other pre-save tasks if any, but here we await it.
            // Since this is a user action (saving), a small delay is acceptable for better data.
            const fundResult = await getTokenFundamentals(transaction.asset);
            if (fundResult) {
                marketSnapshot = {
                    timestamp: Date.now(),
                    fdv_ratio: fundResult.valuation?.fdv_mcap_ratio || null,
                    tvl_trend_30d: fundResult.growth?.tvl_30d_change_percent || null,
                    sector_tags: fundResult.tags || []
                };
            }
        } catch (err) {
            console.warn("Failed to fetch market snapshot:", err);
        }

        const newTx = {
            ...transaction,
            userId: user.uid,
            createdAt: new Date().toISOString(),
            market_context_snapshot: marketSnapshot
        };

        try {
            // Try Firestore first with a short timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Firestore timeout")), 5000)
            );

            await Promise.race([
                addDoc(collection(db, "transactions"), newTx),
                timeoutPromise
            ]);
        } catch (error) {
            console.warn("Firestore failed/timed out, saving locally:", error);
            setIsOffline(true);

            // Local Fallback
            const localTx = { ...newTx, id: `local_${Date.now()}` };
            const updatedTransactions = [localTx, ...transactions];
            setTransactions(updatedTransactions);
            localStorage.setItem(`transactions_${user.uid}`, JSON.stringify(updatedTransactions));
            return; // Return successfully even if offline
        }
    };

    const updateTransaction = async (updatedTransaction) => {
        if (!user) return;

        try {
            const txRef = doc(db, "transactions", updatedTransaction.id);
            // Destructure to remove id from the data payload
            const { id, ...data } = updatedTransaction;

            // Try Firestore first with a short timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Firestore timeout")), 5000)
            );

            await Promise.race([
                updateDoc(txRef, data),
                timeoutPromise
            ]);
        } catch (error) {
            console.warn("Firestore update failed/timed out, saving locally:", error);
            setIsOffline(true);

            // Local Fallback
            const updatedTransactions = transactions.map(tx =>
                tx.id === updatedTransaction.id ? updatedTransaction : tx
            );
            setTransactions(updatedTransactions);
            localStorage.setItem(`transactions_${user.uid}`, JSON.stringify(updatedTransactions));
            return;
        }
    };

    const bulkAddTransactions = async (transactionsArray) => {
        if (!user) return;
        try {
            const batch = writeBatch(db);
            transactionsArray.forEach(tx => {
                const docRef = doc(collection(db, "transactions"));
                batch.set(docRef, {
                    asset: tx.asset.toUpperCase(),
                    type: tx.type || 'buy',
                    amount: parseFloat(tx.amount),
                    price: tx.price !== null ? parseFloat(tx.price) : null,
                    date: tx.date ? new Date(tx.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                    status: tx.status || 'open',
                    reasons: tx.reasons || [],
                    reasonDetails: tx.reasonDetails || {},
                    reasonLinks: tx.reasonLinks || {},
                    sellSignals: tx.sellSignals || [],
                    holdings_breakdown: tx.holdings_breakdown || null,
                    narrative: tx.narrative || null,
                    userId: user.uid,
                    createdAt: new Date().toISOString()
                });
            });
            await batch.commit();
        } catch (error) {
            console.error("Error bulk adding transactions:", error);
            throw error;
        }
    };

    const clearTransactions = async () => {
        if (!user) return;

        try {
            // 1. Clear Local Storage
            localStorage.removeItem(`transactions_${user.uid}`);

            // 2. Clear Firestore (if online)
            // Note: Firestore doesn't support deleting a collection, so we must delete docs individually
            // We use the current 'transactions' state to know what to delete
            const batch = writeBatch(db);
            transactions.forEach(tx => {
                // Only delete if it has a valid Firestore ID (not local_)
                if (tx.id && !tx.id.toString().startsWith('local_')) {
                    const docRef = doc(db, "transactions", tx.id);
                    batch.delete(docRef);
                }
            });

            await batch.commit();

            // 3. Reset State
            setTransactions([]);
            clearOverviewCache(); // Clear portfolio analysis cache

        } catch (error) {
            console.error("Error clearing transactions:", error);
            // Even if Firestore fails, ensure local state is cleared
            setTransactions([]);
            localStorage.removeItem(`transactions_${user.uid}`);
            clearOverviewCache();
            throw error;
        }
    };

    return (
        <TransactionContext.Provider value={{ transactions, addTransaction, updateTransaction, bulkAddTransactions, clearTransactions }}>
            {children}
        </TransactionContext.Provider>
    );
};
