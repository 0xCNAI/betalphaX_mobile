import React, { useState, useEffect } from 'react';
import { analyzeTechnicals } from '../services/technicalService';
import { Activity, Sparkles, X, AlertCircle, RefreshCw } from 'lucide-react';

const TADiagnosis = ({ symbol, currentPrice, iconUrl, autoRun = false }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Auto-run effect
    useEffect(() => {
        if (autoRun && symbol && currentPrice && !result && !loading) {
            handleAnalyze();
        }
    }, [autoRun, symbol, currentPrice]);

    const handleAnalyze = async (forceRefresh = false) => {
        console.log('[TADiagnosis] handleAnalyze called, forceRefresh:', forceRefresh);
        setLoading(true);
        setError(null);
        try {
            // Pass forceRefresh to service
            const data = await analyzeTechnicals(symbol, currentPrice, forceRefresh);

            if (!data) {
                throw new Error('Analysis returned null/undefined');
            }

            // Validate essential fields
            if (!data.score && data.score !== 0) {
                throw new Error('Analysis failed: Score missing');
            }
            if (!data.verdicts || !data.signals) {
                throw new Error('Analysis failed: Incomplete data');
            }

            setResult(data);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('[TADiagnosis] Error:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const getScoreColor = (score) => {
        if (score >= 70) return 'text-emerald-400';
        if (score <= 40) return 'text-rose-400';
        return 'text-amber-400';
    };

    const getGaugeColor = (score) => {
        if (score >= 70) return 'stroke-emerald-400';
        if (score <= 40) return 'stroke-rose-400';
        return 'stroke-amber-400';
    };

    if (!result && !loading) {
        // If autoRun is true, we show loading state (or nothing) instead of the button
        // because the effect will trigger loading immediately.
        if (autoRun) {
            return (
                <div className="ta-loading">
                    <div className="ta-loading-spinner"></div>
                    <span className="ta-loading-text">Initializing AI Diagnosis...</span>
                </div>
            );
        }

        return (
            <button
                onClick={() => handleAnalyze(false)}
                className="ta-trigger-btn"
            >
                <Sparkles size={18} className="animate-pulse" />
                <span>AI Diagnosis</span>
                <div className="ta-trigger-glow" />
            </button>
        );
    }

    if (loading) {
        return (
            <div className="ta-loading">
                <div className="ta-loading-spinner"></div>
                <span className="ta-loading-text">Analyzing Market Data...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="ta-error">
                <div className="ta-error-header">
                    <AlertCircle size={20} />
                    <span>Analysis Failed</span>
                </div>
                <p className="ta-error-msg">{error}</p>
                <button
                    onClick={() => handleAnalyze(true)}
                    className="ta-retry-btn"
                >
                    Retry Analysis
                </button>
            </div>
        );
    }

    // Pro Analysis Data (with fallback for older cache)
    const pro = result.proAnalysis || {
        setupQuality: 'N/A',
        primarySignal: 'N/A',
        marketStructure: 'N/A',
        riskRewardRatio: 0,
        volatility: 'Normal',
        insights: []
    };

    return (
        <div className="flex flex-col gap-4 w-full">
            {/* 1. Header Section */}
            <div className="p-4 border-b border-gray-700/50 flex justify-between items-start bg-gray-800/30 rounded-xl">
                <div className="flex items-center gap-3">
                    {iconUrl ? (
                        <img src={iconUrl} alt={symbol} className="w-10 h-10 rounded-full" />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 font-bold">
                            {symbol[0]}
                        </div>
                    )}
                    <div>
                        <h2 className="text-xl font-bold text-white leading-none flex items-center gap-2">
                            {symbol} <span className="text-sm font-normal text-gray-500">/ USDT</span>
                        </h2>
                        <span className="text-[10px] text-indigo-400 font-medium tracking-wide uppercase mt-1 block">
                            Pro Technical Analysis
                        </span>
                    </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                        {lastUpdated && (
                            <span className="text-[10px] text-gray-500 font-mono">
                                Updated: {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                        <button
                            onClick={() => handleAnalyze(true)}
                            disabled={loading}
                            className="text-gray-500 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
                            title="Refresh Analysis"
                        >
                            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                        </button>
                        <button onClick={() => setResult(null)} className="text-gray-500 hover:text-white transition-colors p-1 rounded hover:bg-white/5">
                            <X size={20} />
                        </button>
                    </div>
                    {result.dataSource && (
                        <span className="text-[10px] text-gray-500 font-mono">
                            via {result.dataSource}
                        </span>
                    )}
                </div>
            </div>

            {/* 2. Verdict Section (Compact) */}
            <div className="p-2 flex items-center justify-center gap-3 bg-white/[0.03] rounded-xl border border-white/[0.05]">
                {/* Gauge */}
                <div className="relative w-12 h-12">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="3"
                            fill="transparent"
                            className="text-gray-700"
                        />
                        <circle
                            cx="24"
                            cy="24"
                            r="20"
                            stroke="currentColor"
                            strokeWidth="3"
                            fill="transparent"
                            strokeDasharray={125.66}
                            strokeDashoffset={125.66 - (125.66 * result.score) / 100}
                            className={`${getGaugeColor(result.score)} transition-all duration-1000 ease-out`}
                            strokeLinecap="round"
                        />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-lg font-bold ${getScoreColor(result.score)}`}>
                            {result.score}
                        </span>
                    </div>
                </div>

                {/* Verdict Text */}
                <h1 className={`text-xl font-black tracking-tight ${getScoreColor(result.score)}`}>
                    {result.action.toUpperCase()}
                </h1>
            </div>

            {/* 3. Key Levels (Tables) */}
            <div className="space-y-4">
                {/* Short Term */}
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            Short term (1H)
                        </h4>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${result.verdicts?.short === 'Bullish' ? 'bg-emerald-500/10 text-emerald-400' :
                            result.verdicts?.short === 'Bearish' ? 'bg-rose-500/10 text-rose-400' :
                                'bg-yellow-500/10 text-yellow-400'
                            }`}>
                            {result.verdicts?.short || 'Neutral'}
                        </span>
                    </div>
                    <div className="bg-gray-800/20 border border-gray-700/30 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-800/50 text-left">
                                    <th className="py-2 px-3 text-[10px] uppercase text-gray-500 font-bold">Level</th>
                                    <th className="py-2 px-3 text-[10px] uppercase text-gray-500 font-bold text-right">Price</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/30">
                                <tr>
                                    <td className="py-2 px-3 text-gray-300">Support</td>
                                    <td className="py-2 px-3 text-right font-mono font-medium text-emerald-400">
                                        ${result.levels?.shortTerm?.support?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-3 text-gray-300">Resistance</td>
                                    <td className="py-2 px-3 text-right font-mono font-medium text-rose-400">
                                        ${result.levels?.shortTerm?.resistance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Long Term */}
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                            Long term (1D)
                        </h4>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${result.verdicts?.long === 'Bullish' ? 'bg-emerald-500/10 text-emerald-400' :
                            result.verdicts?.long === 'Bearish' ? 'bg-rose-500/10 text-rose-400' :
                                'bg-yellow-500/10 text-yellow-400'
                            }`}>
                            {result.verdicts?.long || 'Neutral'}
                        </span>
                    </div>
                    <div className="bg-gray-800/20 border border-gray-700/30 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-800/50 text-left">
                                    <th className="py-2 px-3 text-[10px] uppercase text-gray-500 font-bold">Level</th>
                                    <th className="py-2 px-3 text-[10px] uppercase text-gray-500 font-bold text-right">Price</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700/30">
                                <tr>
                                    <td className="py-2 px-3 text-gray-300">Support</td>
                                    <td className="py-2 px-3 text-right font-mono font-medium text-emerald-400">
                                        ${result.levels?.longTerm?.support?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-3 text-gray-300">Resistance</td>
                                    <td className="py-2 px-3 text-right font-mono font-medium text-rose-400">
                                        ${result.levels?.longTerm?.resistance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* 5. AI Insights (Bullets + Conclusion) */}
            <div>
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3">
                    <h4 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Sparkles size={10} /> AI Insights
                    </h4>

                    {/* Bullet Points (All except last) */}
                    <ul className="space-y-1.5 mb-3">
                        {pro.insights.length > 0 ? (
                            pro.insights.slice(0, -1).map((insight, idx) => (
                                <li key={idx} className="text-xs text-gray-300 flex items-start gap-2 leading-relaxed">
                                    <span className="mt-1.5 w-1 h-1 rounded-full bg-indigo-400 flex-shrink-0"></span>
                                    {insight}
                                </li>
                            ))
                        ) : (
                            <li className="text-xs text-gray-500 italic">No specific insights generated.</li>
                        )}
                    </ul>

                    {/* Conclusion (Last item) */}
                    {pro.insights.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-indigo-500/20">
                            <p className="text-xs text-indigo-200 font-medium leading-relaxed italic">
                                "{pro.insights[pro.insights.length - 1]}"
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TADiagnosis;
