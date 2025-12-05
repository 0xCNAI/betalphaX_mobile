/**
 * Dual-Layer Market Data Service for OHLC
 * Tier 1: Binance (CEX - Most reliable for major tokens)
 * Tier 2: GeckoTerminal (DEX - For tokens not on Binance)
 * 
 * Note: CoinGecko OHLC is NOT used here as user prefers Binance/GeckoTerminal data quality
 * Portfolio prices still use CoinGecko API separately
 */
const BINANCE_API = '/api/binance/api/v3';
const GT_API = '/api/gt';

/**
 * Fetch OHLC Data with Waterfall Strategy (Binance -> GeckoTerminal ONLY)
 * @param {string} symbol - Token symbol (e.g., 'ETH')
 * @param {string} interval - Time interval (e.g., '1d', '1h', '15m')
 * @param {string} network - Network for GeckoTerminal (default: 'eth')
 * @param {number} targetPrice - Optional target price for disambiguation
 * @returns {Promise<{data: Array, source: string}>}
 */
export async function fetchOHLC(symbol, interval = '1d', network = 'eth', targetPrice = null) {
    const upperSymbol = symbol.toUpperCase();
    console.log(`[MarketData v4] Fetching OHLC for ${upperSymbol} (${interval})...`);

    // Tier 1: Binance (CEX - Highest priority for OHLC)
    try {
        const binanceData = await fetchBinanceOHLC(upperSymbol, interval);
        if (binanceData && binanceData.length > 0) {
            console.log(`[MarketData] Source: Binance (${upperSymbol})`);
            return { data: binanceData, source: `Binance (${upperSymbol})` };
        }
    } catch (e) {
        console.warn(`[MarketData] Binance failed for ${upperSymbol}:`, e.message);
    }

    // Tier 2: CryptoCompare (Aggregator - Great for major alts not on Binance)
    try {
        const ccData = await fetchCryptoCompareOHLC(upperSymbol, interval);
        if (ccData && ccData.length > 0) {
            console.log(`[MarketData] Source: CryptoCompare (${upperSymbol})`);
            return { data: ccData, source: `CryptoCompare (${upperSymbol})` };
        }
    } catch (e) {
        console.warn(`[MarketData] CryptoCompare failed for ${upperSymbol}:`, e.message);
    }

    // Tier 3: GeckoTerminal (DEX - Fallback for long-tail tokens)
    try {
        const gtData = await fetchGeckoTerminalOHLC(
            upperSymbol,
            interval,
            network,
            targetPrice
        );

        if (gtData && gtData.length > 0) {
            console.log(`[MarketData] Source: GeckoTerminal (${upperSymbol})`);
            return { data: gtData, source: `GeckoTerminal (${upperSymbol})` };
        }
    } catch (e) {
        console.warn(`[MarketData] GeckoTerminal failed for ${upperSymbol}:`, e.message);
    }

    throw new Error(`Failed to fetch OHLC for ${upperSymbol} from all sources`);
}

// --- Tier 1: Binance ---

