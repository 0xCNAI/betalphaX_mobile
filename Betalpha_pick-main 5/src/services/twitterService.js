/**
 * Service to fetch crypto-related tweets using TwitterAPI.io
 * Docs: https://docs.twitterapi.io
 */

import { getCoinMetadata } from './coinGeckoApi';
import { formatDistanceToNow } from 'date-fns';
import { analyzeTweetSignal, generateNewsDashboard, filterRelevantTweets } from './geminiService';

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
    const CACHE_KEY = `twitter_search_${upperTicker}_v2`;
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
            console.warn('[Twitter] ⚠️ API request failed');
            return [];
        }

        const data = await response.json();

        if (!data.tweets || data.tweets.length === 0) {
            console.warn('[Twitter] ⚠️ No tweets found for', upperTicker);
            return [];
        }

        // --- DOMAIN SAFETY FILTER APPLICATION ---
        const { twitterHandle, links } = await getCoinMetadata(upperTicker);
        const trustedDomains = buildTrustedDomainSet(links);

        // Apply scoring with trusted domains penalty
        const scoredTweets = data.tweets.map(t => ({
            ...t,
            score: calculateTweetScore(t, twitterHandle, trustedDomains)
        }));

        // Sort by SAFE Score (descending)
        scoredTweets.sort((a, b) => b.score - a.score);

        // Take top 25 highest quality/safe tweets
        let tweets = scoredTweets.slice(0, 25);

        console.log(`[Twitter] Filtered top 25 tweets for ${upperTicker} using Safety Score.`);

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

        // If still no tweets, return empty array (User requested NO mock data)
        if (finalTweets.length === 0) {
            console.warn('No relevant tweets found after filtering.');
            return [];
        }

        // Formatted tweets are already sorted by Safety Score (if applied)
        // or effectively by score via the transformation mapping above
        let formattedTweets = finalTweets.map(tweet => {
            // DEBUG: Log raw tweet structure to check metrics
            if (tweet.id === finalTweets[0].id) {
                console.log('[Twitter] Raw tweet object:', JSON.stringify(tweet, null, 2));
            }

            // Use tweet.url from TwitterAPI.io (direct link to tweet)
            const tweetLink = tweet.url || `https://x.com/${tweet.author?.userName}/status/${tweet.id}`;

            return {
                id: tweet.id,
                text: tweet.text,
                author: tweet.author?.userName || 'unknown',
                authorName: tweet.author?.name || 'Unknown',
                authorVerified: tweet.author?.isBlueVerified || tweet.author?.isVerified || false,
                authorFollowers: tweet.author?.followers || 0,
                likes: tweet.likeCount || tweet.likes || tweet.favorite_count || tweet.public_metrics?.like_count || 0,
                retweets: tweet.retweetCount || tweet.retweets || tweet.retweet_count || tweet.public_metrics?.retweet_count || 0,
                replies: tweet.replyCount || tweet.replies || tweet.reply_count || tweet.public_metrics?.reply_count || 0,
                timestamp: tweet.createdAt,
                link: tweetLink,
                score: tweet.score // Preserve the calculated Safety Score
            };
        });

        // Ensure we respect the sort order established by Safety Filter
        // If 'score' is present, sort by it. Otherwise fallback to engagement.
        formattedTweets.sort((a, b) => {
            if (a.score !== undefined && b.score !== undefined) {
                return b.score - a.score;
            }
            const engagementA = (a.likes || 0) + (a.retweets || 0);
            const engagementB = (b.likes || 0) + (b.retweets || 0);
            return engagementB - engagementA;
        });

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
        console.error('[Twitter] ⚠️ Exception during API call. Returning empty.');
        return [];
    }
}

/**
 * Fetch trending topics from Twitter
 * @returns {Promise<Array>}
 */
