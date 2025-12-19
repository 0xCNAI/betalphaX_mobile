
import fs from 'fs';
import readline from 'readline';

async function analyzeSellPerformance() {
    const fileStream = fs.createReadStream('training_data.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    // Buckets for D1 Rank: 0-0.2, 0.2-0.4, etc.
    const buckets = {
        '0.0-0.2': { total: 0, wins: 0 },
        '0.2-0.4': { total: 0, wins: 0 },
        '0.4-0.6': { total: 0, wins: 0 },
        '0.6-0.8': { total: 0, wins: 0 },
        '0.8-1.0': { total: 0, wins: 0 }
    };

    console.log('--- 📉 Analyzing SELL Performance by Market Rank ---');

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);

            // Only analyze SELL actions
            if (data.action !== 'SELL') continue;

            const rank = data.market_state.D1_rank;
            const outcome = data.outcome;
            const isWin = outcome && (outcome.realized_pnl > 0 || outcome.result === 'WIN');

            let bucketKey = '';
            if (rank < 0.2) bucketKey = '0.0-0.2';
            else if (rank < 0.4) bucketKey = '0.2-0.4';
            else if (rank < 0.6) bucketKey = '0.4-0.6';
            else if (rank < 0.8) bucketKey = '0.6-0.8';
            else bucketKey = '0.8-1.0';

            buckets[bucketKey].total++;
            if (isWin) buckets[bucketKey].wins++;

        } catch (e) {
            // ignore
        }
    }

    // Print Results
    console.log('\nRank Range | Total SELLs | Wins | Win Rate');
    console.log('-----------|-------------|------|---------');
    for (const [range, stats] of Object.entries(buckets)) {
        const rate = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0.0';
        console.log(`${range.padEnd(10)} | ${stats.total.toString().padEnd(11)} | ${stats.wins.toString().padEnd(4)} | ${rate}%`);
    }
}

analyzeSellPerformance();
