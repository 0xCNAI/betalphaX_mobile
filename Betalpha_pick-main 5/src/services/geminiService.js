import { RequestQueue } from '../utils/apiQueue';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

// ===== MONITORING CONFIGURATION =====
const MONITOR_ENABLED = true; // Set to false to disable monitoring
const MONITOR_URL = 'https://ai-api-dashboard-t233.vercel.app/api/log'; // Vercel Deployment
// Model pricing (per 1M tokens)
const MODEL_PRICING = {
    'gemini-2.5-flash-lite': { input: 0.075, output: 0.30 },
    'gemini-2.5-flash': { input: 0.15, output: 0.60 },
    'gemini-2.5-pro': { input: 2.50, output: 10.00 }, // Estimated
    'gemini-2.0-flash-exp': { input: 0.10, output: 0.40 },
    'gemini-1.5-flash': { input: 0.075, output: 0.30 }
};

// Helper to calculate cost
const calculateCost = (modelId, inputTokens, outputTokens) => {
    const pricing = MODEL_PRICING[modelId] || { input: 0.10, output: 0.40 };
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return {
        inputCostUsd: inputCost,
        outputCostUsd: outputCost,
        totalCostUsd: inputCost + outputCost
    };
};

import { db } from './firebase';
import { collection, addDoc } from "firebase/firestore";

// Helper to send log to monitor (Firestore)
const logToMonitor = async (logData) => {
    if (!MONITOR_ENABLED) return;

    try {
        await addDoc(collection(db, "gemini_logs"), {
            ...logData,
            timestamp: new Date().toISOString(), // Ensure ISO string for consistency
            createdAt: new Date() // For Firestore sorting
        });
    } catch (error) {
        console.warn('Failed to log to Firestore:', error.message);
    }
};

// Wrapper to log Gemini API calls
const logGeminiCall = async (feature, modelId, inputText, outputText, startTime, error = null) => {
    const endTime = Date.now();
    const latencyMs = endTime - startTime;

    // Estimate tokens (rough approximation: 1 token ≈ 4 chars)
    const inputTokens = Math.ceil(inputText.length / 4);
    const outputTokens = Math.ceil(outputText.length / 4);

    const costs = calculateCost(modelId, inputTokens, outputTokens);

    const log = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        model: modelId,
        feature: feature,
        endpoint: 'generateContent',
        userId: null, // Can be populated if you have user context
        assetId: null, // Can be populated from context
        page: window.location.pathname,
        inputTokens,
        outputTokens,
        inputCostUsd: costs.inputCostUsd,
        outputCostUsd: costs.outputCostUsd,
        totalCostUsd: costs.totalCostUsd,
        inputChars: inputText.length,
        outputChars: outputText.length,
        status: error ? 'error' : 'success',
        errorMessage: error ? error.message : null,
        latencyMs
    };

    await logToMonitor(log);
};

// Model Definitions with Priorities and Limits
export const GEMINI_MODELS = {
    PRO_2_5: 'gemini-2.5-pro', // Assuming availability based on 2.5 Lite existence
    FLASH_2_5: 'gemini-2.5-flash',
    FLASH_LITE_2_5: 'gemini-2.5-flash-lite',
    FLASH_2_0: 'gemini-2.0-flash-exp', // Keep as backup
    FLASH_LITE_2_0: 'gemini-2.0-flash-lite-preview-02-05'
};

const MODELS = [
    {
        id: GEMINI_MODELS.FLASH_LITE_2_5, // Tags, Tweet Summary, Classification (Cost/Speed optimized)
        name: 'Gemini 2.5 Flash Lite',
        rpm: 15,
        priority: 0 // Highest priority for general tasks (Free, High RPD)
    },
    {
        id: GEMINI_MODELS.FLASH_2_5, // AI Coach, Social Signal
        name: 'Gemini 2.5 Flash',
        rpm: 10,
        priority: 1
    },
    {
        id: GEMINI_MODELS.FLASH_2_0,
        name: 'Gemini 2.0 Flash',
        rpm: 15,
        priority: 2
    },
    {
        id: GEMINI_MODELS.FLASH_LITE_2_0,
        name: 'Gemini 2.0 Flash Lite',
        rpm: 30,
        priority: 3 // Fallback
    },
    {
        id: GEMINI_MODELS.PRO_2_5, // News Dashboard, Journal Analysis, Portfolio Summary, Fundamental Analysis
        name: 'Gemini 2.5 Pro',
        rpm: 2, // Assuming lower limit for Pro
        priority: 4 // Least preferred/fallback only
    }
];

// Manager to handle model selection, fallback, and rate limiting
class GeminiModelManager {
    constructor() {
        this.currentModelIndex = 0;
        this.queues = new Map(); // Map<modelId, RequestQueue>
        this.exhaustedModels = new Set(); // Set<modelId>

        // Initialize queues for each model
        MODELS.forEach(model => {
            // Calculate interval from RPM (e.g., 15 RPM = 4000ms interval)
            // Add 10% buffer to be safe
            const interval = Math.ceil((60000 / model.rpm) * 1.1);
            this.queues.set(model.id, new RequestQueue(1, interval));
        });

        this.loadState();
    }

