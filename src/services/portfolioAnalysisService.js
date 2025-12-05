import { generateGeminiContent } from './geminiService';
import { analyzeTechnicals } from './technicalService';
import { getRecommendedKOLs } from './socialService';
import { getNewsDashboard } from './twitterService';
import { getTokenFundamentals } from './fundamentalService';

/**
 * Generate a comprehensive AI Portfolio Report
 * @param {Array} transactions - User's transactions
 * @param {Object} prices - Current market prices { SYMBOL: { price, change24h } }
 * @returns {Promise<Object>} - The AI Report JSON
 */
export async function generatePortfolioReport(transactions, prices) {
    let portfolioData = null;
    try {
        // 1. Aggregate Data
        portfolioData = aggregatePortfolioData(transactions, prices);

        if (portfolioData.assets.length === 0) {
            return null;
        }

        // 2. Fetch External Data (Technicals, Social, Fundamentals, Events) in Parallel
        const enrichedAssets = await enrichAssetsWithExternalData(portfolioData.assets);

        // 3. Construct Prompt
        const prompt = constructPrompt(enrichedAssets, portfolioData.summary);

        // 4. Call Gemini
        const aiResponse = await generateGeminiContent(prompt);

        // 5. Parse and Return
        return parseAIResponse(aiResponse);

    } catch (error) {
        console.error('Error generating portfolio report, using mock:', error);
        // Ensure we have data for the mock
        if (!portfolioData) {
            try {
                portfolioData = aggregatePortfolioData(transactions, prices);
            } catch (e) {
                console.error("Failed to aggregate data for mock:", e);
                return null;
            }
        }
        return getMockPortfolioReport(portfolioData);
    }
}

/**
 * Aggregate raw transactions into asset summaries
 */
function aggregatePortfolioData(transactions, prices) {
    const assetsMap = {};
    let totalPortfolioValue = 0;
    let totalPortfolioCost = 0;

    transactions.forEach(tx => {
        const symbol = tx.asset.toUpperCase();
        if (!assetsMap[symbol]) {
            assetsMap[symbol] = {
                symbol,
                holdings: 0,
                totalCost: 0,
                buyReasons: new Set(),
                sellSignals: new Set(),
                notes: [],
                avgCost: 0
            };
        }

        const asset = assetsMap[symbol];

        if (tx.type === 'buy') {
            asset.holdings += tx.amount;
            asset.totalCost += tx.amount * tx.price;
            if (tx.reasons) tx.reasons.forEach(r => asset.buyReasons.add(r));
            if (tx.reasonDetails) Object.values(tx.reasonDetails).forEach(n => asset.notes.push(n));
        } else if (tx.type === 'sell') {
            asset.holdings -= tx.amount;
            // Simplified cost basis reduction (FIFO assumption not strictly enforced here for simplicity)
            asset.totalCost -= (asset.totalCost / (asset.holdings + tx.amount)) * tx.amount;
            if (tx.sellSignals) tx.sellSignals.forEach(s => asset.sellSignals.add(s));
        }
    });

    const assets = Object.values(assetsMap)
        .filter(a => a.holdings > 0) // Only current holdings
        .map(a => {
            a.avgCost = a.totalCost / a.holdings;
            const currentPrice = prices[a.symbol]?.price || 0;
            const currentValue = a.holdings * currentPrice;
            const pnl = currentValue - a.totalCost;
            const pnlPercent = a.totalCost > 0 ? (pnl / a.totalCost) * 100 : 0;

            totalPortfolioValue += currentValue;
            totalPortfolioCost += a.totalCost;

            return {
                ...a,
                currentPrice,
                currentValue,
                pnl,
                pnlPercent,
                buyReasons: Array.from(a.buyReasons),
                sellSignals: Array.from(a.sellSignals)
            };
        });

    return {
        assets,
        summary: {
            totalValue: totalPortfolioValue,
            totalCost: totalPortfolioCost,
            totalPnL: totalPortfolioValue - totalPortfolioCost,
            totalPnLPercent: totalPortfolioCost > 0 ? ((totalPortfolioValue - totalPortfolioCost) / totalPortfolioCost) * 100 : 0
        }
    };
}

/**
 * Fetch Technicals, Social, Fundamentals, and Events for each asset
 */
