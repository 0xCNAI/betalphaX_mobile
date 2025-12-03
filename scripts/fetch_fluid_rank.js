// Standalone script to fetch ETHFI rank
async function main() {
    const symbol = 'ETHFI';
    const pair = 'ETHFIUSDT';
    console.log(`Fetching data for ${pair}...`);

    try {
        // Fetch from Binance
        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=30`);

        if (!response.ok) {
            throw new Error(`Binance API Error: ${response.status}`);
        }

        const data = await response.json();

        // Binance: [time, open, high, low, close, vol, ...]
        const closes = data.map(c => parseFloat(c[4]));

        // Simple Rank Calculation
        const current = closes[closes.length - 1];
        const min = Math.min(...closes);
        const max = Math.max(...closes);

        const rank = (current - min) / (max - min);
        console.log(`Calculated Rank for ${symbol}: ${rank.toFixed(2)} (Price: ${current}, Range: ${min}-${max})`);
        return rank;

    } catch (e) {
        console.error('Error fetching data:', e);
        return 0.5;
    }
}

main().then(rank => {
    console.log('FINAL_RANK=' + rank);
});
