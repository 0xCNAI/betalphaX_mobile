/**
 * Service to fetch crypto-related tweets using TwitterAPI.io
 * Docs: https://docs.twitterapi.io
 */

import { getCoinMetadata } from './coinGeckoApi';
import { formatDistanceToNow } from 'date-fns';
import { analyzeTweetSignal } from './geminiService';

const TWITTER_API_BASE = '/api/twitter';
// API Key is now handled by the backend proxy

// Map tickers to full token names for better search results
const TOKEN_NAMES = {
    'BTC': 'Bitcoin',
    'ETH': 'Ethereum',
    'SOL': 'Solana',
    'USDT': 'Tether',
    'USDC': 'USD Coin',
    'BNB': 'Binance',
    'XRP': 'Ripple',
    'ADA': 'Cardano',
    'DOGE': 'Dogecoin',
    'MATIC': 'Polygon',
    'DOT': 'Polkadot',
    'AVAX': 'Avalanche',
    'LINK': 'Chainlink',
    'UNI': 'Uniswap',
    'ATOM': 'Cosmos',
    'LTC': 'Litecoin',
    'ZEC': 'Zcash'
};

/**
 * Search tweets for a specific crypto token
 * @param {string} ticker - Token symbol (e.g., "BTC")
 * @param {number} limit - Max tweets to return (default: 10)
 * @returns {Promise<Array>} - Array of tweet objects
 */
