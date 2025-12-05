// Service to handle Portfolio Overview, Trade Diagnosis, and Advanced Analytics

const CACHE_KEY = 'portfolio_overview_cache';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// --- Core Analysis Functions ---

export const generatePortfolioOverview = (transactions, currentPrices = {}) => {
    // Rely strictly on the passed transactions (which now contain rich mock data from Context)
    const safeTransactions = Array.isArray(transactions) ? transactions : [];

    const closedTrades = safeTransactions.filter(tx => tx.status === 'closed');
    const openPositions = safeTransactions.filter(tx => tx.status === 'open');

    // 1. Basic Metrics
    const winningTrades = closedTrades.filter(tx => tx.pnl > 0);
    const winRate = closedTrades.length > 0 ? (winningTrades.length / closedTrades.length) * 100 : 0;
    const avgRR = closedTrades.length > 0 ? closedTrades.reduce((acc, tx) => acc + (tx.rr_ratio || 0), 0) / closedTrades.length : 0;

    // 2. Portfolio Health Index
    const healthIndex = calculateHealthIndex(openPositions, closedTrades, currentPrices);

    // 3. Risk Watchlist
    const riskWatchlist = identifyRiskAssets(openPositions, currentPrices);

    // 4. Historical Insights
    const assetStats = calculateAssetStats(closedTrades);

    return {
        winRate,
        avgRR,
        totalTrades: closedTrades.length + openPositions.length,
        healthIndex,
        riskWatchlist,
        assetStats,
        tradingStyle: determineTradingStyle(closedTrades),
        topAssets: getTopAssets(assetStats)
    };
};

// --- Helper Analysis Functions ---

