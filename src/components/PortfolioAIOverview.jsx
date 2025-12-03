import React, { useState, useEffect } from 'react';
import { generatePortfolioReport } from '../services/portfolioAnalysisService';
import { saveAIReport, getLatestAIReport } from '../services/aiReportService';
import { Sparkles, X, AlertTriangle, TrendingUp, CheckCircle, BrainCircuit, Maximize2, RefreshCw, Shield } from 'lucide-react';

const PortfolioAIOverview = ({ transactions, prices, user }) => {
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

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const data = await generatePortfolioReport(transactions, prices);
            if (data) {
                setReport(data);
                setLastUpdated(new Date());
                if (user?.uid) {
                    await saveAIReport(user.uid, data);
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

    // Example insights for the marquee
    const marqueeItems = [
        "Downside Risk Exposure: If BTC and ETH retest their nearest support levels, your portfolio’s potential downside could exceed -14%",
        "Poor Risk-Reward Holdings: FLUID and BTC currently show the weakest risk-reward profiles in your portfolio",
        "Hidden / Emerging Risks: Recent delisting alerts around ZEC and governance changes in FXN may pose hidden risks",
        "Narrative Overexposure: Over 42% of your holdings are currently concentrated in BTCFi and LRT narratives"
    ];

    return (
        <>
            <div className="dashboard-card ai-overview-card">
                <div className="card-header-row">
                    <div className="ai-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <BrainCircuit size={24} className="text-accent-primary" />
                            <span className="stat-label" style={{ color: 'var(--text-primary)', fontWeight: '700', fontSize: '1.25rem' }}>AI Portfolio Overview</span>
                        </div>
                    </div>
                    <div className="header-actions">
                        <button
                            onClick={handleGenerate}
                            disabled={loading}
                            className="btn-primary"
                            title="Generate New Analysis"
                            style={{ padding: '8px 16px', fontSize: '1rem' }}
                        >
                            {loading ? <RefreshCw size={18} className="spin" /> : <Sparkles size={18} />}
                            {loading ? 'Analyzing...' : 'Generate'}
                        </button>
                    </div>
                </div>

                <div className="ai-content-area">
                    {report ? (
                        <div className="report-preview">
                            <div className="preview-header" style={{ marginBottom: '12px' }}>
                                <h4 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-secondary)' }}>Action Plan</h4>
                            </div>
                            <div className="checklist-preview">
                                {report.actionableChecklist.slice(0, 3).map((item, idx) => (
                                    <div key={idx} className="checklist-item-compact">
                                        <CheckCircle size={16} className="text-accent-success" style={{ flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>{item}</span>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="btn-secondary full-width"
                                style={{ marginTop: '16px', justifyContent: 'center', fontWeight: '600' }}
                            >
                                View AI insights
                            </button>

                            {lastUpdated && (
                                <div style={{ textAlign: 'right', marginTop: '8px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        Updated: {formatDate(lastUpdated)}
                                    </span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="marquee-container">
                            <div className="marquee-content">
                                {[...marqueeItems, ...marqueeItems].map((item, idx) => (
                                    <div key={idx} className="marquee-item">
                                        <Shield size={14} className="text-secondary" />
                                        <span>{item}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Full Report Modal */}
            {isModalOpen && report && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content ai-report-modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <BrainCircuit size={24} className="text-accent-primary" />
                                <h2>AI Portfolio Analysis</h2>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="modal-close">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="modal-body">
                            {/* Executive Summary */}
                            <div className="report-section summary-card" style={{
                                borderLeft: `4px solid ${report.executiveSummary.healthScore >= 70 ? 'var(--accent-success)' : report.executiveSummary.healthScore >= 40 ? 'var(--accent-warning)' : 'var(--accent-danger)'}`
                            }}>
                                <div className="summary-header">
                                    <h3>Executive Summary</h3>
                                    <span className={`score-badge ${report.executiveSummary.healthScore >= 70 ? 'success' : report.executiveSummary.healthScore >= 40 ? 'warning' : 'danger'}`}>
                                        Health Score: {report.executiveSummary.healthScore}/100
                                    </span>
                                </div>
                                <p className="overview-text">{report.executiveSummary.overview}</p>

                                <div className="priority-box">
                                    <AlertTriangle size={18} className="text-accent-primary" />
                                    <div>
                                        <strong>Top Priority Action</strong>
                                        <p>{report.executiveSummary.topPriorityAction}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Asset Strategy */}
                            <h3>Asset Strategy</h3>
                            <div className="assets-grid">
                                {report.assets.map((asset) => (
                                    <div key={asset.symbol} className="asset-card">
                                        <div className="asset-card-header">
                                            <strong>{asset.symbol}</strong>
                                            <span className={`strategy-tag ${asset.strategicAdvice.split(' ')[0].toLowerCase()}`}>
                                                {asset.strategicAdvice.split(' ')[0]}
                                            </span>
                                        </div>
                                        <div className="asset-detail">
                                            <div className="detail-row">
                                                <TrendingUp size={14} />
                                                <span>{asset.technicalVerdict}</span>
                                            </div>
                                            <div className="detail-row">
                                                <Sparkles size={14} />
                                                <span>{asset.fundamentalInsight}</span>
                                            </div>
                                        </div>
                                        <div className="strategy-quote">
                                            "{asset.strategicAdvice}"
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Checklist */}
                            <h3>Action Plan</h3>
                            <div className="checklist-container">
                                {report.actionableChecklist.map((item, idx) => (
                                    <div key={idx} className="checklist-item">
                                        <CheckCircle size={18} className="text-accent-success" />
                                        <span>{item}</span>
                                    </div>
                                ))}
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
                }

                .ai-header {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .header-actions {
                    display: flex;
                    gap: 8px;
                }



                .btn-icon {
                    background: none;
                    border: 1px solid var(--bg-tertiary);
                    color: var(--text-secondary);
                    padding: 4px;
                    border-radius: var(--radius-md);
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .btn-icon:hover {
                    color: var(--text-primary);
                    background-color: var(--bg-tertiary);
                }

                .ai-content-area {
                    flex: 1;
                    overflow: hidden;
                    position: relative;
                    background-color: rgba(0,0,0,0.2);
                    border-radius: var(--radius-md);
                    border: 1px solid var(--bg-tertiary);
                }

                /* Marquee Styles */
                .marquee-container {
                    height: 100%;
                    overflow: hidden;
                    position: relative;
                    display: flex;
                    flex-direction: column;
                    justify-content: center; /* Center vertically if content is short, or just start */
                }

                .marquee-content {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    padding: 12px;
                    animation: scrollUp 20s linear infinite;
                }

                .marquee-item {
                    display: flex;
                    gap: 8px;
                    align-items: flex-start;
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                    padding: 8px;
                    background-color: rgba(255,255,255,0.03);
                    border-radius: var(--radius-sm);
                }

                @keyframes scrollUp {
                    0% { transform: translateY(0); }
                    100% { transform: translateY(-50%); }
                }

                /* Report Preview Styles */
                .report-preview {
                    padding: var(--spacing-md);
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    height: 100%;
                    overflow-y: auto;
                }

                .health-score-row {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    font-size: 0.9rem;
                }
                .score-bar {
                    flex: 1;
                    height: 6px;
                    background-color: var(--bg-tertiary);
                    border-radius: 3px;
                    overflow: hidden;
                }
                .score-fill {
                    height: 100%;
                    border-radius: 3px;
                }
                .score-val {
                    font-weight: 700;
                    color: var(--text-primary);
                }

                .summary-text {
                    font-size: 0.9rem;
                    color: var(--text-secondary);
                    line-height: 1.5;
                    display: -webkit-box;
                    -webkit-line-clamp: 3;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }

                .priority-action {
                    display: flex;
                    gap: 8px;
                    align-items: flex-start;
                    font-size: 0.85rem;
                    color: var(--text-primary);
                    background-color: rgba(245, 158, 11, 0.1);
                    padding: 8px;
                    border-radius: var(--radius-sm);
                }

                /* Modal Styles */
                .ai-report-modal {
                    max-width: 800px;
                    width: 90vw;
                    max-height: 85vh;
                    background-color: var(--bg-secondary);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--bg-tertiary);
                    display: flex;
                    flex-direction: column;
                }

                .modal-body {
                    padding: var(--spacing-lg);
                    overflow-y: auto;
                }

                .summary-card {
                    background-color: var(--bg-primary);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    margin-bottom: var(--spacing-lg);
                }

                .summary-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-md);
                }
                .summary-header h3 { margin: 0; }

                .score-badge {
                    font-weight: 700;
                    padding: 4px 8px;
                    border-radius: var(--radius-sm);
                    font-size: 0.9rem;
                }
                .score-badge.success { color: var(--accent-success); background-color: rgba(34, 197, 94, 0.1); }
                .score-badge.warning { color: var(--accent-warning); background-color: rgba(234, 179, 8, 0.1); }
                .score-badge.danger { color: var(--accent-danger); background-color: rgba(239, 68, 68, 0.1); }

                .overview-text {
                    color: var(--text-secondary);
                    line-height: 1.6;
                    margin-bottom: var(--spacing-md);
                }

                .priority-box {
                    background-color: rgba(99, 102, 241, 0.1);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    display: flex;
                    gap: 12px;
                    align-items: flex-start;
                }
                .priority-box strong { color: var(--accent-primary); display: block; margin-bottom: 4px; }
                .priority-box p { margin: 0; color: var(--text-primary); font-size: 0.95rem; }

                .assets-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    gap: var(--spacing-md);
                    margin-bottom: var(--spacing-lg);
                }

                .asset-card {
                    background-color: var(--bg-primary);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                    border: 1px solid var(--bg-tertiary);
                }

                .asset-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: var(--spacing-md);
                    border-bottom: 1px solid var(--bg-tertiary);
                    padding-bottom: 8px;
                }

                .strategy-tag {
                    font-size: 0.8rem;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-weight: 600;
                }
                .strategy-tag.buy { color: var(--accent-success); background-color: rgba(34, 197, 94, 0.1); }
                .strategy-tag.sell { color: var(--accent-danger); background-color: rgba(239, 68, 68, 0.1); }
                .strategy-tag.hold { color: var(--accent-warning); background-color: rgba(234, 179, 8, 0.1); }

                .asset-detail {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-bottom: 12px;
                }
                .detail-row {
                    display: flex;
                    gap: 8px;
                    align-items: flex-start;
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                }

                .strategy-quote {
                    font-style: italic;
                    color: var(--text-primary);
                    font-size: 0.9rem;
                    background-color: var(--bg-tertiary);
                    padding: 8px;
                    border-radius: var(--radius-sm);
                }

                .checklist-container {
                    background-color: var(--bg-primary);
                    padding: var(--spacing-md);
                    border-radius: var(--radius-md);
                }
                .checklist-item {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 12px;
                    align-items: flex-start;
                    color: var(--text-secondary);
                }
                .checklist-item:last-child { margin-bottom: 0; }

                .checklist-item-compact {
                    display: flex;
                    gap: 8px;
                    align-items: flex-start;
                    margin-bottom: 8px;
                }
                .spin { animation: spin 1s linear infinite; }
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </>
    );
};

export default PortfolioAIOverview;
