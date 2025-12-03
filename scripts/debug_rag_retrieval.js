
import { OpenAI } from 'openai';
import { Index } from '@upstash/vector';
import dotenv from 'dotenv';

dotenv.config();

// Sanitize Env Vars
const sanitize = (val) => val ? val.replace(/^"|"$/g, '').replace(/^'|'$/g, '') : val;
const OPENAI_KEY = sanitize(process.env.OPENAI_API_KEY);
const UPSTASH_URL = sanitize(process.env.UPSTASH_VECTOR_REST_URL);
const UPSTASH_TOKEN = sanitize(process.env.UPSTASH_VECTOR_REST_TOKEN);

async function debugRag() {
    console.log('--- Debugging RAG Retrieval ---');

    if (!OPENAI_KEY || !UPSTASH_URL || !UPSTASH_TOKEN) {
        console.error('Missing Credentials');
        return;
    }

    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const index = new Index({ url: UPSTASH_URL, token: UPSTASH_TOKEN });

    // Mock Query (Simulating BTC BUY in UP trend)
    const queryText = `
Symbol: BTCUSDT
Action: BUY
Market State: Trend is UP. Current price 95000.
Context: Recent OHLC data available.
`.trim();

    console.log('Query Text:', queryText);

    try {
        // 1. Embed
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: queryText,
        });
        const vector = embeddingResponse.data[0].embedding;
        console.log('Embedding generated.');

        // 2. Query
        const queryResult = await index.query({
            vector: vector,
            topK: 10,
            includeMetadata: true,
            includeVectors: false,
        });

        console.log(`Found ${queryResult.length} matches.`);

        // 3. Inspect Metadata
        let buySuccessCount = 0;
        let totalBuyAttempts = 0;

        queryResult.forEach((match, i) => {
            const meta = match.metadata;
            let outcome = meta.outcome;
            let parsedOutcome = null;

            if (typeof outcome === 'string') {
                try {
                    parsedOutcome = JSON.parse(outcome);
                } catch (e) {
                    console.error(`Match ${i}: Failed to parse outcome string:`, outcome);
                }
            } else {
                parsedOutcome = outcome;
            }

            const matchAction = meta.action ? meta.action.toUpperCase() : '';
            const isWin = parsedOutcome && (parsedOutcome.profit > 0 || parsedOutcome.roi > 0 || parsedOutcome.result === 'WIN');

            console.log(`\nMatch ${i + 1} (Score: ${match.score.toFixed(4)}):`);
            console.log(`  Symbol: ${meta.symbol}`);
            console.log(`  Action: ${matchAction}`);
            console.log(`  Outcome Raw:`, outcome);
            console.log(`  Outcome Parsed:`, parsedOutcome);
            console.log(`  Is Win?: ${isWin}`);

            if (matchAction === 'BUY') {
                totalBuyAttempts++;
                if (isWin) buySuccessCount++;
            }
        });

        console.log('\n--- Summary ---');
        console.log(`Total BUY Attempts: ${totalBuyAttempts}`);
        console.log(`BUY Success Count: ${buySuccessCount}`);
        console.log(`Calculated Win Rate: ${totalBuyAttempts > 0 ? (buySuccessCount / totalBuyAttempts * 100).toFixed(1) : 0}%`);

    } catch (error) {
        console.error('Debug Failed:', error);
    }
}

debugRag();
