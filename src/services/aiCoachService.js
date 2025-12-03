
import { fetchOHLC } from './marketDataServiceNew';
import { getPrice } from './coinGeckoApi'; // Or appropriate price service

/**
 * Get AI Coach advice for a trade
 * @param {string} symbol - Asset symbol (e.g., 'BTC')
 * @param {string} action - Intended action ('BUY' or 'SELL')
 * @returns {Promise<Object>} Diagnosis object
 */
export async function getCoachAdvice(symbol, action) {
    try {
        // 1. Fetch Context (OHLC)
        // Get 1D, 4H, and 1H candles for multi-timeframe analysis
        const [ohlcResult, ohlc4hResult, ohlc1hResult] = await Promise.all([
            fetchOHLC(symbol, '1d'),
            fetchOHLC(symbol, '4h'),
            fetchOHLC(symbol, '1h')
        ]);

        const ohlcData = ohlcResult?.data || [];
        const ohlc4hData = ohlc4hResult?.data || [];
        const ohlc1hData = ohlc1hResult?.data || [];

        if (!ohlcData || ohlcData.length === 0) {
            throw new Error('Insufficient market data');
        }

        // 2. Get Current Price & ATR (Simplified ATR calc)
        // ATR = Average of True Ranges over N periods
        // True Range = Max(High-Low, Abs(High-ClosePrev), Abs(Low-ClosePrev))
        // We'll calculate a simple 14-period ATR here or pass raw data to backend
        const atr = calculateATR(ohlcData, 14);
        const currentPrice = ohlcData[ohlcData.length - 1][4]; // Close price of last candle

        // 3. Call Backend API
        const response = await fetch('/api/ai-coach', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                symbol,
                action,
                ohlc: ohlcData.slice(-30), // Send last 30 daily candles
                ohlc_4h: ohlc4hData.slice(-30), // Send last 30 4h candles
                ohlc_1h: ohlc1hData.slice(-30), // Send last 30 1h candles
                currentPrice,
                atr
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('AI Coach API Error Details:', errorData);
            throw new Error(`${errorData.error} - ${errorData.details}` || 'Failed to fetch advice');
        }

        return await response.json();

    } catch (error) {
        console.error('Error getting coach advice:', error);
        // Return a fallback/null diagnosis so UI doesn't crash
        return null;
    }
}

function calculateATR(ohlc, period = 14) {
    if (ohlc.length < period + 1) return 0;

    let trSum = 0;
    for (let i = ohlc.length - period; i < ohlc.length; i++) {
        const current = ohlc[i];
        const prev = ohlc[i - 1];

        const high = current[2];
        const low = current[3];
        const prevClose = prev[4];

        const tr = Math.max(
            high - low,
            Math.abs(high - prevClose),
            Math.abs(low - prevClose)
        );
        trSum += tr;
    }

    return trSum / period;
}
