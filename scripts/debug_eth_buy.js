
import { OpenAI } from 'openai';
import { Index } from '@upstash/vector';
import dotenv from 'dotenv';

dotenv.config();

const OPENAI_KEY = process.env.OPENAI_API_KEY;
const UPSTASH_URL = process.env.UPSTASH_VECTOR_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_VECTOR_REST_TOKEN;

if (!OPENAI_KEY || !UPSTASH_URL || !UPSTASH_TOKEN) {
    console.error('Missing Env Vars');
    process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_KEY });
const index = new Index({ url: UPSTASH_URL, token: UPSTASH_TOKEN });

async function runSimulation() {
    console.log('--- 🧪 Simulating "Buy 10 ETH" Diagnosis 🧪 ---');

    // 1. Mock Current Market State (ETH)
    // We'll assume a "High Rank" scenario (Rank 0.85) to test the "Selling Top" theory,
    // OR we can try to be neutral. Let's try a "Strong Uptrend" scenario which is often dangerous to buy late.
    // D1 Rank: 0.85 (High)
    // H4 Rank: 0.75 (High)
    const marketState = {
        D1_rank: 0.85,
        H4_rank: 0.75
    };

    const action = 'BUY';
    const symbol = 'ETH';

    console.log(`Symbol: ${symbol}`);
    console.log(`Action: ${action}`);
    console.log(`Market State: ${JSON.stringify(marketState)}`);

    // 2. Generate Vector
    // Must match api/ai-coach.js structure exactly
    const queryText = `
Symbol: ${symbol}
Timestamp: ${new Date().toISOString()}
Action: ${action}
Market State: ${JSON.stringify(marketState)}
Outcome: "UNKNOWN"
Context: ${JSON.stringify({ D1: [], H4: [], H1: [] })}
`.trim();

    console.log('\nGenerating Embedding...');
    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: queryText,
    });
    const vector = embeddingResponse.data[0].embedding;

    // 3. Query Upstash
    console.log('Querying Upstash (Top 10)...');
    const results = await index.query({
        vector: vector,
        topK: 10,
        includeMetadata: true,
        filter: `action = '${action}'`
    });

    // 4. Analyze Results
    let wins = 0;
    let losses = 0;

    console.log('\n--- 🔍 Top 10 Matches ---');
    results.forEach((match, i) => {
        const meta = match.metadata;
        let outcome = meta.outcome;

        // Parse Outcome
        if (typeof outcome === 'string') {
            try {
                if (outcome.startsWith('"')) outcome = JSON.parse(outcome);
                outcome = JSON.parse(outcome);
            } catch (e) { }
        }

        const isWin = outcome && (outcome.profit > 0 || outcome.roi > 0 || outcome.result === 'WIN' || outcome.realized_pnl > 0);
        if (isWin) wins++; else losses++;

        console.log(`\n#${i + 1} Score: ${match.score.toFixed(4)}`);
        console.log(`   Symbol: ${meta.symbol}`);
        console.log(`   Rank D1: ${meta.market_state ? JSON.parse(meta.market_state).D1_rank : 'N/A'}`);
        console.log(`   Outcome: ${isWin ? '✅ WIN' : '❌ LOSS'} (PnL: ${outcome?.realized_pnl?.toFixed(4) || 'N/A'})`);
    });

    console.log('\n--- 🏁 Conclusion ---');
    console.log(`Total Matches: ${results.length}`);
    console.log(`Wins: ${wins}`);
    console.log(`Losses: ${losses}`);
    console.log(`Win Rate: ${((wins / results.length) * 100).toFixed(1)}%`);

    if (wins === 0) {
        console.log('\n⚠️  VERDICT: 0% Win Rate. This setup is historically TOXIC.');
    } else {
        console.log('\n✅ VERDICT: Mixed/Positive results.');
    }
}

runSimulation();