export async function getTwitterTrends() {
    // Check cache
    const CACHE_KEY = 'twitter_trends_v2';
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

const GLOBAL_TRUSTED_DOMAINS = new Set([
    'twitter.com', 'x.com',
    't.co', // Twitter Shortener
    'binance.com',
    'coinbase.com',
    'coindesk.com',
    'etherscan.io',
    'medium.com',
    'mirror.xyz',
    'snapshot.org',
    'youtube.com',
    'linkedin.com'
]);

/**
 * Extract domains from text using regex
 * @param {string} text 
 * @returns {Array<string>} List of domains found
 */
function extractDomains(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const urls = text.match(urlRegex) || [];
    return urls.map(url => {
        try {
            const hostname = new URL(url).hostname;
            return hostname.replace(/^www\./, '').toLowerCase();
        } catch (e) {
            return null;
        }
    }).filter(d => d !== null);
}

/**
 * Build dynamic trusted domain set
 * @param {Object} links - Links object from CoinGecko metadata
 * @returns {Set<string>}
 */
function buildTrustedDomainSet(links) {
    const trusted = new Set(GLOBAL_TRUSTED_DOMAINS);
    if (!links) return trusted;

    const addUrl = (url) => {
        if (!url || typeof url !== 'string') return;
        try {
            const hostname = new URL(url).hostname;
            trusted.add(hostname.replace(/^www\./, '').toLowerCase());
        } catch (e) { }
    };

    // Extract from CoinGecko standard fields
    // Using loose checking as fields might vary or be arrays
    const fields = [
        'homepage', 'blockchain_site', 'official_forum_url', 'chat_url',
        'announcement_url', 'twitter_screen_name', 'telegram_channel_identifier'
    ];

    fields.forEach(field => {
        const value = links[field];
        if (Array.isArray(value)) {
            value.forEach(addUrl);
        } else if (typeof value === 'string') {
            addUrl(value);
        }
    });

    return trusted;
}

/**
 * Filter out tweets from untrusted domains (Scam protection)
 * @param {Array} tweets 
 * @param {Set} trustedDomains 
 */
function filterScamTweets(tweets, trustedDomains) {
    if (!trustedDomains) return tweets;

    return tweets.filter(tweet => {
        const domains = extractDomains(tweet.text || '');
        if (domains.length === 0) return true; // No links = safe (usually)

        // Check if ANY domain in the tweet is untrusted
        const hasUntrusted = domains.some(domain => {
            const isTrusted = Array.from(trustedDomains).some(td =>
                domain === td || domain.endsWith('.' + td)
            );
            return !isTrusted;
        });

        if (hasUntrusted) {
            console.log(`[Safety] Filtered Scam Tweet: ${tweet.id} (Untrusted Domain)`);
            return false;
        }
        return true;
    });
}

/**
 * Check if a symbol is high-risk for ambiguity
 */
function isAmbiguousTicker(symbol) {
    const risky = ['RAIL', 'OMNI', 'ONE', 'AI', 'POL', 'GAS'];
    return risky.includes(symbol);
}

/**
 * Strict content filter for ambiguous tickers
 */
function filterNonCryptoTweets(tweets, symbol) {
    const cryptoContextKeywords = [
        'crypto', 'token', 'coin', 'blockchain', 'web3', 'defi', 'nft', 'wallet', 'dao', 'dex', 'cex',
        'price', 'chart', 'market', 'cap', 'vol', 'pump', 'dump', 'bull', 'bear', 'long', 'short', 'ath', 'atl',
        'launch', 'mainnet', 'testnet', 'airdrop', 'stake', 'staking', 'farm', 'governance', 'proposal', 'vote',
        'community', 'dev', 'team', 'partnership', 'collab', 'ama', 'whitelist', 'presale', 'tge', 'gem'
    ];

    return tweets.filter(tweet => {
        const text = (tweet.text || '').toLowerCase();
        const hasContext = cryptoContextKeywords.some(w => text.includes(w));
        const hasTicker = text.includes(`$${symbol.toLowerCase()}`);

        // If it has $TICKER, we give it pass (mostly). 
        // If it lacks $TICKER AND lacks Context -> DELETE.
        if (!hasTicker && !hasContext) {
            console.log(`[Ambiguity] Filtered non-crypto tweet for ${symbol}: ${tweet.id}`);
            return false;
        }
        return true;
    });
}


/**
 * Calculate a "Smart Score" for a tweet to determine its value
 * Factors: Engagement, Freshness, Credibility (Official/Verified), Keywords
 * NEW: Domain Safety Filter (-5 penalty for untrusted links)
 */
function calculateTweetScore(tweet, officialHandle, trustedDomains = null) {
    // Extract author handle safely (handles both raw API object and formatted string)
    const authorHandle = (typeof tweet.author === 'object' ? tweet.author?.userName : tweet.author) || '';

    // 1. Base Engagement
    // Retweets weighted higher as they imply sharing/virality
    let score = (tweet.likes || 0) + ((tweet.retweets || 0) * 2) + (tweet.replies || 0);

    // 2. Credibility Boost
    if (officialHandle && authorHandle.toLowerCase() === officialHandle.toLowerCase()) {
        score *= 3.0; // Massive boost for official news
    } else if (tweet.authorVerified || tweet.author?.isVerified || tweet.author?.isBlueVerified) {
        score *= 1.2; // Slight boost for verified accounts
    }

    // 3. Content Relevance (Keywords)
    const text = (tweet.text || '').toLowerCase();
    const impactKeywords = [
        'launch', 'live', 'mainnet', 'partnership', 'integrate', 'release',
        'upgrade', 'proposal', 'passed', 'record', 'milestone', 'announce',
        'hack', 'exploit', 'vulnerability', 'halt', 'pause', 'delist'
    ];

    if (impactKeywords.some(word => text.includes(word))) {
        score *= 1.5;
    }

    // 4. Domain Safety Filter (Link Trust Score)
    // If tweet contains URL AND domain is NOT in trust list -> Score -5
    if (trustedDomains) {
        const domains = extractDomains(tweet.text || '');
        let hasUntrustedLink = false;

        for (const domain of domains) {
            // Check if domain is trusted (or is a subdomain of trusted)
            const isTrusted = Array.from(trustedDomains).some(td =>
                domain === td || domain.endsWith('.' + td)
            );

            if (!isTrusted) {
                hasUntrustedLink = true;
                break;
            }
        }

        if (hasUntrustedLink) {
            // Apply Penalty
            // If the score is high (viral), -5 is nothing.
            // But per USER SPEC: "score -5". We adhere to spec.
            // Note: If score is 0, this makes it -5.
            score -= 5;
            console.log(`[Safety] Penalized tweet by -5 (Untrusted Link): ${tweet.id}`);
        }
    }

    // 5. Generic Relevance Validation (Anti-Noise)
    // Instead of hardcoding rules for $RAIL or $OMNI, we enforce a "Crypto Context" check.
    // If a tweet mentions the ticker but lacks ANY common crypto terminology, it's likely noise (e.g. physical trains, generic words).

    const symbol = tweet.symbol || (tweet.asset ? tweet.asset.toUpperCase() : ''); // Ensure we have symbol

    const cryptoContextKeywords = [
        // Core
        'crypto', 'token', 'coin', 'blockchain', 'web3', 'defi', 'nft', 'wallet', 'dao', 'dex', 'cex',
        // Price/Trading
        'price', 'chart', 'market', 'cap', 'vol', 'pump', 'dump', 'bull', 'bear', 'long', 'short', 'ath', 'atl', 'roi', 'pnl', 'entry', 'target', 'support', 'resistance',
        // Tech/Product
        'launch', 'mainnet', 'testnet', 'airdrop', 'stake', 'staking', 'farm', 'governance', 'proposal', 'vote', 'upgrade', 'merge', 'protocol', 'network', 'layer', 'l1', 'l2', 'zk', 'rollup', 'bridge',
        // Social/Action
        'community', 'dev', 'team', 'partnership', 'collab', 'ama', 'whitelist', 'presale', 'tge', 'gem', 'alpha', 'thesis', 'bag', 'hold', 'hodl', 'buy', 'sell'
    ];

    const lowerText = text.toLowerCase();

    // Check for presence of at least one crypto keyword
    const hasCryptoContext = cryptoContextKeywords.some(keyword => lowerText.includes(keyword));

    // Check for presence of the Ticker with $ prefix (High confidence signal)
    const hasTickerSymbol = symbol && lowerText.includes(`$${symbol.toLowerCase()}`);

    // Logic:
    // 1. If it has $TICKER, it's usually safe (unless it's spam, handled elsewhere).
    // 2. If it has NO $TICKER and NO Crypto Context, it's highly likely noise (e.g. "Ride the rail to work").
    // 3. We apply a severe penalty if both strong signals are missing.

    if (!hasTickerSymbol && !hasCryptoContext) {
        score *= 0.1; // 90% Penalty for ambiguous generic text
        // console.log(`[Score] Ambiguous tweet penalized (No crypto context): ${tweet.id}`);
    } else if (hasTickerSymbol && !hasCryptoContext) {
        // Has $TICKER but no other text. Neutral.
        // Ambiguity check: $RAIL can be used by non-crypto people? Unlikely. $ implies crypto on Twitter usually.
        // We trust $ symbol mostly.
    } else if (!hasTickerSymbol && hasCryptoContext) {
        // Mentions "Railgun" + "DeFi". Good.
        score *= 1.0;
    }

    // Extra Safety for known Super-Ambiguous words (Optional, but "General" approach prefers context)
    // If we want to be 100% sure for things like RAIL, we can require strict context if $ is missing.
    if (['RAIL', 'OMNI', 'ONE', 'AI', 'POL'].includes(symbol)) {
        if (!hasCryptoContext) {
            score -= 50; // Nuking score for ambiguous tickers without context
        }
    }

    // 6. Time Decay (Gravity)
    // Newer tweets score higher.
    // Score = Score / (Hours + 2)^1.2
    const hoursAgo = (Date.now() - new Date(tweet.timestamp || Date.now()).getTime()) / (1000 * 60 * 60);
    const timeFactor = Math.pow(Math.max(0, hoursAgo) + 2, 1.2);

    return score / timeFactor;
}

/**
 * Fetch feeds for a specific list of assets (Portfolio)
 * Implements "Guaranteed Diversity" algorithm
 * @param {Array<string>} assets - List of asset symbols
 * @returns {Promise<Array>}
 */
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

    const CACHE_KEY = `portfolio_feeds_smart_${targetAssets.sort().join('_')}_v2`;
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
        // We fetch 20 tweets per asset as requested
        const promises = targetAssets.map(async (asset) => {
            const coinMeta = await getCoinMetadata(asset);
            const { twitterHandle, links } = coinMeta;

            // Build trusted domains for Safety Filter
            const trustedDomains = buildTrustedDomainSet(links);

            // Fetch 20 tweets
            const tweets = await searchCryptoTweets(asset, 20, twitterHandle, forceRefresh);

            // Strict Filter: Scams / Ads / Bots
            const spamKeywords = [
                'airdrop', 'claim', 'free', 'scam', 'giveaway', 'whitelist', 'presale',
                'pump', '100x', 'gem', 'dm me', 'whatsapp', 'telegram', 'join group'
            ];

            const filteredTweets = tweets.filter(t => {
                const text = t.text.toLowerCase();
                return !spamKeywords.some(k => text.includes(k));
            });

            // Score tweets WITH Safety Filter
            const scoredTweets = filteredTweets.map(tweet => ({
                ...tweet,
                asset, // Tag with asset for grouping
                score: calculateTweetScore(tweet, twitterHandle, trustedDomains)
            }));

            // Analyze top 5 tweets per asset with AI (for sentiment signals)
            const topTweets = scoredTweets.sort((a, b) => b.score - a.score).slice(0, 5);

            const analyzedTweets = await Promise.all(topTweets.map(async (tweet) => {
                const analysis = await analyzeTweetSignal(tweet.text, asset);
                return { ...tweet, ...analysis };
            }));

            // Return all filtered tweets (up to 20), with analysis merged for the top ones
            return scoredTweets.map(t => {
                const analyzed = analyzedTweets.find(at => at.id === t.id);
                return analyzed || t;
            });
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
                // Sort by smart score
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
            asset: tweet.asset, // Optional: could display which asset this relates to
            // Preserve metrics for UI
            likes: tweet.likes,
            retweets: tweet.retweets,
            replies: tweet.replies,
            sentiment: tweet.sentiment
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

    const CACHE_KEY = 'major_crypto_feeds_v2';
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
            timestamp: tweet.timestamp,
            likes: tweet.likes,
            retweets: tweet.retweets,
            replies: tweet.replies,
            sentiment: tweet.sentiment
        }));

        // Cache the results
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: feeds
        }));

        return feeds;

    } catch (error) {
        console.error('Error fetching major feeds:', error);
        console.error('Error fetching major feeds:', error);
        return [];
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
 * @param {boolean} forceRefresh - Whether to bypass cache
 * @returns {Promise<Object>} - Structured dashboard data
 */
export async function getNewsDashboard(symbol, forceRefresh = false, featureName = 'feeds') {
    console.log(`[Twitter] Fetching News Dashboard for ${symbol}`);

    const CACHE_KEY = `news_dashboard_${symbol.toUpperCase()}_v2`;
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

    // 1. Check Cache
    if (!forceRefresh) {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    console.log(`[Twitter] Using cached dashboard for ${symbol}`);
                    return data;
                }
            }
        } catch (e) {
            console.warn('[Twitter] Cache read error:', e);
        }
    }

    // 2. Fetch Fresh Tweets (Client-side)
    try {
        // Fetch a batch of fresh tweets to analyze
        // We use 60 to get a good sample size (since we might filter some out)
        let tweets = await searchCryptoTweets(symbol, 60, null, true);

        if (!tweets || tweets.length === 0) {
            throw new Error('No tweets found for analysis');
        }

        // --- AI PRE-FILTERING LAYER ---
        // User Request: "Recover f14ac0f logic... but add an AI filter layer after fetching."
        // We use Gemini to strictly sanitize the feed (Scams, Homonyms) BEFORE summarization.
        const initialCount = tweets.length;
        try {
            const validIds = await filterRelevantTweets(symbol, tweets);

            // Fix: filterRelevantTweets returns IDs, we must filter the original array
            if (Array.isArray(validIds) && validIds.length > 0) {
                const validIdSet = new Set(validIds);
                tweets = tweets.filter(t => validIdSet.has(t.id));
            } else {
                console.warn('[NewsDashboard] AI Filter returned empty/invalid list, keeping original tweets as fallback.');
            }

            console.log(`[NewsDashboard] AI Filter removed ${initialCount - tweets.length} bad tweets.`);
        } catch (filterErr) {
            console.warn('[NewsDashboard] AI Filter failed, proceeding with raw feed:', filterErr);
        }

        if (tweets.length === 0) {
            throw new Error('All tweets filtered out as irrelevant/scam by AI');
        }

        // 3. Generate Dashboard using Gemini (Rich Style)
        const dashboardData = await generateNewsDashboard(symbol, tweets, forceRefresh, featureName);

        if (!dashboardData) {
            throw new Error('AI generation failed');
        }

        // 4. Save to Cache
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data: dashboardData
            }));
        } catch (e) {
            console.warn('[Twitter] Cache write error:', e);
        }

        return dashboardData;

    } catch (error) {
        console.error('[Twitter] Failed to generate dashboard:', error);
        throw error;
    }
}

