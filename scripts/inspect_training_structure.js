
import fs from 'fs';
import readline from 'readline';

async function inspectStructure() {
    const fileStream = fs.createReadStream('training_data.jsonl');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
        try {
            const data = JSON.parse(line);
            console.log('--- Root Keys ---');
            console.log(Object.keys(data));

            if (data.market_state) {
                console.log('\n--- Market State ---');
                // Print keys and type of values
                for (const [key, value] of Object.entries(data.market_state)) {
                    if (Array.isArray(value)) {
                        console.log(`${key}: Array(length=${value.length})`);
                        // Check if it's a 2D array
                        if (value.length > 0 && Array.isArray(value[0])) {
                            console.log(`  Sample[0]: [${value[0].slice(0, 5).join(', ')}...]`);
                        } else {
                            console.log(`  Sample: [${value.slice(0, 5).join(', ')}...]`);
                        }
                    } else if (typeof value === 'object') {
                        console.log(`${key}: Object with keys [${Object.keys(value).join(', ')}]`);
                    } else {
                        console.log(`${key}: ${typeof value} = ${value}`);
                    }
                }
            }

            if (data.context) {
                console.log('\n--- Context ---');
                if (Array.isArray(data.context)) {
                    console.log(`Array(length=${data.context.length})`);
                    if (data.context.length > 0 && Array.isArray(data.context[0])) {
                        console.log(`  Sample[0]: [${data.context[0].slice(0, 5).join(', ')}...]`);
                    }
                } else if (typeof data.context === 'object') {
                    console.log(JSON.stringify(data.context, null, 2).substring(0, 200) + '...');
                } else {
                    console.log(data.context.substring(0, 200) + '...');
                }
            }

        } catch (e) {
            console.error('Error parsing JSON:', e);
        }
        break; // Only first line
    }
}

inspectStructure();