const calculateHealthIndex = (openPositions, closedTrades, currentPrices) => {
    // 1. Concentration Risk
    let totalValue = 0;
    const assetAllocation = {};

    openPositions.forEach(tx => {
        const price = currentPrices[tx.asset]?.price || tx.price || 0;
        const value = (tx.amount || 0) * price;
        totalValue += value;
        assetAllocation[tx.asset] = (assetAllocation[tx.asset] || 0) + value;
    });

    let maxConcentration = 0;
    let concentratedAsset = 'None';

    if (totalValue > 0) {
        Object.entries(assetAllocation).forEach(([asset, value]) => {
            const pct = (value / totalValue) * 100;
            if (pct > maxConcentration) {
                maxConcentration = pct;
                concentratedAsset = asset;
            }
        });
    }

    const concentrationScore = Math.max(0, 100 - (maxConcentration > 30 ? (maxConcentration - 30) * 1.2 : 0));
    const concentrationText = maxConcentration > 40
        ? `Heavy allocation in ${concentratedAsset} (${maxConcentration.toFixed(0)}%).`
        : "Balanced allocation.";


    // 2. Downside Exposure + Stop-loss Coverage Ratio
    let totalDownsideRisk = 0;
    let positionsWithStopLoss = 0;

    openPositions.forEach(tx => {
        const price = currentPrices[tx.asset]?.price || tx.price || 0;
        const value = (tx.amount || 0) * price;

        let hasSL = false;
        let slPrice = 0;

        // Check for SL in various fields (Mock or Real)
        if (tx.hasSL !== undefined) {
            hasSL = tx.hasSL;
            slPrice = tx.slPrice;
        } else {
            // Try to parse from sellSignals or customSellSignal
            hasSL = tx.selectedSellSignals?.some(s => s.toLowerCase().includes('stop')) ||
                (tx.customSellSignal && tx.customSellSignal.toLowerCase().includes('stop'));
            // Estimate SL price if not explicit
            if (hasSL) slPrice = price * 0.9;
        }

        if (hasSL) {
            positionsWithStopLoss++;
            const riskPct = slPrice ? (price - slPrice) / price : 0.10;
            const riskAmount = value * Math.max(0, riskPct);
            totalDownsideRisk += riskAmount;
        } else {
            totalDownsideRisk += (value * 0.30);
        }
    });

    const downsideExposurePct = totalValue > 0 ? (totalDownsideRisk / totalValue) * 100 : 0;
    const stopLossCoverageRatio = openPositions.length > 0 ? (positionsWithStopLoss / openPositions.length) * 100 : 0;

    // Balanced Score Logic
    let downsideScore = 50 + (stopLossCoverageRatio * 0.4) - (downsideExposurePct * 1.2);
    downsideScore = Math.min(100, Math.max(0, downsideScore));

    const downsideText = `Max risk: -${downsideExposurePct.toFixed(1)}%. SL Coverage: ${stopLossCoverageRatio.toFixed(0)}%.`;


    // 3. Plan Adherence
    // Now strictly based on the 'adheredToPlan' field in transactions
    const adheredCount = closedTrades.filter(tx => tx.adheredToPlan).length;
    const adherenceRate = closedTrades.length > 0 ? (adheredCount / closedTrades.length) * 100 : 0;
    const adherenceScore = adherenceRate;
    const adherenceText = `Followed plan in ${adherenceRate.toFixed(0)}% of trades.`;


    // 4. Win Quality + Loss Efficiency
    const winningTrades = closedTrades.filter(tx => tx.pnl > 0);
    const losingTrades = closedTrades.filter(tx => tx.pnl < 0);

    const avgWinRR = winningTrades.length > 0
        ? winningTrades.reduce((acc, tx) => acc + (tx.rr_ratio || 0), 0) / winningTrades.length
        : 0;
    const winQualityScore = Math.min(100, avgWinRR * 35);

    let totalActualLoss = 0;
    let totalPotentialLoss = 0;

    losingTrades.forEach(tx => {
        totalActualLoss += Math.abs(tx.pnl);
        // Use potentialMaxLoss if available, else estimate
        const potential = tx.potentialMaxLoss ? Math.abs(tx.potentialMaxLoss) : Math.abs(tx.pnl * 1.3);
        totalPotentialLoss += potential;
    });

    const lossEfficiency = totalPotentialLoss > 0
        ? ((totalPotentialLoss - totalActualLoss) / totalPotentialLoss) * 100
        : 0;

    const performanceScore = (winQualityScore * 0.5) + (lossEfficiency * 0.5);
    const performanceText = `Avg Win R/R: ${avgWinRR.toFixed(2)}. Stops saved ${lossEfficiency.toFixed(0)}% loss.`;


    return {
        overallScore: (concentrationScore + downsideScore + adherenceScore + performanceScore) / 4,
        metrics: [
            {
                name: 'Concentration',
                score: concentrationScore,
                text: concentrationText,
                color: getScoreColor(concentrationScore),
                details: { label: 'Top Asset', value: concentratedAsset }
            },
            {
                name: 'Downside Risk',
                score: downsideScore,
                text: downsideText,
                color: getScoreColor(downsideScore),
                details: {
                    exposure: `-$${totalDownsideRisk.toFixed(0)}`,
                    exposurePct: `${downsideExposurePct.toFixed(1)}%`,
                    coverage: `${stopLossCoverageRatio.toFixed(0)}%`
                }
            },
            {
                name: 'Discipline',
                score: adherenceScore,
                text: adherenceText,
                color: getScoreColor(adherenceScore),
                details: { label: 'Adherence', value: `${adherenceRate.toFixed(0)}%` }
            },
            {
                name: 'Win Quality',
                score: performanceScore,
                text: performanceText,
                color: getScoreColor(performanceScore),
                details: {
                    avgWinRR: avgWinRR.toFixed(2),
                    lossEfficiency: `${lossEfficiency.toFixed(0)}%`
                }
            }
        ]
    };
};

export const identifyRiskAssets = (openPositions, currentPrices) => {
    return openPositions.map(tx => {
        const asset = tx.asset;
        const currentPrice = currentPrices[asset]?.price || tx.price || 0;
        const entryPrice = tx.price || currentPrice;

        let pnlPct = 0;
        if (entryPrice > 0) {
            pnlPct = ((currentPrice - entryPrice) / entryPrice) * 100;
        }

        // Mock PnL logic for demo consistency if prices are static
        // But ideally we rely on real price diff if available
        if (tx.hasSL !== undefined && currentPrice === tx.price) {
            const seed = asset.charCodeAt(0);
            pnlPct = (seed % 24) - 12;
        }

        const risks = [];

        if (pnlPct > 15) {
            risks.push({
                type: 'profit_taking',
                level: 'warning',
                message: `${asset} (+${pnlPct.toFixed(1)}%) approaching profit zone.`
            });
        } else if (pnlPct < -8) {
            risks.push({
                type: 'stop_loss',
                level: 'danger',
                message: `${asset} (${pnlPct.toFixed(1)}%) near stop loss.`
            });
        }

        // Mock Behavioral Alerts based on asset name
        if (asset === 'SOL') {
            risks.push({
                type: 'behavior',
                level: 'info',
                message: `History: You often exit ${asset} too early.`
            });
        }

        return {
            asset,
            currentPrice,
            pnlPct,
            risks
        };
    }).filter(item => item.risks.length > 0);
};

