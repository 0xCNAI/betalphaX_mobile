
import fs from 'fs';
import readline from 'readline';

async function inspectLine() {
    const fileStream = fs.createReadStream('training_data.jsonl');
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let count = 0;
    const targetLine = 4897; // 1-based index from grep

    for await (const line of rl) {
        count++;
        if (count === targetLine) {
            try {
                const data = JSON.parse(line);
                console.log('--- SELL Record Outcome ---');
                console.log(JSON.stringify(data.outcome, null, 2));
                console.log('--- Full Record Keys ---');
                console.log(Object.keys(data));
            } catch (e) {
                console.error('Error parsing JSON:', e);
            }
            break;
        }
    }
}

inspectLine();