async function fetchBinanceOHLC(symbol, interval) {
    // Map standard intervals to Binance intervals if needed (they mostly match)
    // Binance: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M

    // User requested limits: 1h -> 300, 4h -> 300, 1d -> 750
    let limit = 100; // Default
    if (interval === '1h' || interval === '4h') limit = 300;
    if (interval === '1d') limit = 750;

    const pair = `${symbol}USDT`; // Assume USDT pair for simplicity
    const url = `${BINANCE_API}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`;

    console.log(`[Binance] Fetching ${pair} ${interval} from:`, url);

    const response = await fetch(url);

    console.log(`[Binance] Response status for ${pair}:`, response.status);

    if (!response.ok) {
        // 400 usually means symbol not found (invalid symbol for Binance)
        if (response.status === 400) {
            // Suppress error log for expected 400s (symbol not found)
            return [];
        }
        const errorText = await response.text();
        throw new Error(`Binance API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log(`[Binance] Successfully fetched ${data.length} candles for ${pair}`);

    // Transform Binance format to standard OHLCV
    // Binance returns: [timestamp, open, high, low, close, volume, ...]
    return data.map(d => [
        d[0],           // timestamp
        parseFloat(d[1]), // open
        parseFloat(d[2]), // high
        parseFloat(d[3]), // low
        parseFloat(d[4]), // close
        parseFloat(d[5])  // volume
    ]);
}

// --- Tier 2: CryptoCompare ---

async function fetchCryptoCompareOHLC(symbol, interval) {
    // Map intervals to CryptoCompare endpoints
    // CC supports: histominute, histohour, histoday
    let endpoint = 'histoday';
    let limit = 30; // Default
    let aggregate = 1;

    // User requested limits: 1h -> 300, 4h -> 300, 1d -> 750
    if (interval === '1h') {
        endpoint = 'histohour';
        limit = 300;
    } else if (interval === '4h') {
        endpoint = 'histohour';
        limit = 300 * 4; // CC doesn't support 4h native, so we fetch 1h and might need to aggregate, but here we use aggregate param
        // Actually CC aggregate=4 works with histohour.
        // If we want 300 * 4h bars, we need limit=300 with aggregate=4
        limit = 300;
        aggregate = 4;
    } else if (interval === '1d') {
        endpoint = 'histoday';
        limit = 750;
    } else {
        // Fallback
        endpoint = 'histominute';
        limit = 60;
    }

    const url = `https://min-api.cryptocompare.com/data/v2/${endpoint}?fsym=${symbol}&tsym=USD&limit=${limit}&aggregate=${aggregate}`;
    console.log(`[CryptoCompare] Fetching ${symbol} ${interval} from:`, url);

    const response = await fetch(url);
    if (!response.ok) throw new Error(`CryptoCompare API error: ${response.status}`);

    const json = await response.json();
    if (json.Response === 'Error') {
        throw new Error(`CryptoCompare Error: ${json.Message}`);
    }

    const data = json.Data.Data;
    if (!data || data.length === 0) return [];

    console.log(`[CryptoCompare] Successfully fetched ${data.length} candles for ${symbol}`);

    // Transform CC format to standard OHLCV
    // CC returns: { time, open, high, low, close, volumefrom, volumeto }
    return data.map(d => [
        d.time * 1000,  // Convert unix timestamp to ms
        d.open,
        d.high,
        d.low,
        d.close,
        d.volumeto // Use Volume To (USD) as standard volume
    ]);
}

// --- Tier 2: GeckoTerminal ---

async function fetchGeckoTerminalOHLC(symbol, interval, network, targetPrice = null) {
    let pool = null;

    // Search by Symbol (Simplified - no contract lookups)
    // Search by Symbol (Global Search - remove network constraint)
    console.log(`[MarketData] Searching pools by symbol: ${symbol}`);
    const searchUrl = `${GT_API}/search/pools?query=${symbol}`; // Removed network=${network} to find cross-chain
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) throw new Error('Pool search failed');

    const searchData = await searchRes.json();
    let bestMatchPool = null;
    const candidates = searchData.data || [];

    if (candidates.length > 0) {
        // Strategy 1: Price Disambiguation (if targetPrice provided)
        if (targetPrice) {
            try {
                console.log(`[MarketData v3] Disambiguating ${symbol} with target price $${targetPrice}`);
                const bestMatch = candidates.slice(0, 10).reduce((best, candidate) => {
                    const price = parseFloat(candidate.attributes.base_token_price_usd);
                    if (isNaN(price)) return best;
                    const diff = Math.abs(price - targetPrice);
                    if (diff < best.diff) return { diff, pool: candidate };
                    return best;
                }, { diff: Infinity, pool: null });

                if (bestMatch.pool) bestMatchPool = bestMatch.pool;
            } catch (err) {
                console.warn(`[MarketData] Error during price disambiguation:`, err.message);
            }
        }

        // Strategy 2: Name Match (if no price or price failed)
        // Look for pool name starting with "SYMBOL /" (e.g. "FLUID / WETH")
        if (!bestMatchPool) {
            const nameRegex = new RegExp(`^${symbol}\\s*/`, 'i');
            bestMatchPool = candidates.find(c => nameRegex.test(c.attributes.name));
            if (bestMatchPool) {
                console.log(`[MarketData] Selected pool by name match: ${bestMatchPool.attributes.name}`);
            }
        }

        // Strategy 3: Fallback to first result
        if (!bestMatchPool) {
            bestMatchPool = candidates[0];
            console.log(`[MarketData] Fallback to top result: ${bestMatchPool.attributes.name}`);
        }

        pool = bestMatchPool;
    }

    if (!pool) throw new Error('No pool found');

    const poolAddress = pool.attributes.address;
    const poolNetwork = pool.attributes.network?.identifier || network;

    // 2. Map timeframe to GT format
    // GT: day, hour, minute
    // aggregate: 1, 4, 15, etc.
    let timeframe = 'day';
    let aggregate = 1;
    let limit = 100; // Default

    // User requested limits: 1h -> 300, 4h -> 300, 1d -> 750
    if (interval === '15m') {
        timeframe = 'minute';
        aggregate = 15;
        limit = 100; // Keep small for 15m
    } else if (interval === '1h') {
        timeframe = 'hour';
        aggregate = 1;
        limit = 300;
    } else if (interval === '4h') {
        timeframe = 'hour';
        aggregate = 4;
        limit = 300;
    } else if (interval === '1d') {
        timeframe = 'day';
        aggregate = 1;
        limit = 750;
    }

    // GT Max limit is 1000, so 750 is safe.
    const ohlcUrl = `${GT_API}/networks/${poolNetwork}/pools/${poolAddress}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}`;

    const ohlcRes = await fetch(ohlcUrl);
    if (!ohlcRes.ok) throw new Error('OHLC fetch failed');

    const ohlcData = await ohlcRes.json();
    const ohlcArray = ohlcData.data?.attributes?.ohlcv_list || [];

    // Transform GT format to standard OHLCV
    // GT returns: [timestamp_unix, open, high, low, close, volume]
    return ohlcArray.map(d => [
        d[0] * 1000,    // Convert to milliseconds
        parseFloat(d[1]), // open
        parseFloat(d[2]), // high
        parseFloat(d[3]), // low
        parseFloat(d[4]), // close
        parseFloat(d[5])  // volume
    ]);
}
