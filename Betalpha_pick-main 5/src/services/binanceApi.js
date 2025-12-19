/**
 * Service to interact with Binance Public API
 * Used as a fallback for technical analysis data
 */

const BINANCE_API = '/api/binance/api/v3';

/**
 * Fetch Kline (Candlestick) data from Binance
 * @param {string} symbol - The trading pair symbol (e.g., 'BTCUSDT')
 * @param {string} interval - Kline interval (e.g., '1d', '4h')
 * @param {number} limit - Number of data points to fetch
 * @returns {Promise<Array>} - Array of formatted price data
 */
export async function fetchBinanceKlines(symbol, interval = '1d', limit = 30) {
    try {
        // Ensure symbol is in Binance format (e.g., BTC -> BTCUSDT)
        const pair = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;

        const response = await fetch(
            `${BINANCE_API}/klines?symbol=${pair}&interval=${interval}&limit=${limit}`
        );

        if (!response.ok) {
            throw new Error(`Binance API error: ${response.statusText}`);
        }

        const data = await response.json();

        // Format to match our internal structure (timestamp, open, high, low, close, volume)
        // Binance returns: [Open time, Open, High, Low, Close, Volume, Close time, ...]
        return data.map(kline => ({
            timestamp: kline[0],
            open: parseFloat(kline[1]),
            high: parseFloat(kline[2]),
            low: parseFloat(kline[3]),
            close: parseFloat(kline[4]),
            volume: parseFloat(kline[5])
        }));

    } catch (error) {
        console.warn('Error fetching Binance klines:', error);
        return [];
    }
}

/**
 * Fetch current price and 24h change from Binance
 * @param {string} symbol - The trading pair symbol (e.g., 'BTC')
 * @returns {Promise<{price: number, change24h: number}|null>}
 */
export async function fetchBinancePrice(symbol) {
    try {
        // Default to USDT pair
        const pair = symbol.toUpperCase().endsWith('USDT') ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`;

        const response = await fetch(`${BINANCE_API}/ticker/24hr?symbol=${pair}`);

        if (!response.ok) {
            console.warn(`[BinanceAPI] Failed to fetch price for ${pair}: ${response.status} ${response.statusText}`);
            // If 400, pair might not exist (e.g. some altcoins only have BTC pair)
            return null;
        }

        const data = await response.json();

        // Validate data
        if (!data.lastPrice || !data.priceChangePercent) {
            console.warn(`[BinanceAPI] Invalid data format for ${pair}:`, data);
            return null;
        }

        return {
            price: parseFloat(data.lastPrice),
            change24h: parseFloat(data.priceChangePercent)
        };
    } catch (error) {
        console.error(`[BinanceAPI] Error fetching Binance price for ${symbol}:`, error);
        return null;
    }
}
