import React, { useState, useEffect, useCallback } from 'react';
import { Layers, Sparkles, Activity, RefreshCw, Plus, X, Tag } from 'lucide-react';
import { getTokenFundamentals } from '../services/fundamentalService';
import { getTrackedFeed } from '../services/socialService';
import { getCoinMetadata } from '../services/coinGeckoApi';
import { translateText } from '../services/translationService';
import { useLanguage } from '../context/LanguageContext';

// Debounce helper
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

// Helper to format large numbers
const formatMoney = (num) => {
    if (!num) return '-';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(1)}K`;
    return `$${num.toLocaleString()}`;
};

// Stat Card Component
const StatCard = ({ label, value, subValue, change, changeLabel }) => (
    <div className="relative group">
        {/* Glow effect */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 rounded-xl blur opacity-0 group-hover:opacity-100 transition duration-500" />
        <div className="relative flex flex-col rounded-xl border border-white/[0.08] bg-slate-900/80 backdrop-blur-sm overflow-hidden">
            {/* Header */}
            <div className="px-4 py-2 border-b border-white/[0.05] bg-gradient-to-r from-slate-800/50 to-slate-800/30">
                <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{label}</span>
            </div>
            {/* Value */}
            <div className="px-4 py-3 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-white tracking-tight font-mono">{value}</span>
                {subValue && (
                    <span className="text-[10px] text-slate-500 mt-0.5">{subValue}</span>
                )}
                {change !== undefined && change !== null && (
                    <span className={`text-[10px] font-bold mt-1 ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {change >= 0 ? '+' : ''}{change.toFixed(1)}% {changeLabel || ''}
                    </span>
                )}
            </div>
        </div>
    </div>
);

