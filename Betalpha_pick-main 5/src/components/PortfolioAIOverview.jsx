import React, { useState, useEffect } from 'react';
import { generatePortfolioOverview } from '../services/portfolioOverviewService';
import { calculateAssetPnL } from '../utils/pnlCalculator';
import { saveAIReport, getLatestAIReport } from '../services/aiReportService';
import { getOrCreateTranslation, translateText } from '../services/translationService';
import { useLanguage } from '../context/LanguageContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { Sparkles, X, AlertTriangle, TrendingUp, CheckCircle, BrainCircuit, RefreshCw, Shield, History, Target, ArrowRight } from 'lucide-react';

const PortfolioAIOverview = ({ transactions, prices, user }) => {
    const { t, language } = useLanguage();
    const [loading, setLoading] = useState(false);
    const [report, setReport] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);

    // Load latest report on mount
    useEffect(() => {
        const fetchLatest = async () => {
            if (user?.uid) {
                const latest = await getLatestAIReport(user.uid);
                if (latest) {
                    setReport(latest);
                    if (latest.createdAt) {
                        setLastUpdated(latest.createdAt.toDate());
                    }
                }
            }
        };
        fetchLatest();
    }, [user]);

    // Translation Effect
    useEffect(() => {
        const translateReport = async () => {
            if (!report || language !== 'zh-TW' || !user?.uid) return;

            // Check if already translated (using a key field)
            if (report.personalizedAdvice_zhTW) return;

            const docId = report.originalDocId || (report.id === 'latest' ? 'latest' : report.id);
            const docRef = doc(db, 'users', user.uid, 'ai_reports', docId);
            let updates = {};
            let hasUpdates = false;

            // 1. Personalized Advice (Simple Field)
            if (!report.personalizedAdvice_zhTW && report.personalizedAdvice) {
                const translated = await getOrCreateTranslation({
                    docRef: docId !== 'latest' ? docRef : null, // Only persist if not 'latest' (latest is a copy)
                    fieldPath: 'personalizedAdvice',
                    originalText: report.personalizedAdvice,
                    targetLang: 'zh-TW'
                });
                if (translated !== report.personalizedAdvice) {
                    updates.personalizedAdvice_zhTW = translated;
                    hasUpdates = true;
                }
            }

            // 2. Action Items (Array)
            if (!report.actionItems_zhTW && report.actionItems) {
                const translatedItems = await Promise.all(report.actionItems.map(async (item) => ({
                    ...item,
                    action: await translateText(item.action, 'zh-TW'),
                    reason: await translateText(item.reason, 'zh-TW')
                })));
                updates.actionItems_zhTW = translatedItems;
                hasUpdates = true;
            }

            // 3. Portfolio Insights (Array)
            if (!report.portfolioInsights_zhTW && report.portfolioInsights) {
                const translatedInsights = await Promise.all(report.portfolioInsights.map(async (item) => ({
                    ...item,
                    thesisShort: await translateText(item.thesisShort, 'zh-TW'),
                    currentSignals: await translateText(item.currentSignals, 'zh-TW'),
                    recommendation: await translateText(item.recommendation, 'zh-TW'),
                    justification: await translateText(item.justification, 'zh-TW')
                })));
                updates.portfolioInsights_zhTW = translatedInsights;
                hasUpdates = true;
            }

            // 4. Trading Patterns (Array of Strings)
            if (!report.tradingPatterns_zhTW && report.tradingPatterns) {
                const translatedPatterns = await Promise.all(report.tradingPatterns.map(p => translateText(p, 'zh-TW')));
                updates.tradingPatterns_zhTW = translatedPatterns;
                hasUpdates = true;
            }

            // Apply updates locally and to Firestore
            if (hasUpdates) {
                setReport(prev => ({ ...prev, ...updates }));

                // If it's the 'latest' doc, we update both the specific doc (if we have id) and the latest doc
                // But simplified: just update the dockRef we derived
                if (docId !== 'latest') {
                    try {
                        await updateDoc(docRef, updates);
                        console.log('Persisted report translations to Firestore');
                    } catch (e) {
                        console.warn('Failed to persist translations:', e);
                    }
                }
            }
        };

        translateReport();
    }, [report, language, user]);

    // Helper to get correct field based on language
    const getField = (obj, field) => {
        if (language === 'zh-TW' && obj[`${field}_zhTW`]) {
            return obj[`${field}_zhTW`];
        }
        return obj[field];
    };

    // Helper for arrays
    const getList = (field) => {
        if (language === 'zh-TW' && report[`${field}_zhTW`]) {
            return report[`${field}_zhTW`];
        }
        return report[field];
    };

    const handleGenerate = async () => {
        setLoading(true);
        try {
            // Prepare current holdings using standardized PnL calculator
            // Group transactions by asset first
            const transactionsByAsset = transactions.reduce((acc, tx) => {
                if (!acc[tx.asset]) acc[tx.asset] = [];
                acc[tx.asset].push(tx);
                return acc;
            }, {});

            const currentHoldings = Object.keys(transactionsByAsset).map(symbol => {
                const assetTxs = transactionsByAsset[symbol];
                const currentPrice = prices[symbol]?.price || 0;

                // Use the authoritative calculator (WAC logic)
                const { holdings, avgBuyPrice, totalCost } = calculateAssetPnL(assetTxs, currentPrice);

                // Collect buy reasons
                const buyReasons = assetTxs
                    .filter(tx => tx.type === 'buy' && tx.narrative?.primary_reason)
                    .map(tx => tx.narrative.primary_reason);

                return {
                    symbol,
                    holdings,
                    totalCost,
                    avgCost: avgBuyPrice,
                    currentPrice,
                    currentValue: holdings * currentPrice,
                    pnlPercent: totalCost > 0 ? (((holdings * currentPrice) - totalCost) / totalCost) * 100 : 0,
                    buyReasons
                };
            }).filter(h => h.holdings > 0);

            const data = await generatePortfolioOverview(transactions, currentHoldings);

            if (data) {
                setReport(data);
                setLastUpdated(new Date());
                if (user?.uid) {
                    const docId = await saveAIReport(user.uid, data);
                    // Update report with the new ID so translation can use it
                    setReport(prev => ({ ...prev, id: docId }));
                }
            }
        } catch (err) {
            console.error("Failed to generate report:", err);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (date) => {
        if (!date) return '';
        return new Intl.DateTimeFormat('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        }).format(date);
    };

    const renderSafeString = (val) => {
        if (typeof val === 'string') return val;
        if (typeof val === 'number') return String(val);
        if (!val) return '';
        // If object, try known keys or fallback to JSON
        if (typeof val === 'object') {
            return val.action || val.text || val.title || val.description || val.message || JSON.stringify(val);
        }
        return String(val);
    };

    const getPriorityColor = (p) => {
        if (p === 'HIGH') return 'var(--accent-danger)';
        if (p === 'MEDIUM') return 'var(--accent-warning)';
        return 'var(--text-secondary)';
    };

    return (
        <>
            <div className="dashboard-card ai-overview-card">
                <div className="card-header-row">
                    <div className="ai-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BrainCircuit size={24} className="text-accent-primary" />
                            <span className="stat-label" style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '1.25rem' }}>Portfolio Overview 2.0</span>
                        </div>
                    </div>
                    <div className="header-actions">
                        <button
                            onClick={handleGenerate}
                            disabled={loading}
                            className="btn-primary"
                            title="Generate New Analysis"
                            style={{ padding: '8px 16px', fontSize: '1rem', minWidth: '130px' }}
                        >
                            {loading ? <RefreshCw size={18} className="spin" /> : <Sparkles size={18} />}
                            {loading ? 'Analyzing...' : 'Analyze'}
                        </button>
                    </div>
                </div>

                <div className="ai-content-area">
                    {report ? (
                        <div className="report-container">
                            <div className="report-scroll-area">
                                {/* Action Items Preview */}
                                <div className="preview-section">
                                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.9rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                        🚨 Immediate Actions
                                    </h4>
                                    <div className="checklist-preview">
                                        {getList('actionItems')?.slice(0, 3).map((item, idx) => (
                                            <div key={idx} className="checklist-item-compact">
                                                <AlertTriangle size={16} style={{ color: getPriorityColor(item.priority), flexShrink: 0 }} />
                                                <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: item.priority === 'HIGH' ? '600' : '400' }}>
                                                    {renderSafeString(item.action)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="report-footer">
                                <button
                                    onClick={() => setIsModalOpen(true)}
                                    className="btn-secondary full-width"
                                    style={{ justifyContent: 'center', fontWeight: '600' }}
                                >
                                    View Detailed Insights <ArrowRight size={16} />
                                </button>

                                {lastUpdated && (
                                    <div style={{ textAlign: 'center', marginTop: '8px' }}>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                            AI Analysis updated: {formatDate(lastUpdated)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="empty-state-container">
                            <BrainCircuit size={48} style={{ color: 'var(--bg-tertiary)', marginBottom: '16px' }} />
                            <h3>No Analysis Yet</h3>
                            <p>Generate your first AI Portfolio Overview to get personalized insights, action items, and thesis validation.</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--accent-warning)', marginTop: '8px' }}>
                                Note: Deep analysis simulates a human analyst and may take 15-30 seconds to respect API limits.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Full Report Modal */}
            {isModalOpen && report && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    {/* Removed 'modal-content' class from container to fix double padding/scroll issue */}
                    <div className="ai-report-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <BrainCircuit size={28} className="text-accent-primary" />
                                <div>
                                    <h2 style={{ margin: 0 }}>Portfolio Overview 2.0</h2>
                                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Deep Dive Analysis & Thesis Verification</span>
                                </div>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="modal-close">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="modal-body">

                            {/* 1. Action Items Checklist */}
                            <div className="report-section">
                                <h3 className="section-title">
                                    <Target className="text-accent-primary" size={20} />
                                    Action Items
                                </h3>
                                <div className="action-items-grid">
                                    {getList('actionItems')?.map((item, idx) => (
                                        <div key={idx} className="action-card" style={{ borderLeftColor: getPriorityColor(item.priority) }}>
                                            <div className="action-header">
                                                <span className="priority-badge" style={{ backgroundColor: getPriorityColor(item.priority) + '20', color: getPriorityColor(item.priority) }}>{item.priority}</span>
                                                <span className="action-text">{renderSafeString(item.action)}</span>
                                            </div>
                                            <p className="action-reason">{renderSafeString(item.reason)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 2. Portfolio Insights (Thesis vs Signals) */}
                            <div className="report-section">
                                <h3 className="section-title">
                                    <Sparkles className="text-accent-primary" size={20} />
                                    Portfolio Insights
                                </h3>
                                <div className="insights-list">
                                    {getList('portfolioInsights')?.map((insight, idx) => (
                                        <div key={idx} className="insight-card">
                                            <div className="insight-header">
                                                <div className="insight-symbol">
                                                    <h3>{insight.symbol}</h3>
                                                    <span className="hold-days">{language === 'zh-TW' ? `持有 ${insight.holdDays} 天` : `Held ${insight.holdDays} days`}</span>
                                                </div>
                                                <div className={`recommendation-badge ${insight.recommendation.split(' ')[0].toLowerCase()}`}>
                                                    {renderSafeString(insight.recommendation)}
                                                </div>
                                            </div>

                                            <div className="thesis-comparison">
                                                <div className="comparison-col">
                                                    <span className="col-label">{t('initialThesis') || 'Initial Thesis'}</span>
                                                    <p className="thesis-text">"{renderSafeString(insight.thesisShort)}"</p>
                                                    <span className="entry-label">{t('entry') || 'Entry'}: ${insight.entryPrice}</span>
                                                </div>
                                                <div className="comparison-divider">
                                                    <ArrowRight size={16} />
                                                </div>
                                                <div className="comparison-col">
                                                    <span className="col-label">{t('currentSignals') || 'Current Signals'}</span>
                                                    <p className="signal-text">{renderSafeString(insight.currentSignals)}</p>
                                                </div>
                                            </div>

                                            <div className="insight-justification">
                                                <span className="label">{t('analysis') || 'Analysis'}:</span>
                                                {renderSafeString(insight.justification)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Top Actions (New Section) */}
                            <div style={{ marginTop: '12px' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)' }}>
                                    📋 Top Actions
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {report?.actionableChecklist?.slice(0, 3).map((item, idx) => (
                                        <div key={idx} style={{
                                            display: 'flex',
                                            alignItems: 'flex-start',
                                            gap: '8px',
                                            padding: '8px',
                                            background: 'var(--card-bg)',
                                            borderRadius: '8px',
                                            fontSize: '0.8rem'
                                        }}>
                                            <CheckCircle size={14} style={{ color: 'var(--success)', marginTop: '2px', flexShrink: 0 }} />
                                            <span style={{ color: 'var(--text-secondary)', lineHeight: '1.4' }}>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Checklist */}
                            <h3>Action Plan</h3>
                            <div className="checklist-container">
                                {report.actionableChecklist?.map((item, idx) => (
                                    <div key={idx} className="checklist-item">
                                        <CheckCircle size={18} className="text-accent-success" />
                                        <span>{item}</span>
                                    </div>
                                ))}
                            </div>

                            {/* 3. Trading Patterns & Advice */}
                            <div className="report-row-split">
                                <div className="report-section half">
                                    <h3 className="section-title">
                                        <History className="text-accent-primary" size={20} />
                                        {t('tradingPatterns') || 'Your Trading Patterns'}
                                    </h3>
                                    <ul className="patterns-list">
                                        {getList('tradingPatterns')?.map((pattern, idx) => (
                                            <li key={idx}>{renderSafeString(pattern)}</li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="report-section half">
                                    <h3 className="section-title">
                                        <BrainCircuit className="text-accent-primary" size={20} />
                                        {t('personalizedAdvice') || 'Personalized Advice'}
                                    </h3>
                                    <p className="advice-text">
                                        {renderSafeString(getField(report, 'personalizedAdvice'))}
                                    </p>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .ai-overview-card {
                    display: flex;
                    flex-direction: column;
                    gap: var(--spacing-md);
                    position: relative;
                    overflow: hidden;
                    height: 100%;
                }

                .card-header-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                }

                .ai-content-area {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    overflow: hidden;
                    position: relative;
                    background-color: rgba(0,0,0,0.2);
                    border-radius: var(--radius-md);
                    border: 1px solid var(--bg-tertiary);
                    /* Remove padding from container to allow footer to flush to edges if needed, but here we keep padding inside internal containers */
                }

                .report-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }

                .report-scroll-area {
                    flex: 1;
                    overflow-y: auto;
                    padding: var(--spacing-md);
                }

                .report-footer {
                    padding: var(--spacing-md);
                    border-top: 1px solid var(--bg-tertiary);
                    background-color: rgba(0,0,0,0.1);
                    flex-shrink: 0; /* Never shrink the button area */
                }

                .checklist-preview {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .checklist-item-compact {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                }
                .checklist-item-compact:last-child { border-bottom: none; }

                .empty-state-container {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    text-align: center;
                    height: 100%;
                    color: var(--text-secondary);
                    padding: 20px;
                }
                .empty-state-container h3 { margin: 0 0 8px 0; color: var(--text-primary); }

                /* Full Modal Styles */
                
                .ai-report-modal {
                    max-width: 800px;
                    width: 90vw;
                    max-height: 85vh;
                    background-color: var(--bg-secondary);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--bg-tertiary);
                    display: flex;
                    flex-direction: column;
                    box-shadow: var(--shadow-xl);
                }

                .modal-header {
                    padding: var(--spacing-lg);
                    border-bottom: 1px solid var(--bg-tertiary);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-shrink: 0;
                }

                .modal-body {
                    padding: var(--spacing-lg);
                    overflow-y: auto;
                    flex: 1; /* Allow body to take remaining height */
                }

                .modal-close {
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .modal-close:hover {
                    color: var(--text-primary);
                }
                
                .section-title {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 1.1rem;
                    color: var(--text-primary);
                    margin-bottom: 16px;
                    border-bottom: 1px solid var(--bg-tertiary);
                    padding-bottom: 8px;
                }

                .report-section {
                    margin-bottom: 32px;
                }

                .action-items-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 16px;
                }

                .action-card {
                    background-color: var(--bg-primary);
                    border: 1px solid var(--bg-tertiary);
                    border-left: 4px solid var(--text-secondary);
                    border-radius: var(--radius-md);
                    padding: 16px;
                }

                .action-header {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 8px;
                }

                .priority-badge {
                    font-size: 0.7rem;
                    font-weight: 700;
                    padding: 2px 6px;
                    border-radius: 4px;
                }

                .action-text {
                    font-weight: 600;
                    color: var(--text-primary);
                }

                .action-reason {
                    margin: 0;
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                }

                /* Insight Cards */
                .insights-list {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }

                .insight-card {
                    background-color: var(--bg-primary);
                    border: 1px solid var(--bg-tertiary);
                    border-radius: var(--radius-lg);
                    padding: 20px;
                }

                .insight-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 20px;
                }

                .insight-symbol h3 {
                    margin: 0;
                    font-size: 1.5rem;
                    color: var(--text-primary);
                }

                .hold-days {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }

                .recommendation-badge {
                    font-weight: 700;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 0.9rem;
                    text-transform: uppercase;
                    background-color: var(--bg-tertiary);
                    color: var(--text-primary);
                }
                .recommendation-badge.take { background-color: rgba(34, 197, 94, 0.15); color: var(--accent-success); }
                .recommendation-badge.cut { background-color: rgba(239, 68, 68, 0.15); color: var(--accent-danger); }
                .recommendation-badge.hold { background-color: rgba(234, 179, 8, 0.15); color: var(--accent-warning); }

                .thesis-comparison {
                    display: flex;
                    align-items: stretch;
                    background-color: rgba(0,0,0,0.2);
                    border-radius: var(--radius-md);
                    padding: 16px;
                    margin-bottom: 16px;
                }

                .comparison-col {
                    flex: 1;
                }

                .col-label {
                    display: block;
                    font-size: 0.75rem;
                    text-transform: uppercase;
                    color: var(--text-secondary);
                    margin-bottom: 6px;
                    letter-spacing: 0.5px;
                }

                .thesis-text, .signal-text {
                    margin: 0;
                    font-size: 0.95rem;
                    line-height: 1.5;
                    color: var(--text-primary);
                }

                .thesis-text { font-style: italic; }
                .entry-label { font-size: 0.8rem; color: var(--accent-primary); margin-top: 4px; display: block; }

                .comparison-divider {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 0 16px;
                    color: var(--text-secondary);
                    opacity: 0.5;
                }

                .insight-justification {
                    font-size: 0.95rem;
                    color: var(--text-secondary);
                    background-color: rgba(255,255,255,0.03);
                    padding: 12px;
                    border-radius: var(--radius-sm);
                    border-left: 3px solid var(--accent-primary);
                }
                .insight-justification .label {
                    font-weight: 700;
                    color: var(--text-primary);
                    margin-right: 6px;
                }

                .report-row-split {
                    display: flex;
                    gap: 24px;
                }
                .half { flex: 1; }

                .patterns-list {
                    list-style-type: none;
                    padding: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .patterns-list li {
                    position: relative;
                    padding-left: 20px;
                    color: var(--text-secondary);
                    line-height: 1.5;
                }
                .patterns-list li::before {
                    content: "•";
                    color: var(--accent-primary);
                    font-weight: bold;
                    position: absolute;
                    left: 0;
                }

                .advice-text {
                    font-size: 1rem;
                    line-height: 1.6;
                    color: var(--text-primary);
                    background-color: rgba(99, 102, 241, 0.05);
                    padding: 16px;
                    border-radius: var(--radius-md);
                    border: 1px solid rgba(99, 102, 241, 0.2);
                }

                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }

                @media (max-width: 768px) {
                    .thesis-comparison {
                        flex-direction: column;
                        gap: 16px;
                    }
                    .comparison-divider {
                        transform: rotate(90deg);
                    }
                    .report-row-split {
                        flex-direction: column;
                    }
                }
            `}</style>
        </>
    );
};

export default PortfolioAIOverview;

