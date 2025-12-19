import React from 'react';
import { ChevronDown, ChevronUp, Sparkles, ExternalLink, Tag } from 'lucide-react';

/**
 * InsightRow - Unified list row component with fixed 72px collapsed height
 * 
 * Props:
 * - left: { iconUrl, ticker, secondaryLabel }
 * - center: { title, preview }
 * - right: { dateText, training, importance }
 * - expanded: { content, sources[], tags[], meta }
 * - isExpanded: boolean
 * - actions: { onToggleExpand, onToggleTraining, onSetImportance, onDelete }
 */
const InsightRow = ({
    left = {},
    center = {},
    right = {},
    expanded = {},
    isExpanded = false,
    actions = {},
}) => {
    const { iconUrl, ticker, secondaryLabel } = left;
    const { title, preview } = center;
    const { dateText, training, importance = 3, badges = [] } = right;
    const { content, sources = [], tags = [], meta } = expanded;
    const { onToggleExpand, onToggleTraining, onSetImportance, onDelete } = actions;

    return (
        <div
            className={`
        rounded-lg border overflow-hidden transition-all duration-200
        ${isExpanded
                    ? 'border-indigo-500/40 ring-1 ring-indigo-500/20 bg-slate-900/80'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }
      `}
        >
            {/* COLLAPSED ROW - Fixed 72px height */}
            <div
                onClick={onToggleExpand}
                className="flex items-center h-[72px] px-4 cursor-pointer"
            >
                {/* LEFT COLUMN: w-[180px] */}
                <div className="w-[180px] shrink-0 flex items-center gap-3 min-w-0">
                    {/* Icon */}
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-800">
                        {iconUrl ? (
                            <img
                                src={iconUrl}
                                alt={ticker || ''}
                                className="h-8 w-8 rounded-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                        ) : (
                            <span className="text-[11px] font-bold uppercase text-slate-400">
                                {ticker?.substring(0, 3) || '?'}
                            </span>
                        )}
                    </div>
                    {/* Ticker + Secondary */}
                    <div className="min-w-0 overflow-hidden">
                        <div className="text-sm font-semibold text-white truncate">{ticker || 'Unknown'}</div>
                        {secondaryLabel && (
                            <div className="text-[10px] text-slate-500 uppercase truncate">{secondaryLabel}</div>
                        )}
                    </div>
                </div>

                {/* CENTER COLUMN: flex-1, min-w-0, clamped */}
                <div className="flex-1 min-w-0 px-4 overflow-hidden">
                    {title && (
                        <div className="text-sm font-medium text-slate-100 truncate line-clamp-1">{title}</div>
                    )}
                    {preview && (
                        <div className="text-xs text-slate-400 truncate line-clamp-1">{preview}</div>
                    )}
                </div>

                {/* RIGHT COLUMN: w-[220px] */}
                <div className="w-[220px] shrink-0 flex items-center justify-end gap-2">
                    {/* Badges (for Feeds) */}
                    {badges.length > 0 && (
                        <div className="flex items-center gap-1.5">
                            {badges.map((badge, idx) => (
                                <div
                                    key={idx}
                                    className={`
                    inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold
                    ${badge.type === 'opp'
                                            ? 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                            : 'border border-rose-500/40 bg-rose-500/10 text-rose-300'
                                        }
                  `}
                                >
                                    {badge.icon}
                                    {badge.count}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Date */}
                    {dateText && (
                        <span className="text-[10px] text-slate-500 shrink-0">{dateText}</span>
                    )}

                    {/* Training Toggle */}
                    {onToggleTraining && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onToggleTraining(); }}
                            className={`
                inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] shrink-0
                ${training
                                    ? 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-300'
                                    : 'border border-slate-700 text-slate-500 hover:border-slate-500'
                                }
              `}
                        >
                            <Sparkles className="h-3 w-3" />
                            AI
                        </button>
                    )}

                    {/* Priority Dots */}
                    {onSetImportance && (
                        <div className="flex items-center gap-0.5 shrink-0">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <button
                                    key={i}
                                    onClick={(e) => { e.stopPropagation(); onSetImportance(i + 1); }}
                                    className={`h-1.5 w-1.5 rounded-full ${i < importance ? 'bg-indigo-500' : 'bg-slate-700'}`}
                                />
                            ))}
                        </div>
                    )}

                    {/* Chevron */}
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                </div>
            </div>

            {/* EXPANDED CONTENT - Variable height */}
            {isExpanded && (
                <div className="border-t border-slate-800 px-5 py-4 space-y-4">
                    {/* Full Content - handle string or JSX */}
                    {content && (
                        typeof content === 'string' ? (
                            <div className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">
                                {content}
                            </div>
                        ) : (
                            content
                        )
                    )}

                    {/* Meta */}
                    {meta && (
                        <div className="text-[11px] text-slate-500">{meta}</div>
                    )}

                    {/* Sources */}
                    {sources.length > 0 && (
                        <div className="space-y-1.5">
                            <div className="text-[10px] font-bold uppercase text-slate-500">Sources</div>
                            {sources.map((src, idx) => (
                                <a
                                    key={idx}
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 truncate"
                                >
                                    <ExternalLink className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{src.label || src.url}</span>
                                </a>
                            ))}
                        </div>
                    )}

                    {/* Tags */}
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800">
                            {tags.map((tag, i) => (
                                <span key={i} className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                                    <Tag className="h-3 w-3 opacity-60" />
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Delete Action */}
                    {onDelete && (
                        <div className="flex justify-end pt-2 border-t border-slate-800">
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                className="text-xs text-rose-400 hover:text-rose-300"
                            >
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default InsightRow;