export async function searchCryptoTweets(ticker, limit = 10, handle = null, forceRefresh = false) {
    console.log(`[Twitter] searchCryptoTweets called for ${ticker}, limit: ${limit}, forceRefresh: ${forceRefresh}`);

    // Note: We no longer check for API_KEY here as it's handled by the backend
    // But we can check if we are in a "mock mode" if needed, or just proceed to try the API

    const upperTicker = ticker.toUpperCase();
    const tokenName = TOKEN_NAMES[upperTicker] || upperTicker;

    // Check cache first
    const CACHE_KEY = `twitter_search_${upperTicker}`;
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

    try {
        if (!forceRefresh) {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { timestamp, data } = JSON.parse(cached);

                // Check if cached data is mock data (mock IDs start with 'mock_')
                const isMockData = data.length > 0 && data[0].id && data[0].id.toString().startsWith('mock_');

                // If we have cached mock data, we might want to refresh it with real data
                if (isMockData) {
                    console.log(`[Twitter] 🔄 Found cached MOCK data. Refreshing with real data...`);
                }
                // Otherwise check timestamp
                else if (Date.now() - timestamp < CACHE_DURATION) {
                    console.log(`[Twitter] 📦 Using cached tweets for ${upperTicker} (${data.length} tweets)`);
                    return data;
                } else {
                    console.log(`[Twitter] ⏰ Cache expired for ${upperTicker}, fetching fresh data`);
                }
            } else {
                console.log(`[Twitter] 🆕 No cache found for ${upperTicker}, fetching fresh data`);
            }
        } else {
            console.log(`[Twitter] 🔄 Force refresh requested for ${upperTicker}, bypassing cache`);
        }
    } catch (e) {
        console.warn('[Twitter] Cache read error', e);
    }

    // Build search query - use $TICKER format for better crypto results
    // User request: Focus on $TICKER for accuracy (removes noise from generic token names)
    // Increased min_faves to 20 to further reduce noise
    let queryPart = `$${upperTicker}`;
    // Optional: if we had a handle, we could include it, but let's stick to ticker for broader sentiment
    // if (handle) queryPart = `($${upperTicker} OR from:${handle})`;

    const query = `${queryPart} min_faves:20 lang:en -filter:retweets -filter:replies`;

    try {
        // Use the proxy endpoint
        // The proxy expects the path after /api/twitter to match the upstream API path
        // Upstream: https://api.twitterapi.io/twitter/tweet/advanced_search
        // Proxy: /api/twitter/twitter/tweet/advanced_search
        const url = `/api/twitter/twitter/tweet/advanced_search?query=${encodeURIComponent(query)}&type=Top`;
        console.log('[Twitter] 🌐 Fetching from API:', url);
        console.log('[Twitter] 🔍 Search query:', query);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(url, {
            // No headers needed, proxy handles the key
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        console.log('[Twitter] 📡 API Response status:', response.status, response.statusText);

        if (!response.ok) {
            console.warn('[Twitter] ⚠️ Falling back to MOCK data');
            return getMockTweets(ticker, limit);
        }

        const data = await response.json();

        if (!data.tweets || data.tweets.length === 0) {
            console.warn('[Twitter] ⚠️ No tweets found for', upperTicker, '- using MOCK data');
            return getMockTweets(ticker, limit);
        }

        // Filter tweets with SOLID engagement and remove spam
        const spamKeywords = [
            'shop now', 'buy now', 'click here', 'limited offer', 'discount', 'sale',
            'hinge', 'must-have', 'giveaway', 'airdrop', 'whitelist', 'presale',
            'dm me', 'send me', 'whatsapp', 'telegram', 'pump', '100x', 'gem'
        ];

        // Strict Filter: Solid engagement + Crypto relevance + No spam
        const strictTweets = data.tweets.filter(tweet => {
            const text = tweet.text?.toLowerCase() || '';

            // Skip spam/ads
            if (spamKeywords.some(spam => text.includes(spam))) return false;

            // Must mention the ticker
            const mentionsTicker = text.includes(`$${upperTicker.toLowerCase()}`) ||
                text.includes(upperTicker.toLowerCase()) ||
                text.includes(tokenName.toLowerCase());

            if (!mentionsTicker) return false;

            return true;
        });

        let finalTweets = strictTweets;

        // If still no tweets, use mock data
        if (finalTweets.length === 0) {
            console.warn('No relevant tweets found after filtering, using mock data');
            return getMockTweets(ticker, limit);
        }

        // Format tweets for our UI
        let formattedTweets = finalTweets.map(tweet => {
            // Use tweet.url from TwitterAPI.io (direct link to tweet)
            const tweetLink = tweet.url || `https://x.com/${tweet.author?.userName}/status/${tweet.id}`;

            return {
                id: tweet.id, // Note: This might be User ID in some cases, but we use it for keys
                text: tweet.text,
                author: tweet.author?.userName || 'unknown',
                authorName: tweet.author?.name || 'Unknown',
                authorVerified: tweet.author?.isBlueVerified || tweet.author?.isVerified || false,
                authorFollowers: tweet.author?.followers || 0,
                likes: tweet.likeCount || 0,
                retweets: tweet.retweetCount || 0,
                replies: tweet.replyCount || 0,
                timestamp: tweet.createdAt,
                link: tweetLink
            };
        });

        // Sort by total engagement
        formattedTweets.sort((a, b) => (b.likes + b.retweets) - (a.likes + a.retweets));

        // Take top N tweets
        formattedTweets = formattedTweets.slice(0, limit);

        console.log(`[Twitter] ✅ SUCCESS: Returning ${formattedTweets.length} REAL tweets for ${upperTicker}`);
        console.log('[Twitter] 🔗 Sample tweet link:', formattedTweets[0]?.link);

        // Save to cache
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data: formattedTweets
            }));
            console.log(`[Twitter] 💾 Cached ${formattedTweets.length} tweets for ${upperTicker}`);
        } catch (e) {
            console.warn('[Twitter] Cache write error', e);
        }

        return formattedTweets;

    } catch (error) {
        console.error('[Twitter] ❌ Exception during API call:', error.message);
        console.error('[Twitter] ⚠️ Falling back to MOCK data due to exception');
        return getMockTweets(ticker, limit);
    }
}

/**
 * Fetch trending topics from Twitter
 * @returns {Promise<Array>}
 */
export async function getTwitterTrends() {
    // Check cache
    const CACHE_KEY = 'twitter_trends';
    const CACHE_DURATION = 60 * 60 * 1000; // 60 minutes

    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) {
                console.log('Using cached trends');
                return data;
            }
        }
    } catch (e) { }

    try {
        // Use the correct endpoint: /twitter/trends
        // WOEID 1 = Global, 23424977 = US
        // Use the proxy endpoint: /api/twitter/twitter/trends
        const url = `/api/twitter/twitter/trends?woeid=1`;
        console.log('Fetching trends from:', url);

        const response = await fetch(url);

        if (!response.ok) {
            console.warn('Failed to fetch trends, using mock data');
            return getMockTrends();
        }

        const data = await response.json();

        if (data.trends && data.trends.length > 0) {
            // Format trends: { name, volume }
            // The API returns 'meta_description' or we can use rank
            const trends = data.trends.slice(0, 10).map(trend => ({
                name: trend.name,
                volume: trend.meta_description || 'Trending', // API might not return exact volume count
                rank: trend.rank
            }));

            // Save to cache
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data: trends
            }));

            return trends;
        }

        return getMockTrends();

    } catch (error) {
        console.error('Error fetching trends:', error);
        return getMockTrends();
    }
}

