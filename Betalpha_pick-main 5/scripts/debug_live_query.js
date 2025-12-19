
import { Index } from '@upstash/vector';
import dotenv from 'dotenv';

dotenv.config();

const UPSTASH_URL = process.env.UPSTASH_VECTOR_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_VECTOR_REST_TOKEN;

if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.error('Missing Upstash Credentials');
    process.exit(1);
}

const index = new Index({
    url: UPSTASH_URL,
    token: UPSTASH_TOKEN,
});

async function runDebug() {
    console.log('--- 🕵️‍♀️ Live Upstash Debug 🕵️‍♀️ ---');
    console.log(`URL: ${UPSTASH_URL}`);

    // Mock a vector (using random numbers just to trigger retrieval)
    // In reality, we should use a real embedding, but for metadata inspection, random is fine
    // as long as we get *some* results.
    // Better: Use a zero vector or a dummy vector of length 1536
    const dummyVector = new Array(1536).fill(0.01);

    const action = 'BUY';

    console.log(`Querying for Action: ${action}...`);

    try {
        const result = await index.query({
            vector: dummyVector,
            topK: 5,
            includeMetadata: true,
            filter: `action = '${action}'`
        });

        console.log(`\nFound ${result.length} matches.`);

        result.forEach((match, i) => {
            console.log(`\n--- Match #${i + 1} ---`);
            console.log(`ID: ${match.id}`);
            console.log(`Score: ${match.score}`);
            console.log('Metadata Keys:', Object.keys(match.metadata));

            console.log('Action (Raw):', match.metadata.action);
            console.log('Outcome (Raw Type):', typeof match.metadata.outcome);
            console.log('Outcome (Raw Value):', match.metadata.outcome);

            // Try Parsing
            let outcome = match.metadata.outcome;
            if (typeof outcome === 'string') {
                try {
                    outcome = JSON.parse(outcome);
                    console.log('✅ Outcome Parsed Successfully:', outcome);

                    // Check Win Condition
                    const isWin = (outcome.profit > 0 || outcome.roi > 0 || outcome.result === 'WIN' || outcome.realized_pnl > 0);
                    console.log(`🏆 Is Win? ${isWin} (PnL: ${outcome.realized_pnl})`);

                } catch (e) {
                    console.error('❌ Failed to parse outcome JSON:', e.message);
                }
            }
        });

    } catch (error) {
        console.error('Query Failed:', error);
    }
}

runDebug();
