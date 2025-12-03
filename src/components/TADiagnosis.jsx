import React, { useState, useEffect } from 'react';
import { analyzeTechnicals } from '../services/technicalService';
import { Activity, Sparkles, X, AlertCircle } from 'lucide-react';

const TADiagnosis = ({ symbol, currentPrice, iconUrl, autoRun = false }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);

    // Auto-run effect
    useEffect(() => {
        if (autoRun && symbol && currentPrice && !result && !loading) {
            handleAnalyze();
        }
    }, [autoRun, symbol, currentPrice]);

    const handleAnalyze = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await analyzeTechnicals(symbol, currentPrice);

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
                onClick={handleAnalyze}
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
                    onClick={handleAnalyze}
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
        <div className="ta-card p-0 overflow-hidden flex flex-col gap-0">
            {/* 1. Header Section */}
            <div className="p-2 border-b border-gray-700/50 flex justify-end items-center bg-gray-800/30">
                <div className="flex flex-col items-end gap-2">
                    <button onClick={() => setResult(null)} className="text-gray-500 hover:text-white transition-colors p-1">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* 2. Verdict Section (Main Focus) */}
            <div className="p-4 flex items-center justify-center gap-8 bg-gradient-to-b from-gray-800/20 to-transparent">
                {/* Gauge */}
                <div className="relative w-24 h-24">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle
                            cx="48"
                            cy="48"
                            r="42"
                            stroke="currentColor"
                            strokeWidth="6"
                            fill="transparent"
                            className="text-gray-700"
                        />
                        <circle
                            cx="48"
                            cy="48"
                            r="42"
                            stroke="currentColor"
                            strokeWidth="6"
                            fill="transparent"
                            strokeDasharray={263.89}
                            strokeDashoffset={263.89 - (263.89 * result.score) / 100}
                            className={`${getGaugeColor(result.score)} transition-all duration-1000 ease-out`}
                            strokeLinecap="round"
                        />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className={`text-2xl font-bold ${getScoreColor(result.score)}`}>
                            {result.score}
                        </span>
                    </div>
                </div>

                {/* Verdict Text */}
                <div className="flex flex-col">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500 font-bold uppercase tracking-wider">Verdict</span>
                        {result.dataSource && (
                            <span className="text-[10px] text-gray-600 font-mono">
                                via {result.dataSource}
                            </span>
                        )}
                    </div>
                    <h1 className={`text-3xl font-black tracking-tight ${getScoreColor(result.score)}`}>
                        {result.action.toUpperCase()}
                    </h1>
                </div>
            </div>

            {/* 3. Indicators Section (Horizontal Cards) */}
            <div className="px-4 pb-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-bold uppercase">RSI (1H)</span>
                    <div className="flex items-center gap-2">
                        <span className={`text-lg font-mono font-bold ${result.indicators.rsi > 70 ? 'text-rose-400' : result.indicators.rsi < 30 ? 'text-emerald-400' : 'text-white'}`}>
                            {result.indicators.rsi?.toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-500">—</span>
                        <span className="text-xs text-gray-300 font-medium">
                            {result.indicators.rsi > 70 ? 'Overbought' : result.indicators.rsi < 30 ? 'Oversold' : 'Neutral'}
                        </span>
                    </div>
                </div>
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-bold uppercase">MACD</span>
                    <span className={`text-sm font-bold ${result.indicators.macd > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {result.indicators.macd > 0 ? 'BULL TREND' : 'BEAR TREND'}
                    </span>
                </div>
            </div>

            {/* 4. Trading Setup (Tables) */}
            <div className="p-4 space-y-4">
                {/* Short Term */}
                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                        Short Term ({result.levels?.shortTerm?.timeframe || '4H'})
                    </h4>
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
                                    <td className="py-2 px-3 text-gray-300">Support <span className="text-[10px] text-emerald-500 opacity-75">(Buy)</span></td>
                                    <td className="py-2 px-3 text-right font-mono font-medium text-emerald-400">
                                        ${result.levels?.shortTerm?.support?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-3 text-gray-300">Resistance <span className="text-[10px] text-rose-500 opacity-75">(Sell)</span></td>
                                    <td className="py-2 px-3 text-right font-mono font-medium text-rose-400">
                                        ${result.levels?.shortTerm?.resistance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-3 text-gray-400">Stop Loss</td>
                                    <td className="py-2 px-3 text-right font-mono text-gray-400">
                                        ${result.levels?.shortTerm?.stop?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                                <tr>
                                    <td className="py-2 px-3 text-gray-400">Target</td>
                                    <td className="py-2 px-3 text-right font-mono text-emerald-400/80">
                                        ${result.levels?.shortTerm?.target?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Long Term */}
                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                        Long Term ({result.levels?.longTerm?.timeframe || '1D'})
                    </h4>
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

            {/* 5. AI Insights (Bullets) */}
            <div className="px-4 pb-4">
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3">
                    <h4 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Sparkles size={10} /> AI Insights
                    </h4>
                    <ul className="space-y-1.5">
                        {pro.insights.length > 0 ? pro.insights.map((insight, idx) => (
                            <li key={idx} className="text-xs text-gray-300 flex items-start gap-2 leading-relaxed">
                                <span className="mt-1.5 w-1 h-1 rounded-full bg-indigo-400 flex-shrink-0"></span>
                                {insight}
                            </li>
                        )) : (
                            <li className="text-xs text-gray-500 italic">No specific insights generated.</li>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default TADiagnosis;