    loadState() {
        try {
            const saved = localStorage.getItem('gemini_model_state');
            if (saved) {
                const { exhausted, timestamp } = JSON.parse(saved);
                // Reset exhausted state if it's a new day (UTC)
                const savedDate = new Date(timestamp).toDateString();
                const today = new Date().toDateString();

                if (savedDate === today) {
                    this.exhaustedModels = new Set(exhausted);
                    // Advance current index to first non-exhausted model
                    this.findNextAvailableModel();
                } else {
                    console.log('[GeminiManager] New day detected, resetting quotas.');
                }
            }
        } catch (e) {
            console.error('Failed to load Gemini state:', e);
        }
    }

    saveState() {
        try {
            const state = {
                exhausted: Array.from(this.exhaustedModels),
                timestamp: Date.now()
            };
            localStorage.setItem('gemini_model_state', JSON.stringify(state));
        } catch (e) { }
    }

    findNextAvailableModel() {
        while (
            this.currentModelIndex < MODELS.length &&
            this.exhaustedModels.has(MODELS[this.currentModelIndex].id)
        ) {
            this.currentModelIndex++;
        }
    }

    getCurrentModel(preferredModelId = null) {
        // If a specific model is requested, try to use it unless it's exhausted
        if (preferredModelId) {
            const preferred = MODELS.find(m => m.id === preferredModelId);
            if (preferred && !this.exhaustedModels.has(preferred.id)) {
                return preferred;
            } else if (preferred) {
                console.warn(`[GeminiManager] Preferred model ${preferredModelId} is exhausted/limited. Falling back to rotation.`);
            }
        }

        this.findNextAvailableModel();
        if (this.currentModelIndex >= MODELS.length) {
            return null; // All models exhausted
        }
        return MODELS[this.currentModelIndex];
    }

    markAsExhausted(modelId) {
        if (modelId) {
            console.warn(`[GeminiManager] Model ${modelId} exhausted (429/503).`);
            this.exhaustedModels.add(modelId);
            this.saveState();

            // If the exhausted model was our current rotation model, advance the index
            const currentRotationModel = MODELS[this.currentModelIndex];
            if (currentRotationModel && currentRotationModel.id === modelId) {
                this.currentModelIndex++;
            }
        }
    }

    async executeRequest(taskFn, preferredModelId = null) {
        // Try preferred model first if specified
        if (preferredModelId && !this.exhaustedModels.has(preferredModelId)) {
            const model = MODELS.find(m => m.id === preferredModelId);
            if (model) {
                try {
                    const queue = this.queues.get(model.id);
                    return await queue.add(async () => {
                        return await taskFn(model);
                    });
                } catch (error) {
                    const isRateLimit = error.message.includes('429') || error.message.includes('Rate limit');
                    const isServiceUnavailable = error.message.includes('503');

                    if (isRateLimit) {
                        this.markAsExhausted(model.id);
                        // Fall through to rotation logic
                    } else if (isServiceUnavailable) {
                        console.warn(`[GeminiManager] Model ${model.id} Service Unavailable (503). Retrying with next model fallback.`);
                        // Do NOT mark as exhausted, just fall through to fallback
                    } else {
                        throw error;
                    }
                }
            }
        }

        // Standard Rotation Logic
        let attempts = 0;
        const maxAttempts = MODELS.length * 2; // Allow wrapping around once

        while (attempts < maxAttempts) {
            const model = this.getCurrentModel();

            // If we ran out of models, reset to 0 and try again (soft reset)
            if (!model) {
                console.warn('[GeminiManager] All models marked exhausted. Resetting to primary model for retry.');
                this.currentModelIndex = 0;
                this.exhaustedModels.clear();
                this.saveState();
                attempts++;
                continue;
            }

            const queue = this.queues.get(model.id);

            try {
                // Execute request using the specific model's queue
                return await queue.add(async () => {
                    return await taskFn(model);
                });
            } catch (error) {
                // Check for 429 (Too Many Requests) or 503 (Service Unavailable)
                const isRateLimit = error.message.includes('429') || error.message.includes('Rate limit');
                const isServiceUnavailable = error.message.includes('503');

                if (isRateLimit) {
                    this.markAsExhausted(model.id);
                    attempts++;
                    continue; // Loop continues to try next model
                } else if (isServiceUnavailable) {
                    console.warn(`[GeminiManager] Model ${model.id} Service Unavailable (503). Trying next model...`);
                    // Temporarily skip this model for THIS request, but don't mark as permanently exhausted
                    this.currentModelIndex++;
                    attempts++;
                    continue;
                }

                // If it's another error (e.g. 400 Bad Request), throw it immediately
                throw error;
            }
        }

        throw new Error('All Gemini models are currently exhausted or rate-limited. Please try again later.');
    }
}

const geminiManager = new GeminiModelManager();

// Simple in-memory cache backed by localStorage
const CACHE_KEY_PREFIX = 'gemini_cache_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const getFromCache = (key) => {
    try {
        const item = localStorage.getItem(CACHE_KEY_PREFIX + key);
        if (!item) return null;

        const parsed = JSON.parse(item);
        if (Date.now() - parsed.timestamp > CACHE_TTL) {
            localStorage.removeItem(CACHE_KEY_PREFIX + key);
            return null;
        }
        return parsed.value;
    } catch (e) {
        return null;
    }
};

const saveToCache = (key, value) => {
    try {
        const item = {
            value,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(item));
    } catch (e) {
        console.warn('Failed to save to Gemini cache (quota exceeded?)');
    }
};

