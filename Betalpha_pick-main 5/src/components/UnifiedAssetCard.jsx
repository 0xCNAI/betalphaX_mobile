import React, { useState } from 'react';
import {
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    TrendingUp,
    ExternalLink,
    ArrowRight,
    BookOpen,
} from 'lucide-react';
import { ListRowShell, RowHeader, RowLeft, RowRight, RowBody } from './ui/ListRowShell';
import { useNavigate } from 'react-router-dom';

// Helper to parse **bold** text
const formatSignalText = (text) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return (
                <strong key={index} className="font-extrabold text-white">
                    {part.slice(2, -2)}
                </strong>
            );
        }
        return part;
    });
};

const UnifiedAssetCard = ({ asset, priceData, intelligence, logo, onCreateHighlight }) => {
    const navigate = useNavigate();
    const [isExpanded, setIsExpanded] = useState(false);

    const { risks = [], opportunities = [], riskCount = 0, opportunityCount = 0 } =
        intelligence || {};

    const change24h = priceData?.change24h ?? priceData?.priceChange24h ?? 0;
    const hasRisks = riskCount > 0;
    const hasOpps = opportunityCount > 0;

    const handleNavigate = (e) => {
        e.stopPropagation();
        navigate(`/asset/${asset}`);
    };

    return (
        <ListRowShell isExpanded={isExpanded}>
            {/* HEADER ROW - Fixed height, matches Journal */}
            <RowHeader onClick={() => setIsExpanded((v) => !v)}>
                {/* Left: Icon + Ticker + 24h + Summary */}
                <RowLeft>
                    {/* Asset Icon */}
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900">
                        {logo ? (
                            <img
                                src={logo}
                                alt={asset}
                                className="h-7 w-7 rounded-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                        ) : (
                            <span className="text-[10px] font-bold uppercase text-white">
                                {asset.substring(0, 3)}
                            </span>
                        )}
                    </div>

                    {/* Asset Info */}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-white">{asset}</span>
                            {Math.abs(change24h) > 0.001 && (
                                <span className={`text-xs font-semibold ${change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {change24h > 0 ? '+' : ''}{change24h.toFixed(2)}%
                                </span>
                            )}
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                            {opportunityCount} opportunities · {riskCount} risks
                        </div>
                    </div>
                </RowLeft>

                {/* Right: Badges + Chevron */}
                <RowRight>
                    {hasOpps && (
                        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                            <TrendingUp className="h-3 w-3" />
                            {opportunityCount}
                        </div>
                    )}
                    {hasRisks && (
                        <div className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-rose-300">
                            <AlertTriangle className="h-3 w-3" />
                            {riskCount}
                        </div>
                    )}
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                </RowRight>
            </RowHeader>

            {/* BODY - Only visible when expanded */}
            {isExpanded && (
                <RowBody>
                    {/* OPPORTUNITIES */}
                    {hasOpps && (
                        <div>
                            <h4 className="mb-3 flex items-center gap-2 border-b border-emerald-400/20 pb-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
                                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                Opportunities
                            </h4>
                            <div className="flex flex-col gap-3">
                                {opportunities.map((opp, idx) => (
                                    <div key={idx} className="group relative pl-3">
                                        <div className="text-[13px] leading-relaxed text-slate-300">
                                            • {formatSignalText(opp.signal)}
                                        </div>

                                        {onCreateHighlight && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCreateHighlight(asset, null, {
                                                        noteCategory: 'highlight',
                                                        sourceType: 'feed_guardian_opportunity',
                                                        sourceRef: { asset, group: 'opportunity', meta: JSON.stringify({ index: idx, category: opp.category }) },
                                                        title: `Opportunity: ${asset} – ${opp.category || 'General'}`,
                                                        content: opp.signal + (opp.sources ? '\n\nSources:\n' + opp.sources.map((s) => `- ${s.handle}: ${s.text} (${s.url})`).join('\n') : ''),
                                                        tags: ['opportunity', opp.category || 'general'],
                                                        importance: 3,
                                                        forTraining: false,
                                                    });
                                                }}
                                                className="absolute right-0 top-0 rounded p-1 text-emerald-400/60 opacity-0 transition-all hover:bg-emerald-400/10 hover:text-emerald-400 group-hover:opacity-100"
                                                title="Save to Notebook"
                                            >
                                                <BookOpen className="h-4 w-4" />
                                            </button>
                                        )}

                                        {opp.category !== 'TA' && opp.sources && opp.sources.length > 0 && (
                                            <div className="mt-2 flex flex-col gap-1 rounded-lg bg-white/5 p-2.5 text-[11px] text-slate-400 max-w-full overflow-hidden">
                                                <span className="text-[10px] font-bold uppercase opacity-60">Sources:</span>
                                                {opp.sources.slice(0, 2).map((src, sIdx) => (
                                                    <a
                                                        key={sIdx}
                                                        href={src.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="flex items-center gap-1.5 text-emerald-400 no-underline hover:text-emerald-300 truncate"
                                                    >
                                                        <span className="shrink-0 text-xs font-semibold text-white">{src.handle}</span>
                                                        <span className="truncate text-slate-400">
                                                            {src.text ? `"${src.text.length > 80 ? src.text.substring(0, 80) + '...' : src.text}"` : 'View'}
                                                        </span>
                                                        <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                                                    </a>
                                                ))}
                                                {opp.sources.length > 2 && (
                                                    <span className="text-slate-500">+{opp.sources.length - 2} more</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* RISKS */}
                    {hasRisks && (
                        <div>
                            <h4 className="mb-3 flex items-center gap-2 border-b border-red-400/20 pb-2 text-[11px] font-extrabold uppercase tracking-wider text-red-400">
                                <span className="h-2 w-2 rounded-full bg-red-400" />
                                Risks
                            </h4>
                            <div className="flex flex-col gap-3">
                                {risks.map((risk, idx) => (
                                    <div key={idx} className="group relative pl-3">
                                        <div className="text-[13px] leading-relaxed text-slate-300">
                                            • {formatSignalText(risk.signal)}
                                        </div>

                                        {onCreateHighlight && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCreateHighlight(asset, null, {
                                                        noteCategory: 'highlight',
                                                        sourceType: 'feed_guardian_risk',
                                                        sourceRef: { asset, group: 'risk', meta: JSON.stringify({ index: idx, category: risk.category }) },
                                                        title: `Risk: ${asset} – ${risk.category || 'General'}`,
                                                        content: risk.signal + (risk.sources ? '\n\nSources:\n' + risk.sources.map((s) => `- ${s.handle}: ${s.text} (${s.url})`).join('\n') : ''),
                                                        tags: ['risk', risk.category || 'general'],
                                                        importance: 3,
                                                        forTraining: false,
                                                    });
                                                }}
                                                className="absolute right-0 top-0 rounded p-1 text-red-400/60 opacity-0 transition-all hover:bg-red-400/10 hover:text-red-400 group-hover:opacity-100"
                                                title="Save to Notebook"
                                            >
                                                <BookOpen className="h-4 w-4" />
                                            </button>
                                        )}

                                        {risk.category !== 'TA' && risk.sources && risk.sources.length > 0 && (
                                            <div className="mt-2 flex flex-col gap-1 rounded-lg bg-white/5 p-2.5 text-[11px] text-slate-400 max-w-full overflow-hidden">
                                                <span className="text-[10px] font-bold uppercase opacity-60">Sources:</span>
                                                {risk.sources.slice(0, 2).map((src, sIdx) => (
                                                    <a
                                                        key={sIdx}
                                                        href={src.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="flex items-center gap-1.5 text-red-400 no-underline hover:text-red-300 truncate"
                                                    >
                                                        <span className="shrink-0 text-xs font-semibold text-white">{src.handle}</span>
                                                        <span className="truncate text-slate-400">
                                                            {src.text ? `"${src.text.length > 80 ? src.text.substring(0, 80) + '...' : src.text}"` : 'View'}
                                                        </span>
                                                        <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                                                    </a>
                                                ))}
                                                {risk.sources.length > 2 && (
                                                    <span className="text-slate-500">+{risk.sources.length - 2} more</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Footer CTA */}
                    <div className="flex items-center justify-end border-t border-white/10 pt-3">
                        <button
                            type="button"
                            onClick={handleNavigate}
                            className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white transition-colors hover:bg-white/10"
                        >
                            Go to Asset Page
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    </div>
                </RowBody>
            )}
        </ListRowShell>
    );
};

export default UnifiedAssetCard;
