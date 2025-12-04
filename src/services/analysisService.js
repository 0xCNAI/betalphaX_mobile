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
export async function detectAssetEvents(assets) {
    // Placeholder for event detection logic
    return [];
}

/**
 * Generate data for specific widgets
 * @param {string} widgetType - 'risk', 'opportunity', 'sentiment', 'top_asset'
 * @param {Array} assets - Portfolio assets
 */
export async function generateWidgetData(widgetType, assets) {
    switch (widgetType) {
        case 'risk':
            const risks = await identifyRiskAssets(assets);
            return {
                title: 'Risk Radar',
                count: risks.length,
                items: risks.map(r => `${r.symbol}: ${r.reason}`)
            };
        case 'opportunity':
            const opps = await identifyOpportunities(assets);
            return {
                title: 'Alpha Scanner',
                count: opps.length,
                items: opps.map(o => `${o.symbol}: ${o.reason}`)
            };
        case 'sentiment':
            const sent = await analyzePortfolioSentiment(assets);
            return {
                title: 'Market Mood',
                value: sent.label,
                score: sent.score
            };
        default:
            return null;
    }
}

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
