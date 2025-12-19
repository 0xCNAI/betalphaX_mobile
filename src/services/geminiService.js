import { RequestQueue } from '../utils/apiQueue';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

// Model Definitions with Priorities and Limits
export const GEMINI_MODELS = {
    PRO_2_5: 'gemini-2.5-pro',
    FLASH_2_5: 'gemini-2.5-flash',
    FLASH_LITE_2_5: 'gemini-2.5-flash-lite',
    FLASH_2_0: 'gemini-2.0-flash-exp',
    FLASH_LITE_2_0: 'gemini-2.0-flash-lite',
    FLASH_1_5: 'gemini-1.5-flash'
};

const MODELS = [
    {
        id: GEMINI_MODELS.FLASH_LITE_2_5,
        name: 'Gemini 2.5 Flash Lite',
        rpm: 15,
        priority: 1
    },
    {
        id: GEMINI_MODELS.FLASH_2_5,
        name: 'Gemini 2.5 Flash',
        rpm: 10,
        priority: 2
    },
    {
        id: GEMINI_MODELS.FLASH_2_0,
        name: 'Gemini 2.0 Flash',
        rpm: 15,
        priority: 3
    },
    {
        id: GEMINI_MODELS.FLASH_LITE_2_0,
        name: 'Gemini 2.0 Flash Lite',
        rpm: 30,
        priority: 4
    },
    {
        id: GEMINI_MODELS.PRO_2_5,
        name: 'Gemini 2.5 Pro',
        rpm: 2,
        priority: 5
    }
];

class GeminiModelManager {
    constructor() {
        this.modelStatus = new Map(); // modelId -> { failures: 0, cooldownUntil: 0 }
        this.requestQueue = new RequestQueue(15, 60000); // Global rate limiter (safe default)
    }

    getModelStatus(modelId) {
        if (!this.modelStatus.has(modelId)) {
            this.modelStatus.set(modelId, { failures: 0, cooldownUntil: 0 });
        }
        return this.modelStatus.get(modelId);
    }

    isModelAvailable(modelId) {
        const status = this.getModelStatus(modelId);
        return Date.now() > status.cooldownUntil;
    }

    recordFailure(modelId, isRateLimit = false) {
        const status = this.getModelStatus(modelId);
        status.failures++;

        // Exponential backoff: 30s, 1m, 2m, etc.
        const backoff = isRateLimit ? 60000 : 30000 * Math.pow(2, status.failures - 1);
        status.cooldownUntil = Date.now() + backoff;

        console.warn(`[Gemini] Model ${modelId} failed (${status.failures} times). Cooldown for ${backoff}ms.`);
    }

    recordSuccess(modelId) {
        const status = this.getModelStatus(modelId);
        if (status.failures > 0) {
            status.failures = Math.max(0, status.failures - 1);
            status.cooldownUntil = 0;
        }
    }

    /**
     * Executes a request trying models in order of priority
     * @param {Function} requestFn - Async function taking (model) and returning result
     */
    async executeRequest(requestFn) {
        let lastError = null;

        for (const model of MODELS) {
            if (!this.isModelAvailable(model.id)) {
                continue;
            }

            try {
                // Wait for rate limiter? We can optimize this later.
                // For now, just execute.
                const result = await requestFn(model);
                this.recordSuccess(model.id);
                return result;
            } catch (error) {
                console.warn(`[Gemini] Request failed with ${model.name}:`, error.message);
                const isRateLimit = error.message.includes('429') || error.message.includes('503');
                this.recordFailure(model.id, isRateLimit);
                lastError = error;

                // If it's not a rate limit/server error, maybe don't retry other models?
                // But for safety, we usually retry.
            }
        }

        throw lastError || new Error('All Gemini models failed or are on cooldown.');
    }
}

const geminiManager = new GeminiModelManager();

// --- Caching System ---
const CACHE_PREFIX = 'gemini_cache_';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

const getFromCache = (key) => {
    try {
        const item = localStorage.getItem(CACHE_PREFIX + key);
        if (!item) return null;

        const { value, timestamp } = JSON.parse(item);
        if (Date.now() - timestamp > CACHE_EXPIRY) {
            localStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }
        return value;
    } catch (e) {
        console.error('Error reading from cache:', e);
        return null;
    }
};

const saveToCache = (key, value) => {
    try {
        const item = JSON.stringify({
            value,
            timestamp: Date.now()
        });
        localStorage.setItem(CACHE_PREFIX + key, item);
    } catch (e) {
        console.error('Error saving to cache:', e);
    }
};