/**
 * Calculate a "Smart Score" for a tweet to determine its value
 * Factors: Engagement, Freshness, Credibility (Official/Verified), Keywords
 */
function calculateTweetScore(tweet, officialHandle) {
    // 1. Base Engagement
    // Retweets weighted higher as they imply sharing/virality
    let score = (tweet.likes || 0) + ((tweet.retweets || 0) * 2) + (tweet.replies || 0);

    // 2. Credibility Boost
    if (officialHandle && tweet.author.toLowerCase() === officialHandle.toLowerCase()) {
        score *= 3.0; // Massive boost for official news
    } else if (tweet.authorVerified) {
        score *= 1.2; // Slight boost for verified accounts
    }

    // 3. Content Relevance (Keywords)
    const text = tweet.text.toLowerCase();
    const impactKeywords = [
        'launch', 'live', 'mainnet', 'partnership', 'integrate', 'release',
        'upgrade', 'proposal', 'passed', 'record', 'milestone', 'announce',
        'hack', 'exploit', 'vulnerability', 'halt', 'pause', 'delist'
    ];

    if (impactKeywords.some(word => text.includes(word))) {
        score *= 1.5;
    }

    // 4. Time Decay (Gravity)
    // Newer tweets score higher.
    // Score = Score / (Hours + 2)^1.2
    const hoursAgo = (Date.now() - new Date(tweet.timestamp).getTime()) / (1000 * 60 * 60);
    const timeFactor = Math.pow(Math.max(0, hoursAgo) + 2, 1.2);

    return score / timeFactor;
}

/**
 * Fetch feeds for a specific list of assets (Portfolio)
 * Implements "Guaranteed Diversity" algorithm
 * @param {Array<string>} assets - List of asset symbols
 * @returns {Promise<Array>}
 */
export async function getPortfolioFeeds(assets, forceRefresh = false) {
    if (!assets || assets.length === 0) return getMajorCryptoFeeds();

    // Increase limit to top 20 assets to ensure broader coverage
    const targetAssets = assets.slice(0, 20);
    console.log(`[Twitter] Fetching feeds for portfolio: ${targetAssets.join(', ')}, forceRefresh: ${forceRefresh}`);

    const CACHE_KEY = `portfolio_feeds_smart_${targetAssets.sort().join('_')}`;
    const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

    try {
        if (!forceRefresh) {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    console.log('Using cached portfolio feeds');
                    return data;
                }
            }
        } else {
            console.log('[Twitter] Force refresh requested for portfolio feeds');
        }
    } catch (e) { }

    try {
        // Fetch tweets for each asset in parallel
        // We fetch slightly more tweets per asset (10) to have a good pool for scoring
        const promises = targetAssets.map(async (asset) => {
            const { twitterHandle } = await getCoinMetadata(asset);
            const tweets = await searchCryptoTweets(asset, 10, twitterHandle, forceRefresh);

            // Score tweets immediately
            const scoredTweets = tweets.map(tweet => ({
                ...tweet,
                asset, // Tag with asset for grouping
                score: calculateTweetScore(tweet, twitterHandle)
            }));

            // Analyze top 3 tweets per asset with AI to save tokens/latency
            // We only analyze the highest potential impact tweets
            const topTweets = scoredTweets.sort((a, b) => b.score - a.score).slice(0, 3);

            const analyzedTweets = await Promise.all(topTweets.map(async (tweet) => {
                const analysis = await analyzeTweetSignal(tweet.text, asset);
                return { ...tweet, ...analysis };
            }));

            return analyzedTweets;
        });

        // Use allSettled to prevent one failure from breaking the entire feed
        const resultsSettled = await Promise.allSettled(promises);

        // Filter out rejected promises and flatten results
        const results = resultsSettled
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);

        if (results.length === 0) {
            console.warn('[Twitter] All portfolio feed fetches failed, falling back to major');
            return getMajorCryptoFeeds();
        }

        // Group tweets by asset
        const tweetsByAsset = {};
        targetAssets.forEach(asset => tweetsByAsset[asset] = []);

        results.flat().forEach(tweet => {
            if (tweetsByAsset[tweet.asset]) {
                tweetsByAsset[tweet.asset].push(tweet);
            }
        });

        const finalList = [];
        const usedTweetIds = new Set();

        // Pass 1: Guaranteed Diversity
        // Pick the #1 highest scoring tweet for EACH asset
        targetAssets.forEach(asset => {
            const assetTweets = tweetsByAsset[asset];
            if (assetTweets && assetTweets.length > 0) {
                // Sort by score
                assetTweets.sort((a, b) => b.score - a.score);

                const topTweet = assetTweets[0];
                finalList.push(topTweet);
                usedTweetIds.add(topTweet.id);
            }
        });

        // Pass 2: Fill remaining slots with highest value tweets from the pool
        const pool = results.flat().filter(t => !usedTweetIds.has(t.id));
        pool.sort((a, b) => b.score - a.score);

        const slotsRemaining = 20 - finalList.length; // Increased slot limit
        if (slotsRemaining > 0) {
            finalList.push(...pool.slice(0, slotsRemaining));
        }

        // Final Sort: Sort the display list by Score (or Time if preferred, but Score is "Trending")
        finalList.sort((a, b) => b.score - a.score);

        // Format for Feeds UI
        const feeds = finalList.map(tweet => ({
            name: tweet.authorName || tweet.author || 'Unknown',
            volume: `${formatEngagement(tweet.likes)} likes`,
            text: tweet.text,
            url: tweet.link,
            timestamp: tweet.timestamp,
            asset: tweet.asset // Optional: could display which asset this relates to
        }));

        // Cache the results
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: feeds
        }));

        return feeds;

    } catch (error) {
        console.error('Error fetching portfolio feeds:', error);
        return getMajorCryptoFeeds(); // Fallback
    }
}

