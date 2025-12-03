
import fs from 'fs';
import readline from 'readline';

async function inspect() {
    const fileStream = fs.createReadStream('training_data.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            console.log('--- Market State Keys ---');
            console.log(Object.keys(data.market_state));
            console.log('--- Market State Values ---');
            console.log(data.market_state);
            break; // Only need the first one
        } catch (e) {
            console.error(e);
        }
    }
}

inspect();
