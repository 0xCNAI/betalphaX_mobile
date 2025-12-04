import { analyzeTechnicals } from './technicalService';
import { getPortfolioFeeds } from './twitterService';
import { getRecommendedKOLs } from './socialService';
import { getTokenFundamentals } from './fundamentalService';
import { analyzeTweetSignal } from './geminiService';

// Constants
// Constants
const CACHE_DURATION = 15 * 60 * 1000; // 15 minutes
let portfolioCache = null;

export const clearOverviewCache = () => {
    portfolioCache = null;
};

/**
 * Generate comprehensive portfolio overview
 * @param {Array} assets - List of asset objects { symbol, amount, value }
 * @returns {Promise<Object>} - Portfolio health, risk, and opportunities
 */
export async function generatePortfolioOverview(assets) {
    if (!assets || assets.length === 0) return null;

    console.log('[Analysis] Generating portfolio overview for:', assets.length, 'assets');

    // 1. Calculate Health Index
    const health = calculateHealthIndex(assets);

    // 2. Identify Risk Assets (Technical + Fundamental)
    const riskAssets = await identifyRiskAssets(assets);

    // 3. Identify Opportunities (Technical Breakouts + Social Hype)
    const opportunities = await identifyOpportunities(assets);

    // 4. General Sentiment (Social)
    const sentiment = await analyzePortfolioSentiment(assets);

    return {
        health,
        riskAssets,
        opportunities,
        sentiment,
        timestamp: Date.now()
    };
}

/**
 * Identify assets with high risk (Technical breakdown or Fundamental overvaluation)
 */
export async function identifyRiskAssets(assets) {
    const risks = [];

    // Analyze top 5 holdings by value for deep dive
    const topHoldings = [...assets].sort((a, b) => b.value - a.value).slice(0, 5);

    for (const asset of topHoldings) {
        try {
            // Technical Check
            const ta = await analyzeTechnicals(asset.symbol);
            if (ta.action === 'STRONG SELL' || ta.action === 'SELL') {
                risks.push({
                    symbol: asset.symbol,
                    type: 'Technical',
                    severity: ta.action === 'STRONG SELL' ? 'High' : 'Medium',
                    reason: ta.proAnalysis?.primarySignal || 'Bearish Market Structure'
                });
            }

            // Fundamental Check (only if not already flagged as high risk)
            const fund = await getTokenFundamentals(asset.symbol);
            if (fund && fund.valuation?.isHighRisk) {
                risks.push({
                    symbol: asset.symbol,
                    type: 'Fundamental',
                    severity: 'Medium',
                    reason: `Overvalued (FDV/Mcap > 3)`
                });
            }
        } catch (e) {
            console.warn(`[Analysis] Failed to analyze risk for ${asset.symbol}`, e);
        }
    }

    return risks;
}

/**
 * Identify assets with high opportunity (Technical breakout or Social hype)
 */
async function identifyOpportunities(assets) {
    const opportunities = [];
    const topHoldings = [...assets].sort((a, b) => b.value - a.value).slice(0, 5);

    for (const asset of topHoldings) {
        try {
            // Technical Check
            const ta = await analyzeTechnicals(asset.symbol);
            if (ta.action === 'STRONG BUY' || ta.action === 'BUY') {
                opportunities.push({
                    symbol: asset.symbol,
                    type: 'Technical',
                    strength: ta.action === 'STRONG BUY' ? 'High' : 'Medium',
                    reason: ta.proAnalysis?.primarySignal || 'Bullish Market Structure'
                });
            }
        } catch (e) { }
    }

    return opportunities;
}

/**
 * Analyze overall portfolio sentiment using social data
 */
async function analyzePortfolioSentiment(assets) {
    // Aggregate sentiment from top holdings
    // For now, return a mock or simple aggregation
    return {
        score: 65, // 0-100
        label: 'Bullish',
        trend: 'Rising'
    };
}

/**
 * Calculate Portfolio Health Index (0-100)
 * Based on diversification, stablecoin ratio, and risk exposure
 */