// Helper to generate a stable hash/key for a prompt
const generateCacheKey = (prompt, modelId) => {
    let hash = 0;
    const combo = `${modelId || 'any'}_${prompt}`;
    for (let i = 0; i < combo.length; i++) {
        const char = combo.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
};

// Robust JSON Extractor (Robust against markdown, extra text, etc.)
const cleanJson = (text) => {
    if (!text) return null;
    try {
        // 1. Try strict parse first
        return JSON.parse(text);
    } catch {
        // 2. Robust Extraction (Stack-based to handle nested structures correctly)
        try {
            // Find first { or [
            const startObj = text.indexOf('{');
            const startArr = text.indexOf('[');

            let start = -1;
            if (startObj !== -1 && (startArr === -1 || startObj < startArr)) {
                start = startObj;
            } else if (startArr !== -1) { // Only consider startArr if startObj is -1 or startArr is before startObj
                start = startArr;
            }

            if (start === -1) return null;

            // Stack counter to find matching closing brace
            let braceCount = 0;
            let inString = false;
            let escape = false;
            let end = -1;

            const firstChar = text[start];
            const openChar = firstChar === '{' ? '{' : '[';
            const closeChar = firstChar === '{' ? '}' : ']';

            for (let i = start; i < text.length; i++) {
                const char = text[i];

                if (escape) {
                    escape = false;
                    continue;
                }

                if (char === '\\') {
                    escape = true;
                    continue;
                }

                if (char === '"') {
                    inString = !inString;
                    continue;
                }

                if (!inString) {
                    if (char === openChar) {
                        braceCount++;
                    } else if (char === closeChar) {
                        braceCount--;
                        if (braceCount === 0) {
                            end = i;
                            break;
                        }
                    }
                }
            }

            if (end !== -1) {
                const jsonStr = text.substring(start, end + 1);
                return JSON.parse(jsonStr);
            }
        } catch (e) {
            console.warn('Failed to clean/parse JSON:', text.substring(0, 100) + '...');
        }
    }
    return null;
};


/**
 * Generic function to call Gemini API
 * @param {string} prompt - The prompt to send to Gemini
 * @param {string} preferredModelId - Optional specific model ID to request
 * @param {string} feature - Feature name for logging
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

    const startTime = Date.now();
    let usedModel = null;

    // 2. Execute via Manager (Cascade Logic)
    try {
        const generatedText = await geminiManager.executeRequest(async (model) => {
            usedModel = model.id;
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

                // Throw specific error message to trigger fallback in manager
                if (response.status === 429 || response.status === 503) {
                    throw new Error(`${response.status} Rate limit exceeded`);
                }
                throw new Error(`Failed to fetch from Gemini: ${response.status}`);
            }

            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }, preferredModelId);

        // 3. Save to Cache
        if (generatedText) {
            saveToCache(cacheKey, generatedText);
        }

        // 4. Log to Monitor
        await logGeminiCall(feature, usedModel, prompt, generatedText, startTime);

        return generatedText;

    } catch (error) {
        console.error('Error calling Gemini API (All models failed):', error);

        // Log error to monitor
        if (usedModel) {
            await logGeminiCall(feature, usedModel, prompt, '', startTime, error);
        }

        throw error;
    }
};

/**
 * Generates investment tags based on the provided note using Gemini API.
 * Uses Gemini 2.5 Flash Lite (Low Cost, High Speed)
 * @param {string} note - The investment note/thesis.
 * @returns {Promise<string[]>} - A promise that resolves to an array of tag strings.
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
        const generatedText = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_LITE_2_5, 'generate_tags');

        if (!generatedText) {
            return [];
        }

        // Use robust cleanJson
        const tags = cleanJson(generatedText);
        if (Array.isArray(tags)) {
            return tags;
        }
        return [];
    } catch (error) {
        console.error('Error generating tags:', error);
        return [];
    }
};

/**
 * Summarizes a tweet into a short, punchy investment thesis tag.
 * Uses Gemini 2.5 Flash Lite
 * @param {string} tweetText - The content of the tweet.
 * @returns {Promise<string>} - A single short tag string (e.g., "Protocol Upgrade", "Strong Partnership").
 */
export const summarizeTweet = async (tweetText) => {
    if (!tweetText || !tweetText.trim()) return "News Event";

    const prompt = `You are a crypto analyst. Summarize this tweet into a SINGLE, short, punchy investment thesis tag (2-4 words).
    Examples: "Protocol Upgrade", "Strong Partnership", "Mainnet Launch", "Institutional Adoption", "Regulatory Clarity".
    Avoid generic tags like "Good News". Be specific to the content.
    Return ONLY the tag string. No quotes, no JSON.

    Tweet: "${tweetText}"`;

    try {
        const tag = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_LITE_2_5, 'summarize_tweet');
        return tag?.trim() || "News Event";
    } catch (error) {
        console.error('Error summarizing tweet:', error);
        return "News Event";
    }
};

/**
 * Classifies a list of crypto assets into parent groups using Gemini.
 * Uses Gemini 2.5 Flash Lite
 * @param {Array} assets - List of asset objects (must have 'symbol').
 * @returns {Promise<Object>} - Map of { AssetSymbol: ParentSymbol }.
 */
