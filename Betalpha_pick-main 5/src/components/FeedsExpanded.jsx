import React, { useState, useEffect } from 'react';
import { ExternalLink, BookOpen } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { translateText } from '../services/translationService';

/**
 * FeedsExpanded - Expanded content for Feeds rows
 * Domain-specific: shows opportunities, risks, sources, onCreateHighlight
 * 
 * FULL FUNCTIONALITY RESTORED:
 * - Sources with handle, text, URL
 * - External link to tweets
 * - BookOpen icon to save to notebook (onCreateHighlight)
 */

// Helper: Parse **bold** text in signals
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

const FeedsExpanded = ({
    asset,
    opportunities = [],
    risks = [],
    onCreateHighlight,
    onNavigate,
}) => {
    const hasOpps = opportunities.length > 0;
    const hasRisks = risks.length > 0;
    const { language, t } = useLanguage();
    const [translatedOpps, setTranslatedOpps] = useState(null);
    const [translatedRisks, setTranslatedRisks] = useState(null);

    useEffect(() => {
        const translateContent = async () => {
            if (language !== 'zh-TW') {
                setTranslatedOpps(null);
                setTranslatedRisks(null);
                return;
            }

            // Translate Opportunities
            if (hasOpps && !translatedOpps) {
                const translated = await Promise.all(opportunities.map(async (opp) => {
                    const translatedSignal = await translateText(opp.signal, 'zh-TW');
                    return { ...opp, signal: translatedSignal || opp.signal };
                }));
                setTranslatedOpps(translated);
            }

            // Translate Risks
            if (hasRisks && !translatedRisks) {
                const translated = await Promise.all(risks.map(async (risk) => {
                    const translatedSignal = await translateText(risk.signal, 'zh-TW');
                    return { ...risk, signal: translatedSignal || risk.signal };
                }));
                setTranslatedRisks(translated);
            }
        };

        translateContent();
    }, [opportunities, risks, language]);

    const displayOpps = (language === 'zh-TW' && translatedOpps) ? translatedOpps : opportunities;
    const displayRisks = (language === 'zh-TW' && translatedRisks) ? translatedRisks : risks;

    return (
        <div className="px-5 py-4 space-y-6">
            {/* OPPORTUNITIES */}
            {hasOpps && (
                <div>
                    <h4 className="mb-3 flex items-center gap-2 border-b border-emerald-400/20 pb-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        {t('opportunities')}
                    </h4>
                    <div className="flex flex-col gap-3">
                        {displayOpps.map((opp, idx) => (
                            <div key={idx} className="group relative pl-3">
                                {/* Signal Text */}
                                <div className="text-[13px] leading-relaxed text-slate-300">
                                    • {formatSignalText(opp.signal)}
                                </div>

                                {/* Save to Notebook Button */}
                                {onCreateHighlight && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCreateHighlight({
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

                                {/* Sources */}
                                {opp.category !== 'TA' && opp.sources && opp.sources.length > 0 && (
                                    <div className="mt-2 flex flex-col gap-1 rounded-lg bg-white/5 p-2.5 text-[11px] text-slate-400 max-w-full overflow-hidden">
                                        <span className="text-[10px] font-bold uppercase opacity-60">{t('sources')}:</span>
                                        {opp.sources.slice(0, 3).map((src, sIdx) => (
                                            <a
                                                key={sIdx}
                                                href={src.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex items-center gap-1.5 text-emerald-400 no-underline hover:text-emerald-300"
                                            >
                                                <span className="shrink-0 text-xs font-semibold text-white">{src.handle}</span>
                                                <span className="truncate text-slate-400 flex-1 min-w-0">
                                                    {src.text ? `"${src.text.length > 100 ? src.text.substring(0, 100) + '...' : src.text}"` : 'View'}
                                                </span>
                                                <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                                            </a>
                                        ))}
                                        {opp.sources.length > 3 && (
                                            <span className="text-slate-500">+{opp.sources.length - 3} more</span>
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
                        {t('risks')}
                    </h4>
                    <div className="flex flex-col gap-3">
                        {displayRisks.map((risk, idx) => (
                            <div key={idx} className="group relative pl-3">
                                {/* Signal Text */}
                                <div className="text-[13px] leading-relaxed text-slate-300">
                                    • {formatSignalText(risk.signal)}
                                </div>

                                {/* Save to Notebook Button */}
                                {onCreateHighlight && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onCreateHighlight({
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

                                {/* Sources */}
                                {risk.category !== 'TA' && risk.sources && risk.sources.length > 0 && (
                                    <div className="mt-2 flex flex-col gap-1 rounded-lg bg-white/5 p-2.5 text-[11px] text-slate-400 max-w-full overflow-hidden">
                                        <span className="text-[10px] font-bold uppercase opacity-60">{t('sources')}:</span>
                                        {risk.sources.slice(0, 3).map((src, sIdx) => (
                                            <a
                                                key={sIdx}
                                                href={src.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="flex items-center gap-1.5 text-red-400 no-underline hover:text-red-300"
                                            >
                                                <span className="shrink-0 text-xs font-semibold text-white">{src.handle}</span>
                                                <span className="truncate text-slate-400 flex-1 min-w-0">
                                                    {src.text ? `"${src.text.length > 100 ? src.text.substring(0, 100) + '...' : src.text}"` : 'View'}
                                                </span>
                                                <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                                            </a>
                                        ))}
                                        {risk.sources.length > 3 && (
                                            <span className="text-slate-500">+{risk.sources.length - 3} more</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer CTA */}
            {onNavigate && (
                <div className="flex items-center justify-end border-t border-white/10 pt-3">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onNavigate(); }}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white transition-colors hover:bg-white/10"
                    >
                        {t('goToAssetPage')} →
                    </button>
                </div>
            )}
        </div>
    );
};

export default FeedsExpanded;