const generateCacheKey = (prompt, modelId) => {
    // Simple hash for cache key
    const combo = `${modelId || 'any'}_${prompt}`;
    let hash = 0;
    for (let i = 0; i < combo.length; i++) {
        const char = combo.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
};


/**
 * Generic function to call Gemini API
 * @param {string} prompt - The prompt to send to Gemini
 * @param {string} preferredModelId - Optional specific model ID to request
 * @param {string} feature - Feature name for logging (optional)
 * @param {boolean} skipCache - Whether to bypass internal cache
 * @returns {Promise<string>} - The generated text response
 */
export const generateGeminiContent = async (prompt, preferredModelId = null, feature = 'generic', skipCache = false) => {
    if (!prompt) return '';

    // 1. Check Cache
    const cacheKey = generateCacheKey(prompt, preferredModelId);

    if (!skipCache) {
        const cached = getFromCache(cacheKey);
        if (cached) {
            console.log('[Gemini] Serving from cache');
            return cached;
        }
    } else {
        console.log('[Gemini] Bypassing cache (Force Refresh)');
    }

    // 2. Execute via Manager
    try {
        const generatedText = await geminiManager.executeRequest(async (model) => {
            // If preferredModelId is strictly requested, we could check here, 
            // but the manager rotates. For now, we trust the rotation priority.
            // (Flash Lite is priority 1, so it should be picked first anyway)

            console.log(`[Gemini] Calling API with model: ${model.name}...`);
            const url = `${BASE_URL}${model.id}:generateContent?key=${GEMINI_API_KEY}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error(`Gemini API Error (${model.id}):`, errorData);

                if (response.status === 429 || response.status === 503) {
                    throw new Error(`${response.status} Rate limit exceeded`);
                }
                throw new Error(`Failed to fetch from Gemini: ${response.status}`);
            }

            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        });

        // 3. Save to Cache
        if (generatedText) {
            saveToCache(cacheKey, generatedText);
        }

        return generatedText;

    } catch (error) {
        console.error('Error calling Gemini API (All models failed):', error);
        throw error;
    }
};

/**
 * Generates investment tags based on the provided note using Gemini API.
 */
export const generateTagsFromNote = async (note) => {
    if (!note || !note.trim()) {
        return [];
    }

    const prompt = `你是一位頂尖的加密貨幣對沖基金分析師。你的任務是從用戶的「投資筆記 (Investment Note)」中，精準提取出**獨特且具體的投資論點 (Investment Thesis)** 作為標籤 (Tags)。

請嚴格遵守以下規則：
1.  **拒絕籠統：** 絕對不要使用 "Fundamental Undervalued", "Good Project", "Long Term" 這種放諸四海皆準的廢話 Tag。
2.  **提取具體概念：** Tag 必須直接反映筆記中的具體分析點。
    *   例如筆記提到 "LPs earn swap fees and lending fees"，請輸出 "Real Yield" 或 "Capital Efficiency"。
    *   例如筆記提到 "Team from Instadapp"，請輸出 "Strong Team Track Record"。
    *   例如筆記提到 "valuation is too low", 請輸出 "Valuation Gap" 或 "Asymmetric Bet"。
3.  **Tag 格式：** 使用英文，簡潔有力 (2-4 個單字)，首字母大寫。
4.  **數量：** 輸出 3 到 6 個最核心的 Tags。

目標是讓看到這些 Tag 的人，能立刻明白這筆投資的**核心邏輯 (Alpha)** 是什麼。

Return the result as a strict JSON array of strings. Do not include any other text.

Note: "${note}"`;

    try {
        const generatedText = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_LITE_2_5, 'tag_generation', false);

        // Sanitize and parse JSON
        let jsonString = generatedText.trim();
        // Remove markdown code blocks if present
        if (jsonString.startsWith('```')) {
            jsonString = jsonString.replace(/^```(json)?\n/, '').replace(/\n```$/, '');
        }

        const tags = JSON.parse(jsonString);
        if (Array.isArray(tags)) {
            return tags.slice(0, 6);
        }
        return [];
    } catch (error) {
        console.error("Error generating tags:", error);
        return [];
    }
};

/**
 * Generates a concise summary of asset notes using Gemini API.
 */
export const generateAssetNoteSummary = async (notes, asset) => {
    if (!notes || notes.length === 0) {
        return '';
    }

    const notesText = notes.map(n => `- ${n.date}: ${n.content}`).join('\n');

    const prompt = `You are a portfolio manager assistant. Briefly summarize the key investment thesis updates for ${asset} based on the following notes.
    Focus on valid reasons for holding, selling, or risks. Keep it under 50 words.

    Notes:
    ${notesText}
    `;

    try {
        const summary = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_LITE_2_5, 'note_summary', false);
        return summary || 'Unable to generate summary.';
    } catch (error) {
        console.error("Error generating note summary:", error);
        return 'Summarization failed.';
    }
};

/**
 * Analyzes a tweet for sentiment and signal type using Gemini API.
 */
export const analyzeTweetSignal = async (tweetText, asset) => {
    if (!tweetText) return { sentiment: 'Neutral', type: 'Opinion' };

    const prompt = `Analyze this tweet about ${asset}:
    "${tweetText}"

    Output valid JSON only:
    {
      "sentiment": "Bullish" | "Bearish" | "Neutral",
      "type": "News" | "Opinion" | "Analysis" | "Spam",
    }`;

    try {
        const result = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_LITE_2_5, 'tweet_analysis', false);

        // Simple JSON cleaning
        let cleanResult = result.trim();
        if (cleanResult.startsWith('```')) {
            cleanResult = cleanResult.replace(/^```(json)?\n/, '').replace(/\n```$/, '');
        }

        return JSON.parse(cleanResult);
    } catch (error) {
        console.warn("Error analyzing tweet:", error);
        return { sentiment: 'Neutral', type: 'Opinion' };
    }
};