/**
 * Fetch major crypto feeds (BTC, ETH, SOL) to replace trends
 * Returns top 5 quality tweets across all three assets
 * @returns {Promise<Array>}
 */
export async function getMajorCryptoFeeds() {

    const CACHE_KEY = 'major_crypto_feeds';
    const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes

    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) {
                console.log('Using cached major feeds');
                return data;
            }
        }
    } catch (e) { }

    try {
        // Fetch tweets for each major crypto with official handles
        const [btcTweets, ethTweets, solTweets] = await Promise.all([
            searchCryptoTweets('BTC', 5, 'Bitcoin'),
            searchCryptoTweets('ETH', 5, 'ethereum'),
            searchCryptoTweets('SOL', 5, 'solana')
        ]);

        // Combine all tweets
        const allTweets = [...btcTweets, ...ethTweets, ...solTweets];

        // Sort by total engagement (likes + retweets + replies)
        allTweets.sort((a, b) => {
            const engagementA = (a.likes || 0) + (a.retweets || 0) + (a.replies || 0);
            const engagementB = (b.likes || 0) + (b.retweets || 0) + (b.replies || 0);
            return engagementB - engagementA;
        });

        // Take top 5 highest quality tweets
        const topTweets = allTweets.slice(0, 5);

        // Format for Feeds UI
        const feeds = topTweets.map(tweet => ({
            name: tweet.authorName || tweet.author || 'Unknown',
            volume: `${formatEngagement(tweet.likes)} likes`,
            text: tweet.text,
            url: tweet.link,
            timestamp: tweet.timestamp
        }));

        // Cache the results
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: feeds
        }));

        return feeds;

    } catch (error) {
        console.error('Error fetching major feeds:', error);
        return getMockFeeds();
    }
}

function getMockFeeds() {
    const btcTweets = getMockTweets('BTC', 2);
    const ethTweets = getMockTweets('ETH', 2);
    const solTweets = getMockTweets('SOL', 2);

    const allTweets = [...btcTweets, ...ethTweets, ...solTweets]
        .sort(() => Math.random() - 0.5);

    return allTweets.map(tweet => ({
        name: tweet.authorName,
        volume: `${formatEngagement(tweet.likes)} likes`,
        text: tweet.text,
        url: tweet.link,
        timestamp: tweet.timestamp
    }));
}

