
// Node 18+ has global fetch by default
// Running in ES Module scope due to package.json type: module

const BINANCE_API = 'https://api.binance.com/api/v3';
const CC_API = 'https://min-api.cryptocompare.com/data/v2';
const GT_API = 'https://api.geckoterminal.com/api/v2';

async function testBinance() {
    console.log('\n--- Testing Binance (BTCUSDT) ---');
    const symbol = 'BTCUSDT';

    const tests = [
        { interval: '1h', limit: 300 },
        { interval: '4h', limit: 300 },
        { interval: '1d', limit: 750 }
    ];

    for (const t of tests) {
        const url = `${BINANCE_API}/klines?symbol=${symbol}&interval=${t.interval}&limit=${t.limit}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(res.statusText);
            const data = await res.json();
            console.log(`[${t.interval}] Requested: ${t.limit}, Returned: ${data.length} ${data.length === t.limit ? '✅' : '⚠️'}`);
        } catch (e) {
            console.error(`[${t.interval}] Failed:`, e.message);
        }
    }
}

async function testCryptoCompare() {
    console.log('\n--- Testing CryptoCompare (ETH) ---');
    const symbol = 'ETH';

    // Logic from marketDataServiceNew.js
    const tests = [
        { name: '1h', endpoint: 'histohour', limit: 300, aggregate: 1 },
        { name: '4h', endpoint: 'histohour', limit: 300, aggregate: 4 }, // 300 * 4h bars
        { name: '1d', endpoint: 'histoday', limit: 750, aggregate: 1 }
    ];

    for (const t of tests) {
        const url = `${CC_API}/${t.endpoint}?fsym=${symbol}&tsym=USD&limit=${t.limit}&aggregate=${t.aggregate}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(res.statusText);
            const json = await res.json();
            const data = json.Data.Data;
            // CC returns limit + 1 (includes current open candle usually, or just how they count)
            const count = data.length;
            // Allow +/- 1 difference
            const success = Math.abs(count - t.limit) <= 1;
            console.log(`[${t.name}] Requested: ${t.limit}, Returned: ${count} ${success ? '✅' : '⚠️'}`);
        } catch (e) {
            console.error(`[${t.name}] Failed:`, e.message);
        }
    }
}

async function testGeckoTerminal() {
    console.log('\n--- Testing GeckoTerminal (ETH/USDC Pool) ---');
    // ETH/USDC Uniswap V3 on Ethereum
    const network = 'eth';
    const pool = '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640';

    const tests = [
        { name: '1h', timeframe: 'hour', aggregate: 1, limit: 300 },
        { name: '4h', timeframe: 'hour', aggregate: 4, limit: 300 },
        { name: '1d', timeframe: 'day', aggregate: 1, limit: 750 }
    ];

    for (const t of tests) {
        const url = `${GT_API}/networks/${network}/pools/${pool}/ohlcv/${t.timeframe}?aggregate=${t.aggregate}&limit=${t.limit}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(res.statusText);
            const json = await res.json();
            const data = json.data.attributes.ohlcv_list;
            console.log(`[${t.name}] Requested: ${t.limit}, Returned: ${data.length} ${data.length === t.limit ? '✅' : '⚠️'}`);
        } catch (e) {
            console.error(`[${t.name}] Failed:`, e.message);
        }
    }
}

async function run() {
    await testBinance();
    await testCryptoCompare();
    await testGeckoTerminal();
}

run();
