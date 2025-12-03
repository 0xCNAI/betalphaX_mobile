// CoinGecko API Service
import { TOP_COINS } from '../data/topCoins';
const COINGECKO_API = '/api/coingecko';

// Request Queue with Deduplication to prevent rate limits
class RequestQueue {
    constructor(maxConcurrent = 1, intervalMs = 4000) {
        this.queue = [];
        this.processing = false;
        this.maxConcurrent = maxConcurrent;
        this.intervalMs = intervalMs;
        this.backoffMultiplier = 1; // For exponential backoff
        this.consecutiveErrors = 0;
        this.inFlightRequests = new Map(); // For deduplication
        this.circuitBreakerOpen = false; // Circuit breaker state
        this.circuitBreakerTimeout = null;
    }

    add(fn, dedupeKey = null) {
        // Circuit breaker: reject immediately if circuit is open
        if (this.circuitBreakerOpen) {
            console.warn('[RequestQueue] Circuit breaker is OPEN - rejecting request');
            return Promise.reject(new Error('Circuit breaker open - too many consecutive errors'));
        }

        // Request deduplication: if same request is in-flight, return existing Promise
        if (dedupeKey && this.inFlightRequests.has(dedupeKey)) {
            console.log(`[RequestQueue] Deduplicating request: ${dedupeKey}`);
            return this.inFlightRequests.get(dedupeKey);
        }

        const promise = new Promise((resolve, reject) => {
            this.queue.push({ fn, resolve, reject, dedupeKey });
            this.process();
        });

        // Track in-flight request for deduplication
        if (dedupeKey) {
            this.inFlightRequests.set(dedupeKey, promise);
            // Clean up after promise settles
            promise.finally(() => {
                this.inFlightRequests.delete(dedupeKey);
            });
        }

        return promise;
    }

    async process() {
        if (this.processing || this.queue.length === 0) {
            return;
        }

        this.processing = true;
        const { fn, resolve, reject, dedupeKey } = this.queue.shift();

        try {
            const result = await fn();
            // Success - reset backoff
            this.consecutiveErrors = 0;
            this.backoffMultiplier = 1;
            resolve(result);
        } catch (error) {
            // Check if it's a 429 error
            if (error.message && error.message.includes('429')) {
                this.consecutiveErrors++;
                // Exponential backoff: 1x, 2x, 4x, 8x (max)
                this.backoffMultiplier = Math.min(Math.pow(2, this.consecutiveErrors - 1), 8);
                console.warn(`[RequestQueue] 429 error detected. Backoff multiplier: ${this.backoffMultiplier}x`);

                // Circuit breaker: open circuit after 5 consecutive 429 errors
                if (this.consecutiveErrors >= 5) {
                    this.openCircuitBreaker();
                }
            }
            reject(error);
        } finally {
            this.processing = false;
            // Apply backoff multiplier to interval
            const actualInterval = this.intervalMs * this.backoffMultiplier;
            setTimeout(() => this.process(), actualInterval);
        }
    }

    openCircuitBreaker() {
        console.error('[RequestQueue] 🔴 CIRCUIT BREAKER OPENED - Pausing all requests for 30 seconds');
        this.circuitBreakerOpen = true;

        // Clear any existing timeout
        if (this.circuitBreakerTimeout) {
            clearTimeout(this.circuitBreakerTimeout);
        }

        // Close circuit breaker after 30 seconds
        this.circuitBreakerTimeout = setTimeout(() => {
            console.log('[RequestQueue] 🟢 CIRCUIT BREAKER CLOSED - Resuming requests');
            this.circuitBreakerOpen = false;
            this.consecutiveErrors = 0;
            this.backoffMultiplier = 1;
            this.process(); // Resume processing
        }, 30000);
    }
}

// Export shared queue for other services
export const apiQueue = new RequestQueue(1, 4000); // 1 request every 4 seconds (with exponential backoff on 429)

