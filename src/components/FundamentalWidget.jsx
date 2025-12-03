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
            <div className="flex flex-col gap-4 p-4">
                {/* 1. Fundamental Stats (Compact Row) */}
                <div className="grid grid-cols-3 gap-2">
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
                        {growth && growth.tvl_30d_change_percent !== 0 && (
                            <span className={`text-[9px] font-bold ${growth.tvl_30d_change_percent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {growth.tvl_30d_change_percent > 0 ? '+' : ''}{growth.tvl_30d_change_percent.toFixed(1)}%
                            </span>
                        )}
                    </div>
                </div>

                {/* 2. Sector & Tags (Compact) */}
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center px-1">
                        <div className="text-xs font-bold tracking-wide text-emerald-400 uppercase flex items-center gap-1">
                            <Tag size={12} /> Sector & Tags
                        </div>
                        <button
                            onClick={() => setIsAddingTag(!isAddingTag)}
                            className="text-slate-500 hover:text-white transition-colors p-1"
                        >
                            <Plus size={14} />
                        </button>
                    </div>
                    <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-3 min-h-[60px]">
                        <div className="flex flex-wrap gap-2">
                            {customTags.length > 0 ? (
                                customTags.map((tag, idx) => (
                                    <span key={idx} className="group flex items-center gap-1 text-[11px] font-medium px-2 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">
                                        {tag}
                                        <button
                                            onClick={() => handleRemoveTag(tag)}
                                            className="text-slate-500 hover:text-rose-400 transition-colors ml-1"
                                        >
                                            <X size={10} />
                                        </button>
                                    </span>
                                ))
                            ) : (
                                <span className="text-xs text-slate-600 italic">No tags added</span>
                            )}

                            {isAddingTag && (
                                <form onSubmit={handleAddTag} className="inline-flex">
                                    <input
                                        type="text"
                                        value={newTag}
                                        onChange={(e) => setNewTag(e.target.value)}
                                        placeholder="Add..."
                                        className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-indigo-500"
                                        autoFocus
                                    />
                                </form>
                            )}
                        </div>
                    </div>
                </div>

                {/* 3. AI Summary */}
                <div className="flex flex-col gap-2">
                    <div className="text-xs font-bold tracking-wide text-purple-400 uppercase flex items-center gap-1 px-1">
                        <Sparkles size={12} /> AI Summary
                    </div>
                    <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-3">
                        <p className={`text-xs leading-relaxed text-slate-400 text-wrap-fix ${!showFullSummary ? 'line-clamp-3' : ''}`}>
                            {generateSummary()}
                        </p>
                        <button
                            onClick={() => setShowFullSummary(!showFullSummary)}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-2 font-bold uppercase tracking-wide"
                        >
                            {showFullSummary ? 'Show Less' : 'Show More'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FundamentalWidget;
