
import fs from 'fs';
import readline from 'readline';

async function verifyIntegrity() {
    const fileStream = fs.createReadStream('training_data.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let count = 0;
    console.log('--- 🛡️ Deep Data Integrity Check 🛡️ ---');
    console.log('Checking first 5 records for D1, H4, H1 validity...\n');

    for await (const line of rl) {
        if (count >= 5) break;

        try {
            const data = JSON.parse(line);
            console.log(`Record #${count + 1} (${data.symbol} @ ${data.timestamp})`);

            const context = data.context;
            const timeframes = ['D1', 'H4', 'H1'];

            let allValid = true;

            for (const tf of timeframes) {
                const tfData = context[tf];

                // 1. Existence Check
                if (!tfData) {
                    console.error(`  ❌ [${tf}] MISSING`);
                    allValid = false;
                    continue;
                }

                // 2. Array Check
                if (!Array.isArray(tfData)) {
                    console.error(`  ❌ [${tf}] Not an array`);
                    allValid = false;
                    continue;
                }

                // 3. Length Check
                const length = tfData.length;

                // 4. Content Check (First Candle)
                const firstCandle = tfData[0];
                if (!Array.isArray(firstCandle) || firstCandle.length < 5) {
                    console.error(`  ❌ [${tf}] Invalid candle format (expected [O,H,L,C,V])`);
                    allValid = false;
                    continue;
                }

                // 5. Normalization Check
                // Assuming normalization sets first Open to 1.0
                const firstOpen = firstCandle[0]; // Normalized Open
                const isNormalized = Math.abs(firstOpen - 1.0) < 0.0001;

                // 6. Type Check
                const isNumbers = firstCandle.every(n => typeof n === 'number' && !isNaN(n));

                const statusIcon = (isNormalized && isNumbers) ? '✅' : '⚠️';

                console.log(`  ${statusIcon} [${tf}] Length: ${length} | First Open: ${firstOpen} (Normalized: ${isNormalized}) | Valid Numbers: ${isNumbers}`);

                if (!isNormalized) {
                    console.warn(`     ⚠️ Warning: [${tf}] data might not be normalized to 1.0 base.`);
                }
            }

            // 7. Outcome Check
            const outcome = data.outcome;
            if (!outcome) {
                console.error('  ❌ [Outcome] MISSING');
            } else {
                const hasPnl = typeof outcome.realized_pnl === 'number';
                const hasLabel = typeof outcome.label === 'string';
                const hasDuration = typeof outcome.holding_period_hours === 'number';

                if (hasPnl && hasLabel && hasDuration) {
                    console.log(`  ✅ [Outcome] Valid (PnL: ${outcome.realized_pnl.toFixed(4)}, Label: ${outcome.label}, Duration: ${outcome.holding_period_hours}h)`);
                } else {
                    console.error(`  ❌ [Outcome] Invalid structure. Keys: ${Object.keys(outcome)}`);
                }
            }

            console.log('---');
        } catch (e) {
            console.error('Error parsing line:', e);
        }
        count++;
    }
}

verifyIntegrity();
