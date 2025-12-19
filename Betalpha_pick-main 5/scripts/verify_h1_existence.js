
import fs from 'fs';
import readline from 'readline';

async function verify() {
    const fileStream = fs.createReadStream('training_data.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let count = 0;
    console.log('--- Verifying Context Keys in training_data.jsonl ---');

    for await (const line of rl) {
        if (count >= 3) break; // Check first 3 records

        try {
            const data = JSON.parse(line);
            console.log(`Record #${count + 1}:`);
            console.log(`  Symbol: ${data.symbol}`);
            console.log(`  Context Keys: ${JSON.stringify(Object.keys(data.context))}`);

            if (data.context.H1) {
                console.log(`  H1 Data Length: ${data.context.H1.length}`);
            } else {
                console.log('  H1 Data: MISSING');
            }
            console.log('---');
        } catch (e) {
            console.error('Error parsing line:', e);
        }
        count++;
    }
}

verify();
