import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Constants
const TWITTER_API_BASE = '/api/twitter/twitter'; // Proxy path
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour for global cache
const CACHE_VERSION = 'v8'; // Increment to invalidate old cache

// Fallback handles for major coins if API fails
const FALLBACK_HANDLES = {
    'BTC': 'Bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'ZEC': 'zcash',
    'DOGE': 'dogecoin',
    'XRP': 'Ripple',
    'ADA': 'Cardano',
    'DOT': 'Polkadot',
    'AVAX': 'Avalanche',
    'LINK': 'chainlink',
    'UNI': 'Uniswap',
    'MATIC': '0xPolygon'
};

// Map tickers to full names for broader search
const TOKEN_NAMES = {
    'BTC': 'Bitcoin',
    'ETH': 'Ethereum',
    'SOL': 'Solana',
    'ZEC': 'Zcash',
    'DOGE': 'Dogecoin',
    'XRP': 'Ripple',
    'ADA': 'Cardano',
    'DOT': 'Polkadot',
    'AVAX': 'Avalanche',
    'LINK': 'Chainlink',
    'UNI': 'Uniswap',
    'MATIC': 'Polygon'
};

/**
 * Get Recommended KOLs (Cold Start / First Trigger Logic)
 * @param {string} symbol - Token symbol
 * @param {string} [projectHandle] - Official project Twitter handle (optional)
 * @returns {Promise<Array>} - Top 5 Authors and their tweets
 */
