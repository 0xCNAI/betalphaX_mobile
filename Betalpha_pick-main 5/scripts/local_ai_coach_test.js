
import { OpenAI } from 'openai';
import { Index } from '@upstash/vector';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const UPSTASH_URL = process.env.UPSTASH_VECTOR_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_VECTOR_REST_TOKEN;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

if (!OPENAI_KEY || !UPSTASH_URL || !UPSTASH_TOKEN || !GEMINI_KEY) {
    console.error('Missing Environment Variables');
    process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_KEY });
const index = new Index({ url: UPSTASH_URL, token: UPSTASH_TOKEN });
const genAI = new GoogleGenerativeAI(GEMINI_KEY);

async function runSimulation(rank, label) {
    console.log(`\n--- 🧪 Simulation: SELL at ${label} (Rank ${rank}) 🧪 ---`);

    const symbol = 'ETHFI';
    const action = 'BUY';
    const currentPrice = 95000;
    const atr = 2500;

    // Construct Market State
    const marketState = {
        D1_rank: rank,
        H4_rank: rank
    };

    // Generate Embedding
    const queryText = `
Symbol: ${symbol}
Timestamp: ${new Date().toISOString()}
Action: ${action}
Market State: ${JSON.stringify(marketState)}
Outcome: "UNKNOWN"
Context: ${JSON.stringify({ D1: [], H4: [], H1: [] })}
`.trim();

    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: queryText,
    });
    const vector = embeddingResponse.data[0].embedding;

    // Query Upstash
    const queryResult = await index.query({
        vector: vector,
        topK: 10,
        includeMetadata: true,
        includeVectors: false,
        filter: `action = '${action}'`
    });

    // Analyze
    let wins = 0;
    let total = 0;
    queryResult.forEach((match) => {
        const meta = match.metadata;
        let outcome = meta.outcome;
        if (typeof outcome === 'string') {
            try {
                if (outcome.startsWith('"')) outcome = JSON.parse(outcome);
                outcome = JSON.parse(outcome);
            } catch (e) { }
        }
        const isWin = outcome && (outcome.profit > 0 || outcome.roi > 0 || outcome.result === 'WIN' || outcome.realized_pnl > 0);
        if (isWin) wins++;
        total++;
    });

    console.log(`Win Rate: ${total > 0 ? ((wins / total) * 100).toFixed(1) : 0}% (${wins}/${total})`);
}

async function main() {
    // ETHFI BUY Simulation at Rank 0.46
    await runSimulation(0.46, "ETHFI Current State (Rank 0.46)");
}

main();
