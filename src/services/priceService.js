import { fetchBinancePrice } from './binanceApi';
import { fetchPrices as fetchGeckoPrices } from './coinGeckoApi';

// Cache for prices to reduce API calls
let priceCache = {};
const CACHE_DURATION = 30000; // 30 seconds

/**
 * Get price for a single ticker
 * Priority: Cache -> Binance -> CoinGecko
 */
export async function getPriceForTicker(ticker) {
    if (!ticker) return null;
    const upperTicker = ticker.toUpperCase();
    const now = Date.now();

    // Check memory cache
    if (priceCache[upperTicker] && (now - priceCache[upperTicker].timestamp < CACHE_DURATION)) {
        return priceCache[upperTicker].data;
    }

    // 1. Try Binance first (Fastest & Real-time)
    const binanceData = await fetchBinancePrice(upperTicker);
    if (binanceData) {
        priceCache[upperTicker] = { timestamp: now, data: binanceData };
        return binanceData;
    }

    // 2. Fallback to CoinGecko
    try {
        const geckoData = await fetchGeckoPrices([upperTicker]);
        if (geckoData && geckoData[upperTicker]) {
            priceCache[upperTicker] = { timestamp: now, data: geckoData[upperTicker] };
            return geckoData[upperTicker];
        }
    } catch (err) {
        console.warn('CoinGecko fallback failed:', err);
    }

    // 3. Fallback to GeckoTerminal (DEX)
    try {
        // Import dynamically to avoid circular dependencies if any, or just standard import
        const { fetchOHLC } = await import('./marketDataServiceNew');
        // Fetch 15m OHLC to get latest close price
        const gtData = await fetchOHLC(upperTicker, '15m');
        if (gtData && gtData.data && gtData.data.length > 0) {
            const latestCandle = gtData.data[gtData.data.length - 1]; // [time, open, high, low, close]
            const latestPrice = latestCandle[4];
            const openPrice = gtData.data[0][1]; // Approximation for 24h change if we fetched enough data
            // Or just return price with 0 change if unknown

            const result = {
                price: latestPrice,
                change24h: 0 // GeckoTerminal OHLC doesn't give 24h change directly without more data
            };

            priceCache[upperTicker] = { timestamp: now, data: result };
            return result;
        }
    } catch (err) {
        console.warn('GeckoTerminal fallback failed:', err);
    }

    return null;
}

/**
 * Get prices for multiple tickers
 * Optimizes by checking cache and using parallel requests
 */
export async function getPricesForTickers(tickers) {
    const results = {};
    const missingTickers = [];
    const uniqueTickers = [...new Set(tickers.map(t => t.toUpperCase()))];

    // Check cache first
    const now = Date.now();
    uniqueTickers.forEach(t => {
        if (priceCache[t] && (now - priceCache[t].timestamp < CACHE_DURATION)) {
            results[t] = priceCache[t].data;
        } else {
            missingTickers.push(t);
        }
    });

    if (missingTickers.length === 0) return results;

    // Fetch missing from Binance parallelly (limit concurrency if needed, but for <20 items it's fine)
    const binancePromises = missingTickers.map(async t => {
        const data = await fetchBinancePrice(t);
        if (data) {
            priceCache[t] = { timestamp: now, data };
            return { ticker: t, data };
        }
        return { ticker: t, data: null };
    });

    const binanceResults = await Promise.all(binancePromises);
    const stillMissing = [];

    binanceResults.forEach(res => {
        if (res.data) {
            results[res.ticker] = res.data;
        } else {
            stillMissing.push(res.ticker);
        }
    });

    // Fallback to CoinGecko for remaining (Batch request)
    if (stillMissing.length > 0) {
        try {
            const geckoData = await fetchGeckoPrices(stillMissing);
            Object.entries(geckoData).forEach(([t, data]) => {
                priceCache[t] = { timestamp: now, data };
                results[t] = data;
            });
        } catch (err) {
            console.error('Batch fetch failed for CoinGecko:', err);
        }
    }

    // 4. Final Fallback to GeckoTerminal for any remaining missing tickers
    // Re-calculate missing tickers after CoinGecko attempt
    const finalMissing = uniqueTickers.filter(t => !results[t]);

    if (finalMissing.length > 0) {
        try {
            const { fetchOHLC } = await import('./marketDataServiceNew');
            // Process sequentially or with limited concurrency to avoid overwhelming GT
            await Promise.all(finalMissing.map(async (ticker) => {
                try {
                    const gtData = await fetchOHLC(ticker, '15m');
                    if (gtData && gtData.data && gtData.data.length > 0) {
                        const latestCandle = gtData.data[gtData.data.length - 1];
                        const latestPrice = latestCandle[4];
                        const result = {
                            price: latestPrice,
                            change24h: 0
                        };
                        priceCache[ticker] = { timestamp: now, data: result };
                        results[ticker] = result;
                    }
                } catch (e) {
                    console.warn(`GeckoTerminal fallback failed for ${ticker}:`, e);
                }
            }));
        } catch (err) {
            console.warn('GeckoTerminal batch fallback failed:', err);
        }
    }

    return results;
}
