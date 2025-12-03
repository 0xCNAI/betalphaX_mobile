import { db } from './firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { fetchPrices, fetchCoinHistory, getCoinId } from './coinGeckoApi';
import { getTokenFundamentals } from './fundamentalService';
import { analyzeTechnicals } from './technicalService';
import { getRecommendedKOLs } from './socialService';

/**
 * Transaction Service
 * Handles intelligent data fetching for "Time Capsule" snapshots
 * distinguishing between Live Trading and Historical Imports.
 */

const LIVE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/**
 * Add a new transaction with intelligent context snapshot
 * @param {Object} txData - Transaction data (symbol, action, price, amount, date, narrative)
 * @returns {Promise<string>} - The new transaction ID
 */
export async function addTransaction(txData) {
    try {
        const { symbol, action, price, amount, date, narrative } = txData;
        const timestamp = new Date(date).getTime();
        const now = Date.now();
        const isLive = (now - timestamp) < LIVE_THRESHOLD_MS;

        console.log(`[TransactionService] Processing ${isLive ? 'LIVE' : 'HISTORICAL'} transaction for ${symbol}`);

        // 1. Prepare Snapshot Container (Strict Schema)
        let snapshot = {
            mc: null,
            fdv: null,
            rsi_entry: null,
            social_score: null,
            social_sentiment: null,
            btc_ref_price: null,
            price_at_snapshot: null,
            fetched_at: now,
            data_source: isLive ? 'LIVE' : 'HISTORICAL'
        };

        // Debug Time Logic
        console.log(`[TransactionService] Time Diff: ${(now - timestamp) / 1000 / 60} minutes`);
        if (!isLive && (now - timestamp) < 24 * 60 * 60 * 1000) {
            console.log('[TransactionService] Note: Transaction is within 24h but > 1h. Treated as Historical. If this is a "Just Now" trade, ensure timestamp is correct.');
        }

        // 2. Fetch Context based on Scenario
        if (isLive) {
            await fetchLiveContext(symbol, snapshot);
        } else {
            await fetchHistoricalContext(symbol, date, snapshot);
        }

        // 3. Construct Final Document
        const docData = {
            tokenSymbol: symbol.toUpperCase(),
            action: action.toUpperCase(), // BUY or SELL
            price: parseFloat(price),
            amount: parseFloat(amount),
            timestamp: timestamp, // Store as number for easier sorting
            date: new Date(date).toISOString(), // Store ISO for readability
            type: isLive ? 'LIVE' : 'IMPORT',

            // The "Time Capsule" - Immutable Context
            snapshot,

            // User's Narrative
            narrative: {
                primary_reason: narrative?.primary_reason || 'Unspecified',
                notes: narrative?.notes || '',
                event_type: narrative?.event_type || 'General',
                impact_score: narrative?.impact_score || null
            },

            // Import Specific Data
            holdings_breakdown: txData.holdings_breakdown || null,
            status: txData.status || 'active', // 'active', 'needs_calculation'

            createdAt: Timestamp.now()
        };

        // Allow price to be null for imports
        if (docData.price === null || isNaN(docData.price)) {
            docData.price = null;
        }

        // 4. Save to Firestore

        // 4. Save to Firestore
        const docRef = await addDoc(collection(db, 'transactions'), docData);
        console.log(`[TransactionService] Transaction saved with ID: ${docRef.id}`);
        return docRef.id;

    } catch (error) {
        console.error('[TransactionService] Error adding transaction:', error);
        throw error;
    }
}

/**
 * Scenario A: Live Execution Context
 * Fetches real-time Technicals, Fundamentals, and Social Sentiment
 */
