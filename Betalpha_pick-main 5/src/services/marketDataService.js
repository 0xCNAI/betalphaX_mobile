import { fetchOHLC as fetchCoinGeckoOHLC } from './coinGeckoApi';

/**
 * Tri-Layer Market Data Service
 * Strategy: Binance (CEX) -> GeckoTerminal (DEX) -> CoinGecko (Fallback)
 */

const BINANCE_API = '/api/binance/api/v3';
const GT_API = '/api/gt';

/**
 * Fetch OHLC Data with Waterfall Strategy
 * @param {string} symbol - Token symbol (e.g., 'ETH')
 * @param {string} interval - Timeframe ('15m', '1h', '4h', '1d')
 * @param {string} network - Network for DEX search (default: 'eth')
 * @returns {Promise<{data: Array, source: string}>}
 */
export async function fetchOHLC(symbol, interval = '4h', network = 'eth', targetPrice = null) {
    const upperSymbol = symbol.toUpperCase();
    console.log(`[MarketData v2] Fetching OHLC for ${upperSymbol} (${interval})...`);

    // Tier 1: Binance (CEX)
    try {
        const binanceData = await fetchBinanceOHLC(upperSymbol, interval);
        if (binanceData && binanceData.length > 0) {
            console.log(`[MarketData] Source: Binance (${upperSymbol})`);
            return { data: binanceData, source: 'Binance' };
        }
    } catch (e) {
        console.warn(`[MarketData] Binance failed for ${upperSymbol}:`, e.message);
    }

    // Tier 2: GeckoTerminal (DEX)
    try {
        const gtData = await fetchGeckoTerminalOHLC(upperSymbol, interval, network, targetPrice);
        if (gtData && gtData.length > 0) {
            console.log(`[MarketData] Source: GeckoTerminal (${upperSymbol})`);
            return { data: gtData, source: 'GeckoTerminal' };
        }
    } catch (e) {
        console.warn(`[MarketData] GeckoTerminal failed for ${upperSymbol}:`, e.message);
    }

    // Tier 3: CoinGecko (Fallback)
    try {
        // Map interval to days for CoinGecko
        // 15m/1h -> 1 day (high res)
        // 4h -> 14 days
        // 1d -> 30 days
        let days = 30;
        if (interval === '15m' || interval === '1h') days = 1;
        else if (interval === '4h') days = 14;

        const cgData = await fetchCoinGeckoOHLC(symbol, days);
        if (cgData && cgData.length > 0) {
            console.log(`[MarketData] Source: CoinGecko (${upperSymbol})`);
            return { data: cgData, source: 'CoinGecko' };
        }
    } catch (e) {
        console.error(`[MarketData] CoinGecko failed for ${upperSymbol}:`, e);
    }

    throw new Error(`Failed to fetch OHLC for ${upperSymbol} from all sources`);
}

// --- Tier 1: Binance ---

async function fetchBinanceOHLC(symbol, interval) {
    // Map standard intervals to Binance intervals if needed (they mostly match)
    // Binance: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
    const limit = 100;
    const pair = `${symbol}USDT`; // Assume USDT pair for simplicity
    const url = `${BINANCE_API}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;

    const response = await fetch(url);
    if (!response.ok) throw new Error(response.statusText);

    const data = await response.json();
    // [time, open, high, low, close, volume, ...]
    return data.map(d => [
        d[0],               // timestamp
        parseFloat(d[1]),   // open
        parseFloat(d[2]),   // high
        parseFloat(d[3]),   // low
        parseFloat(d[4])    // close
    ]);
}

// --- Tier 2: GeckoTerminal ---

async function fetchGeckoTerminalOHLC(symbol, interval, network, targetPrice = null) {
    // 1. Search for pool
    const searchUrl = `${GT_API}/search/pools?query=${symbol}&network=${network}`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error('Pool search failed');

    const searchData = await searchRes.json();
    let pool = null;
    let bestMatchPool = null;

    if (targetPrice && searchData.data && searchData.data.length > 0) {
        // Price Disambiguation Strategy
        // Find the pool with base_token_price_usd closest to targetPrice
        // But first, filter for pools that actually match the symbol in base_token
        // (Search is fuzzy, might return other tokens)

        const candidates = searchData.data.slice(0, 10); // Check top 10 results

        try {
            console.log(`[MarketData v3] Disambiguating ${symbol} with target price $${targetPrice}`);

            const bestMatch = candidates.reduce((best, candidate) => {
                const price = parseFloat(candidate.attributes.base_token_price_usd);
                if (isNaN(price)) return best;

                const diff = Math.abs(price - targetPrice);
                if (diff < best.diff) {
                    return { diff, pool: candidate };
                }
                return best;
            }, { diff: Infinity, pool: null });

            if (bestMatch.pool) {
                bestMatchPool = bestMatch.pool;
            }
        } catch (err) {
            // If an error occurs during disambiguation, we'll just proceed without a specific bestMatchPool
            console.warn(`[MarketData] Error during GeckoTerminal pool disambiguation:`, err.message);
        }

        if (bestMatchPool) {
            console.log(`[MarketData] Selected pool by price: ${bestMatchPool.attributes.name} ($${bestMatchPool.attributes.base_token_price_usd})`);
            pool = bestMatchPool;
        } else {
            pool = searchData.data[0];
        }

    } else {
        // Default: Take top result
        pool = searchData.data?.[0];
    }

    if (!pool) throw new Error('No pool found');

    const poolAddress = pool.attributes.address;
    const poolNetwork = pool.attributes.network?.identifier || network; // Use returned network if available

    // 2. Map timeframe to GT format
    // GT: day, hour, minute
    // aggregate: 1, 4, 15, etc.
    let timeframe = 'day';
    let aggregate = 1;

    if (interval === '15m') {
        timeframe = 'minute';
        aggregate = 15;
    } else if (interval === '1h') {
        timeframe = 'hour';
        aggregate = 1;
    } else if (interval === '4h') {
        timeframe = 'hour';
        aggregate = 4;
    } else if (interval === '1d') {
        timeframe = 'day';
        aggregate = 1;
    }

    const ohlcUrl = `${GT_API}/networks/${poolNetwork}/pools/${poolAddress}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=100`;
    const ohlcRes = await fetch(ohlcUrl);
    if (!ohlcRes.ok) throw new Error('OHLC fetch failed');

    const ohlcData = await ohlcRes.json();
    // GT returns: [timestamp, open, high, low, close, volume]
    // Timestamp is in seconds, need ms
    return ohlcData.data.attributes.ohlcv_list.map(d => [
        d[0] * 1000, // convert s to ms
        d[1],
        d[2],
        d[3],
        d[4]
    ]).reverse(); // GT returns newest first
}
