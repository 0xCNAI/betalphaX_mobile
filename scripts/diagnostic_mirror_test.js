
import { Index } from '@upstash/vector';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';
import readline from 'readline';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const index = new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});

// 1. Helper to generate embedding
async function getEmbedding(text) {
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
    });
    return response.data[0].embedding;
}

// 2. Helper to calculate Cosine Similarity
function cosineSimilarity(vecA, vecB) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function runMirrorTest() {
    console.log('--- 🪞 Running Mirror Test & Score Validation 🪞 ---');

    // Step A: Get a sample record from training data
    const fileStream = fs.createReadStream('training_data.jsonl');
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    let sampleData = null;
    for await (const line of rl) {
        const d = JSON.parse(line);
        if (d.action === 'BUY') { // Pick a BUY record to match our previous tests
            sampleData = d;
            break;
        }
    }
    rl.close();

    if (!sampleData) {
        console.error('Could not find a sample record.');
        return;
    }

    console.log(`Selected Sample: ${sampleData.symbol} (${sampleData.timestamp})`);

    // Step B: Reconstruct "Training" Text (JSON Format)
    // Logic copied from scripts/vectorize_data.js
    const trainingText = `
Symbol: ${sampleData.symbol}
Timestamp: ${sampleData.timestamp}
Action: ${sampleData.action}
Market State: ${JSON.stringify(sampleData.market_state)}
Outcome: ${JSON.stringify(sampleData.outcome)}
Context: ${JSON.stringify(sampleData.context)}
`.trim();

    // Step C: Reconstruct "Live API" Text (Natural Language Format)
    // Logic copied from api/ai-coach.js (approximate reconstruction)
    // Note: API uses OHLC to calculate trend, here we mock it based on market_state or just use the same logic structure
    const trend = 'UP'; // Assumption for this test, or derive from sampleData if possible
    const currentPrice = 50000; // Mock
    const normalizedAction = sampleData.action.toUpperCase();

    // CRITICAL: This is the logic currently in api/ai-coach.js
    const marketState = {
        trend: trend,
        current_price: currentPrice,
    };

    const liveApiText = `
Symbol: ${sampleData.symbol}
Timestamp: ${new Date().toISOString()}
Action: ${normalizedAction}
Market State: ${JSON.stringify(marketState)}
Outcome: "UNKNOWN"
Context: ${JSON.stringify(sampleData.context)}
`.trim();

    console.log('\n--- Text Comparison ---');
    console.log('Format A (Training/Stored):');
    console.log(trainingText.substring(0, 150) + '...');
    console.log('\nFormat B (Live API/Query):');
    console.log(liveApiText);

    // Step D: Generate Embeddings
    console.log('\nGenerating Embeddings...');
    const vecA = await getEmbedding(trainingText);
    const vecB = await getEmbedding(liveApiText);

    // Step E: Compare Vectors
    const similarity = cosineSimilarity(vecA, vecB);
    console.log(`\n📊 Mirror Test Similarity Score: ${similarity.toFixed(4)}`);

    if (similarity < 0.95) {
        console.error('❌ FAIL: Vectors are significantly different. Normalization/Format mismatch confirmed.');
    } else {
        console.log('✅ PASS: Vectors are similar.');
    }

    // Step F: Query Upstash with Live Vector (Score Validation)
    console.log('\n--- 🔍 Score Validation (Upstash Query) ---');
    console.log(`Querying with "Live API" vector... Filter: action='${normalizedAction}'`);

    const results = await index.query({
        vector: vecB,
        topK: 5,
        includeMetadata: true,
        filter: `action = '${normalizedAction}'`
    });

    console.log(`Top 5 Matches:`);
    results.forEach((m, i) => {
        console.log(`#${i + 1} Score: ${m.score.toFixed(4)} | Symbol: ${m.metadata.symbol}`);
    });

    if (results.length > 0 && results[0].score < 0.75) {
        console.error('⚠️ WARNING: Top match score is low (< 0.75). RAG retrieval is weak.');
    }
}

runMirrorTest();
