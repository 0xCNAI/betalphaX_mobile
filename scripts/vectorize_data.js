
import fs from 'fs';
import readline from 'readline';
import { OpenAI } from 'openai';
import { Index } from '@upstash/vector';
import dotenv from 'dotenv';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const UPSTASH_VECTOR_REST_URL = process.env.UPSTASH_VECTOR_REST_URL;
const UPSTASH_VECTOR_REST_TOKEN = process.env.UPSTASH_VECTOR_REST_TOKEN;

if (!OPENAI_API_KEY || !UPSTASH_VECTOR_REST_URL || !UPSTASH_VECTOR_REST_TOKEN) {
    console.error('Missing environment variables. Please check .env file.');
    process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const index = new Index({
    url: UPSTASH_VECTOR_REST_URL,
    token: UPSTASH_VECTOR_REST_TOKEN,
});

const INPUT_FILE = 'training_data.jsonl';
const BATCH_SIZE = 20; // Batch size for processing

async function generateEmbedding(text) {
    try {
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: text,
        });
        return response.data[0].embedding;
    } catch (error) {
        console.error('Error generating embedding:', error);
        return null;
    }
}

async function processFile() {
    let batch = [];
    let count = 0;

    console.log('Starting vectorization...');
    console.log(`Reading from ${INPUT_FILE}`);

    if (!fs.existsSync(INPUT_FILE)) {
        console.error(`File not found: ${INPUT_FILE}`);
        return;
    }

    // Resume capability: Skip already processed lines
    // Set to 0 to restart from the beginning
    const SKIP_COUNT = 0;
    let processedCount = 0;

    // DRY RUN MODE: Set to true to inspect data without uploading
    const DRY_RUN = false;

    // FLUSH DATABASE: Reset the index before uploading
    if (SKIP_COUNT === 0 && !DRY_RUN) {
        console.log('⚠️  FLUSHING DATABASE... Deleting all existing vectors.');
        try {
            await index.reset();
            console.log('✅ Database flushed successfully.');
        } catch (error) {
            console.error('❌ Failed to flush database:', error);
            // Optional: exit if flush fails, or continue
            // process.exit(1); 
        }
    }

    const fileStream = fs.createReadStream(INPUT_FILE);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    for await (const line of rl) {
        if (count < SKIP_COUNT) {
            count++;
            continue;
        }

        // console.log('Line length:', line.length); // Debug
        try {
            const data = JSON.parse(line);

            // Construct text content from available fields
            // We include symbol, action, market_state, outcome, and FULL context (D1, H4, H1)
            const textContent = `
Symbol: ${data.symbol}
Timestamp: ${data.timestamp}
Action: ${data.action}
Market State: ${JSON.stringify(data.market_state)}
Outcome: ${JSON.stringify(data.outcome)}
Context: ${JSON.stringify(data.context)}
`.trim();

            if (!textContent) continue;

            if (DRY_RUN) {
                console.log(`\n--- [DRY RUN] Record #${count + 1} ---`);
                console.log(textContent.substring(0, 500) + '...'); // Print first 500 chars
                if (processedCount >= 5) { // Stop after 5 records in dry run
                    console.log('\n[DRY RUN] Stopping after 5 records.');
                    process.exit(0);
                }
                processedCount++;
                count++;
                continue;
            }

            batch.push({
                id: `tx_${count}`,
                text: textContent,
                metadata: {
                    symbol: data.symbol,
                    action: data.action,
                    timestamp: data.timestamp,
                    outcome: JSON.stringify(data.outcome), // Add outcome to metadata
                    // Store a subset of raw data to avoid metadata limits
                    market_state: JSON.stringify(data.market_state)
                }
            });

            count++;

            if (batch.length >= BATCH_SIZE) {
                await processBatch(batch);
                batch = [];
                console.log(`Processed ${count} records...`);
            }
        } catch (e) {
            console.error('Error parsing line:', e);
        }
    }

    if (batch.length > 0) {
        await processBatch(batch);
    }

    console.log(`Finished! Total records processed: ${count}`);
}

async function processBatch(batch) {
    // 1. Generate embeddings in parallel (or batch if API supports it, but here we do simple map)
    // OpenAI supports batch inputs for embeddings
    try {
        const texts = batch.map(item => item.text);
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: texts
        });

        const vectors = batch.map((item, i) => ({
            id: item.id,
            vector: embeddingResponse.data[i].embedding,
            metadata: { text: item.text, ...item.metadata },
        }));

        // 2. Upsert to Upstash
        await index.upsert(vectors);

    } catch (error) {
        console.error('Error processing batch:', error);
    }
}

processFile().catch(console.error);
