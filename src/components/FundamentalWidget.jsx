import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Tag, Activity, Layers, Plus, X, Sparkles, DollarSign } from 'lucide-react';
import { getTokenFundamentals } from '../services/fundamentalService';
import { getTrackedFeed } from '../services/socialService';
import { getCoinMetadata } from '../services/coinGeckoApi';
import { generateFundamentalAnalysis } from '../services/geminiService';

const FundamentalWidget = ({ symbol, name }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showFullSummary, setShowFullSummary] = useState(false);

    // AI Analysis State
    const [aiAnalysis, setAiAnalysis] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);



    useEffect(() => {
        let mounted = true;

        // Reset state immediately on symbol change
        setData(null);
        setAiAnalysis(null);
        setLoading(true);

        const fetchData = async (forceRefresh = false) => {
            if (!symbol) return;

            try {
                // 1. Fetch Fundamentals
                const result = await getTokenFundamentals(symbol, name, forceRefresh);

                if (mounted && result) {
                    setData(result);

                    // 2. Check Cache for AI Analysis
                    const cacheKey = `fundamental_analysis_v3_${symbol}`;
                    const cachedAnalysis = localStorage.getItem(cacheKey);
                    let analysisData = null;

                    if (!forceRefresh && cachedAnalysis) {
                        try {
                            const { timestamp, data } = JSON.parse(cachedAnalysis);
                            // 1 Hour Cache TTL
                            if (Date.now() - timestamp < 60 * 60 * 1000) {
                                console.log(`[FundamentalWidget] Using cached AI analysis for ${symbol}`);
                                analysisData = data;
                                setAiAnalysis(data);
                            }
                        } catch (e) {
                            console.warn("Invalid cache for analysis", e);
                        }
                    }

                    // 3. Trigger AI Analysis if no cache
                    if (!analysisData) {
                        setAnalyzing(true);

                        // Fetch Social Context
                        let socialContext = [];
                        try {
                            const metadata = await getCoinMetadata(symbol);
                            const projectHandle = metadata?.twitter_screen_name;
                            if (projectHandle) {
                                const feed = await getTrackedFeed(symbol, projectHandle, name);
                                socialContext = feed.slice(0, 10);
                            }
                        } catch (e) {
                            console.warn("Failed to fetch social context", e);
                        }

                        // Generate Analysis
                        const analysis = await generateFundamentalAnalysis(symbol, result, socialContext);

                        if (mounted) {
                            setAiAnalysis(analysis);
                            setAnalyzing(false);

                            // Save to Cache
                            if (analysis && analysis.verdict) {
                                localStorage.setItem(cacheKey, JSON.stringify({
                                    timestamp: Date.now(),
                                    data: analysis
                                }));
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to fetch fundamentals", err);
                if (mounted) setAnalyzing(false);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchData();

        return () => { mounted = false; };
    }, [symbol, name]);



    // Always render the widget structure to prevent layout shifts
    if (loading && !data) {
        return (
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 min-h-[180px] flex items-center justify-center w-full">
                <div className="text-slate-500 text-xs flex items-center gap-2">
                    <Activity size={14} className="animate-spin" /> Loading Fundamentals...
                </div>
            </div>
        );
    }

    const { valuation, growth, revenue, benchmarks } = data || {};

    // Helper to format large numbers
    const formatMoney = (num) => {
        if (!num) return '$0';
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        return `$${num.toLocaleString()}`;
    };

    return (
        <div className="card-auto flex flex-col w-full">
            <div className="flex flex-col gap-4 p-4">
                {/* 1. Fundamental Stats (Compact Grid) */}
                <div className="grid grid-cols-2 gap-2">
                    {/* Market Cap */}
                    <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-2 flex flex-col justify-center items-center text-center">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">M. Cap</span>
                        <span className="text-sm font-bold text-white tracking-tight">
                            {valuation ? formatMoney(valuation.mcap) : '-'}
                        </span>
                    </div>

                    {/* FDV */}
                    <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-2 flex flex-col justify-center items-center text-center">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">FDV</span>
                        <span className="text-sm font-bold text-white tracking-tight">
                            {valuation ? formatMoney(valuation.fdv) : '-'}
                        </span>
                    </div>

                    {/* TVL */}
                    <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-2 flex flex-col justify-center items-center text-center">
                        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">TVL</span>
                        <span className="text-sm font-bold text-white tracking-tight">
                            {growth ? formatMoney(growth.tvl_current) : '-'}
                        </span>
                        {benchmarks?.medianFdvTvl && valuation?.fdv && growth?.tvl_current && (
                            <span className="text-[9px] text-slate-500 mt-1">
                                Ratio: {(valuation.fdv / growth.tvl_current).toFixed(2)} (Ind: {benchmarks.medianFdvTvl.toFixed(2)})
                            </span>
                        )}
                    </div>

                    {/* Revenue (Conditional) */}
                    {revenue && revenue.annualized > 0 ? (
                        <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-2 flex flex-col justify-center items-center text-center">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Revenue (Est)</span>
                            <span className="text-sm font-bold text-emerald-400 tracking-tight">
                                {formatMoney(revenue.annualized)}
                            </span>
                            {benchmarks?.medianFdvRev && valuation?.fdv && (
                                <span className="text-[9px] text-slate-500 mt-1">
                                    P/S: {(valuation.fdv / revenue.annualized).toFixed(1)}x (Ind: {benchmarks.medianFdvRev.toFixed(1)}x)
                                </span>
                            )}
                        </div>
                    ) : (
                        <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-2 flex flex-col justify-center items-center text-center">
                            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Revenue</span>
                            <span className="text-xs text-slate-600 italic">N/A</span>
                        </div>
                    )}
                </div>



                {/* 3. AI Insights & What It Does */}
                <div className="flex flex-col gap-2">
                    <div className="text-xs font-bold tracking-wide text-purple-400 uppercase flex items-center gap-1 px-1">
                        <Sparkles size={12} /> AI Insights
                    </div>
                    <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-3">
                        {analyzing ? (
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Sparkles size={12} className="animate-pulse" /> Analyzing Valuation & Growth...
                            </div>
                        ) : aiAnalysis ? (
                            <div className="flex flex-col gap-3">
                                {/* What It Does */}
                                {aiAnalysis.projectDescription && (
                                    <div>
                                        <h4 className="text-[10px] text-slate-400 uppercase font-bold tracking-wider mb-1">What It Does</h4>
                                        <p className="text-xs text-slate-300 leading-relaxed">
                                            {aiAnalysis.projectDescription}
                                        </p>
                                    </div>
                                )}

                                {/* Verdict */}
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Verdict:</h4>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${aiAnalysis.verdict === 'Undervalued' ? 'bg-emerald-500/20 text-emerald-400' :
                                            aiAnalysis.verdict === 'Overvalued' ? 'bg-rose-500/20 text-rose-400' :
                                                'bg-yellow-500/20 text-yellow-400'
                                            }`}>
                                            {aiAnalysis.verdict}
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-300 italic leading-relaxed">
                                        "{aiAnalysis.reasoning}"
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500 italic">Analysis unavailable.</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FundamentalWidget;
