import { generateGeminiContent } from './geminiService';
import { analyzeTechnicals } from './technicalService';
import { getRecommendedKOLs } from './socialService';
import { getNewsDashboard } from './twitterService';
import { getTokenFundamentals } from './fundamentalService';
import { fetchPrices } from './coinGeckoApi';
import { getOpenPositionForAsset } from './positionService';
import { auth } from './firebase';

// Constants
const DELAY_BETWEEN_ASSETS_MS = 2500; // 2.5s delay to be safe
const GLOBAL_DATA_API = 'https://api.coingecko.com/api/v3/global';
const FEAR_GREED_API = 'https://api.alternative.me/fng/?limit=1';

/**
 * Generate a comprehensive Portfolio Overview 2.0 Report
 * @param {Array} transactions - User's full transaction history
 * @param {Array} currentHoldings - List of current assets with amount > 0
 * @returns {Promise<Object>} - The AI Report JSON
 */
export async function generatePortfolioOverview(transactions, currentHoldings) {
    console.log('[PortfolioOverview] Starting report generation...');

    // 1. Filter holdings (Quantity > 0 only) as per requirement
    // Note: currentHoldings coming in might already be filtered, but double check
    const activeAssets = currentHoldings.filter(a => a.holdings > 0 && a.currentValue > 1); // Ignore dust < $1

    if (activeAssets.length === 0) {
        return null; // Nothing to analyze
    }

    // 2. Fetch Global Market Context (Fear & Greed, Dominance)
    const globalContext = await fetchGlobalContext();
    const userId = auth.currentUser?.uid;

    // 3. Sequential Data Fetching for each asset (to avoid Rate Limits)
    const enrichedAssets = [];

    for (const asset of activeAssets) {
        // Find original Buy Transaction for default values
        const buyTxs = transactions
            .filter(t => t.asset === asset.symbol && t.type === 'buy')
            .sort((a, b) => new Date(a.date) - new Date(b.date)); // Oldest first

        const firstBuy = buyTxs[0];

        // Find the most relevant thesis from transactions as fallback
        // Find the most relevant thesis from transactions as fallback
        const thesisTx = buyTxs.find(t => t.memo || t.narrative?.notes || t.narrative?.primary_reason) || firstBuy;

        // Fetch authoritative Position data from Firestore
        let positionData = null;
        if (userId) {
            try {
                positionData = await getOpenPositionForAsset(userId, asset.symbol);
            } catch (err) {
                console.warn(`[PortfolioOverview] Failed to fetch position for ${asset.symbol}`, err);
            }
        }

        const thesis = positionData?.main_thesis || thesisTx?.memo || thesisTx?.narrative?.notes || thesisTx?.narrative?.primary_reason || "No thesis recorded.";

        // Use Position's avg_entry_price if valid (>0), otherwise fallback to asset.avgCost
        // The position service calculates avg_entry_price correctly (weighted avg)
        const entryPrice = (positionData?.avg_entry_price && Number(positionData.avg_entry_price) > 0)
            ? Number(positionData.avg_entry_price)
            : asset.avgCost;

        // Prepare context object
        const assetContext = {
            symbol: asset.symbol,
            amount: asset.holdings,
            currentPrice: asset.currentPrice,
            avgCost: asset.avgCost,
            pnlPercent: asset.pnlPercent,
            daysHeld: firstBuy ? Math.floor((Date.now() - new Date(firstBuy.date).getTime()) / (1000 * 60 * 60 * 24)) : 0,
            originalEntryPrice: entryPrice,
            thesis: thesis,
            buyReasons: asset.buyReasons || [],
        };

        // Fetch External Data with Delay
        console.log(`[PortfolioOverview] Fetching context for ${asset.symbol}...`);
        const externalData = await fetchExternalDataWithDelay(asset.symbol);

        enrichedAssets.push({
            ...assetContext,
            ...externalData
        });

        // Wait before next asset
        await new Promise(r => setTimeout(r, DELAY_BETWEEN_ASSETS_MS));
    }

    // 4. Construct Prompt
    const prompt = constructOverviewPrompt(enrichedAssets, globalContext, transactions);

    // 5. Call Gemini
    console.log('[PortfolioOverview] Sending prompt to Gemini...');
    const aiResponse = await generateGeminiContent(prompt);

    // 6. Parse and Return
    return parseAIResponse(aiResponse);
}

/**
 * Fetch External Data (Technicals, Social, News, Fundamentals)
 * No rate limit logic here, handled by caller loop.
 */
