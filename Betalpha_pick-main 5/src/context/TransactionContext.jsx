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
    writeBatch,
    deleteDoc
} from 'firebase/firestore';
import { useAuth } from './AuthContext';
import { clearOverviewCache } from '../services/analysisService';
import { getTokenFundamentals } from '../services/fundamentalService';
import { createTransaction } from '../types/transaction';
import {
    getOpenPositionForAsset,
    createPositionDoc,
    updatePositionWithNewTx,
    recalculatePosition
} from '../services/positionService';
import { runPostTransactionAnalysis } from '../services/aiAnalysisService';
import { recalculateAssetSummary, recalculateUserSummary, recalculateAllSummaries } from '../services/summaryService';
import { addNote } from '../services/noteService';

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

    // Sync local transactions to Firestore when connection is restored
    useEffect(() => {
        const syncLocalTransactions = async () => {
            if (!user || isOffline) return;

            const localData = localStorage.getItem(`transactions_${user.uid}`);
            if (!localData) return;

            let parsed = [];
            try {
                parsed = JSON.parse(localData);
            } catch (e) {
                console.error("Error parsing local transactions:", e);
                return;
            }

            const localTxs = parsed.filter(tx => tx.id && tx.id.toString().startsWith('local_'));

            if (localTxs.length === 0) return;

            console.log(`Attempting to sync ${localTxs.length} local transactions...`);
            let syncedCount = 0;
            const remainingLocalTxs = [];

            for (const tx of localTxs) {
                try {
                    // Remove local ID before sending to Firestore
                    const { id, ...txData } = tx;
                    await addDoc(collection(db, "transactions"), txData);
                    syncedCount++;
                } catch (error) {
                    console.error("Failed to sync transaction:", tx.id, error);
                    remainingLocalTxs.push(tx);
                }
            }

            if (syncedCount > 0) {
                // Update local storage: keep server txs + failed local txs
                const serverTxs = parsed.filter(tx => !tx.id || !tx.id.toString().startsWith('local_'));
                const updatedCache = [...serverTxs, ...remainingLocalTxs];
                localStorage.setItem(`transactions_${user.uid}`, JSON.stringify(updatedCache));
                console.log(`Successfully synced ${syncedCount} transactions.`);
            }
        };

        // Run sync when user is present and we are NOT in offline mode (meaning onSnapshot is working)
        syncLocalTransactions();
    }, [user, isOffline]);

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

                    // Price / TA (Placeholder)
                    price: null,
                    price_change_24h: null,
                    rsi_1h: null,
                    rsi_4h: null,
                    rsi_1d: null,
                    macd_1h: null,
                    macd_4h: null,
                    structure_4h: null,
                    structure_1d: null,
                    near_level: null,

                    // Fundamentals
                    fdv: fundResult.valuation?.fdv || null,
                    mcap: fundResult.valuation?.mcap || null,
                    fdv_ratio: fundResult.valuation?.fdv_mcap_ratio || null,
                    tvl: fundResult.growth?.tvl_current || null,
                    tvl_trend_30d: fundResult.growth?.tvl_30d_change_percent || null,
                    revenue_30d: null,
                    ps_ratio: null,
                    sector_tags: fundResult.tags || [],

                    // Narrative / Social (Placeholder)
                    narratives: [],
                    news_sentiment: null,
                    social_buzz_level: null,
                };
            }
        } catch (err) {
            console.warn("Failed to fetch market snapshot:", err);
        }

        // --- Position Logic Start ---
        let positionId = null;
        let entryIndex = null;

        try {
            // 1. Check for open position
            const openPosition = await getOpenPositionForAsset(user.uid, transaction.asset);

            if (!openPosition && transaction.type === 'buy') {
                // 2. Create new position if none exists and it's a buy
                // We need a draft tx object for createPositionDoc to calculate initials
                const draftTx = { ...transaction, userId: user.uid };
                const newPosition = await createPositionDoc(user.uid, transaction.asset, draftTx);
                positionId = newPosition.id;
                entryIndex = 1;
                console.log(`Created new position ${positionId} for ${transaction.asset}`);
            } else if (openPosition) {
                // 3. Link to existing position
                positionId = openPosition.id;
                entryIndex = (openPosition.transactionIds?.length || 0) + 1;
                console.log(`Linked to existing position ${positionId} for ${transaction.asset}`);
            }
            // If sell and no open position, we might treat it as isolated or error. 
            // For now, let's allow it but with null positionId (orphan sell).
        } catch (posError) {
            console.error("Error handling position logic:", posError);
            // Fallback: proceed without position linking to avoid blocking the transaction
        }
        // --- Position Logic End ---

        const newTx = createTransaction({
            ...transaction,
            userId: user.uid,
            createdAt: new Date().toISOString(),
            market_context_snapshot: marketSnapshot,
            coinId: transaction.coinId || null,
            coinName: transaction.coinName || null,
            positionId: positionId, // Add positionId
            entryIndex: entryIndex  // Add entryIndex
        });

        try {
            // Try Firestore first with a short timeout
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Firestore timeout")), 5000)
            );

            const docRef = await Promise.race([
                addDoc(collection(db, "transactions"), newTx),
                timeoutPromise
            ]);

            // If successful, update position with the new transaction ID and recalculate metrics
            if (positionId && docRef.id) {
                // We need to import updatePositionWithNewTx at the top first, 
                // but for now let's assume it's available or we'll add the import.
                await updatePositionWithNewTx(positionId, newTx, docRef.id);
            }

            // 5. Trigger Real-time AI Analysis (Fire and Forget)
            // We don't await this so the UI returns immediately
            runPostTransactionAnalysis(user.uid, docRef.id, newTx, { id: positionId, current_size: 0 /* fetch if needed */ });

            // 6. Trigger Summary Recalculation (Fire and Forget)
            const priceForSummary = Number(newTx.price) || 0;
            recalculateAssetSummary(user.uid, newTx.asset, priceForSummary)
                .then(() => recalculateUserSummary(user.uid))
                .catch(err => console.error("Summary update failed:", err));

            // 7. Save Investment Note if present (Fire and Forget)
            // 'memo' is the processed string from TransactionForm (investmentNotes joined)
            const noteContent = transaction.memo;
            if (noteContent && typeof noteContent === 'string' && noteContent.trim().length > 0) {
                console.log('Saving investment note from transaction:', noteContent.substring(0, 20) + '...');
                addNote(user.uid, {
                    asset: newTx.asset,
                    coinId: newTx.coinId,
                    type: 'journal',
                    title: `Investment Note: ${newTx.type.toUpperCase()} ${newTx.asset}`,
                    content: noteContent,
                    txId: docRef.id, // Link to this transaction
                    tags: ['Transaction Note'],
                    source: 'manual'
                }).catch(err => console.error("Failed to save transaction note:", err));
            }

            return docRef; // Return the document reference on success
        } catch (error) {
            console.warn("Firestore failed/timed out, saving locally:", error);
            setIsOffline(true);

            // Add to local storage immediately for optimistic UI
            const localTx = { ...newTx, id: `local_${Date.now()}` };
            const updatedTransactions = [localTx, ...transactions];
            setTransactions(updatedTransactions);
            localStorage.setItem(`transactions_${user.uid}`, JSON.stringify(updatedTransactions));

            // 4. Update Position with new Tx ID (if applicable)
            // For offline, we use the local ID for now. The sync process will update it later.
            if (positionId && localTx.id) {
                await updatePositionWithNewTx(positionId, localTx, localTx.id);
            }

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

            // Recalculate position if applicable
            if (updatedTransaction.positionId) {
                console.log(`Recalculating position ${updatedTransaction.positionId} after update...`);
                await recalculatePosition(updatedTransaction.positionId);
            }

            // Trigger Summary Recalculation (Fire and Forget)
            recalculateAssetSummary(user.uid, updatedTransaction.asset)
                .then(() => recalculateUserSummary(user.uid))
                .catch(err => console.error("Summary update failed:", err));
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
                    createdAt: new Date().toISOString(),
                    coinId: tx.coinId || null,
                    coinName: tx.coinName || null
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

    const deleteTransaction = async (transactionId) => {
        if (!user) return;

        try {
            // 1. Find the transaction to get details before deleting
            const txToDelete = transactions.find(t => t.id === transactionId);
            if (!txToDelete) {
                console.warn("Transaction not found for deletion:", transactionId);
                return;
            }

            console.log(`Deleting transaction ${transactionId}...`);

            // 2. Delete from Firestore (if online/valid ID)
            if (!transactionId.toString().startsWith('local_')) {
                await deleteDoc(doc(db, "transactions", transactionId));
            }

            // 3. Update Local State (Optimistic)
            const updatedTransactions = transactions.filter(t => t.id !== transactionId);
            setTransactions(updatedTransactions);
            localStorage.setItem(`transactions_${user.uid}`, JSON.stringify(updatedTransactions));

            // 4. Update Position ID if applicable
            if (txToDelete.positionId) {
                console.log(`Recalculating position ${txToDelete.positionId} after deletion...`);
                // Use a short delay or await to ensure data consistency if needed
                await recalculatePosition(txToDelete.positionId);
            }

            // 5. Trigger Summary Recalculation
            recalculateAssetSummary(user.uid, txToDelete.asset)
                .then(() => recalculateUserSummary(user.uid))
                .catch(err => console.error("Summary update failed:", err));

            console.log("Transaction deleted successfully.");

        } catch (error) {
            console.error("Error deleting transaction:", error);
            // Revert state if needed? For now, we assume Firestore error shouldn't revert local state if we want to be responsive.
            // But strict consistency might require re-fetching.
            setIsOffline(true);
            throw error;
        }
    };

    const repairDatabase = async () => {
        if (!user) return;
        if (window.confirm("This will recalculate all statistics and clean up ghost data. It may take a few seconds. Continue?")) {
            console.log("Starting DB Repair...");
            await recalculateAllSummaries(user.uid);
            alert("Database repaired successfully!");
            // Refresh logic if needed
        }
    };

    return (
        <TransactionContext.Provider value={{ transactions, addTransaction, updateTransaction, deleteTransaction, bulkAddTransactions, clearTransactions, repairDatabase }}>
            {children}
        </TransactionContext.Provider>
    );
};
