
import { GoogleGenerativeAI } from '@google/generative-ai';

export const config = {
    maxDuration: 60,
};

const TWITTER_API_KEY = process.env.TWITTER_API_KEY || 'new1_f96fb36ea3274017be61efe351c31c5c';
// Use the same key as in geminiService.js
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD4GqUbFoSvb46M2lxhnRzCT_JulzcC9T4';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { symbol } = req.body;

        if (!symbol) {
            return res.status(400).json({ error: 'Symbol is required' });
        }

        console.log(`[NewsDashboard] Generating dashboard for ${symbol}`);

        // 1. Multi-Query Strategy
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        const sinceDate = oneMonthAgo.toISOString().split('T')[0];

        const queries = [
            { type: 'Roadmap', q: `${symbol} (roadmap OR upgrade OR "v2" OR mainnet OR launch) min_faves:10 -filter:retweets` },
            { type: 'RecentEvents', q: `${symbol} (live OR announced OR partnership OR listing OR exploit OR refund) since:${sinceDate} min_faves:5 -filter:retweets` },
            { type: 'Discussions', q: `${symbol} (thought OR opinion OR thread OR analysis OR "bullish on" OR "bearish on") min_faves:5 -filter:retweets` },
            { type: 'General', q: `${symbol} min_faves:50 -filter:retweets` }
        ];

        const fetchPromises = queries.map(async (queryObj) => {
            const url = `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${encodeURIComponent(queryObj.q)}&type=Top`;
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);

                const response = await fetch(url, {
                    headers: { 'X-API-Key': TWITTER_API_KEY },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (!response.ok) throw new Error(`${response.status}`);
                const data = await response.json();
                return data.tweets || [];
            } catch (e) {
                console.warn(`[NewsDashboard] Query failed [${queryObj.type}]: ${e.message}`);
                return [];
            }
        });

        const results = await Promise.all(fetchPromises);
        const rawTweets = results.flat();

        // Deduplicate
        const seenIds = new Set();
        const uniqueTweets = rawTweets.filter(t => {
            if (seenIds.has(t.id)) return false;
            seenIds.add(t.id);
            return true;
        }).map(t => ({
            text: t.text,
            author: t.author?.userName || 'unknown',
            date: t.createdAt,
            likes: t.likeCount,
            retweets: t.retweetCount,
            url: t.url || `https://x.com/${t.author?.userName}/status/${t.id}`
        }));

        console.log(`[NewsDashboard] Analyzed ${uniqueTweets.length} unique tweets`);

        if (uniqueTweets.length === 0) {
            return res.status(404).json({ error: 'No data found' });
        }

        // 2. LLM Analysis with Gemini
        const prompt = `
You are an Elite Crypto Analyst. Your goal is to generate a "Deep Dive News Dashboard" for ${symbol}.

Input Data (${uniqueTweets.length} Tweets):
${JSON.stringify(uniqueTweets.slice(0, 60), null, 2)}

Task:
Synthesize the provided tweets into a high-precision report.
You MUST cite sources (URLs) for every claim.

Structure Requirements:

1. **Recent Community Discussions (近期社群討論重點)**:
   - Group into specific themes (e.g., "DEX Upgrade", "Lending Market Dominance").
   - Provide 2-3 specific bullet points per theme.
   - Attach Source URL to each point.

2. **Past Month Important Events (前一個月重要事件)**:
   - Focus strictly on events from ${sinceDate} to Present.
   - Columns: Date, Event, Details, Source.

3. **Future Roadmap (未來可期待的重要事件)**:
   - Group by Timeline (e.g., "2025 Q4", "2026 Q1").
   - Specific technical upgrades or expansions.

Output Schema (JSON):
{
  "symbol": "${symbol}",
  "discussions": [
    {
      "theme": "string",
      "points": [
        { "detail": "string", "source_url": "string" }
      ]
    }
  ],
  "past_month_events": [
    {
      "date": "MM-DD",
      "event": "string",
      "details": "string",
      "source_url": "string"
    }
  ],
  "future_events": [
    {
      "timeline": "string",
      "event": "string",
      "details": "string",
      "source_url": "string"
    }
  ]
}

Return ONLY the JSON string. Do not include markdown formatting like \`\`\`json.
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Clean up markdown if present
        const jsonString = responseText.replace(/```json\n?|\n?```/g, '').trim();
        const dashboardData = JSON.parse(jsonString);

        return res.status(200).json(dashboardData);

    } catch (error) {
        console.error('[NewsDashboard] Error:', error);
        return res.status(500).json({ error: error.message });
    }
}