async function fetchExternalDataWithDelay(symbol) {
    try {
        // Run these in parallel as they hit different APIs (or same API but low concurrency per asset)
        // Adjust if specific services share the same rate limit bucket
        const [technicals, social, news, fundamentals] = await Promise.all([
            analyzeTechnicals(symbol).catch(e => null),
            getRecommendedKOLs(symbol).catch(e => []),
            getNewsDashboard(symbol).catch(e => null),
            getTokenFundamentals(symbol).catch(e => null)
        ]);

        return {
            signals: {
                rsi: technicals?.indicators?.rsi || null,
                marketStructure: technicals?.proAnalysis?.marketStructure || null,
                volumeDivergence: technicals?.proAnalysis?.volumeDivergence || null,
                verdict: technicals?.action || 'NEUTRAL'
            },
            social: {
                sentiment: social.length > 0 ? (social.reduce((a, b) => a + (b.score || 0), 0) / social.length) : 50,
                // Top topics?
            },
            events: {
                upcoming: news?.future_events?.slice(0, 2).map(e => `${e.event} (${e.timeline})`) || [],
                recent: news?.past_month_events?.slice(0, 1).map(e => e.event) || []
            },
            fundamentals: {
                tvlRequest: fundamentals?.growth?.tvl_30d_change_percent || null, // Check if TVL growing
                mcapRisk: fundamentals?.valuation?.isHighRisk || false
            }
        };
    } catch (e) {
        console.warn(`[PortfolioOverview] Failed to fetch context for ${symbol}`, e);
        return {};
    }
}

/**
 * Fetch Global Market Data
 */
async function fetchGlobalContext() {
    try {
        const [fngRes, globalRes] = await Promise.all([
            fetch(FEAR_GREED_API).then(r => r.json()).catch(() => null),
            fetch(GLOBAL_DATA_API).then(r => r.json()).catch(() => null)
        ]);

        return {
            fearAndGreed: fngRes?.data ? fngRes.data[0].value : 'Unknown',
            fearAndGreedLabel: fngRes?.data ? fngRes.data[0].value_classification : 'Neutral',
            btcDominance: globalRes?.data?.market_cap_percentage?.btc ? `${globalRes.data.market_cap_percentage.btc.toFixed(1)}%` : 'Unknown',
            marketTrend: 'Unknown' // Deduce later if needed
        };
    } catch (e) {
        console.warn('[PortfolioOverview] Failed to fetch global context', e);
        return { fearAndGreed: 50, btcDominance: '50%' };
    }
}

/**
 * Construct the prompt for Gemini
 */
function constructOverviewPrompt(assets, globalContext, allTransactions) {
    const assetsJson = JSON.stringify(assets, null, 2);

    // Analyze Trading Patterns (Simple Heuristics passed to AI)
    // AI will do the heavy lifting, but we provide raw stats
    const totalTrades = allTransactions.length;
    const wins = allTransactions.filter(t => t.type === 'sell' && t.pnl > 0).length;
    const losses = totalTrades - wins; // Rough approx
    // AI does better analysis if we just give it the JSON

    return `
You are an expert Crypto Portfolio Manager "Betalpha".
Generate a "Portfolio Overview 2.0" report based on the user's holdings and market conditions.

**Global Context:**
- Fear & Greed: ${globalContext.fearAndGreed} (${globalContext.fearAndGreedLabel})
- BTC Dominance: ${globalContext.btcDominance}

**User Holdings & Context (Current vs Thesis):**
${assetsJson}

**User Trading History Stats:**
- Total Transactions: ${totalTrades}
(Analyze the provided buy/sell patterns from the asset data implicitly)

**Task:**
Generate a JSON report with this STRICT structure:

{
  "actionItems": [
    {
      "priority": "HIGH" | "MEDIUM" | "LOW",
      "action": "Immediate concise action (e.g., Review Exit for FLUID)",
      "reason": "Why? (e.g., Breaking plan, High Risk Event)"
    }
  ],
  "portfolioInsights": [
    {
      "symbol": "BTC",
      "holdDays": 120,
      "entryPrice": 45000,
      "thesisShort": "Original thesis summary...",
      "currentSignals": "Plain English summary of market conditions vs Thesis",
      "recommendation": "Concrete advice: Take Profit / Cut Loss / Hold",
      "justification": "Why? (e.g. Thesis intact but showing signs of exhaustion)"
    }
  ],
  "tradingPatterns": [
    "Observation 1 (e.g., You tend to buy falling knives...)",
    "Observation 2"
  ],
  "personalizedAdvice": "Short paragraph of coaching advice."
}

**Rules:**
1. **Critical Comparison**: You MUST compare the "thesis" (original buy reason) with "currentSignals". If they contradict, flag it.
2. **Action Oriented**: "actionItems" should be a checklist the user can physically tick off.
3. **Tone**: Professional, insightful, slightly strict if the user is gambling.
4. **NO TECHNICAL JARGON**: In "currentSignals" and "justification", DO NOT mention technical indicators like "RSI", "MACD", "Bollinger Bands", "Golden Cross", etc.
   - Instead of "RSI is 85", say "The price is extremely overheated".
   - Instead of "MACD bullish crossover", say "Momentum is shifting positive".
   - Instead of "Bearish Divergence", say "Price is rising but buying pressure is fading".
   - **USE PLAIN ENGLISH** that a non-technical investor understands instantly.
5. **JSON ONLY**: Return raw JSON.
`;
}

/**
 * Parse Gemini response
 */
function parseAIResponse(text) {
    try {
        let cleaned = text.trim();
        // Remove markdown code blocks if present by finding the first { and last }
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace !== -1 && lastBrace !== -1) {
            cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        }

        return JSON.parse(cleaned);
    } catch (e) {
        console.error('Failed to parse AI Portfolio Overview:', text);
        return null;
    }
}