export const classifyAssets = async (assets) => {
    if (!assets || assets.length === 0) return {};

    // Extract unique symbols to minimize token usage
    const uniqueSymbols = [...new Set(assets.map(a => a.symbol))];
    const symbolsString = uniqueSymbols.join(', ');

    const prompt = `You are a DeFi Portfolio Accountant. Analyze the provided crypto assets and map them to their Underlying Native Asset Rules:

Map wrappers (cbBTC, WBTC) -> Parent 'BTC'.

Map LSDs (wstETH, rETH, ezETH) -> Parent 'ETH'.

Map Stablecoins (USDC, DAI) -> Parent 'USD' (or 'Stablecoins').

Keep others as is (Parent = Self).

Assets to classify: [${symbolsString}]

Return the result as a strict JSON object where keys are the Asset Symbols and values are the Parent Symbols.
Example: { "wstETH": "ETH", "USDC": "USD", "PENDLE": "PENDLE" }
Do not include any other text.`;

    try {
        const generatedText = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_LITE_2_5, 'classify_assets');

        if (!generatedText) return {};

        const mapping = cleanJson(generatedText) || {};
        return mapping;

    } catch (error) {
        console.error('Error classifying assets with Gemini:', error);
        return {};
    }
};

/**
 * Analyzes a tweet to determine its signal category, sentiment, and explanation.
 * Uses Gemini 2.5 Flash
 * @param {string} text - Tweet content
 * @param {string} asset - Related asset symbol
 * @returns {Promise<Object>} - { category, sentiment, explanation, engagementScore }
 */
export const analyzeTweetSignal = async (text, asset) => {
    if (!text) return null;

    const prompt = `Analyze this crypto tweet for "${asset}" and classify it into one of these 3 categories:
1. "Risk Alert" (Delisting, hack, bug, negative governance, large outflows, regulatory threat)
2. "Opportunity" (Breakout, inflows, upgrade, partnership, strong KOL support, bullish chart)
3. "Sentiment Shift" (Hype spike, unusual volume, general discussion)

Also determine the sentiment (Positive, Negative, Neutral) and provide a 1-sentence explanation for a trader.

Tweet: "${text}"

Return strict JSON:
{
  "category": "Risk Alert" | "Opportunity" | "Sentiment Shift",
  "sentiment": "Positive" | "Negative" | "Neutral",
  "explanation": "Why this matters...",
  "engagementScore": 0-100 (Estimate impact based on content urgency)
}`;

    try {
        const generatedText = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_2_5, 'analyze_tweet_signal');
        if (!generatedText) return null;

        return cleanJson(generatedText);
    } catch (error) {
        console.error('Error analyzing tweet signal:', error);
        // Fallback
        return {
            category: 'Sentiment Shift',
            sentiment: 'Neutral',
            explanation: 'AI analysis failed, treat as general info.',
            engagementScore: 50
        };
    }
};

/**
 * Generate Fundamental Analysis using Gemini
 * Uses Gemini 2.5 Pro
 * @param {string} symbol - Token symbol
 * @param {Object} data - Fundamental data (valuation, growth, benchmarks)
 * @param {Array} socialContext - Recent tweets/updates for context
 * @returns {Promise<Object>} - Analysis JSON
 */
export const generateFundamentalAnalysis = async (symbol, data, socialContext = []) => {
    const { valuation, growth, revenue, benchmarks, meta } = data;
    const description = valuation?.description || '';
    const name = meta?.name || symbol;
    const coinId = meta?.coinId || '';

    // Format social context
    const recentUpdates = socialContext
        .slice(0, 5) // Top 5 relevant tweets
        .map(t => `- "${t.text || t.content}" (Source: ${t.author})`)
        .join('\n');

    const prompt = `
Analyze the fundamental data for ${name} (${symbol}) ${coinId ? `[ID: ${coinId}]` : ''} and provide a structured investment analysis.

**Project Description:**
${description ? description.substring(0, 500) + '...' : 'No description available.'}

**Recent Social Updates (Context):**
${recentUpdates || 'No recent updates available.'}

**Data:**
- Market Cap: $${valuation?.mcap?.toLocaleString() || 'N/A'}
- FDV: $${valuation?.fdv?.toLocaleString() || 'N/A'}
- TVL: $${growth?.tvl_current?.toLocaleString() || 'N/A'}
- 30d TVL Change: ${growth?.tvl_30d_change_percent?.toFixed(2) || 'N/A'}%
- Annualized Revenue: ${revenue?.annualized_revenue ? '$' + revenue.annualized_revenue.toLocaleString() : 'Not Available (Data missing)'}

**Industry Benchmarks (Category: ${growth?.category || 'General'}):**
- Median FDV/TVL: ${benchmarks?.medianFdvTvl?.toFixed(2) || 'N/A'}
- Median FDV/Revenue: ${benchmarks?.medianFdvRev?.toFixed(2) || 'N/A'}

**Your Task:**
Provide a concise analysis in the following JSON format:
{
  "whatItDoes": "1 sentence explaining what the project does. Use the description and recent updates to identify the latest protocol features (e.g., if rebrand or new product launched).",
  "verdict": "Undervalued" | "Overvalued" | "Fair",
  "verdictReasoning": "1 sentence justifying the verdict based on the data. Focus on TVL/FDV and growth."
}

Keep it professional, objective, and data-driven.
`;

    try {
        const generatedText = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_LITE_2_5, 'fundamental_analysis');
        if (!generatedText) return null;

        return cleanJson(generatedText);
    } catch (error) {
        console.error('Error generating fundamental analysis:', error);
        return null;
    }
};

/**
 * Generates a daily portfolio summary based on analyzed events and social signals.
 * Uses Gemini 2.5 Pro
 * @param {Array} events - List of detected events (Risk, Opportunity, Narrative)
 * @param {Array} socialData - Raw social feed data
 * @returns {Promise<Array>} - Array of summary objects { text, color }
 */