function getMockTrends() {
    return [
        { name: '#Bitcoin', volume: '500K' },
        { name: '$SOL', volume: '250K' },
        { name: 'Ethereum', volume: '180K' },
        { name: 'Crypto', volume: '1.2M' },
        { name: '#Binance', volume: '90K' }
    ];
}

// Mock data generator for demonstration and fallback
export function getMockTweets(ticker, limit = 5) {
    const upperTicker = ticker.toUpperCase();
    const tokenName = TOKEN_NAMES[upperTicker] || upperTicker;

    // Specific mock data for major coins
    const specificMocks = {
        'BTC': [
            { text: `${tokenName} breaking through resistance! This could be the start of a major rally. Technical indicators looking bullish 📈 #Bitcoin`, likes: 15200, retweets: 3400, author: 'CryptoWhale', verified: true },
            { text: `Institutional buying pressure on ${upperTicker} is increasing. Major accumulation phase detected on-chain 🐋`, likes: 8900, retweets: 2100, author: 'OnChainAnalyst', verified: false },
            { text: `${tokenName} RSI showing oversold conditions. Historical data suggests this is a good entry point.`, likes: 6700, retweets: 1800, author: 'TechnicalTrader', verified: true }
        ],
        'ETH': [
            { text: `${tokenName} staking yields looking attractive. The merge has fundamentally changed the economics 🔥`, likes: 12500, retweets: 2800, author: 'EthereumDaily', verified: true },
            { text: `${upperTicker} breaking out! Layer 2 adoption is driving serious demand. This is just the beginning 📊`, likes: 9200, retweets: 2300, author: 'DeFiAnalyst', verified: true }
        ],
        'SOL': [
            { text: `${tokenName} ecosystem is on fire! New projects launching daily. This chain is unstoppable 🔥`, likes: 11000, retweets: 2600, author: 'SolanaDaily', verified: true },
            { text: `At zec 60k`, likes: 0, retweets: 0, author: 'gimsh123456', verified: false },
            { text: `ZEC这波稳得让人想加仓`, likes: 0, retweets: 0, author: 'Lara82175200', verified: true },
            { text: `Privacy is a fundamental right. Zcash is leading the way with shielded transactions and zero-knowledge proofs 🔒`, likes: 8900, retweets: 2100, author: 'PrivacyMatters', verified: true }
        ]
    };

    const defaultMockTweets = [
        { text: `${tokenName} showing strong momentum. Technical analysis suggests continued upward movement 📈`, likes: 8500, retweets: 1900, author: 'CryptoAnalyst', verified: true },
        { text: `Bullish on ${upperTicker}! The fundamentals are solid and market sentiment is turning positive`, likes: 6200, retweets: 1400, author: 'MarketWatch', verified: false },
        { text: `${tokenName} breaking key resistance levels. This could be the start of a major trend reversal`, likes: 5100, retweets: 1200, author: 'TechnicalTA', verified: true },
        { text: `Accumulating more ${upperTicker} at these levels. Risk/reward ratio is excellent`, likes: 4300, retweets: 980, author: 'InvestorPro', verified: false },
        { text: `${tokenName} network metrics looking strong. On-chain data supports bullish thesis 🔗`, likes: 3800, retweets: 850, author: 'OnChainPro', verified: false }
    ];

    const tweets = specificMocks[upperTicker] || defaultMockTweets;

    return tweets.slice(0, limit).map((tweet, idx) => ({
        id: `mock_${upperTicker}_${idx}_${Date.now()}`,
        text: tweet.text,
        author: tweet.author,
        authorName: tweet.author,
        authorVerified: tweet.verified,
        authorFollowers: Math.floor(Math.random() * 50000) + 10000,
        likes: tweet.likes,
        retweets: tweet.retweets,
        replies: Math.floor(Math.random() * 500) + 50,
        timestamp: new Date(Date.now() - Math.random() * 86400000).toISOString(),
        link: `https://twitter.com/${tweet.author}/status/${Date.now() + idx}`
    }));
}

/**
 * Format large numbers for display (e.g., 15200 -> "15.2K")
 * @param {number} num - Number to format
 * @returns {string} - Formatted string
 */
export function formatEngagement(num) {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
}

/**
 * Prefetch tweets for key assets (BTC, ZEC) on app initialization
 * This ensures fresh data is available when users create transactions
 */