export async function getRecommendedKOLs(symbol, projectHandle = null) {
    const upperSymbol = symbol.toUpperCase();

    // Use fallback handle if not provided
    const effectiveHandle = projectHandle || FALLBACK_HANDLES[upperSymbol];

    const cacheKey = effectiveHandle ? `${upperSymbol}_${effectiveHandle}` : upperSymbol;

    // 1. Check Firestore Cache
    try {
        const docRef = doc(db, 'token_social_insights', cacheKey);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const now = Date.now();
            // Check if cache is recent (< 1h) AND version matches
            if (data.updatedAt &&
                (now - new Date(data.updatedAt).getTime() < CACHE_DURATION_MS) &&
                data.version === CACHE_VERSION
            ) {
                console.log(`[Social] Using cached global insights for ${upperSymbol}`);
                return data.topVoices || [];
            }
        }
    } catch (e) {
        console.warn('[Social] Cache read error:', e);
    }

    console.log(`[Social] ❄️ Cold Start: Fetching fresh insights for ${upperSymbol} ${effectiveHandle ? `(@${effectiveHandle})` : ''}`);

    // 2. Cache Miss: Fetch from API
    try {
        // Query: ($SYMBOL OR @projectHandle OR "Token Name") lang:en -filter:retweets min_faves:5
        // Adding Token Name (e.g. "Zcash") significantly improves recall for coins where $ZEC is less used
        const tokenName = TOKEN_NAMES[upperSymbol];

        let queryTerm = `($${upperSymbol})`;
        if (effectiveHandle && tokenName) {
            queryTerm = `($${upperSymbol} OR @${effectiveHandle} OR "${tokenName}")`;
        } else if (effectiveHandle) {
            queryTerm = `($${upperSymbol} OR @${effectiveHandle})`;
        } else if (tokenName) {
            queryTerm = `($${upperSymbol} OR "${tokenName}")`;
        }

        const query = `${queryTerm} lang:en -filter:retweets -filter:replies min_faves:5`;
        console.log(`[Social] Generated Query: ${query}`);

        // Calculate date 14 days ago for "since" filter (YYYY-MM-DD)
        const date = new Date();
        date.setDate(date.getDate() - 14);
        const sinceDate = date.toISOString().split('T')[0];

        const fullQuery = `${query} since:${sinceDate}`;
        const url = `${TWITTER_API_BASE}/tweet/advanced_search?query=${encodeURIComponent(fullQuery)}&type=Top&limit=50`;

        const response = await fetch(url);
        if (!response.ok) throw new Error('Twitter API failed');

        const data = await response.json();
        const tweets = data.tweets || [];

        // 3. Strict Date & Spam Filter
        const spamKeywords = ['giveaway', 'airdrop', 'whitelist', 'presale', 'free mint', 'rt to win', 'pump', 'dm me', 'join my', 'telegram'];
        const blockedHandles = ['caffeineai']; // Targeted block list

        const filteredTweets = tweets.filter(t => {
            const text = (t.text || '').toLowerCase();
            const handle = (t.author?.userName || '').toLowerCase();

            // Date Check (Crucial: API 'since' is sometimes loose)
            const tweetDate = new Date(t.createdAt);
            const isRecent = tweetDate >= date;
            if (!isRecent) return false;

            // Content Check
            const hasSpam = spamKeywords.some(kw => text.includes(kw));
            if (hasSpam) return false;

            // Blocked Handle Check
            if (blockedHandles.includes(handle)) return false;

            return true;
        });

        // 4. Scoring Algorithm
        // Group by author first
        const authorMap = {};

        filteredTweets.forEach(t => {
            const rawHandle = t.author?.userName;
            if (!rawHandle) return;

            // Normalize handle for grouping (lowercase, trim)
            const authorKey = rawHandle.toLowerCase().trim();

            if (!authorMap[authorKey]) {
                authorMap[authorKey] = {
                    handle: rawHandle, // Keep original casing for display
                    name: t.author.name,
                    followers: t.author.followers || 0,
                    verified: t.author.isBlueVerified || t.author.isVerified,
                    tweets: [],
                    totalEngagement: 0,
                    mentions: 0
                };
            }

            authorMap[authorKey].tweets.push(t);
            authorMap[authorKey].mentions += 1;
            authorMap[authorKey].totalEngagement += (t.likeCount || 0) + (t.retweetCount || 0) + (t.replyCount || 0);
        });

        // Calculate Score for each author
        const scoredAuthors = Object.values(authorMap).map(a => {
            const avgEngagement = a.totalEngagement / a.tweets.length;
            const engagementRate = avgEngagement;
            const mentionFreq = a.mentions;
            const followerCountLog = Math.log10(Math.max(a.followers, 1));

            // Weighted Score:
            // - Engagement (50%): Increased weight on quality/impact
            // - Mentions (30%): Relevance
            // - Followers (20%): Reach
            let score = (engagementRate * 0.5) + (mentionFreq * 20 * 0.3) + (followerCountLog * 10 * 0.2);

            // Penalty for very small accounts (likely spam/bots)
            if (a.followers < 500) score *= 0.1;
            if (a.followers < 2000) score *= 0.5;

            return { ...a, score };
        });

        // 5. Ranking: Sort by score desc, take top 5
        scoredAuthors.sort((a, b) => b.score - a.score);
        const top5 = scoredAuthors.slice(0, 5);

        console.log('[Social] Top 5 Recommended:', top5.map(a => a.handle));

        // Format for return/storage (keep only necessary data)
        const result = top5.map(a => ({
            handle: a.handle,
            name: a.name,
            followers: a.followers,
            verified: a.verified,
            score: a.score,
            // Keep their best tweet for display context
            bestTweet: a.tweets.sort((t1, t2) => t2.likeCount - t1.likeCount)[0]
        }));

        // 6. Save Global Cache with Version
        try {
            const docRef = doc(db, 'token_social_insights', cacheKey);
            await setDoc(docRef, {
                topVoices: result,
                updatedAt: new Date().toISOString(),
                version: CACHE_VERSION
            });
        } catch (e) {
            console.warn('[Social] Cache write error:', e);
        }

        return result;

    } catch (error) {
        console.error('[Social] Error in getRecommendedKOLs:', error);
        return []; // Fail gracefully
    }
}

