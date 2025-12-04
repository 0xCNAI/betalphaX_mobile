
import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
    maxDuration: 60,
};

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!GEMINI_API_KEY) {
        console.error('Missing GEMINI_API_KEY environment variable');
        return res.status(500).json({ error: 'Server Configuration Error: Missing API Key' });
    }

    try {
        const { prompt, model: modelName = "gemini-2.0-flash" } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        return res.status(200).json({ text });

    } catch (error) {
        console.error('[Gemini Proxy] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