export const generatePortfolioSummary = async (events, socialData) => {
    try {
        // Prepare context
        const context = {
            timestamp: new Date().toISOString(),
            totalTweets: socialData.length,
            assets: [...new Set(events.map(e => e.asset))],
            riskAssets: socialData.filter(t => t.sentiment === 'bearish').map(t => t.asset),
            // Pass summarized tweet data to save tokens but keep context
            // We pass up to 50 tweets now to ensure coverage for narratives
            topTweets: socialData.slice(0, 50).map(t => ({
                text: t.text,
                asset: t.asset,
                likes: t.likes || 0
            }))
        };

        const prompt = `
        You are a senior crypto market analyst. Analyze the following portfolio events and social data to generate a structured dashboard summary.
        
        **Input Data:**
        ${JSON.stringify(context, null, 2)}

        **CRITICAL INSTRUCTION: NO TEMPLATES.**
        Do not use generic phrases like "mixed sentiment" or "bulls vs bears" without specific context.
        Every summary must be unique to the asset's specific situation (price action, specific keywords, news).

        **Requirements:**

        1. **Daily Summary**: Generate 2-3 high-quality bullet points. 
           - Integrate risk signals, opportunity triggers, narrative changes, and significant tweet volume surges.

        2. **Risk Overview**: Generate ONE concise paragraph (1-2 sentences) explaining the primary risk factor.
           - If no major risk, say "No major risk detected across selected assets; market conditions appear stable."
           - If risk exists, explain WHY (e.g., "ETH is facing selling pressure due to liquidation rumors...").

        3. **Opportunities**: Identify 1-3 assets with positive momentum or buzz.
           - Provide a 1-sentence AI summary explaining WHY it is an opportunity.
           - Score them (0-100) based on momentum + buzz.
           - Flag if it looks "New".

        4. **Narratives**: For EACH asset in the input list, generate a 1-2 sentence narrative summary based on its tweets/events.
           - **BAD EXAMPLE**: "Debate between bulls and bears calling local top; sentiment mixed." (DO NOT DO THIS)
           - **GOOD EXAMPLE**: "Traders are discussing ZEC's unexpected intraday breakout, with many highlighting strong order flow and resistance flips."
           - **GOOD EXAMPLE**: "ETH sentiment is cautious as users discuss the delayed upgrade, despite stable price action."
           - **GOOD EXAMPLE**: "ZEC discussions focus on structural breakout and short covering, with majority bullish but some concern over short-term overheating."

        **Output Format (JSON ONLY):**
        {
            "dailySummary": [
                { "text": "...", "color": "red|green|yellow|blue" }
            ],
            "riskOverview": "...",
            "opportunities": [
                { "asset": "SOL", "summary": "...", "score": 85, "isNew": true }
            ],
            "narratives": {
                "BTC": "...",
                "ETH": "..."
            }
        }
        `;

        // Execute via Manager
        const generatedText = await geminiManager.executeRequest(async (model) => {
            usedModel = model.id;
            console.log(`[Gemini] Generating Portfolio Summary with model: ${model.name}...`);
            const url = `${BASE_URL}${model.id}:generateContent?key=${GEMINI_API_KEY}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Gemini API Error (${response.status}): ${errText}`);
            }

            const data = await response.json();
            return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }, GEMINI_MODELS.FLASH_LITE_2_5);

        // Log to monitor
        await logGeminiCall('portfolio_summary', usedModel, prompt, generatedText, startTime);

        return cleanJson(generatedText);
    } catch (error) {
        console.error('Error generating portfolio summary:', error);
        return null;
    }
};
/**
 * AI-Based Pre-Filter: removing Scams, Spam, and Homonyms (Noise)
 * Returns a list of the subset of tweets that are high-quality.
 */
export const filterRelevantTweets = async (symbol, tweets) => {
    if (!tweets || tweets.length === 0) return [];

    // Batch tweets for analysis
    const tweetList = tweets.map(t =>
        `ID: ${t.id} | Text: ${t.text} | Author: ${t.author}`
    ).join('\n');

    const prompt = `
    You are a Security & Relevance Filter for the crypto token "${symbol}".
    
    **TASK**: specifically filter out 3 types of content:
    1. **SCAMS**: "Airdrop claims", "Connect Wallet", "Giveaways" from non-official accounts.
    2. **HOMONYMS**: Content about "${symbol}" that is NOT crypto (e.g. if symbol is RAIL, remove trains; if AI, remove generic tech).
    3. **SPAM**: Bot spam, repetitive copy-paste, shilling without substance.

    **INPUT TWEETS**:
    ${tweetList}

    **OUTPUT**:
    Return a JSON object containing **ONLY** the list of IDs for the SAFE, RELEVANT tweets.
    {
        "valid_ids": ["123", "456", ...]
    }
    `;

    try {
        const generatedText = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_LITE_2_5, 'tweet_filter');
        if (!generatedText) return [];

        const result = cleanJson(generatedText) || {};
        return result.valid_ids || [];
    } catch (error) {
        console.error(`Error filtering tweets for ${symbol}:`, error);
        return [];
    }
};
/**
 * Generates a structured summary of asset notes using Gemini 2.5 Flash Lite.
 * Extracts key updates, core thesis, and risk factors.
 * @param {string} assetSymbol - The asset symbol (e.g., 'ETH')
 * @param {Array} notes - List of note objects
 * @returns {Promise<Object>} - Structured summary JSON
 */
