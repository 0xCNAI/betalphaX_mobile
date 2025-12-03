
const GEMINI_API_KEY = 'AIzaSyD4GqUbFoSvb46M2lxhnRzCT_JulzcC9T4';
const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Generic function to call Gemini API
 * @param {string} prompt - The prompt to send to Gemini
 * @returns {Promise<string>} - The generated text response
 */
export const generateGeminiContent = async (prompt) => {
    try {
        const response = await fetch(`${API_URL}?key=${GEMINI_API_KEY}`, {
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
            const errorData = await response.json();
            console.error('Gemini API Error:', errorData);
            throw new Error('Failed to fetch from Gemini');
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

        return generatedText || '';

    } catch (error) {
        console.error('Error calling Gemini API:', error);
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
