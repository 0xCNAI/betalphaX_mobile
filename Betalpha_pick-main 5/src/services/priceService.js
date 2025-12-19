import { fetchBinancePrice } from './binanceApi';
import { fetchPrices as fetchGeckoPrices } from './coinGeckoApi';

// Cache for prices to reduce API calls
let priceCache = {};
const CACHE_DURATION = 30000; // 30 seconds

// Asset Configuration for Market Data Source Optimization
const DEFAULT_ASSET_CONFIG = {
    BTC: { symbol: 'BTC', source: 'binance' },
    ETH: { symbol: 'ETH', source: 'binance' },
    SOL: { symbol: 'SOL', source: 'binance' },
    BNB: { symbol: 'BNB', source: 'binance' },
    XRP: { symbol: 'XRP', source: 'binance' },
    ADA: { symbol: 'ADA', source: 'binance' },
    DOGE: { symbol: 'DOGE', source: 'binance' },
    PENDLE: { symbol: 'PENDLE', source: 'binance' },
    FLUID: { symbol: 'FLUID', source: 'coingecko' }, // Use CoinGecko (which maps to CryptoCompare/GeckoTerminal internally if needed)
    RAIL: { symbol: 'RAIL', source: 'coingecko' },
    CLOUD: { symbol: 'CLOUD', source: 'coingecko' },
};

const STORAGE_KEY = 'asset_source_config';

// Load config from local storage or use default
const getAssetConfig = () => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : {};
        return { ...DEFAULT_ASSET_CONFIG, ...parsed };
    } catch (e) {
        console.warn('Failed to load asset config:', e);
        return DEFAULT_ASSET_CONFIG;
    }
};

