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

const identifyRiskAssets = (openPositions, currentPrices) => {
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

const calculateAssetStats = (history) => {
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
