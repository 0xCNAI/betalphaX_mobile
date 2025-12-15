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
import { createTransaction } from '../types/transaction';
import { createPositionDoc, getOpenPositionForAsset, updatePositionWithNewTx, recalculatePosition } from '../services/positionService';
import { addNote } from '../services/notebookService';
import { recalculateAssetSummary, recalculateUserSummary, recalculateAllSummaries } from '../services/summaryService';
import { runPostTransactionAnalysis } from '../services/aiAnalysisService';

const TransactionContext = createContext();

export const useTransactions = () => useContext(TransactionContext);

export const TransactionProvider = ({ children }) => {
    const [transactions, setTransactions] = useState([]);
    const { user } = useAuth();
    const [isOffline, setIsOffline] = useState(false);

    // Mock Data for Dev/Testing if empty
    const MOCK_DATA = [
        {
            id: 'local_mock_1',
            asset: 'BTC',
            type: 'buy',
            amount: 0.15,
            price: 65000,
            date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString().split('T')[0], // 10 days ago
            status: 'open',
            memo: "Accumulating spot BTC as a long-term hedge. Analyzing the 4-year cycle indicators which suggest we are in the early bull phase. Will look to add more on dips below 62k.",
            tags: ["Hedge", "Cycle", "Long Term"],
            userId: user?.uid || 'mock_user'
        },
        {
            id: 'local_mock_2',
            asset: 'ETH',
            type: 'buy',
            amount: 2.5,
            price: 3200,
            date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString().split('T')[0], // 5 days ago
            status: 'open',
            memo: "Entry for yield farming strategy on Aave. Expecting ETH ETF narrative to pick up steam in Q2. Risk/Reward looks favorable here with invalidation below 2800.",
            tags: ["DeFi", "Yield", "Narrative"],
            userId: user?.uid || 'mock_user'
        },
        {
            id: 'local_mock_3',
            asset: 'SOL',
            type: 'buy',
            amount: 150,
            price: 145,
            date: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString().split('T')[0], // 2 days ago
            status: 'open',
            memo: "Momentum trade. Solana showing relative strength against both BTC and ETH. Breakout above 140 was efficient. Targeting 180 short term.",
            tags: ["Momentum", "Breakout", "L1"],
            userId: user?.uid || 'mock_user'
        }
    ];

    // Load from local storage if offline or init mock data
    useEffect(() => {
        if (user) {
            const localData = localStorage.getItem(`transactions_${user.uid}`);
            if (localData) {
                const parsed = JSON.parse(localData);
                if (parsed.length > 0) {
                    setTransactions(parsed);
                } else {
                    // Seed mock data if empty
                    console.log("Seeding mock data for empty portfolio...");
                    setTransactions(MOCK_DATA);
                    localStorage.setItem(`transactions_${user.uid}`, JSON.stringify(MOCK_DATA));
                }
            } else {
                // Seed mock data if no local storage found
                console.log("Seeding mock data (first init)...");
                setTransactions(MOCK_DATA);
                localStorage.setItem(`transactions_${user.uid}`, JSON.stringify(MOCK_DATA));
            }
        }
    }, [user]);

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
                    sector_tags: fundResult.tags || [],

                    // Narrative
                    narratives: [],
                    news_sentiment: null,
                    social_buzz_level: null
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
                await updatePositionWithNewTx(positionId, newTx, docRef.id);
            }

            // 5. Trigger Real-time AI Analysis (Fire and Forget)
            runPostTransactionAnalysis(user.uid, docRef.id, newTx, { id: positionId, current_size: 0 });

            // 6. Trigger Summary Recalculation (Fire and Forget)
            const priceForSummary = Number(newTx.price) || 0;
            recalculateAssetSummary(user.uid, newTx.asset, priceForSummary)
                .then(() => recalculateUserSummary(user.uid))
                .catch(err => console.error("Summary update failed:", err));

            // 7. Save Investment Note if present (Fire and Forget)
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

            return docRef.id;

        } catch (error) {
            console.warn("Firestore failed/timed out, saving locally:", error);
            setIsOffline(true);

            // Local Fallback
            const localTx = { ...newTx, id: `local_${Date.now()}` };
            const updatedTransactions = [localTx, ...transactions];
            setTransactions(updatedTransactions);
            localStorage.setItem(`transactions_${user.uid}`, JSON.stringify(updatedTransactions));
            return localTx.id; // Return successfully even if offline
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