// Save successful source to local storage
const updateAssetSource = (ticker, source) => {
    try {
        const currentConfig = getAssetConfig();
        // Only update if different to avoid thrashing storage
        if (!currentConfig[ticker] || currentConfig[ticker].source !== source) {
            const newConfig = {
                ...currentConfig,
                [ticker]: { symbol: ticker, source: source }
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
            console.log(`[PriceService] Learned source for ${ticker}: ${source}`);
        }
    } catch (e) {
        console.warn('Failed to save asset config:', e);
    }
};

/**
 * Get price for a single ticker
 * Priority: Cache -> Configured Source -> Binance -> CoinGecko -> GeckoTerminal
 */
export async function getPriceForTicker(ticker) {
    if (!ticker) return null;
    const upperTicker = ticker.toUpperCase();
    const now = Date.now();

    // Check memory cache
    if (priceCache[upperTicker] && (now - priceCache[upperTicker].timestamp < CACHE_DURATION)) {
        return priceCache[upperTicker].data;
    }

    const config = getAssetConfig()[upperTicker] || { source: 'auto' };
    let result = null;

    // 1. Try Binance (if source is binance or auto)
    if (config.source === 'binance' || config.source === 'auto') {
        const binanceData = await fetchBinancePrice(upperTicker);
        if (binanceData) {
            priceCache[upperTicker] = { timestamp: now, data: binanceData };
            updateAssetSource(upperTicker, 'binance'); // Remember success
            return binanceData;
        } else if (config.source === 'binance') {
            // If strictly configured for Binance but failed, we might want to stop or fallback?
            // For now, let's allow fallback if it fails, but log it.
            console.warn(`[PriceService] Configured for Binance but failed for ${upperTicker}`);
        }
        // If auto and failed, we naturally fall through to next sources
    }

    // 2. Fallback to CoinGecko (if source is coingecko or auto, or binance failed)
    if (config.source === 'coingecko' || config.source === 'auto' || !result) {
        try {
            const geckoData = await fetchGeckoPrices([upperTicker]);
            if (geckoData && geckoData[upperTicker]) {
                priceCache[upperTicker] = { timestamp: now, data: geckoData[upperTicker] };
                updateAssetSource(upperTicker, 'coingecko'); // Remember success
                return geckoData[upperTicker];
            }
        } catch (err) {
            console.warn('CoinGecko fallback failed:', err);
        }
    }

    // 3. Fallback to GeckoTerminal (DEX)
    if (config.source === 'geckoterminal' || config.source === 'auto' || !result) {
        try {
            // Import dynamically to avoid circular dependencies if any, or just standard import
            const { fetchOHLC } = await import('./marketDataServiceNew');
            // Fetch 15m OHLC to get latest close price
            const gtData = await fetchOHLC(upperTicker, '15m');
            if (gtData && gtData.data && gtData.data.length > 0) {
                const latestCandle = gtData.data[gtData.data.length - 1]; // [time, open, high, low, close]
                const latestPrice = latestCandle[4];

                const result = {
                    price: latestPrice,
                    change24h: 0
                };

                // Calculate 24h change if possible
                if (gtData.data.length > 1) {
                    const latestTime = latestCandle[0];
                    const targetTime = latestTime - (24 * 60 * 60 * 1000); // 24h ago

                    // Find candle closest to targetTime
                    // Since data is sorted ascending, we search for first candle >= targetTime
                    let oldCandle = gtData.data[0];
                    let minDiff = Math.abs(oldCandle[0] - targetTime);

                    for (let i = 1; i < gtData.data.length; i++) {
                        const diff = Math.abs(gtData.data[i][0] - targetTime);
                        if (diff < minDiff) {
                            minDiff = diff;
                            oldCandle = gtData.data[i];
                        }
                    }

                    if (oldCandle) {
                        const oldPrice = oldCandle[1]; // Use Open of the old candle? Or Close? Open is better if it aligns with time.
                        if (oldPrice > 0) {
                            result.change24h = ((latestPrice - oldPrice) / oldPrice) * 100;
                        }
                    }
                }

                priceCache[upperTicker] = { timestamp: now, data: result };
                updateAssetSource(upperTicker, 'geckoterminal'); // Remember success
                return result;
            }
        } catch (err) {
            console.warn('GeckoTerminal fallback failed:', err);
        }
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

    const currentConfig = getAssetConfig();

    // Group by source strategy
    const binanceCandidates = [];
    const geckoCandidates = [];

    // We don't need 'otherCandidates' as we fall through
    // But we can pre-sort based on config

    missingTickers.forEach(t => {
        const config = currentConfig[t] || { source: 'auto' };
        if (config.source === 'binance') {
            binanceCandidates.push(t);
        } else if (config.source === 'coingecko') {
            geckoCandidates.push(t);
        } else if (config.source === 'geckoterminal') {
            // Skip straight to GT logic if we implemented batch GT (we haven't really)
            // For now, let's just put them in geckoCandidates as a fallback or handle separately?
            // Since we don't have batch GT, we'll let them fall through to finalMissing
        } else {
            // Auto: try Binance first
            binanceCandidates.push(t);
        }
    });

    // 1. Fetch Binance Candidates
    const binancePromises = binanceCandidates.map(async t => {
        const data = await fetchBinancePrice(t);
        if (data) {
            priceCache[t] = { timestamp: now, data };
            updateAssetSource(t, 'binance'); // Remember success
            return { ticker: t, data };
        }
        return { ticker: t, data: null };
    });

    const binanceResults = await Promise.all(binancePromises);

    binanceResults.forEach(res => {
        if (res.data) {
            results[res.ticker] = res.data;
        } else {
            // Failed Binance fetch (or wasn't on Binance) -> Move to Gecko candidates
            geckoCandidates.push(res.ticker);
        }
    });

    // 2. Fetch CoinGecko Candidates (Batch request)
    if (geckoCandidates.length > 0) {
        try {
            const geckoData = await fetchGeckoPrices(geckoCandidates);
            Object.entries(geckoData).forEach(([t, data]) => {
                priceCache[t] = { timestamp: now, data };
                results[t] = data;
                updateAssetSource(t, 'coingecko'); // Remember success
            });
        } catch (err) {
            console.error('Batch fetch failed for CoinGecko:', err);
        }
    }

    // 3. Final Fallback to GeckoTerminal for any remaining missing tickers
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

                        // Calculate 24h change if possible
                        if (gtData.data.length > 1) {
                            const latestTime = latestCandle[0];
                            const targetTime = latestTime - (24 * 60 * 60 * 1000); // 24h ago

                            // Find candle closest to targetTime
                            // Since data is sorted ascending, we search for first candle >= targetTime
                            let oldCandle = gtData.data[0];
                            let minDiff = Math.abs(oldCandle[0] - targetTime);

                            for (let i = 1; i < gtData.data.length; i++) {
                                const diff = Math.abs(gtData.data[i][0] - targetTime);
                                if (diff < minDiff) {
                                    minDiff = diff;
                                    oldCandle = gtData.data[i];
                                }
                            }

                            if (oldCandle) {
                                const oldPrice = oldCandle[1];
                                if (oldPrice > 0) {
                                    result.change24h = ((latestPrice - oldPrice) / oldPrice) * 100;
                                }
                            }
                        }

                        priceCache[ticker] = { timestamp: now, data: result };
                        results[ticker] = result;
                        updateAssetSource(ticker, 'geckoterminal'); // Remember success
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