export const calculateAssetStats = (history) => {
    const stats = {};
    history.forEach(tx => {
        if (!stats[tx.asset]) {
            stats[tx.asset] = { wins: 0, total: 0, totalPnL: 0, totalRR: 0 };
        }
        stats[tx.asset].total++;
        stats[tx.asset].totalPnL += (tx.pnl || 0);
        stats[tx.asset].totalRR += (tx.rr_ratio || 0);
        if ((tx.pnl || 0) > 0) stats[tx.asset].wins++;
    });

    Object.keys(stats).forEach(asset => {
        const s = stats[asset];
        s.winRate = (s.wins / s.total) * 100;
        s.avgRR = s.totalRR / s.total;
    });

    return stats;
};

const determineTradingStyle = (trades) => {
    if (trades.length === 0) return 'New Trader';
    return 'Swing Trader';
};

const getTopAssets = (stats) => {
    return Object.entries(stats)
        .map(([asset, data]) => ({ asset, ...data }))
        .sort((a, b) => b.winRate - a.winRate)
        .slice(0, 3);
};

const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
};

// Legacy support
export const getTradeDiagnosis = (newTransaction, overview) => {
    return {
        riskLevel: 'Medium',
        advice: ["Historical Win Rate: 65% on BTC breakouts."],
        similarTradesStats: { winRate: 55, count: 12, avgRR: 2.1 },
        structureCheck: { hasStopLoss: true, hasTakeProfit: true, hasExitLogic: true }
    };
};

export const getCachedOverview = () => {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < CACHE_TTL) return parsed.data;
        return null;
    } catch (e) { return null; }
};

export const cacheOverview = (data) => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data }));
};