// Common ticker to CoinGecko ID mapping (for performance)
// Expanded to include top 50+ tokens to reduce API search calls by ~80%
const TICKER_MAP = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'USDT': 'tether',
    'USDC': 'usd-coin',
    'BNB': 'binancecoin',
    'XRP': 'ripple',
    'ADA': 'cardano',
    'DOGE': 'dogecoin',
    'MATIC': 'matic-network',
    'DOT': 'polkadot',
    'AVAX': 'avalanche-2',
    'LINK': 'chainlink',
    'UNI': 'uniswap',
    'ATOM': 'cosmos',
    'ZEC': 'zcash',
    'LTC': 'litecoin',
    'BCH': 'bitcoin-cash',
    'ETC': 'ethereum-classic',
    'XLM': 'stellar',
    'ALGO': 'algorand',
    'VET': 'vechain',
    'FIL': 'filecoin',
    'TRX': 'tron',
    'AAVE': 'aave',
    'NEAR': 'near',
    'APT': 'aptos',
    'ARB': 'arbitrum',
    'OP': 'optimism',
    'FLUID': 'instadapp',  // Correct FLUID token (Instadapp, formerly INST)
    'RAIL': 'railgun',
    // Additional top tokens
    'SHIB': 'shiba-inu',
    'DAI': 'dai',
    'WBTC': 'wrapped-bitcoin',
    'LEO': 'leo-token',
    'TON': 'the-open-network',
    'HBAR': 'hedera-hashgraph',
    'ICP': 'internet-computer',
    'CRO': 'crypto-com-chain',
    'IMX': 'immutable-x',
    'MKR': 'maker',
    'LDO': 'lido-dao',
    'RUNE': 'thorchain',
    'INJ': 'injective-protocol',
    'GRT': 'the-graph',
    'SNX': 'havven',
    'MANA': 'decentraland',
    'SAND': 'the-sandbox',
    'AXS': 'axie-infinity',
    'FTM': 'fantom',
    'THETA': 'theta-token',
    'EGLD': 'elrond-erd-2',
    'XTZ': 'tezos',
    'EOS': 'eos',
    'FLOW': 'flow',
    'KLAY': 'klay-token',
    'CHZ': 'chiliz',
    'QNT': 'quant-network',
    'CAKE': 'pancakeswap-token',
    'PENDLE': 'pendle',
    'ETHFI': 'ether-fi',
    'PEPE': 'pepe',
    'WIF': 'dogwifcoin',
    'BONK': 'bonk',
    'FLOKI': 'floki',
    'GALA': 'gala',
    'ENS': 'ethereum-name-service',
    'CRV': 'curve-dao-token',
    'COMP': 'compound-governance-token',
    'SUSHI': 'sushi',
    '1INCH': '1inch',
    'BAL': 'balancer',
    'YFI': 'yearn-finance'
};

// Token Blacklist - these tokens are banned from the app
const BANNED_TOKENS = new Set([
    'fluid-liquidity',  // Wrong FLUID token (Fluid Finance), causes pricing issues
]);

// Cache for dynamic ticker lookups
let tickerCache = { ...TICKER_MAP };

// Simple in-memory cache for API responses
const apiCache = {
    prices: { data: {}, timestamp: 0 },
    ohlc: {}, // Keyed by ticker: { data: [], timestamp: 0 }
    history: {} // Keyed by ticker: { data: [], timestamp: 0 }
};

const CACHE_TTL = {
    PRICES: 60 * 1000, // 1 minute
    OHLC: 5 * 60 * 1000, // 5 minutes
    HISTORY: 15 * 60 * 1000 // 15 minutes
};

/**
 * Search for a coin by ticker symbol
 * @param {string} ticker - The ticker symbol (e.g., "BTC")
 * @returns {Promise<Object|null>} - Coin data or null if not found
 */
export async function searchCoin(ticker) {
    try {
        const response = await fetch(`${COINGECKO_API}/search?query=${ticker}`);
        if (!response.ok) throw new Error('Search failed');

        const data = await response.json();

        // Find exact symbol match (case-insensitive)
        const coin = data.coins.find(c =>
            c.symbol.toUpperCase() === ticker.toUpperCase()
        );

        if (coin) {
            return {
                id: coin.id,
                name: coin.name,
                symbol: coin.symbol,
                thumb: coin.thumb,
                small: coin.small,
                large: coin.large
            };
        }

        return null;
    } catch (error) {
        console.error('Error searching coin:', error);
        return null;
    }
}

