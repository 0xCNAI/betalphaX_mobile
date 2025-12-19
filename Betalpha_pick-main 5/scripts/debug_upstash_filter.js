
import { Index } from '@upstash/vector';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const index = new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});

async function debugFilter() {
    console.log('--- Debugging Upstash Filter ---');

    const queryText = "Action: BUY. Market State: Trend is UP.";

    // Generate vector
    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: queryText,
    });
    const vector = embeddingResponse.data[0].embedding;

    console.log('Testing filter: "action = \'BUY\'"');

    try {
        const result = await index.query({
            vector: vector,
            topK: 5,
            includeMetadata: true,
            filter: "action = 'BUY'"
        });

        console.log(`Matches found: ${result.length}`);
        result.forEach((m, i) => {
            console.log(`Match ${i + 1}: Action=${m.metadata.action}, Symbol=${m.metadata.symbol}`);
        });

        if (result.length === 0) {
            console.log('WARNING: Filter returned 0 results. Trying without filter...');
            const resultNoFilter = await index.query({
                vector: vector,
                topK: 5,
                includeMetadata: true
            });
            console.log(`Matches found WITHOUT filter: ${resultNoFilter.length}`);
            resultNoFilter.forEach((m, i) => {
                console.log(`Match ${i + 1}: Action=${m.metadata.action}, Symbol=${m.metadata.symbol}`);
            });
        }

    } catch (error) {
        console.error('Query failed:', error);
    }
}

debugFilter();