/**
 * Get Tracked Feed (User Feed Logic)
 * @param {string} symbol - Token symbol
 * @param {Array<string>} userTrackedHandles - List of handles the user tracks (e.g. ['@vitalik'])
 * @param {string} [projectHandle] - Official project Twitter handle (optional)
 * @returns {Promise<Array>} - Combined sorted feed of tweets
 */
export async function getTrackedFeed(symbol, userTrackedHandles = [], projectHandle = null) {
    const upperSymbol = symbol.toUpperCase();

    // 1. Fetch Global Data (Recommendation Pool)
    // We use this to get tweets for any handles in the user list that happen to be in the top 5
    // AND to populate the recommendation list in the UI.
    // But for the FEED itself, we need tweets.

    // Actually, getRecommendedKOLs returns authors and their *best tweet*. 
    // It doesn't return the full feed. 
    // But the requirement says: "Combine tweets from Global Data (for tracked users) + Targeted Fetch results."

    // Let's re-fetch the global data to get the authors.
    // If the user tracks someone in the global top 5, we might want more than just the "best tweet".
    // However, to save API calls, we can try to reuse what we have or just fetch fresh for the feed.

    // Optimization:
    // If userTrackedHandles is empty, show feed from Top 5 Global KOLs? 
    // Requirement says: "View 1: The Feed... Call getTrackedFeed".
    // Let's assume if empty, we use Top 5.

    let targetHandles = [...userTrackedHandles];
    let globalKOLs = [];

    try {
        // This will use the new logic (and potentially trigger a fresh fetch if cache is old/wrong version)
        globalKOLs = await getRecommendedKOLs(upperSymbol, projectHandle);
    } catch (e) {
        console.error('Error getting global KOLs:', e);
    }

    if (targetHandles.length === 0) {
        // Default to Top 5 Global if user has no preference
        targetHandles = globalKOLs.map(k => k.handle);
    }

    // 2. Gap Filling & Targeted Fetch
    // We need tweets for ALL targetHandles.
    // The globalKOLs data only has `bestTweet`. It might be stale or just one tweet.
    // To build a proper "Feed", we should probably fetch fresh tweets for these handles regarding the symbol.

    // Targeted Query: ($SYMBOL) (from:handle1 OR from:handle2 ...)
    // Twitter API limits query length, but 5 handles is fine.

    if (targetHandles.length === 0) return [];

    const handlesQuery = targetHandles.map(h => `from:${h.replace('@', '')}`).join(' OR ');

    // Calculate date 14 days ago
    const date = new Date();
    date.setDate(date.getDate() - 14);
    const sinceDate = date.toISOString().split('T')[0];

    // Query: ($SYMBOL OR @projectHandle) (from:handle1 OR from:handle2 ...)
    let queryTerm = `($${upperSymbol})`;
    if (projectHandle) {
        queryTerm = `($${upperSymbol} OR @${projectHandle})`;
    }

    const query = `${queryTerm} (${handlesQuery}) -filter:retweets -filter:replies since:${sinceDate}`;

    try {
        const url = `${TWITTER_API_BASE}/tweet/advanced_search?query=${encodeURIComponent(query)}&type=Latest&limit=20`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Twitter API failed for feed');

        const data = await response.json();
        const tweets = data.tweets || [];

        // Strict Date Filter for Feed as well
        const recentTweets = tweets.filter(t => {
            const tweetDate = new Date(t.createdAt);
            return tweetDate >= date;
        });

        // Format tweets
        return recentTweets.map(t => ({
            id: t.id,
            text: t.text,
            author: t.author?.userName,
            authorName: t.author?.name,
            authorVerified: t.author?.isBlueVerified || t.author?.isVerified,
            likes: t.likeCount,
            retweets: t.retweetCount,
            timestamp: t.createdAt,
            url: t.url || `https://x.com/${t.author?.userName}/status/${t.id}`
        })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    } catch (error) {
        console.error('[Social] Error fetching tracked feed:', error);
        return [];
    }
}
