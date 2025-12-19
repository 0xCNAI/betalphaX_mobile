import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, updateDoc, collection } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: "AIzaSyAMMk37tmdFOXULC9BJPJmJ3rAyB20AYBg",
    authDomain: "betalphapick.firebaseapp.com",
    projectId: "betalphapick",
    storageBucket: "betalphapick.firebasestorage.app",
    messagingSenderId: "1069329661064",
    appId: "1:1069329661064:web:69246bab3d6497dee4f33d",
    measurementId: "G-N3H568MC2K"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const POSITIONS_COLLECTION = 'positions';

const recalculatePosition = async (positionId) => {
    try {
        console.log(`Recalculating position ${positionId}...`);
        const positionRef = doc(db, POSITIONS_COLLECTION, positionId);
        const positionSnap = await getDoc(positionRef);

        if (!positionSnap.exists()) {
            console.error("Position not found:", positionId);
            return;
        }

        const posData = positionSnap.data();
        const txIds = posData.transactionIds || [];

        if (txIds.length === 0) {
            console.log("No transactions found.");
            return;
        }

        // Fetch all transactions
        const txs = [];
        for (const txId of txIds) {
            const txSnap = await getDoc(doc(db, 'transactions', txId));
            if (txSnap.exists()) {
                txs.push({ id: txSnap.id, ...txSnap.data() });
            }
        }

        // Sort by date/timestamp
        txs.sort((a, b) => new Date(a.date) - new Date(b.date));

        // Replay metrics
        let current_size = 0;
        let total_buy_amount = 0;
        let total_cost = 0;
        let realized_pnl_abs = 0;

        for (const tx of txs) {
            const amount = Number(tx.amount) || 0;
            const price = Number(tx.price) || 0;

            if (tx.type === 'buy') {
                current_size += amount;
                total_buy_amount += amount;
                total_cost += (amount * price);
            } else if (tx.type === 'sell') {
                current_size -= amount;
                
                const avgEntry = total_buy_amount > 0 ? (total_cost / total_buy_amount) : 0;
                const tradePnl = (price - avgEntry) * amount;
                realized_pnl_abs += tradePnl;
            }
        }

        const avg_entry_price = total_buy_amount > 0 ? (total_cost / total_buy_amount) : 0;
        
        let status = 'open';
        let closedAt = null;
        if (current_size <= 1e-8) {
            current_size = 0;
            status = 'closed';
            const lastTx = txs[txs.length - 1];
            closedAt = lastTx?.createdAt || new Date().toISOString();
        }

        // Update Position
        await updateDoc(positionRef, {
            current_size,
            total_buy_amount,
            total_cost,
            avg_entry_price,
            realized_pnl_abs,
            status,
            closedAt,
            updatedAt: new Date().toISOString()
        });

        console.log(`Position ${positionId} recalculated successfully.`);
        console.log(`New Size: ${current_size}, Cost: ${total_cost}, Avg: ${avg_entry_price}`);

    } catch (error) {
        console.error("Error recalculating position:", error);
    }
};

recalculatePosition('aEEyArzLWc9lIGbHHfA4').then(() => process.exit());
