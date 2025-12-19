
import OpenAI from 'openai';


export const config = {
  maxDuration: 60,
};

const TWITTER_API_KEY = process.env.TWITTER_API_KEY || 'new1_f96fb36ea3274017be61efe351c31c5c';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

export default async function handler(req, res) {
  // Vercel Serverless (Node.js) signature: (req, res)

  if (!GEMINI_API_KEY) {
    console.error('Missing GEMINI_API_KEY');
    return res.status(500).json({ error: 'Configuration Error: Missing GEMINI_API_KEY on Vercel' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // In Vercel Node.js functions, req.body is already parsed if Content-Type is application/json
    const { symbol } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    console.log(`[NewsDashboard] Generating dashboard for ${symbol} using Gemini 2.5 Pro`);

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
        // Add 5s timeout per request to prevent hanging (Optimized for Vercel Hobby 10s limit)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

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

    // 2. LLM Analysis (Gemini 2.5 Pro)
    // Optimize context window for speed
    const prompt = `
You are an Elite Crypto Market Intelligence Analyst. Generate a "Community & Events Dashboard" for ${symbol}.

Input Data (${Math.min(uniqueTweets.length, 45)} Tweets):
${JSON.stringify(uniqueTweets.slice(0, 45), null, 2)}

====================================================================
TASK 1: SYNTHESIZE KEY THEMES & EVENTS (Detailed View)
====================================================================
Analyze the tweets to extract:
1. **Community Discussions**: What are people arguing about? What's the narrative?
2. **Past Month Events**: Validated events that happened recently.
3. **Future Roadmap**: Upcoming events mentioned.

====================================================================
TASK 2: RISKS & OPPORTUNITIES (Feed Summary)
====================================================================
Based on the analysis, explicitly list:
1. **Risks**: Negative signals, FUD, delays, exploits, or bearish sentiment.
2. **Opportunities**: Positive signals, launches, growth, or bullish sentiment.

====================================================================
OUTPUT JSON SCHEMA
====================================================================
{
  "discussions": [
    {
      "theme": "string (Title)",
      "points": [
        { "detail": "Specific point", "source_url": "https://..." }
      ]
    }
  ],
  "past_month_events": [
    {
      "date": "YYYY-MM-DD",
      "event": "string",
      "details": "string",
      "source_url": "https://..."
    }
  ],
  "future_events": [
    {
      "timeline": "string",
      "event": "string",
      "details": "string",
      "source_url": "https://..."
    }
  ],
  "risks": [
    {
      "signal": "string (Short warning title)",
      "category": "Sentiment" | "Security" | "Regulatory" | "Product",
      "sources": [ 
        { 
          "url": "https://...", 
          "handle": "@username",
          "text": "Brief snippet of the tweet content..."
        } 
      ]
    }
  ],
  "opportunities": [
    {
      "signal": "string (Short potential title)",
      "category": "Sentiment" | "Growth" | "Product" | "Event",
      "sources": [ 
        { 
          "url": "https://...", 
          "handle": "@username",
          "text": "Brief snippet of the tweet content..."
        } 
      ]
    }
  ]
}

- For **discussions**, group related distinct tweets into themes.
- If no data for a section, return an empty array for that section.
- Return ONLY the JSON.
`;

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      throw new Error(`Gemini API Error ${geminiResponse.status}: ${errorText}`);
    }

    const completion = await geminiResponse.json();
    const generatedText = completion.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Clean up Markdown code blocks if present
    const jsonString = generatedText.replace(/```json\n?|\n?```/g, '').trim();

    const dashboardData = JSON.parse(jsonString);

    return res.status(200).json(dashboardData);

  } catch (error) {
    console.error('[NewsDashboard] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
