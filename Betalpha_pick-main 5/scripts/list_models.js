
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        // There isn't a direct listModels method in the high-level SDK easily accessible without digging,
        // but we can try to use the model manager if exposed, or just try a known working one like 'gemini-pro' again with more debug.
        // Actually, the error message suggested calling ListModels.
        // Let's try to infer or just try 'gemini-1.0-pro' or 'gemini-1.5-pro-latest'

        // Wait, the SDK doesn't expose listModels directly on the main class in all versions.
        // Let's try to make a raw fetch request to the API to list models.

        const apiKey = process.env.GEMINI_API_KEY;
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            console.log('Available Models:');
            data.models.forEach(m => {
                if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
                    console.log(`- ${m.name} (${m.displayName})`);
                }
            });
        } else {
            console.log('No models found or error:', data);
        }

    } catch (error) {
        console.error('Error listing models:', error);
    }
}

listModels();
