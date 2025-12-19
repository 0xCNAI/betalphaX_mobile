
import fs from 'fs';
import readline from 'readline';

const INPUT_FILE = 'training_data.jsonl';

async function debugFile() {
    console.log(`Checking ${INPUT_FILE}...`);
    const stats = fs.statSync(INPUT_FILE);
    console.log(`Size: ${stats.size} bytes`);

    const stream = fs.createReadStream(INPUT_FILE, { encoding: 'utf8' });
    const rl = readline.createInterface({
        input: stream,
        crlfDelay: Infinity
    });

    let count = 0;
    for await (const line of rl) {
        count++;
        if (count <= 3) {
            try {
                const data = JSON.parse(line);
                console.log(`Line ${count} keys:`, Object.keys(data));
                console.log('Sample values:');
                console.log('Action:', data.action);
                console.log('Market State:', JSON.stringify(data.market_state).substring(0, 200));
                console.log('Context:', JSON.stringify(data.context).substring(0, 200));
            } catch (e) {
                console.log(`Line ${count} parse error:`, e.message);
            }
        }
        if (count > 10) break;
    }
    console.log(`Total lines read in debug: ${count}`);
}

debugFile().catch(console.error);