export const generateAssetNoteSummary = async (assetSymbol, notes) => {
    if (!notes || notes.length === 0) return null;

    // Filter relevant fields to save tokens
    const notesContent = notes.map(n => ({
        date: n.createdAt,
        content: n.content,
        type: n.type, // 'journal', 'thesis', etc.
        tags: n.tags
    }));

    const prompt = `
    You are a dedicated AI Analyst managing a crypto trading journal for "${assetSymbol}".
    Analyze the user's historical notes and generate a structured summary "State of the Asset" report.

        ** Input Notes:**
            ${JSON.stringify(notesContent)}

    ** Your Task:**
        1. ** Key Updates(Chronological):** Extract the most significant events, decisions, or observations. 
       - Format: List of objects with { date: ISOString, content: string }.
       - Limit to top 5 - 10 most important updates.
       - "Content" should be concise(1 sentence).

    2. ** Core Thesis:** Synthesize the user's main reason for holding/trading this asset.
        - If they have a note tagged "thesis" or "Core Thesis", prioritize that.
       - If not, infer it from their buy rationale / sentiment.
       - Max 2 sentences.

    3. ** Major Mistakes:** Identify any self - reported errors or lessons learned.
       - e.g., "Sold too early", "Ignored stop loss".
       - Return as array of strings.

    4. ** Exit Conditions:** Extract specific price targets or conditions mentioned for selling.
       - Return as array of strings.

    ** Output Format(Strict JSON):**
        {
            "key_updates": [
                { "date": "2024-01-01T...", "content": "Entered position due to ETF rumor." }
            ],
            "core_thesis": "...",
            "major_mistakes": ["..."],
            "exit_conditions": ["..."]
        }
            `;

    try {
        const generatedText = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_LITE_2_5, 'note_summary');
        if (!generatedText) return null;

        return cleanJson(generatedText);

    } catch (error) {
        console.error(`Error generating note summary for ${assetSymbol}: `, error);
        return null;
    }
};
/**
 * Generates the News Dashboard from a Cleaned Tweet Set
 */
export const generateNewsDashboard = async (symbol, tweets, forceRefresh = false, featureName = 'news_dashboard') => {
    if (!tweets || tweets.length === 0) return null;

    // 1. Prepare Tweet Context
    // We limit to top 40 tweets and provide DATE context to prevent hallucinations
    const tweetContext = tweets.slice(0, 40).map((t, i) => {
        // Fix: Support both 'timestamp' (mock/cache) and 'createdAt' (real API)
        const rawDate = t.timestamp || t.createdAt || t.created_at;
        let dateStr = 'Unknown';
        if (rawDate) {
            try {
                dateStr = new Date(rawDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            } catch (e) {
                console.warn('[NewsDashboard] Invalid date format:', rawDate);
            }
        }

        return `[${i}][Date: ${dateStr}](Score: ${Math.round(t.score || 0)}) ${t.text} (Source: ${t.link})`;
    }).join('\n---\n');

    console.log(`[NewsDashboard] Constructed Tweet Context (First 200 chars):`, tweetContext.substring(0, 200));

    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `
        ** CURRENT DATE:** ${today}
    
    You are a high - precision Crypto Analyst.Target audience: Pro traders who want fast, actionable intel. 
    Your goal is to generate a ** concise, high - signal ** news dashboard for the token "${symbol}".
    
    ** CRITICAL FILTERING & FORMATTING RULES:**
        1. ** ACCURACY FIRST(DATES & ROADMAP) **:
        -   ** Use Tweet Dates **: ALWAYS refer to the "[Date: ...]" provided in the input.Never output "Unknown" if a date is visible.
        -   ** Future Roadmap **: Include ONLY events that are strictly ** AFTER ${today}**.If a date is in the past, putting it here is a HALLUCINATION.Return empty array if no future events exist.
        -   ** Contextual Dates **: If a tweet says "today", calculate it based on ** ${today}**.
        -   ** No Splitting **: One tweet source = ** ONE ** bullet point.Do NOT split a single tweet.
        -   ** Active Voice **: Use "FLUID listed on Bitvavo" vs "FLUID has been listed...".

    2. ** NOISE CANCELLATION **: 
        -   ** Homonym Filter **: STRICTLY DISCARD non - crypto meanings(e.g. "RAIL" as trains) unless explicitly linked to the token's ecosystem.
        -   ** Scam / Spam Eraser **: Ignore "Giveaways"(unless official).
        -   ** Deduplication **: Merge similar tweets into single insights.

    3. ** OPPORTUNITY & RISK ANALYSIS (New) **:
        -   ** Opportunities **: Identify bullish setups, adoption, or positive catalysts (e.g., "Exchange Listing", "Mainnet Launch", "Partnerships").
        -   ** Risks **: Identify bearish signals, delays, hacks, or FUD (e.g., "Exploit", "Delisting", "Sell-offs").

    4. ** CONCISENESS & QUANTITY(Strict) **:
        -   ** Discussions **: Max ** 3 Themes **.Max ** 3 Points ** per theme.
        -   ** Mandatory Sections **: "Past Month Events" and "Future Roadmap" are required(unless empty).
        -   ** One - Line Rule **: Every point must be ** ONE sentence max ** (under 20 words).

    ** INPUT TWEETS:**
        ${tweetContext}

    ** OUTPUT FORMAT(JSON ONLY, NO MARKDOWN):**
        {
            "discussions": [
                {
                    "theme": "Short Theme Title (e.g. 'Governance Passed')",
                    "points": [
                        { "detail": "Actionable one-liner summary.", "source_url": "Best source URL" }
                    ]
                }
            ],
            "past_month_events": [
                { "date": "MM-DD", "event": "Short Event Name", "details": "Actionable one-liner.", "source_url": "URL" }
            ],
            "future_events": [
                { "timeline": "Timeline (e.g. Q4 2025)", "event": "Short Event Name", "details": "Actionable one-liner.", "source_url": "URL" }
            ],
            "risks": [
               { "signal": "Detailed risk description (~20 words) explaining the specific threat or negative indicator.", "category": "Market/Tech/FUD", "sources": [{ "handle": "Source", "url": "URL", "text": "Relevant tweet context (~20 words)..." }] }
            ],
            "opportunities": [
               { "signal": "Detailed opportunity description (~20 words) explaining the bullish setup or catalyst.", "category": "Adoption/Tech/Market", "sources": [{ "handle": "Source", "url": "URL", "text": "Relevant tweet context (~20 words)..." }] }
            ]
        }
            `;

    try {
        console.log(`[NewsDashboard] Sending prompt to Gemini for ${symbol}...`);
        console.log(`[NewsDashboard] Partial Input Prompt (First 500 chars):`, prompt.substring(0, 500) + '...');
        console.log(`[NewsDashboard] Partial Input Prompt (Middle 500 chars):`, prompt.substring(prompt.length / 2, (prompt.length / 2) + 500) + '...');

        const generatedText = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_LITE_2_5, featureName, forceRefresh);

        console.log(`[NewsDashboard] Raw Gemini Response for ${symbol}:`, (generatedText || '').substring(0, 500) + '...');

        if (!generatedText) {
            console.warn(`[NewsDashboard] Gemini returned empty text for ${symbol}`);
            return null;
        }

        const cleaned = cleanJson(generatedText);
        if (!cleaned) {
            console.error(`[NewsDashboard] Failed to valid JSON for ${symbol}. Raw text length: ${generatedText.length}`);
        } else {
            console.log(`[NewsDashboard] Successfully parsed JSON for ${symbol}. Sections:`, Object.keys(cleaned));
        }

        return cleaned;
    } catch (error) {
        console.error('Error generating news dashboard:', error);
        return null;
    }
};
/**
 * Generates a focused "Review & Adjustments" report using the AI Coach persona.
 * 
 * @param {Object} userSummary - The user's historical summary (UserSummary).
 * @param {Object} assetSummary - The specific asset's summary (AssetSummary).
 * @param {Object} [currentTransaction] - Optional: The specific transaction being reviewed (draft or final).
 * @returns {Promise<Object>} - JSON object with { behavior_summary, recommended_playbook:[3 strings] }
 */
