
import { OpenAI } from 'openai';
import { Index } from '@upstash/vector';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const index = new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});

async function debugApi() {
    console.log('--- Debugging API Logic ---');

    // 1. Simulate Input
    const symbol = 'ETH/USDT';
    const action = 'SELL';
    const trend = 'DOWN';
    const currentPrice = 50000;

    // 2. Construct Query (Same as API)
    const queryText = `
Action: ${action}
Market State: Trend is ${trend}. Current price ${currentPrice}.
Context: Recent OHLC data available.
`.trim();

    console.log('Query Text:', queryText);

    // 3. Embed
    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: queryText,
    });
    const vector = embeddingResponse.data[0].embedding;

    // 4. Query Upstash
    const queryResult = await index.query({
        vector: vector,
        topK: 10,
        includeMetadata: true,
        includeVectors: false,
    });

    console.log(`Found ${queryResult.length} matches.`);

    // 5. Analyze Matches (Same Logic as API)
    let buySuccessCount = 0;
    let totalBuyAttempts = 0;
    let sellSuccessCount = 0;
    let totalSellAttempts = 0;
    let matchesWithOutcome = 0;

    queryResult.forEach((match, i) => {
        console.log(`\nMatch #${i + 1}:`);
        const meta = match.metadata;
        if (!meta) {
            console.log('  No metadata');
            return;
        }

        console.log('  Symbol:', meta.symbol);
        console.log('  Action:', meta.action); // Critical: See what actions are retrieved
        console.log('  Raw Outcome:', meta.outcome);

        let outcome = meta.outcome;
        if (outcome) {
            matchesWithOutcome++;
            if (typeof outcome === 'string') {
                try {
                    outcome = JSON.parse(outcome);
                    console.log('  Parsed Outcome:', outcome);
                } catch (e) {
                    console.error('  Failed to parse outcome JSON', e);
                }
            }
        } else {
            console.log('  Outcome is missing/null');
        }

        const matchAction = meta.action ? meta.action.toUpperCase() : '';

        if (matchAction === 'BUY') {
            totalBuyAttempts++;
            if (outcome && (outcome.profit > 0 || outcome.roi > 0 || outcome.result === 'WIN' || outcome.realized_pnl > 0)) {
                buySuccessCount++;
                console.log('  Result: WIN');
            } else {
                console.log('  Result: LOSS/NEUTRAL');
            }
        } else if (matchAction === 'SELL') {
            totalSellAttempts++;
            if (outcome && (outcome.profit > 0 || outcome.roi > 0 || outcome.result === 'WIN' || outcome.realized_pnl > 0)) {
                sellSuccessCount++;
                console.log('  Result: WIN');
            } else {
                console.log('  Result: LOSS/NEUTRAL');
            }
        }
    });

    console.log('\n--- Stats ---');
    console.log(`Total Buy Attempts: ${totalBuyAttempts}`);
    console.log(`Buy Success Count: ${buySuccessCount}`);
    console.log(`Total Sell Attempts: ${totalSellAttempts}`);
    console.log(`Sell Success Count: ${sellSuccessCount}`);
    console.log(`Matches with Outcome: ${matchesWithOutcome}`);
}

debugApi().catch(console.error);
