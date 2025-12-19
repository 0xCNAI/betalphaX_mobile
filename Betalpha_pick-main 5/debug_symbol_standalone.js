// Standalone debug script with copied logic to avoid import issues

// Mock fetch
const fetch = async (url) => {
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

const COINGECKO_API = 'https://api.coingecko.com/api/v3';

async function getCoinId(ticker) {
    try {
        const response = await fetch(`${COINGECKO_API}/search?query=${ticker}`);
        const data = await response.json();
        const coin = data.coins.find(c => c.symbol.toUpperCase() === ticker.toUpperCase());
        return coin ? coin.id : null;
    } catch (e) {
        console.error('Search error:', e);
        return null;
    }
}

async function getBestTradingViewSymbol(ticker) {
    try {
        const coinId = await getCoinId(ticker);
        console.log(`CoinID for ${ticker}:`, coinId);
        if (!coinId) return null;

        const response = await fetch(
            `${COINGECKO_API}/coins/${coinId}?localization=false&tickers=true&market_data=false&community_data=false&developer_data=false&sparkline=false`
        );

        if (!response.ok) throw new Error('Failed to fetch coin tickers');

        const data = await response.json();
        const tickers = data.tickers || [];
        console.log(`Found ${tickers.length} tickers for ${ticker}`);

        const PRIORITY_EXCHANGES = [
            'Binance',
            'Coinbase Exchange',
            'Kraken',
            'Bybit',
            'OKX',
            'KuCoin',
            'Gate.io',
            'MEXC',
            'Bitget'
        ];

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
                'Bitget': 'BITGET'
            };
            return map[cgName] || cgName.toUpperCase();
        };

        const candidates = tickers.filter(t => {
            const target = t.target.toUpperCase();
            const isPriority = PRIORITY_EXCHANGES.includes(t.market.name);
            const isUSDPair = target === 'USDT' || target === 'USD' || target === 'USDC';
            return isPriority && isUSDPair;
        });

        console.log('Priority Candidates:', candidates.map(c => `${c.market.name}: ${c.base}/${c.target}`));

        if (candidates.length === 0) {
            const fallbackCandidates = tickers.filter(t => {
                const target = t.target.toUpperCase();
                return target === 'USDT' || target === 'USD';
            });

            if (fallbackCandidates.length > 0) {
                fallbackCandidates.sort((a, b) => b.converted_volume.usd - a.converted_volume.usd);
                const best = fallbackCandidates[0];
                console.log('Fallback Best:', best.market.name, best.base, best.target);
                return `${best.market.name.toUpperCase().replace(/ /g, '')}:${best.base.toUpperCase()}${best.target.toUpperCase()}`;
            }
            return null;
        }

        candidates.sort((a, b) => {
            const rankA = PRIORITY_EXCHANGES.indexOf(a.market.name);
            const rankB = PRIORITY_EXCHANGES.indexOf(b.market.name);
            if (rankA !== rankB) return rankA - rankB;
            return b.converted_volume.usd - a.converted_volume.usd;
        });

        const best = candidates[0];
        const exchange = mapExchangeToTV(best.market.name);
        const pair = `${best.base.toUpperCase()}${best.target.toUpperCase()}`;

        return `${exchange}:${pair}`;

    } catch (error) {
        console.error('Error getting best TV symbol:', error);
        return null;
    }
}

async function test() {
    console.log('--- Testing FLUID ---');
    const fluid = await getBestTradingViewSymbol('FLUID');
    console.log('FLUID Result:', fluid);

    console.log('\n--- Testing ETHFI ---');
    const ethfi = await getBestTradingViewSymbol('ETHFI');
    console.log('ETHFI Result:', ethfi);
}

test();
