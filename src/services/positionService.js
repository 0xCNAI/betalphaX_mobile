import { db } from './firebase';
import { collection, addDoc, doc, getDoc, updateDoc, arrayUnion, query, where, getDocs } from 'firebase/firestore';
import { calculateAssetPnL } from '../utils/pnlCalculator';

const POSITIONS_COLLECTION = 'positions';

/**
 * Helper to create a standardized Position object
 */
const createPosition = (data) => ({
    userId: data.userId,
    asset: data.asset,
    chain: data.chain || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'open',

    current_size: 0,
    total_buy_amount: 0,
    total_cost: 0,
    avg_entry_price: 0,
    realized_pnl_abs: 0,

    transactionIds: [],

    main_thesis: data.main_thesis || null,
    ...data
});

/**
 * Get active open position for a user and asset
 */
export const getOpenPositionForAsset = async (userId, asset) => {
    try {
        const q = query(
            collection(db, POSITIONS_COLLECTION),
            where('userId', '==', userId),
            where('asset', '==', asset.toUpperCase()),
            where('status', '==', 'open')
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
        }
        return null;
    } catch (error) {
        console.error("Error fetching open position:", error);
        return null;
    }
};

/**
 * Create a new position document
 */
export const createPositionDoc = async (userId, asset, firstTx) => {
    const price = Number(firstTx.price) || 0;
    const isBuy = firstTx.type === 'buy';

    const positionData = createPosition({
        userId,
        asset: asset.toUpperCase(),
        chain: firstTx.chain || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        status: 'open',

        // Initial metrics - start at 0, will be populated by updatePositionWithNewTx
        current_size: 0,
        total_buy_amount: 0,
        total_cost: 0,
        avg_entry_price: 0,

        transactionIds: [], // Will be updated after tx is saved

        // Prioritize explicit thesis, fallback to memo
        main_thesis: firstTx.main_thesis || firstTx.memo || null,
    });

    try {
        const docRef = await addDoc(collection(db, POSITIONS_COLLECTION), positionData);
        return { id: docRef.id, ...positionData };
    } catch (error) {
        console.error("Error creating position:", error);
        throw error;
    }
};

/**
 * Update a position with a new transaction.
 * Recalculates metrics: current_size, status, PnL, etc.
 * 
 * @param {string} positionId 
 * @param {Object} tx - The new transaction object
 * @param {string} txId - The Firestore ID of the new transaction
 */