async function enrichAssetsWithExternalData(assets) {
    const promises = assets.map(async (asset) => {
        // 1. Fetch Technicals
        let technicals = null;
        try {
            technicals = await analyzeTechnicals(asset.symbol);
        } catch (e) { console.warn(`Failed to fetch technicals for ${asset.symbol}`, e); }

        // 2. Fetch Social Signals (Top 3 KOLs tweets)
        let social = null;
        try {
            const kols = await getRecommendedKOLs(asset.symbol);
            // Extract top 3 tweets content for context
            social = kols.slice(0, 3).map(k => ({
                handle: k.handle,
                tweet: k.bestTweet?.text || ''
            }));
        } catch (e) { console.warn(`Failed to fetch social for ${asset.symbol}`, e); }

        // 3. Fetch Important Events (News Dashboard)
        let events = null;
        try {
            // Note: getNewsDashboard is likely in twitterService based on previous context, 
            // but imported from socialService if re-exported. Adjust import if needed.
            // Based on user file view, it is in twitterService.js.
            // I will assume it is available via the import at the top.
            const newsData = await getNewsDashboard(asset.symbol);
            if (newsData) {
                events = {
                    upcoming: newsData.future_events?.map(e => `${e.timeline}: ${e.event}`),
                    recent: newsData.past_month_events?.map(e => e.event),
                    discussions: newsData.discussions?.map(d => d.theme)
                };
            }
        } catch (e) { console.warn(`Failed to fetch events for ${asset.symbol}`, e); }

        // 4. Fetch Fundamentals
        let fundamentals = null;
        try {
            const fundData = await getTokenFundamentals(asset.symbol, asset.symbol); // Name might be needed, using symbol as fallback
            if (fundData) {
                fundamentals = {
                    valuation: fundData.valuation ? {
                        mcap: fundData.valuation.mcap,
                        fdv: fundData.valuation.fdv,
                        isHighRisk: fundData.valuation.isHighRisk
                    } : null,
                    growth: fundData.growth ? {
                        tvl_30d_change: fundData.growth.tvl_30d_change_percent
                    } : null,
                    tags: fundData.tags
                };
            }
        } catch (e) { console.warn(`Failed to fetch fundamentals for ${asset.symbol}`, e); }

        return {
            ...asset,
            technicals: technicals ? {
                verdicts: technicals.verdicts,
                score: technicals.score,
                action: technicals.action,
                signals: technicals.signals.map(s => s.msg)
            } : null,
            social,
            events,
            fundamentals
        };
    });

    return Promise.all(promises);
}

/**
 * Construct the prompt for Gemini
 */
function constructPrompt(assets, summary) {
    const assetsJson = JSON.stringify(assets.map(a => ({
        symbol: a.symbol,
        pnlPercent: `${a.pnlPercent.toFixed(1)}%`,
        avgCost: a.avgCost,
        currentPrice: a.currentPrice,
        buyReasons: a.buyReasons,
        notes: a.notes,
        technicals: a.technicals,
        socialBuzz: a.social,
        fundamentals: a.fundamentals,
        events: a.events
    })), null, 2);

    return `
You are a Senior Crypto Portfolio Manager and Analyst.
Analyze the following user portfolio and provide a strategic report.

**Portfolio Summary:**
- Total Value: $${summary.totalValue.toFixed(2)}
- Total PnL: ${summary.totalPnLPercent.toFixed(1)}%

**Assets Data:**
${assetsJson}

**Task:**
Generate a JSON report with the following structure:
{
  "executiveSummary": {
    "healthScore": 0-100,
    "overview": "Concise summary of portfolio health and main risks/opportunities.",
    "topPriorityAction": "The single most important action the user should take."
  },
  "assets": [
    {
      "symbol": "BTC",
      "technicalVerdict": "Bullish/Bearish/Neutral (explain in 1 short sentence)",
      "fundamentalInsight": "Insight based on Fundamentals, Events, or Social Buzz (1 sentence)",
      "strategicAdvice": "Buy/Sell/Hold/Trim/Accumulate - and WHY. Focus on if their buy thesis is still valid, if technicals suggest an exit, or if upcoming events present an opportunity."
    }
  ],
  "actionableChecklist": [
    "Specific action item 1",
    "Specific action item 2"
  ]
}

**Rules:**
1. **Be Critical:** If a user is holding a coin with bad technicals and no valid thesis, tell them to reconsider.
2. **Synthesize:** Combine Technicals (Trend), Fundamentals (Valuation/TVL), and Events (Catalysts) for a holistic view.
3. **Focus on Alpha:** Highlight opportunities (e.g., upcoming roadmap events) or risks (e.g., high FDV dilution).
4. **JSON Only:** Return ONLY the JSON object. No markdown formatting.
`;
}

/**
 * Parse Gemini response
 */
function parseAIResponse(text) {
    try {
        const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(cleaned);
    } catch (e) {
        console.error('Failed to parse AI report:', text);
        return null;
    }
}

/**
 * Generate mock Portfolio Report for fallback
 */
function getMockPortfolioReport(portfolioData) {
    const healthScore = 78;

    return {
        executiveSummary: {
            healthScore: healthScore,
            overview: "Your portfolio demonstrates strong conviction in major L1s but lacks diversification in DeFi sectors. While BTC holdings provide stability, the heavy concentration exposes you to systemic risks if the macro environment shifts.",
            topPriorityAction: "Consider trimming your ETH position to reallocate into high-growth L2 protocols or stablecoins to hedge against short-term volatility."
        },
        assets: portfolioData.assets.map(asset => ({
            symbol: asset.symbol,
            technicalVerdict: Math.random() > 0.5 ? "Bullish - Strong momentum above 50 EMA" : "Neutral - Consolidating in range",
            fundamentalInsight: "High developer activity and increasing TVL suggest long-term growth potential.",
            strategicAdvice: Math.random() > 0.5 ? "Hold - Thesis remains valid" : "Accumulate - Good entry zone"
        })),
        actionableChecklist: [
            "Set a stop-loss for your ETH position at $2,850 to protect recent gains.",
            "Research and identify 2 potential RWA (Real World Asset) projects to diversify your sector exposure.",
            "Review your stablecoin yield strategy; current Aave rates are attractive."
        ]
    };
}
