
import fs from 'fs';
import readline from 'readline';

async function analyzeData() {
    const fileStream = fs.createReadStream('training_data.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    let total = 0;
    let wins = 0;
    let losses = 0;

    let btcTotal = 0;
    let btcWins = 0;
    let btcLosses = 0;

    let buyTotal = 0;
    let buyWins = 0;

    let sellTotal = 0;
    let sellWins = 0;

    console.log('--- 📊 Analyzing Training Data ---');

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            total++;

            const outcome = data.outcome;
            const isWin = outcome && (outcome.realized_pnl > 0 || outcome.result === 'WIN');

            if (isWin) wins++;
            else losses++;

            // Symbol specific
            if (data.symbol && data.symbol.includes('BTC')) {
                btcTotal++;
                if (isWin) btcWins++;
                else btcLosses++;
            }

            // Action specific
            if (data.action === 'BUY') {
                buyTotal++;
                if (isWin) buyWins++;
            } else if (data.action === 'SELL') {
                sellTotal++;
                if (isWin) sellWins++;
            }

        } catch (e) {
            // ignore parse errors
        }
    }

    console.log(`\nTotal Records: ${total}`);
    console.log(`Global Win Rate: ${((wins / total) * 100).toFixed(2)}% (${wins} Wins / ${losses} Losses)`);

    console.log(`\nBTC Records: ${btcTotal}`);
    console.log(`BTC Win Rate: ${((btcWins / btcTotal) * 100).toFixed(2)}% (${btcWins} Wins / ${btcLosses} Losses)`);

    console.log(`\nBUY Win Rate: ${((buyWins / buyTotal) * 100).toFixed(2)}% (${buyWins}/${buyTotal})`);
    console.log(`SELL Win Rate: ${((sellWins / sellTotal) * 100).toFixed(2)}% (${sellWins}/${sellTotal})`);
}

analyzeData();