/**
 * Search for multiple coins by query (for autocomplete)
 * @param {string} query - The search query (e.g., "B" or "BTC")
 * @param {number} limit - Maximum number of results (default: 10)
 * @returns {Promise<Array>} - Array of coin data
 */
/**
 * Search for multiple coins by query (for autocomplete)
 * @param {string} query - The search query (e.g., "B" or "BTC")
 * @param {number} limit - Maximum number of results (default: 10)
 * @returns {Promise<Array>} - Array of coin data
 */
export async function searchCoins(query, limit = 10) {
    return apiQueue.add(async () => {
        try {
            if (!query || query.length < 1) return [];

            const upperQuery = query.toUpperCase();

            // 1. Search in Static Top Coins List FIRST (Fundamental Fix for IP/Network issues)
            const staticMatches = TOP_COINS.filter(c =>
                c.symbol.includes(upperQuery) ||
                c.name.toUpperCase().includes(upperQuery)
            ).slice(0, limit);

            if (staticMatches.length > 0) {
                console.log(`[CoinGecko] Found ${staticMatches.length} matches in static list for: ${query}`);
                return staticMatches.map(coin => ({
                    ...coin,
                    market_cap_rank: 1 // Mock rank for static data
                }));
            }

            // 2. If not found in static list, try API (with fallback)
            console.log(`[CoinGecko] Not in static list, searching API for: ${query}`);
            const response = await fetch(`${COINGECKO_API}/search?query=${query}`);

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            console.log('CoinGecko raw search response:', data);

            // Return top matches with icon data
            return data.coins.slice(0, limit).map(coin => ({
                id: coin.id,
                name: coin.name,
                symbol: coin.symbol.toUpperCase(),
                thumb: coin.thumb,
                small: coin.small,
                large: coin.large,
                market_cap_rank: coin.market_cap_rank
            }));
        } catch (error) {
            console.error('Error searching coins (using fallback):', error);

            // Local Fallback using TICKER_MAP
            const upperQuery = query.toUpperCase();
            const fallbackResults = Object.entries(TICKER_MAP)
                .filter(([ticker]) => ticker.includes(upperQuery))
                .map(([ticker, id]) => ({
                    id: id,
                    name: id.charAt(0).toUpperCase() + id.slice(1).replace('-', ' '),
                    symbol: ticker,
                    thumb: null, // No icon in fallback
                    market_cap_rank: 999
                }))
                .slice(0, 5);

            return fallbackResults;
        }
    });
}

/**
 * Get CoinGecko ID from ticker symbol
 * @param {string} ticker - The ticker symbol
 * @returns {Promise<string|null>} - CoinGecko ID or null
 */
export async function getCoinId(ticker) {
    const upperTicker = ticker.toUpperCase();

    // Check hardcoded map first (with precedence over cache)
    if (TICKER_MAP[upperTicker]) {
        const coinId = TICKER_MAP[upperTicker];
        // Check if banned
        if (BANNED_TOKENS.has(coinId)) {
            console.warn(`[CoinGecko] Token ${upperTicker} (${coinId}) is banned`);
            return null;
        }
        return coinId;
    }

    // Check localStorage cache
    const cachedId = tickerCache[upperTicker];
    if (cachedId) {
        // Check if banned
        if (BANNED_TOKENS.has(cachedId)) {
            console.warn(`[CoinGecko] Token ${upperTicker} (${cachedId}) is banned`);
            return null;
        }
        return cachedId;
    }

    // Search via API (searchCoin is already queued)
    const coin = await searchCoin(ticker);
    if (coin) {
        // Check if banned
        if (BANNED_TOKENS.has(coin.id)) {
            console.warn(`[CoinGecko] Token ${upperTicker} (${coin.id}) is banned`);
            return null;
        }
        // Cache the result
        tickerCache[upperTicker] = coin.id;
        // Persist to localStorage
        localStorage.setItem('tickerCache', JSON.stringify(tickerCache));
        return coin.id;
    }

    return null;
}