function calculateHealthIndex(assets) {
    let score = 100;

    // 1. Diversification Penalty
    if (assets.length < 3) score -= 20;
    const totalValue = assets.reduce((sum, a) => sum + (a.value || 0), 0);

    if (totalValue > 0) {
        const maxAllocation = Math.max(...assets.map(a => a.value || 0)) / totalValue;
        if (maxAllocation > 0.5) score -= 15; // Over-concentrated
    }

    // 2. Stablecoin Ratio (Healthy buffer)
    const stables = assets.filter(a => ['USDT', 'USDC', 'DAI'].includes(a.symbol));
    const stableRatio = stables.reduce((sum, a) => sum + (a.value || 0), 0) / totalValue;

    if (stableRatio < 0.1) score -= 10; // Low cash buffer
    if (stableRatio > 0.8) score -= 10; // Too conservative (opportunity cost)

    return Math.max(0, Math.min(100, score));
}

/**
 * Calculate detailed stats for a single asset
 */
export async function calculateAssetStats(asset) {
    const { symbol, amount, value } = asset;

    const [ta, fund, social] = await Promise.all([
        analyzeTechnicals(symbol),
        getTokenFundamentals(symbol),
        getRecommendedKOLs(symbol)
    ]);

    return {
        symbol,
        price: ta.currentPrice || 0, // Need to ensure TA returns price
        value,
        technical: {
            score: ta.score,
            action: ta.action,
            signal: ta.proAnalysis?.primarySignal
        },
        fundamental: {
            mcap: fund?.valuation?.mcap,
            fdv: fund?.valuation?.fdv,
            isUndervalued: fund?.valuation?.isHealthy
        },
        social: {
            score: social.length > 0 ? social[0].score : 0, // Top KOL score
            topVoice: social.length > 0 ? social[0].handle : null
        }
    };
}

/**
 * Detect significant events for assets (Earnings, Unlocks, Hacks)
 * Uses Twitter news dashboard logic
 */
/**
 * Detect significant events for assets (Earnings, Unlocks, Hacks)
 * Uses Twitter news dashboard logic
 */