/**
 * Generate mock News Dashboard data for fallback
 */
function getMockNewsDashboard(symbol) {
    return {
        discussions: [
            {
                theme: "Bullish Momentum",
                points: [
                    { detail: "Traders targeting $1.50 breakout level", source_url: "https://twitter.com" },
                    { detail: "Strong volume accumulation on Binance", source_url: "https://twitter.com" }
                ]
            },
            {
                theme: "Protocol Usage",
                points: [
                    { detail: "TVL reached new ATH this week", source_url: "https://twitter.com" }
                ]
            }
        ],
        past_month_events: [
            {
                date: new Date().toISOString().split('T')[0],
                event: "Mainnet Upgrade v2",
                details: "Successful deployment with lower fees",
                source_url: "https://twitter.com"
            }
        ],
        future_events: [
            {
                timeline: "Q4 2024",
                event: "Governance Staking",
                details: "Proposal passed to enable revenue share",
                source_url: "https://twitter.com"
            }
        ],
        risks: [],
        opportunities: [
            {
                signal: "Volume accumulation detected across major exchanges suggests institutional interest ahead of the protocol upgrade.",
                category: "Market",
                sources: [{
                    handle: "CryptoWhale",
                    url: "https://twitter.com",
                    text: "Massive buy walls forming on Binance for $TOKEN. Someone knows something is coming..."
                }]
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
            console.warn('[Twitter] Failed to fetch user tweets');
            return [];
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
        console.error('[Twitter] Error fetching user tweets:', error);
        return [];
    }
}