export const updatePositionWithNewTx = async (positionId, tx, txId) => {
    try {
        const positionRef = doc(db, POSITIONS_COLLECTION, positionId);
        const positionSnap = await getDoc(positionRef);

        if (!positionSnap.exists()) {
            console.error("Position not found:", positionId);
            return;
        }

        const posData = positionSnap.data();

        // 1. Calculate new metrics
        let current_size = Number(posData.current_size) || 0;
        let total_buy_amount = Number(posData.total_buy_amount) || 0;
        // Interpret total_cost as Current Cost Basis
        let total_cost = Number(posData.total_cost) || 0;
        let realized_pnl_abs = Number(posData.realized_pnl_abs) || 0;
        let realized_pnl_pct = Number(posData.realized_pnl_pct) || 0;

        // Important: Track Avg Entry Price for Current Holdings
        let avg_entry_price = Number(posData.avg_entry_price) || 0;

        const txAmount = Number(tx.amount) || 0;
        const txPrice = Number(tx.price) || 0;

        if (tx.type === 'buy') {
            // Update Current Cost Basis
            total_cost += (txAmount * txPrice);
            current_size += txAmount;
            total_buy_amount += txAmount; // Lifetime buy volume

            // Recalculate Weighted Avg
            avg_entry_price = current_size > 0 ? total_cost / current_size : 0;

        } else if (tx.type === 'sell') {
            // Reduce Current Cost Basis proportional to sold amount
            const costRemoved = txAmount * avg_entry_price;
            total_cost -= costRemoved;
            current_size -= txAmount;

            // Calculate Realized PnL for this sell using CURRENT Avg Entry
            const tradePnl = (txPrice - avg_entry_price) * txAmount;
            realized_pnl_abs += tradePnl;

            // Avg Entry Price remains CONSTANT on sell
        }

        // Safety check
        if (current_size < 1e-8) {
            current_size = 0;
            total_cost = 0;
            avg_entry_price = 0;
        } else if (total_cost < 0) {
            total_cost = 0;
        }

        // 2. Determine Status
        let status = posData.status;
        let closedAt = posData.closedAt;

        // Close if size is effectively zero (handle floating point errors)
        if (current_size <= 1e-8) {
            current_size = 0;
            status = 'closed';
            closedAt = tx.createdAt || new Date().toISOString();
        } else {
            status = 'open';
            closedAt = null;
        }

        // 3. Update Document
        await updateDoc(positionRef, {
            current_size,
            total_buy_amount,
            total_cost,
            avg_entry_price,
            realized_pnl_abs,
            status,
            closedAt,
            transactionIds: arrayUnion(txId),
            updatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error("Error updating position:", error);
        throw error;
    }
};

/**
 * Add transaction ID to position's transactionIds array.
 * @deprecated Use updatePositionWithNewTx instead for full logic
 * 
 * @param {string} positionId 
 * @param {string} txId 
 */
export const addTxToPosition = async (positionId, txId) => {
    try {
        const positionRef = doc(db, POSITIONS_COLLECTION, positionId);
        await updateDoc(positionRef, {
            transactionIds: arrayUnion(txId),
            updatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error adding tx to position:", error);
    }
}

/**
 * Recalculate position metrics from scratch based on its transactions.
 * Useful for fixing data inconsistencies or after editing transactions.
 * 
 * @param {string} positionId 
 */
export const recalculatePosition = async (positionId) => {
    try {
        const positionRef = doc(db, POSITIONS_COLLECTION, positionId);
        const positionSnap = await getDoc(positionRef);

        if (!positionSnap.exists()) {
            console.error("Position not found:", positionId);
            return;
        }

        const posData = positionSnap.data();
        const { userId, asset } = posData;

        // Fetch ALL transactions for this asset from the transactions collection
        // This ensures we are using the detailed source of truth, not a potentially out-of-sync ID list
        const q = query(
            collection(db, 'transactions'),
            where('userId', '==', userId),
            where('asset', '==', asset)
        );

        const querySnapshot = await getDocs(q);
        const txs = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (txs.length === 0) {
            // No transactions found, reset position
            await updateDoc(positionRef, {
                current_size: 0,
                total_buy_amount: 0,
                total_cost: 0,
                avg_entry_price: 0,
                realized_pnl_abs: 0,
                status: 'closed',
                transactionIds: [], // Clear IDs
                updatedAt: new Date().toISOString()
            });
            return;
        }

        // Sort by date/timestamp
        txs.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Update the position's transactionIds list to match reality
        const freshTransactionIds = txs.map(t => t.id);

        // Replay metrics using standard WAC calculator
        let {
            holdings: current_size,
            totalCost: total_cost,
            avgBuyPrice: avg_entry_price,
            realizedPnL: realized_pnl_abs
        } = calculateAssetPnL(txs, 0); // Price 0 is fine, we don't need unrealized here

        // Calculate total buy amount (lifetime volume) manually as it's not in PnL calculator
        const total_buy_amount = txs.reduce((acc, tx) => {
            return tx.type === 'buy' ? acc + (Number(tx.amount) || 0) : acc;
        }, 0);

        // Determine status
        let status = 'open';
        let closedAt = null;
        if (current_size <= 1e-8) {
            current_size = 0;
            status = 'closed';
            // Use the last transaction's date as closedAt
            const lastTx = txs[txs.length - 1];
            closedAt = lastTx?.createdAt || new Date().toISOString();
        }

        // Sync Initial Thesis from transaction notes
        // Prioritize narrative.notes (Firestore) or memo (local/legacy) of the FIRST transaction
        const firstTx = txs[0];
        const initialThesis = firstTx.narrative?.notes || firstTx.memo || null;

        // Update Position
        await updateDoc(positionRef, {
            current_size,
            total_buy_amount,
            total_cost,
            avg_entry_price,
            realized_pnl_abs,
            status,
            closedAt,
            transactionIds: freshTransactionIds, // Update the list with validation
            main_thesis: initialThesis, // Sync Initial Thesis
            updatedAt: new Date().toISOString()
        });

        console.log(`Position ${positionId} recalculated successfully.`);

    } catch (error) {
        console.error("Error recalculating position:", error);
        throw error;
    }
};