export const detectAssetEvents = (asset, priceData, socialData = [], transactionData = {}) => {
    const events = [];
    const price = priceData?.price || 0;
    const change24h = priceData?.change24h || 0;
    const priceText = `${change24h > 0 ? '+' : ''}${change24h.toFixed(1)}%`;

    // Helper to count sources
    const tweetCount = socialData.length;
    const newsCount = 0; // Placeholder for news integration

    // --- 1. Price Events (Non-Narrative) ---
    if (Math.abs(change24h) > 5) {
        events.push({
            asset,
            category: 'Price',
            type: change24h > 0 ? 'Surge' : 'Dump',
            description: `${asset} ${change24h > 0 ? 'surging' : 'dropping'} (${priceText})`,
            importance: Math.min(100, Math.abs(change24h) * 10),
            impact: change24h > 0 ? 'positive' : 'negative',
            sources: { tweets: tweetCount, news: newsCount, price: 1 },
            isNarrative: false,
            stance: change24h > 0 ? 'BULLISH' : 'BEARISH'
        });
    }

    // --- 2. Risk Events (Non-Narrative) ---
    if (transactionData.status === 'open') {
        const entryPrice = transactionData.price || price;
        const pnlPct = entryPrice > 0 ? ((price - entryPrice) / entryPrice) * 100 : 0;

        if (pnlPct < -8) {
            events.push({
                asset,
                category: 'Risk',
                type: 'StopLoss',
                description: `${asset} approaching stop-loss levels (${pnlPct.toFixed(1)}%)`,
                importance: 90,
                impact: 'negative',
                sources: { tweets: tweetCount, price: 1 },
                isNarrative: false,
                stance: 'BEARISH'
            });
        }

        if (pnlPct > 15) {
            events.push({
                asset,
                category: 'Risk',
                type: 'ProfitZone',
                description: `${asset} in profit zone (+${pnlPct.toFixed(1)}%)`,
                importance: 70,
                impact: 'positive',
                sources: { tweets: tweetCount, price: 1 },
                isNarrative: false,
                stance: 'BULLISH'
            });
        }
    }

    // --- 3. Social/Narrative Events ---
    // Strict Filter: Must have at least 1 source (tweet or news)
    if (tweetCount + newsCount >= 1) {
        // Sort tweets by likes (desc) to find top influencers
        const sortedTweets = [...socialData].sort((a, b) => (b.likes || 0) - (a.likes || 0));
        const topTweet = sortedTweets[0];
        const topTweetText = topTweet?.text?.toLowerCase() || '';

        // Prepare top 5 tweets for display with links
        const displayTweets = sortedTweets.slice(0, 5).map(t => ({
            text: t.text,
            sentiment: t.sentiment || 'neutral',
            likes: t.likes || 0,
            timestamp: t.timestamp || new Date().toISOString(),
            url: t.url || (t.id ? `https://twitter.com/i/web/status/${t.id}` : `https://twitter.com/search?q=${encodeURIComponent(t.text.substring(0, 50))}`)
        }));

        // Dynamic Narrative Generation
        let headline = '';
        let reasoning = '';
        let stance = 'NEUTRAL';
        let importance = 40; // Base importance
        let category = 'Social';

        // Theme Detection
        const isSecurity = topTweetText.includes('hack') || topTweetText.includes('exploit') || topTweetText.includes('scam');
        const isPartnership = topTweetText.includes('partnership') || topTweetText.includes('collab') || topTweetText.includes('join forces');
        const isListing = topTweetText.includes('listing') || topTweetText.includes('binance') || topTweetText.includes('coinbase');
        const isViral = (topTweet.likes || 0) > 1000;
        const isFear = topTweetText.includes('panic') || topTweetText.includes('sell') || topTweetText.includes('dump') || topTweetText.includes('crash');
        const isHype = topTweetText.includes('moon') || topTweetText.includes('gem') || topTweetText.includes('send it') || topTweetText.includes('breakout');

        if (isSecurity) {
            headline = `Security alert: ${asset} community discussing potential exploit or scam.`;
            reasoning = "Keywords 'hack', 'exploit', or 'scam' detected in recent tweets.";
            stance = 'BEARISH';
            category = 'Security';
            importance = 95;
        } else if (isPartnership) {
            headline = `${asset} seeing buzz around new partnership rumors.`;
            reasoning = "High engagement on tweets mentioning 'partnership' or 'collab'.";
            stance = 'BULLISH';
            category = 'Social';
            importance = 75;
        } else if (isListing) {
            headline = `Exchange listing speculation heating up for ${asset}.`;
            reasoning = "Community discussing potential Binance/Coinbase listing.";
            stance = 'BULLISH';
            category = 'Exchange';
            importance = 85;
        } else if (isViral) {
            headline = `Viral momentum: Top KOLs driving heavy engagement for ${asset}.`;
            reasoning = `Viral tweet detected with ${topTweet.likes} likes.`;
            stance = 'BULLISH';
            category = 'Social';
            importance = 60 + (topTweet.likes / 500);
        } else if (isFear) {
            headline = `${asset} sentiment hit by panic selling discussions.`;
            reasoning = "Negative sentiment and fear keywords dominating conversation.";
            stance = 'BEARISH';
            category = 'Social';
            importance = 65;
        } else if (isHype) {
            headline = `${asset} breakout narrative gaining traction among traders.`;
            reasoning = "Bullish keywords 'moon', 'breakout', 'send it' frequent in timeline.";
            stance = 'BULLISH';
            category = 'Social';
            importance = 60;
        } else {
            // Default / General Buzz
            const bullishCount = socialData.filter(t => t.sentiment === 'bullish').length;
            const bearishCount = socialData.filter(t => t.sentiment === 'bearish').length;

            if (bullishCount > bearishCount * 1.5) {
                headline = `${asset} community showing strong bullish sentiment.`;
                stance = 'BULLISH';
                importance = 50 + (tweetCount);
            } else if (bearishCount > bullishCount * 1.5) {
                headline = `Bearish chatter increasing for ${asset} amid uncertainty.`;
                stance = 'BEARISH';
                importance = 50 + (tweetCount);
            } else {
                headline = `Mixed social signals for ${asset} as traders debate direction.`;
                stance = 'MIXED';
                importance = 45 + (tweetCount);
            }
            reasoning = `Analyzed ${tweetCount} tweets. Sentiment split: ${bullishCount} Bullish / ${bearishCount} Bearish.`;
        }

        events.push({
            asset,
            category,
            type: 'Narrative',
            headline,
            description: headline, // Backward compatibility
            reasoning,
            supportingPrice: priceText,
            importance: Math.min(100, importance),
            impact: stance === 'BEARISH' ? 'negative' : (stance === 'BULLISH' ? 'positive' : 'neutral'),
            sources: { tweets: tweetCount, news: newsCount },
            isNarrative: true,
            stance,
            tweets: displayTweets
        });
    }

    return events;
};

/**
 * Generate data for specific widgets
 * @param {Array} events - All detected events
 * @param {Array} socialData - All social data
 * @param {Array} transactions - User transactions
 * @param {Object} prices - Current prices
 */
