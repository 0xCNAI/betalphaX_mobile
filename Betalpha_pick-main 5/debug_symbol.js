import { getBestTradingViewSymbol } from './src/services/coinGeckoApi.js';

// Mock fetch for node environment
global.fetch = async (url) => {
    const https = await import('https');
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    json: () => Promise.resolve(JSON.parse(data))
                });
            });
        }).on('error', reject);
    });
};

// Mock localStorage
global.localStorage = {
    getItem: () => null,
    setItem: () => { }
};

async function test() {
    console.log('Testing FLUID...');
    const fluid = await getBestTradingViewSymbol('FLUID');
    console.log('FLUID Result:', fluid);

    console.log('Testing ETHFI...');
    const ethfi = await getBestTradingViewSymbol('ETHFI');
    console.log('ETHFI Result:', ethfi);
}

test();