const FundamentalWidget = React.memo(({ symbol, name, embedded = false, onAnalysisComplete }) => {
    const { t, language } = useLanguage();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [customTags, setCustomTags] = useState([]);
    const [newTag, setNewTag] = useState('');
    const [isAddingTag, setIsAddingTag] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [aiAnalysis, setAiAnalysis] = useState(null);
    const [translatedAnalysis, setTranslatedAnalysis] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const debouncedSymbol = useDebounce(symbol, 1000);

    // Translation Effect
    useEffect(() => {
        const translateAnalysis = async () => {
            if (!aiAnalysis || language !== 'zh-TW') {
                setTranslatedAnalysis(null);
                return;
            }

            // Simple dedupe check
            if (translatedAnalysis && translatedAnalysis.timestamp === aiAnalysis.timestamp) return;

            const newAnalysis = { ...aiAnalysis };

            if (newAnalysis.whatItDoes) {
                newAnalysis.whatItDoes = await translateText(newAnalysis.whatItDoes, 'zh-TW');
            }
            if (newAnalysis.verdictReasoning) {
                newAnalysis.verdictReasoning = await translateText(newAnalysis.verdictReasoning, 'zh-TW');
            }

            setTranslatedAnalysis(newAnalysis);
        };
        translateAnalysis();
    }, [aiAnalysis, language]);

    const displayAnalysis = (language === 'zh-TW' && translatedAnalysis) ? translatedAnalysis : aiAnalysis;

    // Load custom tags from local storage
    useEffect(() => {
        const savedTags = localStorage.getItem(`custom_tags_${symbol}`);
        if (savedTags) {
            setCustomTags(JSON.parse(savedTags));
        } else {
            setCustomTags([]);
        }
    }, [symbol]);

    const fetchData = useCallback(async (forceRefresh = false) => {
        if (!debouncedSymbol) return;
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            const result = await getTokenFundamentals(debouncedSymbol, name, forceRefresh);
            if (result) {
                setData(result);
                setLastUpdated(new Date());
                const savedTags = localStorage.getItem(`custom_tags_${debouncedSymbol}`);
                if (!savedTags && result?.tags) {
                    setCustomTags(result.tags);
                    localStorage.setItem(`custom_tags_${debouncedSymbol}`, JSON.stringify(result.tags));
                }

                // AI Analysis
                setAnalyzing(true);
                let socialContext = [];
                try {
                    const metadata = await getCoinMetadata(debouncedSymbol);
                    const projectHandle = metadata?.twitter_screen_name;
                    const feed = await getTrackedFeed(debouncedSymbol, [], projectHandle, name, forceRefresh);
                    socialContext = feed.slice(0, 10);
                } catch (e) {
                    console.warn("Failed to fetch social context", e);
                }

                import('../services/geminiService').then(async ({ generateFundamentalAnalysis }) => {
                    const analysis = await generateFundamentalAnalysis(debouncedSymbol, result, socialContext);
                    setAiAnalysis(analysis);
                    setAnalyzing(false);
                    if (onAnalysisComplete) {
                        onAnalysisComplete({ fundamental: result, analysis, socialContext });
                    }
                });
            }
        } catch (err) {
            console.error("Failed to fetch fundamentals", err);
            setAnalyzing(false);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [debouncedSymbol, name, onAnalysisComplete]);

    useEffect(() => {
        if (debouncedSymbol) {
            setData(null);
            setAiAnalysis(null);
            fetchData(false);
        }
    }, [fetchData, debouncedSymbol]);

    const handleRefresh = () => fetchData(true);

    const handleAddTag = (e) => {
        e.preventDefault();
        if (newTag.trim()) {
            const updatedTags = [...customTags, newTag.trim()];
            setCustomTags(updatedTags);
            localStorage.setItem(`custom_tags_${symbol}`, JSON.stringify(updatedTags));
            setNewTag('');
            setIsAddingTag(false);
        }
    };

    const handleRemoveTag = (tagToRemove) => {
        const updatedTags = customTags.filter(t => t !== tagToRemove);
        setCustomTags(updatedTags);
        localStorage.setItem(`custom_tags_${symbol}`, JSON.stringify(updatedTags));
    };

    const translateVerdict = (verdict) => {
        if (!verdict) return verdict;
        return t(`verdict_${verdict.toLowerCase().replace(' ', '_')}`);
    };

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-3 text-slate-500">
                    <Activity size={16} className="animate-spin" />
                    <span className="text-sm">{t('loadingFundamentals')}</span>
                </div>
            </div>
        );
    }

    const { valuation, growth, benchmarks } = data || {};

    return (
        <div className={`${embedded ? 'w-full' : 'asset-card w-full'} space-y-5`}>
            {/* Header (non-embedded) */}
            {!embedded && (
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Layers size={18} className="text-indigo-400" />
                        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">{t('fundamentalIntelligence')}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {lastUpdated && (
                            <span className="text-[10px] text-slate-500 font-mono">
                                {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className={`p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white transition-colors ${refreshing ? 'animate-spin text-indigo-400' : ''}`}
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3">
                <StatCard
                    label={t('marketCap')}
                    value={valuation ? formatMoney(valuation.mcap) : '-'}
                />
                <StatCard
                    label={t('fdv')}
                    value={valuation ? formatMoney(valuation.fdv) : '-'}
                />
                <StatCard
                    label={t('tvl')}
                    value={growth ? formatMoney(growth.tvl_current) : '-'}
                    change={growth?.tvl_30d_change_percent}
                    changeLabel="30d"
                />
            </div>

            {/* AI Insights Section */}
            <div className="relative">
                {/* Section Header */}
                <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center gap-2">
                        <Sparkles size={14} className="text-purple-400" />
                        <span className="text-xs font-bold text-purple-400 uppercase tracking-wider">{t('aiInsights')}</span>
                    </div>
                    {analyzing && (
                        <span className="text-[10px] text-slate-500 animate-pulse">{t('analyzing')}...</span>
                    )}
                </div>

                {/* Content */}
                <div className="rounded-xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 p-4">
                    {analyzing ? (
                        <div className="flex items-center justify-center py-4">
                            <Sparkles size={16} className="animate-pulse text-purple-400 mr-2" />
                            <span className="text-sm text-slate-400">{t('analyzingValuation')}</span>
                        </div>
                    ) : displayAnalysis ? (
                        <div className="space-y-4">
                            {/* What it Does */}
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{t('whatItDoes')}</h4>
                                <p className="text-sm text-slate-200 leading-relaxed">{displayAnalysis.whatItDoes}</p>
                            </div>

                            {/* Verdict */}
                            <div className="pt-3 border-t border-white/10">
                                <div className="flex items-center gap-3 mb-2">
                                    <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('verdict')}</h4>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${displayAnalysis.verdict === 'Undervalued' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                        displayAnalysis.verdict === 'Overvalued' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                                            'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                        }`}>
                                        {translateVerdict(displayAnalysis.verdict)}
                                    </span>
                                </div>
                                <p className="text-sm text-slate-300 leading-relaxed italic">
                                    "{displayAnalysis.verdictReasoning}"
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4 text-slate-500 text-sm">
                            {t('noAiAnalysis')}
                        </div>
                    )}
                </div>
            </div>

            {/* Tags Section */}
            <div>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Tag size={12} className="text-slate-500" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('tags')}</span>
                    </div>
                    {!isAddingTag && (
                        <button
                            onClick={() => setIsAddingTag(true)}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                            <Plus size={12} /> {t('add')}
                        </button>
                    )}
                </div>

                <div className="flex flex-wrap gap-2">
                    {customTags.map((tag, i) => (
                        <span
                            key={i}
                            className="group inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 border border-slate-700 px-3 py-1 text-xs text-slate-300"
                        >
                            {tag}
                            <button
                                onClick={() => handleRemoveTag(tag)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-500 hover:text-rose-400"
                            >
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                    {customTags.length === 0 && !isAddingTag && (
                        <span className="text-[11px] text-slate-500 italic">{t('noTags')}</span>
                    )}
                </div>

                {isAddingTag && (
                    <form onSubmit={handleAddTag} className="mt-2 flex items-center gap-2">
                        <input
                            type="text"
                            value={newTag}
                            onChange={(e) => setNewTag(e.target.value)}
                            placeholder={t('enterTag')}
                            className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                            autoFocus
                        />
                        <button type="submit" className="px-3 py-1.5 text-xs rounded-lg bg-indigo-500 text-white hover:bg-indigo-600">
                            {t('add')}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsAddingTag(false); setNewTag(''); }}
                            className="p-1.5 text-slate-500 hover:text-white"
                        >
                            <X size={14} />
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
});

export default FundamentalWidget;