export const generateWidgetData = (events, socialData, transactions, prices) => {
    // 1. Risk Widget Data
    const riskEvents = events.filter(e => e.impact === 'negative').sort((a, b) => b.importance - a.importance);
    const primaryRisk = riskEvents[0];
    const activeRiskFlags = riskEvents.length;
    const highestVolAsset = 'BTC'; // Placeholder or calc
    const negativeEventsCount = riskEvents.length;

    const riskData = {
        headline: primaryRisk ? `${primaryRisk.asset} — ${primaryRisk.headline}` : 'No major risk flags.',
        subline: primaryRisk ? primaryRisk.description : 'Portfolio looks stable.',
        metrics: {
            activeFlags: activeRiskFlags,
            highestVol: highestVolAsset,
            negativeEvents: negativeEventsCount
        },
        hasData: !!primaryRisk
    };

    // 2. Opportunity Widget Data
    const oppEvents = events.filter(e => e.impact === 'positive').sort((a, b) => b.importance - a.importance);
    const topOpp = oppEvents[0];
    const momentumCount = oppEvents.filter(e => e.category === 'Price').length;
    const socialBuzzCount = oppEvents.filter(e => e.category === 'Social').length;

    const oppData = {
        headline: topOpp ? `${topOpp.asset} — ${topOpp.headline}` : 'No standout opportunities.',
        subline: topOpp ? topOpp.description : 'Market is quiet today.',
        metrics: {
            momentumCount: momentumCount,
            socialBuzzCount: socialBuzzCount,
            newOpp: true // Placeholder
        },
        hasData: !!topOpp
    };

    // 3. Sentiment Widget Data
    const bullishCount = socialData.filter(t => t.sentiment === 'bullish').length;
    const bearishCount = socialData.filter(t => t.sentiment === 'bearish').length;
    const highEngagementCount = socialData.filter(t => t.likes > 20).length;
    const sentimentScore = bullishCount - bearishCount;

    let sentimentLabel = 'Neutral';
    if (sentimentScore >= 5) sentimentLabel = 'Bullish';
    if (sentimentScore <= -5) sentimentLabel = 'Bearish';

    const sentimentData = {
        headline: `${sentimentLabel} (${sentimentScore > 0 ? '+' : ''}${sentimentScore})`,
        subline: `More ${sentimentScore >= 0 ? 'bullish' : 'bearish'} tweets in the last 24h.`,
        metrics: {
            bullishCount: bullishCount,
            bearishCount: bearishCount,
            highEngagementCount: highEngagementCount
        },
        hasData: socialData.length > 0
    };

    // 4. Top Asset Widget Data
    // Reuse existing logic to find best asset
    const assetStats = calculateAssetStats(transactions);
    let bestAsset = 'BTC';
    let maxScore = -Infinity;
    const targets = [...new Set([...transactions.map(t => t.asset), ...Object.keys(prices)])];

    targets.forEach(asset => {
        let score = 0;
        const stats = assetStats[asset];
        if (stats) score += (stats.winRate || 0);
        const assetEvents = events.filter(e => e.asset === asset);
        score += assetEvents.reduce((acc, e) => acc + (e.impact === 'positive' ? e.importance : -e.importance), 0);
        const assetTweets = socialData.filter(t => t.asset === asset);
        score += assetTweets.length * 5;

        if (score > maxScore) {
            maxScore = score;
            bestAsset = asset;
        }
    });

    const currentPrice = prices[bestAsset];
    const change24h = currentPrice?.change24h || 0;

    const topAssetData = {
        headline: `${bestAsset} — ${change24h > 0 ? '+' : ''}${change24h.toFixed(1)}%, moderate uptrend`,
        subline: [
            'Strong upward momentum',
            'Stable liquidity improving'
        ],
        metrics: {
            performance: 82,
            liquidity: 75,
            sentiment: 68
        },
        hasData: true
    };

    return {
        risk: riskData,
        opp: oppData,
        sentiment: sentimentData,
        topAsset: topAssetData
    };
};

/**
 * Get cached portfolio overview
 */
export function getCachedOverview() {
    return portfolioCache;
}

/**
 * Generate a diagnosis for a specific trade (pre-submission)
 * @param {Object} transaction - The proposed transaction
 * @param {Object} portfolioOverview - Current portfolio state
 */
export function getTradeDiagnosis(transaction, portfolioOverview) {
    // Placeholder logic for trade diagnosis
    return {
        score: 75,
        verdict: 'Neutral',
        warnings: [],
        confirmations: ['Asset aligns with portfolio strategy']
    };
}