export const generateCoachReview = async (userSummary, assetSummary, currentTransaction = null) => {
    // Map loose schema to prompt variables (still useful for quick checks if needed, but we feed full JSON now)
    const ctx_pnl = assetSummary?.realized_pnl_abs ?? assetSummary?.realizedPnL ?? 0;
    const ctx_trades = assetSummary?.total_trades ?? assetSummary?.totalTrades ?? 0;

    // We provide the FULL context to the AI as requested
    const prompt = `
Role: Professional Crypto Trading Coach(Persona: Strict, data - driven, focused on behavioral psychology and system discipline).
    Task: Review the user's trading pattern for ${assetSummary?.assetSymbol || 'this asset'} and provide a critical "Review & Adjustments" assessment.
    ${currentTransaction ? `Wait! The user is about to SAVE A NEW TRANSACTION for ${currentTransaction.asset}. Review this SPECIFIC trade setup against their history.` : ''}

    Input Data:
1. User Profile(Global Stats & Psychology):
    ${JSON.stringify(userSummary || {}, null, 2)}

2. Asset Context(History for ${assetSummary?.assetSymbol}):
    ${JSON.stringify(assetSummary || {}, null, 2)}

    ${currentTransaction ? `
    3. CURRENT TRANSACTION DRAFT (PRE-TRADE):
    ${JSON.stringify(currentTransaction, null, 2)}
    ` : ''
        }

    Output Format(Strict JSON):
{
    "behavior_summary": "A single, conversational paragraph (approx 3-5 sentences) acting as a direct human coach. Critique the trade setup or validate it based on the data. Be natural, insightful, and direct ('说人话'). Do NOT use bullet points here. Focus on the psychology and system alignment. Example: 'Looking at your history, this setup seems solid. You usually hesitate here, but the data supports a long. Just watch out for that stop loss level as you tend to set it too tight.'",
        "recommended_playbook": [
            {
                "rule": "Short, actionable rule title (e.g. 'Define Invalidation Point')",
                "reasoning": "Brief explanation of why this applies now."
            },
            {
                "rule": "Another rule...",
                "reasoning": "..."
            }
        ]
}
`;

    try {
        // Enforce Gemini 2.5 Flash Lite as requested
        const targetModel = GEMINI_MODELS.FLASH_LITE_2_5;
        console.log(`[Gemini] Calling API with model: ${targetModel.name || targetModel}...`);

        const generatedText = await generateGeminiContent(prompt, targetModel, 'ai_coach_review');
        if (!generatedText) return null;

        return cleanJson(generatedText);

    } catch (error) {
        console.error("AI Coach Generation Failed:", error);
        // Fallback for UI resilience
        return {
            behavior_summary: "AI Coach is currently offline. Please stick to your trading layout.",
            recommended_playbook: []
        };
    }
};


