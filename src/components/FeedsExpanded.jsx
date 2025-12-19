import React, { useState, useEffect } from 'react';
import { ExternalLink, FileText, ArrowRight, BookOpen } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { translateText } from '../services/translationService';

/**
 * FeedsExpanded - Expanded content for Feeds rows
 * Shows opportunities, risks, with translation support
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
    onCreateHighlight, // maps to handleAddToNote
    onNavigate, // maps to handleWidgetClick
}) => {
    const hasOpps = opportunities.length > 0;
    const hasRisks = risks.length > 0;
    const { language, t } = useLanguage(); // Should work if context provides language string ('zh-TW')
    const [translatedOpps, setTranslatedOpps] = useState(null);
    const [translatedRisks, setTranslatedRisks] = useState(null);

    useEffect(() => {
        const translateContent = async () => {
            if (language !== 'zh-TW') {
                setTranslatedOpps(null);
                setTranslatedRisks(null);
                return;
            }

            // Helper to get text from mobile item structure
            const getText = (item) => item.text || item.summary || item.signal || '';

            // Translate Opportunities
            if (hasOpps && !translatedOpps) {
                const translated = await Promise.all(opportunities.map(async (opp) => {
                    const text = getText(opp);
                    const translatedSignal = await translateText(text, 'zh-TW');
                    return { ...opp, translatedText: translatedSignal || text };
                }));
                // We store the FULL object with translatedText property
                setTranslatedOpps(translated);
            }

            // Translate Risks
            if (hasRisks && !translatedRisks) {
                const translated = await Promise.all(risks.map(async (risk) => {
                    const text = getText(risk);
                    const translatedSignal = await translateText(text, 'zh-TW');
                    return { ...risk, translatedText: translatedSignal || text };
                }));
                setTranslatedRisks(translated);
            }
        };

        translateContent();
    }, [opportunities, risks, language]);

    // Use translated list if available, otherwise original
    const displayOpps = (language === 'zh-TW' && translatedOpps) ? translatedOpps : opportunities;
    const displayRisks = (language === 'zh-TW' && translatedRisks) ? translatedRisks : risks;

    const getText = (item) => item.translatedText || item.text || item.summary || item.signal || '';

    return (
        <div className="asset-intel-details" onClick={(e) => e.stopPropagation()}>
            {/* OPPORTUNITIES */}
            {hasOpps && (
                <div className="intel-section-block">
                    <h4 className="intel-section-title text-emerald-400">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>
                        {t('opportunities')}
                    </h4>
                    <div className="intel-items-list">
                        {displayOpps.map((opp, idx) => {
                            const text = getText(opp);
                            return (
                                <div key={idx} className="intel-detail-item">
                                    <div className="intel-content-row">
                                        <div className="intel-text-wrapper">
                                            <div className="intel-detail-text">• {formatSignalText(text)}</div>
                                            {(opp.url || opp.sources) && (
                                                <div className="intel-source-row">
                                                    <span className="source-label">{t('source') || 'SOURCE'}:</span>
                                                    {opp.sources ? (
                                                        // Web Structure
                                                        opp.sources.slice(0, 3).map((src, sIdx) => (
                                                            <a
                                                                key={sIdx}
                                                                href={src.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="source-link"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {src.handle} <ExternalLink size={10} />
                                                            </a>
                                                        ))
                                                    ) : (
                                                        // Mobile Structure
                                                        <a href={opp.url} target="_blank" rel="noopener noreferrer" className="source-link" onClick={(e) => e.stopPropagation()}>
                                                            {opp.author || 'News'} <ExternalLink size={10} />
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {onCreateHighlight && (
                                            <button
                                                className="add-to-note-btn-icon"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCreateHighlight(text, asset, 'Opportunity');
                                                }}
                                            >
                                                <FileText size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* RISKS */}
            {hasRisks && (
                <div className="intel-section-block">
                    <h4 className="intel-section-title text-rose-400">
                        <div className="w-2 h-2 rounded-full bg-rose-500 mr-2"></div>
                        {t('risks')}
                    </h4>
                    <div className="intel-items-list">
                        {displayRisks.map((risk, idx) => {
                            const text = getText(risk);
                            return (
                                <div key={idx} className="intel-detail-item">
                                    <div className="intel-content-row">
                                        <div className="intel-text-wrapper">
                                            <div className="intel-detail-text">• {formatSignalText(text)}</div>
                                            {(risk.url || risk.sources) && (
                                                <div className="intel-source-row">
                                                    <span className="source-label">{t('source') || 'SOURCE'}:</span>
                                                    {risk.sources ? (
                                                        risk.sources.slice(0, 3).map((src, sIdx) => (
                                                            <a
                                                                key={sIdx}
                                                                href={src.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="source-link"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {src.handle} <ExternalLink size={10} />
                                                            </a>
                                                        ))
                                                    ) : (
                                                        <a href={risk.url} target="_blank" rel="noopener noreferrer" className="source-link" onClick={(e) => e.stopPropagation()}>
                                                            {risk.author || 'News'} <ExternalLink size={10} />
                                                        </a>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        {onCreateHighlight && (
                                            <button
                                                className="add-to-note-btn-icon"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onCreateHighlight(text, asset, 'Risk');
                                                }}
                                            >
                                                <FileText size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Go to Asset Page Button */}
            {onNavigate && (
                <div className="mt-4 flex items-center justify-end border-t border-white/10 pt-3">
                    <button
                        className="go-to-asset-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            onNavigate();
                        }}
                    >
                        {t('goToAssetPage')} <ArrowRight size={14} className="ml-1" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default FeedsExpanded;
