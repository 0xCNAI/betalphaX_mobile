import { RequestQueue } from '../utils/apiQueue';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';

// Model Definitions with Priorities and Limits
const MODELS = [
    {
        id: 'gemini-2.5-flash-lite',
        name: 'Gemini 2.5 Flash Lite',
        rpm: 15,
        priority: 1 // Highest priority (Free, High RPD)
    },
    {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        rpm: 10,
        priority: 2
    },
    {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        rpm: 15,
        priority: 3
    },
    {
        id: 'gemini-2.0-flash-lite',
        name: 'Gemini 2.0 Flash Lite',
        rpm: 30,
        priority: 4 // Last resort
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

    getCurrentModel() {
        this.findNextAvailableModel();
        if (this.currentModelIndex >= MODELS.length) {
            return null; // All models exhausted
        }
        return MODELS[this.currentModelIndex];
    }

    markCurrentAsExhausted() {
        const model = this.getCurrentModel();
        if (model) {
            console.warn(`[GeminiManager] Model ${model.id} exhausted (429/503). Switching...`);
            this.exhaustedModels.add(model.id);
            this.saveState();
            this.currentModelIndex++;
        }
    }

    async executeRequest(taskFn) {
        // Try models in sequence until one works or all fail
        while (true) {
            const model = this.getCurrentModel();
            if (!model) {
                console.error('[GeminiManager] All models exhausted or failing. Aborting.');
                throw new Error('All Gemini models are currently exhausted or rate-limited. Please try again later.');
            }

            const queue = this.queues.get(model.id);

            try {
                // Execute request using the specific model's queue
                return await queue.add(async () => {
                    return await taskFn(model);
                });
            } catch (error) {
                // Check for 429 (Too Many Requests) or 503 (Service Unavailable)
                const isQuotaError = error.message.includes('429') || error.message.includes('503') || error.message.includes('Rate limit');

                if (isQuotaError) {
                    this.markCurrentAsExhausted();
                    // Loop continues to try next model
                    continue;
                }

                // If it's another error (e.g. 400 Bad Request), throw it immediately
                throw error;
            }
        }
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
const generateCacheKey = (prompt) => {
    let hash = 0;
    for (let i = 0; i < prompt.length; i++) {
        const char = prompt.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
};


/**
 * Generates investment tags based on the provided note using Gemini API.
 * @param {string} note - The investment note/thesis.
 * @returns {Promise<string[]>} - A promise that resolves to an array of tag strings.
 */
/**
 * Generic function to call Gemini API
 * @param {string} prompt - The prompt to send to Gemini
 * @returns {Promise<string>} - The generated text response
 */
export const generateGeminiContent = async (prompt) => {
    if (!prompt) return '';

    // 1. Check Cache
    const cacheKey = generateCacheKey(prompt);
    const cached = getFromCache(cacheKey);
    if (cached) {
        console.log('[Gemini] Serving from cache');
        return cached;
    }

    // 2. Execute via Manager (Cascade Logic)
    try {
        const generatedText = await geminiManager.executeRequest(async (model) => {
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
        const generatedText = await generateGeminiContent(prompt);

        if (!generatedText) {
            return [];
        }

        // Clean up the response to ensure it's valid JSON
        const jsonString = generatedText.replace(/```json\n?|\n?```/g, '').trim();

        try {
            const tags = JSON.parse(jsonString);
            if (Array.isArray(tags)) {
                return tags;
            }
            return [];
        } catch (parseError) {
            console.error('Failed to parse Gemini response as JSON:', generatedText);
            return [];
        }

    } catch (error) {
        console.error('Error generating tags:', error);
        return [];
    }
};

/**
 * Summarizes a tweet into a short, punchy investment thesis tag.
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
        const tag = await generateGeminiContent(prompt);
        return tag?.trim() || "News Event";
    } catch (error) {
        console.error('Error summarizing tweet:', error);
        return "News Event";
    }
};

/**
 * Classifies a list of crypto assets into parent groups using Gemini.
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
        const generatedText = await generateGeminiContent(prompt);

        if (!generatedText) return {};

        const jsonString = generatedText.replace(/```json\n?|\n?```/g, '').trim();
        const mapping = JSON.parse(jsonString);

        return mapping;

    } catch (error) {
        console.error('Error classifying assets with Gemini:', error);
        return {};
    }
};

/**
 * Analyzes a tweet to determine its signal category, sentiment, and explanation.
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
        const generatedText = await generateGeminiContent(prompt);
        if (!generatedText) return null;

        const jsonString = generatedText.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(jsonString);
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
        const generatedText = await generateGeminiContent(prompt);
        if (!generatedText) return null;

        const jsonString = generatedText.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(jsonString);
    } catch (error) {
        console.error('Error generating fundamental analysis:', error);
        return null;
    }
};