async function fetchLiveContext(symbol, snapshot) {
    try {
        console.log(`[TransactionService] Fetching LIVE context for ${symbol}...`);

        // Parallel Fetching for Speed
        const [fundamentals, technicals, social, btcPrice] = await Promise.all([
            getTokenFundamentals(symbol).catch(e => { console.warn('Fundamentals failed:', e); return null; }),
            analyzeTechnicals(symbol).catch(e => { console.warn('Technicals failed:', e); return null; }),
            getRecommendedKOLs(symbol).catch(e => { console.warn('Social failed:', e); return null; }),
            fetchPrices(['BTC']).then(res => res['BTC']?.price).catch(e => null)
        ]);

        // 1. Market Data (MC, FDV)
        // FIX: fundamentalService returns { mcap, fdv, ... } NOT marketCap
        if (fundamentals) {
            snapshot.mc = fundamentals.mcap || fundamentals.marketCap || null;
            snapshot.fdv = fundamentals.fdv || null;
            // Also capture other useful fundamental tags if available
            if (fundamentals.categories) snapshot.sector_tags = fundamentals.categories;
        }

        // 2. Technical Context (RSI)
        if (technicals && technicals.indicators) {
            snapshot.rsi_entry = technicals.indicators.rsi || null;
            snapshot.trend = technicals.proAnalysis?.marketStructure || null;
        }

        // 3. Social Context (Sentiment Proxy)
        if (social && social.length > 0) {
            const avgScore = social.reduce((acc, curr) => acc + (curr.score || 0), 0) / social.length;
            snapshot.social_score = Math.round(avgScore);
            // Simple sentiment derivation
            snapshot.social_sentiment = avgScore > 50 ? 'Bullish' : avgScore < 20 ? 'Bearish' : 'Neutral';
        }

        // 4. Reference Price
        snapshot.btc_ref_price = btcPrice || null;

        // 5. Price at Snapshot (Current Market Price)
        // We should fetch the current price of the asset itself to store as "price_at_snapshot"
        // This validates if the user's entered price was close to market price
        try {
            const prices = await fetchPrices([symbol]);
            if (prices[symbol.toUpperCase()]) {
                snapshot.price_at_snapshot = prices[symbol.toUpperCase()].price;
            }
        } catch (e) {
            console.warn('Failed to fetch snapshot price:', e);
        }

        console.log('[TransactionService] Live Context Fetched:', JSON.stringify(snapshot, null, 2));

    } catch (error) {
        console.warn('[TransactionService] Partial failure in Live Context fetch:', error);
    }
}

/**
 * Scenario B: Historical Import Context
 * Fetches date-specific Price/MC. Sets volatile fields to null.
 */
async function fetchHistoricalContext(symbol, dateObj, snapshot) {
    try {
        // Format date to dd-mm-yyyy for CoinGecko
        const d = new Date(dateObj);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        const dateStr = `${day}-${month}-${year}`;

        // Fetch Historical Data
        const history = await fetchCoinHistory(symbol, dateStr);

        if (history) {
            snapshot.mc = history.marketCap;

            // FDV Logic: If missing, try to estimate or leave null
            if (history.fdv) {
                snapshot.fdv = history.fdv;
            } else if (history.total_supply && history.price) {
                // Estimate FDV if total supply is known (assuming it hasn't changed drastically)
                snapshot.fdv = history.total_supply * history.price;
            }
        }

        // Explicitly NULL for volatile fields (as per requirements)
        snapshot.rsi_entry = null; // Cannot reliably reconstruct
        snapshot.social_score = null; // Cannot reliably reconstruct
        snapshot.social_sentiment = null;
        snapshot.trend = null;

        // Try to fetch BTC price for that date too for reference
        const btcHistory = await fetchCoinHistory('BTC', dateStr);
        if (btcHistory) {
            snapshot.btc_ref_price = btcHistory.price;
        }

        // For historical, price_at_snapshot is the historical price we found
        if (history) {
            snapshot.price_at_snapshot = history.price;
        }

    } catch (error) {
        console.warn('[TransactionService] Partial failure in Historical Context fetch:', error);
    }
}