/**
 * Generates/Updates the "User Behavior Archetype" (The 20 Questions)
 * Recursive Personality Update: New Profile = AI(Old Profile + New Evidence)
 * 
 * @param {Object} currentProfile - The existing ai_behavior_archetype (Prior)
 * @param {Array} recentTransactions - List of recent transactions (Evidence)
 * @param {Object} rawStats - Calculated UserSummary stats (Context for AI reasoning, not instruction)
 * @returns {Promise<Object>} - The updated 20-parameter profile
 */
export const generateUserArchetype = async (currentProfile, recentTransactions, rawStats) => {
    // 1. Prepare Context
    // We only send the last 10 transactions to keep it focused on "recent behavior changes" 
    // while the 'currentProfile' holds the long-term memory.
    const recentActivity = recentTransactions.slice(0, 10).map(t => ({
        date: t.date,
        type: t.type,
        asset: t.asset,
        amount: t.amount,
        price: t.price,
        pnl: t.realizedPnL || 0, // details if available
        reasons: t.reasons || [],
        memo: t.memo || ''
    }));

    // 2. Construct Prompt
    const prompt = `
    Role: Elite Trading Psychologist & Behavioral Coach.
    Objective: Maintain and evolve a sophisticated "User Behavior Archetype" based on trading activity.

    ** PHILOSOPHY **:
    - You are observing a trader's journey. Your goal is to mirror their *actual* behavior, not an idealized version.
    - ** Recursive Update **: You are given the [Current Profile] (Prior Knowledge) and [Recent Activity] (New Evidence).
    - ** Conflict Resolution **: If [Recent Activity] contradicts [Current Profile], UPDATE the profile to reflect the change (e.g. they were "Conservative" but just made 5 yolo bets -> change to "Aggressive").
    - ** Holistic Reasoning **: Do NOT just copy math stats. If the math says "Win Rate 90%" but it's only 1 trade, you should interpret that as "Untested" or "Lucky start", not "God mode".

    ** INPUT DATA **:
    
    [A] CURRENT PROFILE (The Baseline):
    ${JSON.stringify(currentProfile || {}, null, 2)}

    [B] RECENT ACTIVITY (The Delta - Last 10 Trades):
    ${JSON.stringify(recentActivity, null, 2)}

    [C] RAW STATS (For Context Only - Use your own judgment):
    ${JSON.stringify(rawStats || {}, null, 2)}

    ** REQUIRED OUTPUT (The 20 Dimensions) **:
    Return a STRICT JSON object with these exact keys. No markdown.
    
    {
        "risk_tolerance": "string (e.g. Low, Moderate, High, Degen)",
        "risk_capacity": "string (Description of financial cushion implied by sizing)",
        "maximum_acceptable_drawdown": "string (e.g. '-20% (Strict stop loss observed)')",
        "preferred_time_horizon": "string (e.g. Scalp, Swing, Position)",
        "strategy_style": "string (e.g. Mean Reversion, Trend Following, Breakout)",
        "entry_behavior_biases": "string (e.g. FOMO on spikes, Limit orders at support)",
        "exit_behavior_biases": "string (e.g. Early profit taker, Bag holder)",
        "position_sizing_preference": "string (e.g. Fixed fractional, Martingale, All-in)",
        "emotional_triggers": "string (e.g. Revenge trading after loss, Greed on winning streaks)",
        "discipline_consistency_score": "number (0-100)",
        "portfolio_concentration_level": "string (e.g. Diversified, Sniper (1-2 assets))",
        "sector_preferences": "string (e.g. L1s, Memecoins, DeFi)",
        "win_rate_perception": "string (Your qualitative assessment of their hit rate)",
        "average_rrr_perception": "string (Your assessment of their Risk/Reward skew)",
        "max_drawdown_perception": "string (Your assessment of their drawdown tolerance)",
        "thesis_quality_score": "number (0-100 based on 'reasons' and notes)",
        "thesis_drift_tendency": "string (High/Low - do they stick to the plan?)",
        "use_of_technical_analysis": "string (High/Low/None)",
        "use_of_fundamental_analysis": "string (High/Low/None)",
        "review_journaling_habits": "string (Implied from note frequency)"
    }
    `;

    try {
        console.log('[AI Profiler] Generating user archetype...');
        // DEBUG: Print prompt to ensure data is correct
        console.log('[AI Profiler] Prompt Length:', prompt.length);

        const generatedText = await generateGeminiContent(prompt, GEMINI_MODELS.FLASH_LITE_2_5, 'generate_user_archetype');

        // DEBUG: Print raw response
        console.log('[AI Profiler] Raw Gemini Response:', generatedText);

        if (!generatedText) {
            console.warn('[AI Profiler] No response from Gemini.');
            return currentProfile; // Fallback to old if fail
        }

        const newProfile = cleanJson(generatedText);

        // DEBUG: Print parsed profile
        console.log('[AI Profiler] Parsed Profile:', newProfile);

        if (newProfile) {
            return newProfile;
        }
        console.warn('[AI Profiler] Failed to parse JSON.');
        return currentProfile;

    } catch (error) {
        console.error('Error generating user archetype:', error);
        return currentProfile;
    }
};
