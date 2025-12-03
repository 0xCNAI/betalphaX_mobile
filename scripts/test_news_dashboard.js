
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
if (!GEMINI_API_KEY) {
  console.error('Missing GEMINI_API_KEY');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

async function runDashboardPrototype() {
  console.log('--- 📰 News Dashboard Prototype (High Precision Mode) 📰 ---');

  const symbol = '$FLUID';
  console.log(`Target Asset: ${symbol}`);

  const TWITTER_API_KEY = 'new1_f96fb36ea3274017be61efe351c31c5c';
  let allTweets = [];

  // 1. Multi-Query Strategy (Optimized for Discussions & Recent Events)
  // Assume Today is 2025-12-02. "Past Month" = Since 2025-11-01.
  const queries = [
    // 1. Roadmap/Future (Unchanged)
    { type: 'Roadmap', q: `${symbol} (roadmap OR upgrade OR "v2" OR mainnet OR launch) min_faves:10 -filter:retweets` },

    // 2. Past Month Events (Specific Time Window)
    { type: 'RecentEvents', q: `${symbol} (live OR announced OR partnership OR listing OR exploit OR refund) since:2025-11-01 min_faves:5 -filter:retweets` },

    // 3. Community Discussions (Opinions/Threads)
    { type: 'Discussions', q: `${symbol} (thought OR opinion OR thread OR analysis OR "bullish on" OR "bearish on") min_faves:5 -filter:retweets` },

    // 4. General High Signal (Catch-all)
    { type: 'General', q: `${symbol} min_faves:50 -filter:retweets` }
  ];

  console.log(`\n🚀 Executing ${queries.length} parallel search queries...`);

  try {
    const fetchPromises = queries.map(async (queryObj) => {
      const url = `https://api.twitterapi.io/twitter/tweet/advanced_search?query=${encodeURIComponent(queryObj.q)}&type=Top`;
      try {
        const response = await fetch(url, { headers: { 'X-API-Key': TWITTER_API_KEY } });
        if (!response.ok) throw new Error(`${response.status}`);
        const data = await response.json();
        const tweets = data.tweets || [];
        console.log(`   - [${queryObj.type}] Found ${tweets.length} tweets`);
        return tweets;
      } catch (e) {
        console.warn(`   - [${queryObj.type}] Failed: ${e.message}`);
        return [];
      }
    });

    const results = await Promise.all(fetchPromises);
    const rawTweets = results.flat();

    // Deduplicate by ID
    const seenIds = new Set();
    allTweets = rawTweets.filter(t => {
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

    console.log(`\n✅ Total Unique Tweets for Analysis: ${allTweets.length}`);

  } catch (error) {
    console.error('Critical Error fetching tweets:', error);
    return;
  }

  // 2. LLM Extraction Logic (OpenAI)
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const prompt = `
You are an Elite Crypto Analyst. Your goal is to generate a "Deep Dive News Dashboard" for ${symbol}.

Input Data (${allTweets.length} Tweets):
${JSON.stringify(allTweets.slice(0, 60), null, 2)} 
(Note: Input truncated to top 60 most relevant)

Task:
Synthesize the provided tweets into a high-precision report.
You MUST cite sources (URLs) for every claim.

Structure Requirements:

1. **Recent Community Discussions (近期社群討論重點)**:
   - **CRITICAL**: This section must be detailed. Don't just say "people are excited".
   - Group into specific themes (e.g., "DEX Upgrade", "Lending Market Dominance", "Risk Management").
   - For each theme, provide 2-3 specific bullet points summarizing the *content* of the discussion.
   - Attach Source URL to each point.

2. **Past Month Important Events (前一個月重要事件)**:
   - Focus strictly on events from **November 2025 to Present (Dec 2025)**.
   - Columns: Date, Event, Details, Source.
   - Look for: Listings, Features Live, Partnerships, Hacks/Refunds.

3. **Future Roadmap (未來可期待的重要事件)**:
   - Group by Timeline (e.g., "2025 Q4", "2026 Q1").
   - specific technical upgrades or expansions expected.

Output Schema (JSON):
{
  "symbol": "${symbol}",
  "discussions": [
    {
      "theme": "string", // e.g. "Lending Market Dominance"
      "points": [
        { "detail": "string", "source_url": "string" }
      ]
    }
  ],
  "past_month_events": [
    {
      "date": "MM-DD", // e.g., "11-28"
      "event": "string",
      "details": "string",
      "source_url": "string"
    }
  ],
  "future_events": [
    {
      "timeline": "string", // e.g., "2026 Q1"
      "event": "string",
      "details": "string",
      "source_url": "string"
    }
  ]
}

Return ONLY the JSON.
`;

  try {
    const completion = await openai.chat.completions.create({
      messages: [{ role: "system", content: prompt }],
      model: "gpt-4o-mini",
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0].message.content;
    const data = JSON.parse(responseText);

    console.log('\n--- 📊 Deep Dive Dashboard Output 📊 ---');
    console.log(JSON.stringify(data, null, 2));

  } catch (error) {
    console.error('Error generating dashboard (LLM Failed):', error.message);
  }
}


runDashboardPrototype();