export async function prefetchTweetsForAssets() {
    const assets = ['BTC', 'ZEC'];

    console.log('[Twitter] Prefetching tweets for key assets...');

    for (const asset of assets) {
        try {
            // This will use cache if available, or fetch fresh data
            await searchCryptoTweets(asset, 5);
        } catch (error) {
            console.error(`[Twitter] Failed to prefetch ${asset}:`, error);
        }
    }

    console.log('[Twitter] Prefetch complete');
}

/**
 * Fetch the AI-generated News Dashboard for a symbol
 * @param {string} symbol - Asset symbol (e.g., "FLUID")
 * @returns {Promise<Object>} - Structured dashboard data
 */
export async function getNewsDashboard(symbol) {
    console.log(`[Twitter] Fetching News Dashboard for ${symbol}`);
    try {
        const response = await fetch('/api/news-dashboard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('[Twitter] Failed to fetch dashboard, using mock:', error);
        return getMockNewsDashboard(symbol);
    }
}

/**
 * Generate mock News Dashboard data for fallback
 */
function getMockNewsDashboard(symbol) {
    return {
        symbol: symbol,
        discussions: [
            {
                theme: "Ecosystem Expansion",
                points: [
                    { detail: "New DeFi protocols launching on the network.", source_url: "https://twitter.com" },
                    { detail: "Increasing developer activity observed on GitHub.", source_url: "https://github.com" }
                ]
            },
            {
                theme: "Market Sentiment",
                points: [
                    { detail: "Community sentiment shifting to bullish after recent support hold.", source_url: "https://twitter.com" },
                    { detail: "Influencers discussing potential breakout targets.", source_url: "https://twitter.com" }
                ]
            }
        ],
        past_month_events: [
            {
                date: "Recent",
                event: "Network Upgrade",
                details: "Successful implementation of latest improvement proposal.",
                source_url: "https://twitter.com"
            },
            {
                date: "Last Week",
                event: "Partnership Announcement",
                details: "Strategic collaboration with major infrastructure provider.",
                source_url: "https://twitter.com"
            }
        ],
        future_events: [
            {
                timeline: "Q3 2025",
                event: "Mainnet V2",
                details: "Major scalability improvements and fee reduction.",
                source_url: "https://twitter.com"
            },
            {
                timeline: "Next Month",
                event: "Governance Vote",
                details: "Community voting on treasury allocation.",
                source_url: "https://twitter.com"
            }
        ]
    };
}

/**
 * Fetch tweets from a specific user handle
 * @param {string} username - Twitter handle (without @)
 * @param {number} limit - Max tweets to return
 * @returns {Promise<Array>}
 */
export async function getTweetsFromUser(username, limit = 10) {
    const cleanUser = username.replace('@', '');
    console.log(`[Twitter] Fetching tweets from user: ${cleanUser}`);

    const query = `from:${cleanUser} -filter:retweets -filter:replies`;

    try {
        const url = `/api/twitter/twitter/tweet/advanced_search?query=${encodeURIComponent(query)}&type=Latest`;

        const response = await fetch(url);

        if (!response.ok) {
            console.warn('[Twitter] Failed to fetch user tweets, using mock');
            return getMockTweets(cleanUser, limit); // Fallback to mock
        }

        const data = await response.json();

        if (!data.tweets || data.tweets.length === 0) {
            return [];
        }

        const tweets = data.tweets.slice(0, limit).map(tweet => ({
            id: tweet.id,
            text: tweet.text,
            author: tweet.author?.userName || cleanUser,
            authorName: tweet.author?.name || cleanUser,
            authorVerified: tweet.author?.isVerified || false,
            likes: tweet.likeCount || 0,
            retweets: tweet.retweetCount || 0,
            replies: tweet.replyCount || 0,
            timestamp: tweet.createdAt,
            link: tweet.url || `https://x.com/${cleanUser}/status/${tweet.id}`
        }));

        // Analyze user tweets
        const analyzedTweets = await Promise.all(tweets.map(async (tweet) => {
            const analysis = await analyzeTweetSignal(tweet.text, cleanUser);
            return { ...tweet, ...analysis };
        }));

        return analyzedTweets;

    } catch (error) {
        console.error('[Twitter] Error fetching user tweets:', error);
        return getMockTweets(cleanUser, limit);
    }
}
