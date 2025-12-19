
import { OpenAI } from 'openai';
import { Index } from '@upstash/vector';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Clients
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const index = new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function testCoach() {
    console.log('Testing AI Coach Logic...');

    const symbol = 'BTC';
    const action = 'BUY';
    const currentPrice = 95000;

    // Mock Embedding
    console.log('1. Generating Embedding...');
    const queryText = `
Symbol: ${symbol}
Action: ${action}
Market State: Trend is UP. Current price ${currentPrice}.
Context: Recent OHLC data available.
`.trim();

    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: queryText,
    });
    const vector = embeddingResponse.data[0].embedding;
    console.log('   Embedding generated.');

    // Mock Retrieval
    console.log('2. Querying Upstash...');
    const queryResult = await index.query({
        vector: vector,
        topK: 5,
        includeMetadata: true,
    });
    console.log(`   Retrieved ${queryResult.length} matches.`);

    if (queryResult.length > 0) {
        console.log('   Top match:', queryResult[0].metadata.symbol, queryResult[0].score);
    }

    // Mock Gemini
    console.log('3. Calling Gemini...');
    const modelName = "gemini-2.5-flash";

    try {
        console.log(`   Trying model: ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const prompt = `
        Analyze this trade:
        Symbol: ${symbol}
        Action: ${action}
        Matches: ${JSON.stringify(queryResult.slice(0, 2))}
        
        Return JSON: { "verdict": "BUY", "reason": "test" }
        `;

        const result = await model.generateContent(prompt);
        console.log(`   SUCCESS with ${modelName}!`);
        console.log('   Gemini Response:', result.response.text());
    } catch (e) {
        console.log(`   Failed with ${modelName}: ${e.message}`);
    }
}

testCoach().catch(console.error);