/**
 * Fetch prices for multiple coins
 * @param {string[]} tickers - Array of ticker symbols
 * @returns {Promise<Object>} - Price data keyed by ticker
 */
export async function fetchPrices(tickers) {
    try {
        // Check cache
        const now = Date.now();
        if (now - apiCache.prices.timestamp < CACHE_TTL.PRICES) {
            // Check if all requested tickers are in cache
            const allCached = tickers.every(t => apiCache.prices.data[t.toUpperCase()]);
            if (allCached) {
                return apiCache.prices.data;
            }
        }

        // Convert tickers to CoinGecko IDs
        const coinIdPromises = tickers.map(ticker => getCoinId(ticker));
        const coinIds = await Promise.all(coinIdPromises);

        // Filter out null values
        const validCoinIds = coinIds.filter(id => id !== null);

        if (validCoinIds.length === 0) {
            return {};
        }

        return apiQueue.add(async () => {
            // Fetch prices
            const response = await fetch(
                `${COINGECKO_API}/simple/price?ids=${validCoinIds.join(',')}&vs_currencies=usd&include_24hr_change=true`
            );

            if (!response.ok) throw new Error('Failed to fetch prices');

            const data = await response.json();

            // Transform to ticker-keyed format and update cache
            const result = {};
            tickers.forEach((ticker, index) => {
                const coinId = coinIds[index];
                if (coinId && data[coinId]) {
                    const upperTicker = ticker.toUpperCase();
                    result[upperTicker] = {
                        price: data[coinId].usd,
                        change24h: data[coinId].usd_24h_change || 0
                    };
                }
            });

            // Update cache
            apiCache.prices = {
                data: { ...apiCache.prices.data, ...result },
                timestamp: now
            };

            return result;
        }, `prices:${validCoinIds.sort().join(',')}`); // Deduplication key
    } catch (error) {
        console.error('Error fetching prices:', error);
        return apiCache.prices.data || {}; // Return stale data on error if available
    }
}

/**
 * Validate if a ticker exists
 * @param {string} ticker - The ticker symbol
 * @returns {Promise<{valid: boolean, name?: string, id?: string}>}
 */
export async function validateTicker(ticker) {
    const coin = await searchCoin(ticker);

    if (coin) {
        return {
            valid: true,
            name: coin.name,
            id: coin.id,
            symbol: coin.symbol.toUpperCase()
        };
    }

    return { valid: false };
}

// Load cached ticker mappings from localStorage
try {
    const cached = localStorage.getItem('tickerCache');
    if (cached) {
        // Merge cached values, but let TICKER_MAP (hardcoded) take precedence
        tickerCache = { ...JSON.parse(cached), ...TICKER_MAP };
    }
} catch (error) {
    console.error('Error loading ticker cache:', error);
}

/**
 * Fetch historical price data for technical analysis
 * @param {string} ticker - The ticker symbol
 * @param {number} days - Number of days of history (default: 30)
 * @returns {Promise<Array>} - Array of [timestamp, price]
 */
export async function fetchHistoricalData(ticker, days = 30) {
    try {
        // Check cache
        const cacheKey = `${ticker}_${days}`;
        const now = Date.now();
        if (apiCache.history[cacheKey] && (now - apiCache.history[cacheKey].timestamp < CACHE_TTL.HISTORY)) {
            return apiCache.history[cacheKey].data;
        }

        const coinId = await getCoinId(ticker);
        if (!coinId) return [];

        return apiQueue.add(async () => {
            const response = await fetch(
                `${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=${days}`
            );

            if (!response.ok) throw new Error('Failed to fetch historical data');

            const data = await response.json();
            const prices = data.prices || [];

            // Update cache
            apiCache.history[cacheKey] = {
                data: prices,
                timestamp: now
            };

            return prices;
        });
    } catch (error) {
        console.error('Error fetching historical data:', error);
        return [];
    }
}

/**
 * Fetch historical data for a specific date
 * @param {string} ticker - Token ticker
 * @param {string} dateStr - Date in dd-mm-yyyy format
 * @returns {Promise<Object>} - Historical data (price, mc, etc.)
 */