export const clearOverviewCache = () => {
    localStorage.removeItem(CACHE_KEY);
};
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
        // Ensure we map the correct fields from the raw API data
        // API usually returns: favorite_count, retweet_count, reply_count OR likes, retweets, replies depending on normalization
        // We'll assume the service layer might normalize, but let's handle both just in case
        const sortedTweets = [...socialData].sort((a, b) => {
            const likesA = a.likes || a.favorite_count || 0;
            const likesB = b.likes || b.favorite_count || 0;
            return likesB - likesA;
        });

        const topTweet = sortedTweets[0];
        const topTweetText = topTweet?.text?.toLowerCase() || '';
        const topTweetLikes = topTweet?.likes || topTweet?.favorite_count || 0;

        // Prepare top 5 tweets for display with links and REAL metrics
        const displayTweets = sortedTweets.slice(0, 5).map(t => ({
            text: t.text,
            sentiment: t.sentiment || 'neutral',
            likes: t.likes || t.favorite_count || 0,
            retweets: t.retweets || t.retweet_count || 0,
            replies: t.replies || t.reply_count || 0,
            timestamp: t.timestamp || t.created_at || new Date().toISOString(),
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
        const isViral = topTweetLikes > 1000;
        const isFear = topTweetText.includes('panic') || topTweetText.includes('sell') || topTweetText.includes('dump') || topTweetText.includes('crash');
        const isHype = topTweetText.includes('moon') || topTweetText.includes('gem') || topTweetText.includes('send it') || topTweetText.includes('breakout');
        const isTech = topTweetText.includes('upgrade') || topTweetText.includes('mainnet') || topTweetText.includes('release') || topTweetText.includes('dev');

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
            reasoning = `Viral tweet detected with ${topTweetLikes} likes.`;
            stance = 'BULLISH';
            category = 'Social';
            importance = 60 + (topTweetLikes / 500);
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
        } else if (isTech) {
            headline = `${asset} dev activity and upgrade news driving conversation.`;
            reasoning = "Discussions focused on technical updates and mainnet releases.";
            stance = 'BULLISH';
            category = 'Fundamental';
            importance = 70;
        } else {
            // Default / General Buzz - More granular
            const bullishCount = socialData.filter(t => t.sentiment === 'bullish').length;
            const bearishCount = socialData.filter(t => t.sentiment === 'bearish').length;
            const ratio = bearishCount > 0 ? bullishCount / bearishCount : bullishCount;

            if (ratio > 2) {
                headline = `Traders discussing bounce from support and improved performance for ${asset}.`;
                stance = 'BULLISH';
                importance = 50 + (tweetCount);
            } else if (ratio < 0.5) {
                headline = `Debate between bulls and bears calling local top for ${asset}; sentiment mixed.`;
                stance = 'BEARISH';
                importance = 50 + (tweetCount);
            } else {
                headline = `Low-key chatter focused on liquidity conditions and flows for ${asset}.`;
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

export const generateDailySummary = (events, socialData) => {
    // Generate 3-4 bullet points mixing Market and Narrative signals
    const summary = [];

    // 1. Top Risk Event
    const riskEvent = events.find(e => e.impact === 'negative' && e.importance > 70);
    if (riskEvent) {
        summary.push({
            text: `${riskEvent.asset} approaching stop-loss levels with increased fear chatter.`,
            color: 'red'
        });
    }

    // 2. Top Opportunity/Momentum
    const oppEvent = events.find(e => e.impact === 'positive' && e.category === 'Price' && e.importance > 70);
    if (oppEvent) {
        summary.push({
            text: `${oppEvent.asset} showing strong intraday momentum with multiple traders discussing breakout.`,
            color: 'green'
        });
    }

    // 3. Top Narrative/Sentiment
    const narrativeEvent = events.find(e => e.isNarrative && e.importance > 60 && e.asset !== (riskEvent?.asset) && e.asset !== (oppEvent?.asset));
    if (narrativeEvent) {
        summary.push({
            text: `${narrativeEvent.headline}`,
            color: narrativeEvent.stance === 'BULLISH' ? 'blue' : 'yellow'
        });
    }

    // 4. General Market State (Fallback or additional)
    if (summary.length < 3) {
        const totalTweets = socialData.length;
        const bearishTweets = socialData.filter(t => t.sentiment === 'bearish').length;
        const sentimentRatio = totalTweets > 0 ? bearishTweets / totalTweets : 0;

        if (sentimentRatio > 0.6) {
            summary.push({ text: "Broader market sentiment is cautious; risk-off chatter dominating.", color: 'red' });
        } else if (sentimentRatio < 0.3) {
            summary.push({ text: "Overall sentiment remains optimistic with focus on altcoin rotation.", color: 'green' });
        } else {
            summary.push({ text: "No major risks detected across stablecoins; chatter is low and neutral.", color: 'gray' });
        }
    }

    return summary.slice(0, 4);
};

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
        details: riskEvents.map(e => ({ label: e.asset, value: e.type })), // Expanded details
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
        details: oppEvents.map(e => ({ label: e.asset, value: `${e.importance}% Score` })),
        hasData: !!topOpp
    };

    // 3. Sentiment Widget Data
    const bullishCount = socialData.filter(t => t.sentiment === 'bullish').length;
    const bearishCount = socialData.filter(t => t.sentiment === 'bearish').length;
    const highEngagementCount = socialData.filter(t => (t.likes || t.favorite_count) > 20).length;
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
        details: [
            { label: 'Bullish Tweets', value: bullishCount },
            { label: 'Bearish Tweets', value: bearishCount },
            { label: 'Viral Posts', value: highEngagementCount }
        ],
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
        details: [
            { label: '24h Change', value: `${change24h.toFixed(2)}%` },
            { label: 'AI Score', value: maxScore.toFixed(0) }
        ],
        trailing: {
            change24h: `${change24h > 0 ? '+' : ''}${change24h.toFixed(1)}%`,
            trend7d: '↗ Moderate uptrend'
        },
        symbol: bestAsset,
        scores: {
            performance: 82,
            liquidity: 75,
            sentiment: 68
        },
        drivers: [
            `Strong upward momentum ${change24h > 0 ? '+' : ''}${change24h.toFixed(1)}%`,
            'Rising on-chain mentions',
            'Stable liquidity improving'
        ],
        hasData: true
    };

    return {
        risk: riskData,
        opp: oppData,
        sentiment: sentimentData,
        topAsset: topAssetData
    };
};
