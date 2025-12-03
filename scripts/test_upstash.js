
import { Index } from '@upstash/vector';
import dotenv from 'dotenv';

dotenv.config();

async function testUpstash() {
    console.log('Testing Upstash Connection...');
    const url = process.env.UPSTASH_VECTOR_REST_URL;
    const token = process.env.UPSTASH_VECTOR_REST_TOKEN;

    console.log('URL:', url);
    console.log('Token Length:', token ? token.length : 'N/A');

    if (!url || !token) {
        console.error('Missing Upstash Credentials in .env');
        return;
    }

    const index = new Index({
        url: url,
        token: token,
    });

    try {
        // Try a simple info or query
        const info = await index.info();
        console.log('Successfully connected to Upstash!');
        console.log('Index Info:', info);
    } catch (error) {
        console.error('Upstash Connection Failed:', error);
    }
}

testUpstash();