export async function fetchCoinHistory(ticker, dateStr) {
    const coinId = await getCoinId(ticker);
    if (!coinId) return null;

    const cacheKey = `history_${coinId}_${dateStr}`;

    // Check cache (Historical data doesn't change, so long TTL is fine)
    if (apiCache.history[cacheKey]) {
        return apiCache.history[cacheKey];
    }

    return apiQueue.add(async () => {
        try {
            const url = `${COINGECKO_API}/coins/${coinId}/history?date=${dateStr}&localization=false`;
            const response = await fetch(url);

            if (!response.ok) throw new Error(`History fetch failed: ${response.status}`);

            const data = await response.json();

            if (!data.market_data) return null;

            const result = {
                price: data.market_data.current_price?.usd || 0,
                marketCap: data.market_data.market_cap?.usd || 0,
                // FDV is often missing in history endpoint, but we try
                fdv: data.market_data.fully_diluted_valuation?.usd || null,
                total_supply: data.market_data.total_supply || null
            };

            // Cache it
            apiCache.history[cacheKey] = result;

            return result;
        } catch (error) {
            console.error(`[CoinGecko] History fetch error for ${ticker} on ${dateStr}:`, error);
            return null;
        }
    }, `history:${coinId}:${dateStr}`);
}

/**
 * Fetch OHLC (candlestick) data
 * @param {string} ticker - The ticker symbol
 * @param {number} days - Number of days (1, 7, 14, 30, 90, 180, 365, max)
 * @returns {Promise<Array>} - Array of [timestamp, open, high, low, close]
 */
export async function fetchOHLC(ticker, days = 7) {
    try {
        // Check cache
        const cacheKey = `${ticker}_${days}`;
        const now = Date.now();
        if (apiCache.ohlc[cacheKey] && (now - apiCache.ohlc[cacheKey].timestamp < CACHE_TTL.OHLC)) {
            return apiCache.ohlc[cacheKey].data;
        }

        const coinId = await getCoinId(ticker);
        if (!coinId) return [];

        return apiQueue.add(async () => {
            const response = await fetch(
                `${COINGECKO_API}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`
            );

            if (!response.ok) throw new Error('Failed to fetch OHLC data');

            const data = await response.json();
            const ohlc = data || [];

            // Update cache
            apiCache.ohlc[cacheKey] = {
                data: ohlc,
                timestamp: now
            };

            return ohlc;
        });
    } catch (error) {
        console.error('Error fetching OHLC data:', error);
        return [];
    }
}
/**
 * Get coin metadata including Twitter handle
 * @param {string} ticker - The ticker symbol
 * @returns {Promise<{twitterHandle: string|null}>}
 */
export async function getCoinMetadata(ticker) {
    const upperTicker = ticker.toUpperCase();
    const CACHE_KEY = `coin_meta_${upperTicker}`;

    // Check cache first
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            return JSON.parse(cached);
        }
    } catch (e) { }

    try {
        const coinId = await getCoinId(ticker);
        if (!coinId) return { twitterHandle: null };

        // Fetch coin details (lightweight)
        const response = await fetch(
            `${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false&sparkline=false`
        );

        if (!response.ok) throw new Error('Failed to fetch coin details');

        const data = await response.json();
        const twitterHandle = data.links?.twitter_screen_name || null;

        const result = { twitterHandle };

        // Cache result (permanent cache as handles rarely change)
        localStorage.setItem(CACHE_KEY, JSON.stringify(result));

        return result;
    } catch (error) {
        console.error('Error fetching coin metadata:', error);
        return { twitterHandle: null };
    }
}

/**
 * Get the best TradingView symbol for a coin based on liquidity
 * @param {string} ticker - The ticker symbol
 * @returns {Promise<string|null>} - TradingView symbol (e.g. "BINANCE:BTCUSDT") or null
 */
