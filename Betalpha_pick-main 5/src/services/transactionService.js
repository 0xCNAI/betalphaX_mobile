import { db } from './firebase';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { fetchPrices, fetchCoinHistory, getCoinId } from './coinGeckoApi';
import { getTokenFundamentals } from './fundamentalService';
import { analyzeTechnicals } from './technicalService';
import { getRecommendedKOLs } from './socialService';
import { getNewsForAsset } from './newsService';

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
        const { symbol, action, price, amount, date, narrative, tags, type } = txData;
        const timestamp = new Date(date).getTime();
        const now = Date.now();
        const isLive = (now - timestamp) < LIVE_THRESHOLD_MS;

        console.log(`[TransactionService] Processing ${isLive ? 'LIVE' : 'HISTORICAL'} transaction for ${symbol}`);

        // 1. Prepare Snapshot Container
        let snapshot = {
            fetched_at: now,
            data_source: isLive ? 'LIVE' : 'HISTORICAL',
            // Placeholders
            price_at_snapshot: null,
            technicals: null,
            fundamentals: null,
            news: null,
            social_sentiment: null
        };

        // 2. Fetch Context based on Scenario
        if (isLive) {
            await fetchLiveContext(symbol, snapshot);
        } else {
            await fetchHistoricalContext(symbol, date, snapshot);
        }

        // 3. Construct Final Document (Optimized Schema v2)
        const docData = {
            // --- Identifier & Meta ---
            tokenSymbol: symbol.toUpperCase(),
            type: isLive ? 'LIVE' : 'IMPORT',
            status: txData.status || 'active',
            createdAt: Timestamp.now(),

            // --- Layer 1: Execution (The Hard Data) ---
            // Keeping root level for backward compatibility with UI
            action: action.toUpperCase(), // BUY or SELL
            price: parseFloat(price),
            amount: parseFloat(amount),
            timestamp: timestamp,
            date: new Date(date).toISOString(),

            // Structured Execution Object (Future Proof)
            execution: {
                price: parseFloat(price),
                amount: parseFloat(amount),
                value: parseFloat(price) * parseFloat(amount),
                timestamp: timestamp,
                fee: txData.fee || 0 // Placeholder
            },

            // --- Layer 2: Strategy (User Intent) ---
            strategy: {
                setup_type: "Discretionary", // Default, or infer from tags later
                tags: tags || [],
                notes: narrative?.notes || '',
                sentiment: narrative?.emotion || 'Neutral',
                conviction: narrative?.confidence || null // 1-10
            },

            // Legacy Narrative object (for backward compatibility if needed)
            narrative: {
                primary_reason: narrative?.primary_reason || 'Unspecified',
                notes: narrative?.notes || '',
                event_type: narrative?.event_type || 'General',
                impact_score: narrative?.impact_score || null
            },

            // --- Layer 3: Market Snapshot (The Time Capsule) ---
            snapshot, // Rich context

            // Import Specific Data
            holdings_breakdown: txData.holdings_breakdown || null
        };

        // Allow price to be null for imports
        if (docData.price === null || isNaN(docData.price)) {
            docData.price = null;
        }

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
        console.log(`[TransactionService] Fetching RICH LIVE context for ${symbol}...`);

        // Parallel Fetching for Speed
        const [fundamentals, technicals, social, news, prices] = await Promise.all([
            getTokenFundamentals(symbol).catch(e => null),
            analyzeTechnicals(symbol).catch(e => null),
            getRecommendedKOLs(symbol).catch(e => null),
            getNewsForAsset(symbol, 3).catch(e => null), // Top 3 Headlines
            fetchPrices([symbol]).catch(e => null)
        ]);

        // 1. Fundamentals (Market Cap, FDV)
        if (fundamentals) {
            snapshot.fundamentals = {
                mcap: fundamentals.mcap || fundamentals.marketCap || null,
                fdv: fundamentals.fdv || null,
                rank: fundamentals.rank || null,
                sector_tags: fundamentals.categories || []
            };
        }

        // 2. Technicals (Deep Context)
        if (technicals) {
            snapshot.technicals = {
                score: technicals.score, // 0-100
                action: technicals.action, // BUY/SELL
                rsi_1h: technicals.indicators?.rsi || null,
                trend_short: technicals.verdicts?.short || null,
                trend_long: technicals.verdicts?.long || null,
                key_levels: technicals.keyLevels || null, // { support, resistance }
                signals: technicals.signals?.map(s => s.msg) || [] // List of active signals
            };
        }

        // 3. Social Context
        if (social && social.length > 0) {
            const avgScore = social.reduce((acc, curr) => acc + (curr.score || 0), 0) / social.length;
            snapshot.social_sentiment = {
                score: Math.round(avgScore),
                verdict: avgScore > 50 ? 'Bullish' : 'Bearish',
                volume_24h: 'Normal' // Placeholder
            };
        }

        // 4. News Context (Headlines)
        if (news && news.length > 0) {
            snapshot.news = news.map(n => ({
                headline: n.headline,
                source: n.source
            }));
        }

        // 5. Price at Snapshot
        if (prices && prices[symbol.toUpperCase()]) {
            snapshot.price_at_snapshot = prices[symbol.toUpperCase()].price;
        }

        console.log('[TransactionService] Rich Context Captured:', Object.keys(snapshot));

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
