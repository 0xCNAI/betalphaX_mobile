import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Tag, Activity, Layers, Plus, X, Sparkles } from 'lucide-react';
import { getTokenFundamentals } from '../services/fundamentalService';

const FundamentalWidget = ({ symbol, name }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [customTags, setCustomTags] = useState([]);
    const [newTag, setNewTag] = useState('');
    const [isAddingTag, setIsAddingTag] = useState(false);
    const [showFullSummary, setShowFullSummary] = useState(false);

    // Load custom tags from local storage
    useEffect(() => {
        const savedTags = localStorage.getItem(`custom_tags_${symbol}`);
        if (savedTags) {
            setCustomTags(JSON.parse(savedTags));
        } else {
            setCustomTags([]);
        }
    }, [symbol]);

    useEffect(() => {
        let mounted = true;

        // Reset state immediately on symbol change
        setData(null);
        setLoading(true);

        const fetchData = async () => {
            if (!symbol) return;

            try {
                const result = await getTokenFundamentals(symbol, name);
                if (mounted) {
                    setData(result);
                    // Initialize custom tags from API if no local tags exist yet
                    const savedTags = localStorage.getItem(`custom_tags_${symbol}`);
                    if (!savedTags && result?.tags) {
                        setCustomTags(result.tags);
                        localStorage.setItem(`custom_tags_${symbol}`, JSON.stringify(result.tags));
                    }
                }
            } catch (err) {
                console.error("Failed to fetch fundamentals", err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchData();

        return () => { mounted = false; };
    }, [symbol, name]);

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

    // Generate Rule-based AI Summary
    const generateSummary = () => {
        if (!data) return "Analyzing market data...";

        const { valuation, growth } = data;
        const parts = [];

        // Valuation Analysis
        if (valuation) {
            if (valuation.isHealthy) parts.push("Valuation is healthy with low dilution risk.");
            else if (valuation.isHighRisk) parts.push("High dilution risk detected (FDV > 3x Mcap).");
            else parts.push("Valuation shows moderate dilution.");
        }

        // Growth Analysis
        if (growth && growth.hasTvl) {
            if (growth.tvl_30d_change_percent > 10) parts.push("Strong TVL growth trend (+10% 30d).");
            else if (growth.tvl_30d_change_percent < -10) parts.push("Significant capital outflow detected.");
            else parts.push("TVL remains relatively stable.");
        }

        // Tag Context
        if (customTags.length > 0) {
            const sectors = customTags.slice(0, 2).join(", ");
            parts.push(`Key sectors: ${sectors}.`);
        }

        return parts.join(" ") || "Insufficient data for summary.";
    };

    // Always render the widget structure to prevent layout shifts
    if (loading) {
        return (
            <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-4 min-h-[180px] flex items-center justify-center w-full">
                <div className="text-slate-500 text-xs flex items-center gap-2">
                    <Activity size={14} className="animate-spin" /> Loading Fundamentals...
                </div>
            </div>
        );
    }

    const { valuation, growth } = data || {};

    // Helper to format large numbers
    const formatMoney = (num) => {
        if (!num) return '$0';
        if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
        if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
        return `$${num.toLocaleString()}`;
    };

    return (
        <div className="card-auto flex flex-col w-full">
            <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={20} className="text-indigo-400" />
                <h3 className="text-base font-bold text-slate-200 uppercase tracking-wider">Fundamental Intelligence</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1.3fr_1fr] gap-8 p-6">
                {/* 1. Fundamental Stats (MC, FDV, TVL) */}
                <div className="flex flex-col gap-3">
                    <div className="text-sm font-bold tracking-wide text-indigo-400 uppercase flex items-center gap-2 pl-1">
                        <Layers size={16} /> Fundamental Stats
                    </div>
                    <div className="flex flex-col gap-4 h-full min-h-[240px]">
                        {/* Market Cap Card */}
                        <div className="flex flex-col bg-white/[0.03] rounded-xl border border-white/[0.08] flex-1 overflow-hidden">
                            <div className="px-5 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                                <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Market Cap</span>
                            </div>
                            <div className="p-5 flex items-center">
                                <span className="text-2xl font-bold text-white tracking-tight">
                                    {valuation ? formatMoney(valuation.mcap) : '-'}
                                </span>
                            </div>
                        </div>

                        {/* FDV Card */}
                        <div className="flex flex-col bg-white/[0.03] rounded-xl border border-white/[0.08] flex-1 overflow-hidden">
                            <div className="px-5 py-3 border-b border-white/[0.05] bg-white/[0.02]">
                                <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">FDV</span>
                            </div>
                            <div className="p-5 flex items-center">
                                <span className="text-2xl font-bold text-white tracking-tight">
                                    {valuation ? formatMoney(valuation.fdv) : '-'}
                                </span>
                            </div>
                        </div>

                        {/* TVL Card */}
                        <div className="flex flex-col bg-white/[0.03] rounded-xl border border-white/[0.08] flex-1 overflow-hidden">
                            <div className="px-5 py-3 border-b border-white/[0.05] bg-white/[0.02] flex justify-between items-center">
                                <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">TVL (30d)</span>
                                {growth && (
                                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/[0.05] ${growth.tvl_30d_change_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {growth.tvl_30d_change_percent > 0 ? '+' : ''}{growth.tvl_30d_change_percent.toFixed(1)}%
                                    </div>
                                )}
                            </div>
                            <div className="p-5 flex items-center">
                                <span className="text-2xl font-bold text-white tracking-tight">
                                    {growth ? formatMoney(growth.tvl_current) : '-'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 2. Sector & Tags (Editable) */}
                <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center pl-1 pr-1">
                        <div className="text-sm font-bold tracking-wide text-emerald-400 uppercase flex items-center gap-2">
                            <Tag size={16} /> Sector & Tags
                        </div>
                        <button
                            onClick={() => setIsAddingTag(!isAddingTag)}
                            className="text-slate-400 hover:text-white transition-colors p-1"
                        >
                            <Plus size={16} />
                        </button>
                    </div>
                    <div className="flex flex-col bg-white/[0.03] rounded-xl p-6 border border-white/[0.08] min-h-[240px]">
                        <div className="flex flex-wrap gap-3 items-start content-start h-full max-h-[200px] overflow-y-auto pr-3 custom-scrollbar">
                            {customTags.length > 0 ? (
                                customTags.map((tag, idx) => (
                                    <span key={idx} className="group flex items-center gap-2 text-sm font-bold px-4 py-2 bg-white/[0.08] text-white rounded-lg whitespace-nowrap border border-white/[0.05]">
                                        {tag}
                                        <button
                                            onClick={() => handleRemoveTag(tag)}
                                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 transition-opacity"
                                        >
                                            <X size={14} />
                                        </button>
                                    </span>
                                ))
                            ) : (
                                <span className="text-sm text-slate-500 italic">No tags added</span>
                            )}

                            {isAddingTag && (
                                <form onSubmit={handleAddTag} className="w-full mt-2">
                                    <input
                                        type="text"
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        placeholder="Add tag..."
                                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                                        autoFocus
                                    />
                                </form>
                            )}
                        </div>
                    </div>
                </div>

                {/* 3. AI Summary */}
                <div className="flex flex-col gap-3">
                    <div className="text-sm font-bold tracking-wide text-purple-400 uppercase flex items-center gap-2 pl-1">
                        <Sparkles size={16} /> AI Summary
                    </div>
                    <div className="flex flex-col bg-white/[0.03] rounded-xl p-8 border border-white/[0.08] min-h-[240px]">
                        <div className="flex-1 h-full flex flex-col">
                            <p className={`text-sm leading-loose text-slate-300 text-wrap-fix transition-all duration-300 ${!showFullSummary ? 'line-clamp-6' : ''}`}>
                                {generateSummary()}
                            </p>
                            <button
                                onClick={() => setShowFullSummary(!showFullSummary)}
                                className="text-xs text-indigo-400 hover:text-indigo-300 mt-4 font-bold self-start uppercase tracking-wide"
                            >
                                {showFullSummary ? 'Show Less' : 'Show More'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FundamentalWidget;