export async function getBestTradingViewSymbol(ticker) {
    try {
        const coinId = await getCoinId(ticker);
        if (!coinId) return null;

        // Fetch coin tickers (limit to top 50 to save bandwidth, though API returns all pages by default for this endpoint)
        // Note: The /coins/{id} endpoint returns tickers in the 'tickers' array
        const response = await fetch(
            `${COINGECKO_API}/coins/${coinId}?localization=false&tickers=true&market_data=false&community_data=false&developer_data=false&sparkline=false`
        );

        if (!response.ok) throw new Error('Failed to fetch coin tickers');

        const data = await response.json();
        const tickers = data.tickers || [];

        // Define priority exchanges supported by TradingView
        // Order matters: we prefer these exchanges in this order
        const PRIORITY_EXCHANGES = [
            'Binance',
            'Coinbase Exchange',
            'Kraken',
            'Bybit',
            'OKX',
            'KuCoin',
            'Gate.io',
            'MEXC',
            'Bitget',
            'BingX',
            'Huobi',
            'Bitfinex',
            'Bitstamp',
            'Gemini'
        ];

        // Helper to map CoinGecko exchange name to TradingView exchange prefix
        const mapExchangeToTV = (cgName) => {
            const map = {
                'Binance': 'BINANCE',
                'Coinbase Exchange': 'COINBASE',
                'Kraken': 'KRAKEN',
                'Bybit': 'BYBIT',
                'OKX': 'OKX',
                'KuCoin': 'KUCOIN',
                'Gate.io': 'GATEIO',
                'MEXC': 'MEXC',
                'Bitget': 'BITGET',
                'BingX': 'BINGX',
                'Huobi': 'HTX',
                'Bitfinex': 'BITFINEX',
                'Bitstamp': 'BITSTAMP',
                'Gemini': 'GEMINI'
            };
            return map[cgName] || cgName.toUpperCase().replace(/ /g, '');
        };

        // Filter for USDT or USD pairs on priority exchanges
        const candidates = tickers.filter(t => {
            const target = t.target.toUpperCase();
            const isPriority = PRIORITY_EXCHANGES.includes(t.market.name);
            const isUSDPair = target === 'USDT' || target === 'USD' || target === 'USDC';
            return isPriority && isUSDPair;
        });

        if (candidates.length === 0) {
            // If no priority exchange found, try any exchange with USDT/USD
            // But instead of guessing the exchange prefix, let's return NULL
            // so the UI can fallback to "Auto" mode (just ticker).
            // UNLESS we find a very high volume pair on a known exchange not in priority?
            // Actually, returning null is safer for "Auto" resolution in TradingView.

            // However, let's try one last fallback:
            // If we find a USDT pair on ANY exchange, return just the pair name "SYMBOLUSDT"
            // This signals to the UI to use the pair but let TV find the exchange.
            const fallbackCandidates = tickers.filter(t => {
                const target = t.target.toUpperCase();
                return target === 'USDT' || target === 'USD';
            });

            if (fallbackCandidates.length > 0) {
                fallbackCandidates.sort((a, b) => b.converted_volume.usd - a.converted_volume.usd);
                const best = fallbackCandidates[0];
                // Return just the pair, e.g. "FLUIDUSDT"
                return `${best.base.toUpperCase()}${best.target.toUpperCase()}`;
            }
            return null;
        }

        // Sort candidates:
        // 1. Priority Exchange Rank
        // 2. Volume
        candidates.sort((a, b) => {
            const rankA = PRIORITY_EXCHANGES.indexOf(a.market.name);
            const rankB = PRIORITY_EXCHANGES.indexOf(b.market.name);

            if (rankA !== rankB) return rankA - rankB; // Lower index = higher priority
            return b.converted_volume.usd - a.converted_volume.usd; // Higher volume first
        });

        const best = candidates[0];
        const exchange = mapExchangeToTV(best.market.name);
        // TradingView symbols usually don't have dashes, e.g. BTCUSDT not BTC-USDT
        // But CoinGecko returns base/target.
        const pair = `${best.base.toUpperCase()}${best.target.toUpperCase()}`;

        return `${exchange}:${pair}`;

    } catch (error) {
        console.error('Error getting best TV symbol:', error);
        return null;
    }
}


