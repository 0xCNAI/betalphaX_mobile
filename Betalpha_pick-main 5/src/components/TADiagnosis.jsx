import React, { useState, useEffect } from 'react';
import { analyzeTechnicals } from '../services/technicalService';
import { translateText } from '../services/translationService';
import { Activity, Sparkles, X, AlertCircle, RefreshCw, TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const TADiagnosis = ({ symbol, currentPrice, iconUrl, autoRun = false, embedded = false, onAnalysisComplete }) => {
    const { t, language } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [showAllInsights, setShowAllInsights] = useState(true);
    const [translatedInsights, setTranslatedInsights] = useState(null);

    // Translation Effect
    useEffect(() => {
        const translateInsights = async () => {
            if (!result || language !== 'zh-TW') {
                setTranslatedInsights(null);
                return;
            }

            const insights = result.proAnalysis?.insights || [];
            if (insights.length === 0) return;

            // Deduplicate by length and content check if needed, but array comparison is hard
            const translated = await Promise.all(insights.map(i => translateText(i, 'zh-TW')));
            setTranslatedInsights(translated);
        };
        translateInsights();
    }, [result, language]);

    const displayInsights = (language === 'zh-TW' && translatedInsights) ? translatedInsights : (result?.proAnalysis?.insights || []);

    useEffect(() => {
        if (autoRun && symbol && currentPrice && !result && !loading) {
            handleAnalyze();
        }
    }, [autoRun, symbol, currentPrice]);

    const handleAnalyze = async (forceRefresh = false) => {
        setLoading(true);
        setError(null);
        try {
            const data = await analyzeTechnicals(symbol, currentPrice, forceRefresh);
            if (!data) throw new Error('Analysis returned null/undefined');
            if (!data.score && data.score !== 0) throw new Error('Analysis failed: Score missing');
            if (!data.verdicts || !data.signals) throw new Error('Analysis failed: Incomplete data');

            setResult(data);
            setLastUpdated(new Date());
            if (onAnalysisComplete) onAnalysisComplete(data);
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

    const getScoreBg = (score) => {
        if (score >= 70) return 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30';
        if (score <= 40) return 'from-rose-500/20 to-rose-500/5 border-rose-500/30';
        return 'from-amber-500/20 to-amber-500/5 border-amber-500/30';
    };

    const getVerdictBadge = (verdict, type) => {
        const colors = {
            Bullish: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
            Bearish: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
            Neutral: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        };
        return colors[verdict] || colors.Neutral;
    };

    // Helper for translating dynamic values
    const translateVerdict = (verdict) => {
        if (!verdict) return verdict;
        return t(`verdict_${verdict.toLowerCase().replace(' ', '_')}`);
    };

    const translateAction = (action) => {
        if (!action) return action;
        return t(`action_${action.toLowerCase().replace(' ', '_')}`);
    };

    // Loading state
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="relative w-12 h-12">
                    <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-ping" />
                    <div className="absolute inset-0 rounded-full border-2 border-t-indigo-500 animate-spin" />
                </div>
                <span className="text-sm text-slate-400">{t('analyzingMarketData')}</span>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
                <AlertCircle size={24} className="text-rose-400" />
                <span className="text-sm text-rose-400">{error}</span>
                <button
                    onClick={() => handleAnalyze(true)}
                    className="px-4 py-2 text-xs rounded-lg border border-slate-700 text-slate-300 hover:bg-white/5"
                >
                    {t('retry')}
                </button>
            </div>
        );
    }

    // Initial state - no result yet
    if (!result) {
        return (
            <button
                onClick={() => handleAnalyze()}
                className="w-full py-4 flex items-center justify-center gap-2 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/5 rounded-xl border border-dashed border-indigo-500/30 transition-all"
            >
                <Sparkles size={18} className="animate-pulse" />
                <span className="font-medium">{t('runAiDiagnosis')}</span>
            </button>
        );
    }

    const pro = result?.proAnalysis || { insights: [] };

    return (
        <div className="flex flex-col gap-4 p-4">
            {/* Header Row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    {iconUrl ? (
                        <img src={iconUrl} alt={symbol} className="w-8 h-8 rounded-full" />
                    ) : (
                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                            {symbol[0]}
                        </div>
                    )}
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            {symbol} <span className="text-xs font-normal text-slate-500">/ USDT</span>
                        </h2>
                        <span className="text-[10px] text-indigo-400 uppercase tracking-wide">{t('proTechnicalAnalysis')}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {lastUpdated && (
                        <span className="text-[10px] text-slate-500 font-mono">
                            {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                    {result.dataSource && (
                        <span className="text-[10px] text-slate-600">{t('via')} {result.dataSource}</span>
                    )}
                    <button
                        onClick={() => handleAnalyze(true)}
                        className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
                    >
                        <RefreshCw size={14} />
                    </button>
                    {!embedded && (
                        <button
                            onClick={() => setResult(null)}
                            className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Score + Verdict Card */}
            <div className={`relative rounded-xl border bg-gradient-to-br ${getScoreBg(result.score)} p-4`}>
                <div className="flex items-center justify-center gap-4">
                    {/* Circular Score */}
                    <div className="relative w-16 h-16">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle cx="32" cy="32" r="28" strokeWidth="4" fill="transparent" className="stroke-slate-700/50" />
                            <circle
                                cx="32" cy="32" r="28" strokeWidth="4" fill="transparent"
                                strokeDasharray={175.93}
                                strokeDashoffset={175.93 - (175.93 * result.score) / 100}
                                className={`${result.score >= 70 ? 'stroke-emerald-400' : result.score <= 40 ? 'stroke-rose-400' : 'stroke-amber-400'} transition-all duration-1000`}
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className={`text-2xl font-black ${getScoreColor(result.score)}`}>{result.score}</span>
                        </div>
                    </div>
                    {/* Action Text */}
                    <div className="text-center">
                        <h1 className={`text-2xl font-black tracking-tight ${getScoreColor(result.score)}`}>
                            {translateAction(result.action).toUpperCase()}
                        </h1>
                    </div>
                </div>
            </div>

            {/* Key Levels - Compact */}
            <div className="grid grid-cols-2 gap-3">
                {/* Short Term */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            {t('shortTerm')}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getVerdictBadge(result.verdicts?.short)}`}>
                            {translateVerdict(result.verdicts?.short || 'Neutral')}
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 flex items-center gap-1"><TrendingDown size={10} className="text-emerald-400" /> {t('support')}</span>
                            <span className="font-mono font-medium text-emerald-400">
                                ${result.levels?.shortTerm?.support?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 flex items-center gap-1"><TrendingUp size={10} className="text-rose-400" /> {t('resistance')}</span>
                            <span className="font-mono font-medium text-rose-400">
                                ${result.levels?.shortTerm?.resistance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Long Term */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                            {t('longTerm')}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getVerdictBadge(result.verdicts?.long)}`}>
                            {translateVerdict(result.verdicts?.long || 'Neutral')}
                        </span>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 flex items-center gap-1"><TrendingDown size={10} className="text-emerald-400" /> {t('support')}</span>
                            <span className="font-mono font-medium text-emerald-400">
                                ${result.levels?.longTerm?.support?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-400 flex items-center gap-1"><TrendingUp size={10} className="text-rose-400" /> {t('resistance')}</span>
                            <span className="font-mono font-medium text-rose-400">
                                ${result.levels?.longTerm?.resistance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI Insights */}
            <div className="rounded-xl border border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles size={12} /> {t('aiInsights')}
                    </h4>
                    {pro.insights.length > 3 && (
                        <button
                            onClick={() => setShowAllInsights(!showAllInsights)}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                            {showAllInsights ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                            {showAllInsights ? t('collapse') : t('expand')}
                        </button>
                    )}
                </div>

                <ul className="space-y-2">
                    {(showAllInsights ? displayInsights.slice(0, -1) : displayInsights.slice(0, 2)).map((insight, idx) => (
                        <li key={idx} className="text-xs text-slate-300 flex items-start gap-2 leading-relaxed">
                            <span className="mt-1.5 w-1 h-1 rounded-full bg-indigo-400 flex-shrink-0" />
                            {insight}
                        </li>
                    ))}
                    {displayInsights.length === 0 && (
                        <li className="text-xs text-slate-500 italic">{t('noInsights')}</li>
                    )}
                </ul>

                {/* Conclusion */}
                {displayInsights.length > 0 && showAllInsights && (
                    <div className="mt-3 pt-3 border-t border-indigo-500/20">
                        <p className="text-xs text-indigo-200 font-medium leading-relaxed italic">
                            "{displayInsights[displayInsights.length - 1]}"
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TADiagnosis;
