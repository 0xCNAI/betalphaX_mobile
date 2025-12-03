import React, { useState, useEffect } from 'react';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { generatePortfolioOverview, getCachedOverview } from '../services/analysisService';
import { BookOpen, Sparkles, Calendar, TrendingUp, TrendingDown, Brain, ArrowRight, Activity, AlertTriangle, Edit2, X, FileText, Wallet } from 'lucide-react';
import TransactionForm from '../components/TransactionForm';

const Journal = () => {
  const { transactions } = useTransactions();
  const { getPrice, getIcon } = usePrices();
  const [isGenerating, setIsGenerating] = useState(false);
  const [weeklyReview, setWeeklyReview] = useState(null);
  const [overview, setOverview] = useState(null);

  // Edit state
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [initialStep, setInitialStep] = useState(1);

  const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  // Load overview for analysis section
  useEffect(() => {
    const loadOverview = () => {
      const cached = getCachedOverview();
      if (cached) {
        setOverview(cached);
      } else {
        // Generate if not cached
        const currentPrices = {};
        transactions.forEach(tx => {
          const p = getPrice(tx.asset);
          if (p) currentPrices[tx.asset] = p;
        });
        const data = generatePortfolioOverview(transactions, currentPrices);
        setOverview(data);
      }
    };
    loadOverview();
  }, [transactions, getPrice]);

  const generateReview = () => {
    setIsGenerating(true);
    // Mock AI generation
    setTimeout(() => {
      setWeeklyReview({
        summary: "This week showed a strong preference for momentum trading. Your entry on SOL was particularly well-timed, capturing the breakout.",
        strengths: ["Good patience waiting for confirmation", "Risk management was disciplined"],
        weaknesses: ["Tendency to exit winners too early", "FOMO detected in ETH trade"],
        actionable: "Consider using trailing stops to let winners run longer."
      });
      setIsGenerating(false);
    }, 2000);
  };

  const [expandedIds, setExpandedIds] = useState([]);

  const toggleExpand = (id) => {
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="journal-container">


      {/* AI Portfolio Analysis Section (Moved from Portfolio) */}
      {overview && (
        <div className="analysis-section">
          <div className="section-title">
            <Activity size={20} className="text-accent" />
            <h3>Portfolio Health Breakdown</h3>
          </div>
          <div className="health-dimensions-grid">
            {overview.healthIndex?.metrics?.map((metric, idx) => (
              <div key={idx} className="dimension-card">
                <div className="dimension-header">
                  <span className="dim-name">{metric.name}</span>
                  <span className={`dim-score ${metric.score >= 80 ? 'good' : metric.score >= 50 ? 'avg' : 'bad'}`}>
                    {metric.score.toFixed(0)}/100
                  </span>
                </div>
                <div className="dim-bar-bg">
                  <div
                    className="dim-bar-fill"
                    style={{
                      width: `${metric.score}%`,
                      backgroundColor: metric.score >= 80 ? 'var(--accent-success)' : metric.score >= 50 ? 'var(--accent-warning)' : 'var(--accent-danger)'
                    }}
                  ></div>
                </div>
                <p className="dim-desc">{metric.text}</p>

                <div className="dim-stats">
                  {metric.name === 'Downside Risk' && metric.details && (
                    <>
                      <span className="stat-pill">Max Loss: {metric.details.exposure}</span>
                      <span className="stat-pill">SL Coverage: {metric.details.coverage}</span>
                    </>
                  )}
                  {metric.name === 'Win Quality' && metric.details && (
                    <>
                      <span className="stat-pill">Avg Win R/R: {metric.details.avgWinRR}</span>
                      <span className="stat-pill">Loss Efficiency: {metric.details.lossEfficiency}</span>
                    </>
                  )}
                  {metric.name === 'Concentration' && metric.details && (
                    <span className="stat-pill">Top Asset: {metric.details.value}</span>
                  )}
                  {metric.name === 'Discipline' && metric.details && (
                    <span className="stat-pill">Plan Adherence: {metric.details.value}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="journal-layout">
        <div className="feed-section">
          <h3>Recent Entries</h3>
          <div className="entries-list">
            {sortedTransactions.map((tx) => {
              const isExpanded = expandedIds.includes(tx.id);
              return (
                <div key={tx.id} className={`journal-list-item ${isExpanded ? 'expanded' : ''}`}>
                  <div className="list-item-header" onClick={() => toggleExpand(tx.id)}>
                    <div className="header-left">
                      <div className="asset-badge">
                        {getIcon && getIcon(tx.asset) && (
                          <img
                            src={getIcon(tx.asset)}
                            alt={tx.asset}
                            style={{ width: '20px', height: '20px', borderRadius: '50%', marginRight: '6px' }}
                          />
                        )}
                        <span className="symbol">{tx.asset}</span>
                        <span className={`type ${tx.type}`}>{tx.type.toUpperCase()}</span>
                      </div>
                      <span className="date">
                        <Calendar size={14} />
                        {new Date(tx.date).toLocaleDateString()}
                      </span>
                    </div>

                    <div className="header-right">
                      <div className="financials-compact">
                        <span className="amount">{tx.amount} {tx.asset}</span>
                        <span className="price">@ ${tx.price.toLocaleString()}</span>
                      </div>
                      <button className="btn-icon toggle-btn">
                        <ArrowRight size={16} className={`chevron ${isExpanded ? 'rotated' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="list-item-body">
                      <div className="thesis-section">
                        <h4><Brain size={14} /> Buy Thesis</h4>
                        {tx.tags && tx.tags.length > 0 ? (
                          <div className="tags-display" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                            {tx.tags.map((tag, i) => (
                              <span
                                key={i}
                                className="tag-pill"
                                style={{
                                  backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                  color: 'var(--accent-primary)',
                                  padding: '4px 10px',
                                  borderRadius: '14px',
                                  fontSize: '0.8rem',
                                  fontWeight: '500',
                                  border: '1px solid rgba(99, 102, 241, 0.3)'
                                }}
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-secondary">No thesis documented</p>
                        )}
                      </div>

                      {((tx.sellSignals && tx.sellSignals.length > 0) || (tx.exitTags && tx.exitTags.length > 0)) && (
                        <div className="thesis-section">
                          <h4><TrendingDown size={14} /> Exit Strategy</h4>
                          {tx.exitTags && tx.exitTags.length > 0 && (
                            <div className="tags-display" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                              {tx.exitTags.map((tag, i) => (
                                <span
                                  key={i}
                                  className="tag-pill"
                                  style={{
                                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                    color: 'var(--accent-primary)',
                                    padding: '4px 10px',
                                    borderRadius: '14px',
                                    fontSize: '0.8rem',
                                    fontWeight: '500',
                                    border: '1px solid rgba(99, 102, 241, 0.3)'
                                  }}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          {tx.sellSignals && tx.sellSignals.length > 0 && (
                            <ul>
                              {tx.sellSignals.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          )}
                        </div>
                      )}

                      {tx.memo && (
                        <div className="thesis-section">
                          <h4><FileText size={14} /> Investment Note</h4>
                          <p className="text-secondary" style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem', lineHeight: '1.5' }}>
                            {tx.memo}
                          </p>
                        </div>
                      )}

                      {tx.holdings_breakdown && tx.holdings_breakdown.length > 0 && (
                        <div className="thesis-section">
                          <h4><Wallet size={14} /> On-Chain Source</h4>
                          <div className="breakdown-list" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {tx.holdings_breakdown.map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', backgroundColor: 'rgba(255,255,255,0.05)', padding: '6px 10px', borderRadius: '6px' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{item.source} {item.protocol_id !== 'wallet' && '(DeFi)'}</span>
                                <span style={{ fontFamily: 'var(--font-mono)' }}>{item.amount.toFixed(4)} {item.symbol}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="item-actions">
                        <button
                          className="btn-secondary edit-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setInitialStep(2);
                            setEditingTransaction(tx);
                          }}
                        >
                          <Edit2 size={14} /> Edit Transaction
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="insights-sidebar">
          {weeklyReview && (
            <div className="insight-card review-card">
              <div className="card-title">
                <Sparkles size={18} className="text-accent" />
                <h4>Weekly AI Review</h4>
              </div>
              <p className="summary">{weeklyReview.summary}</p>

              <div className="review-section">
                <h5>Strengths</h5>
                <ul>{weeklyReview.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>

              <div className="review-section">
                <h5>Areas for Improvement</h5>
                <ul>{weeklyReview.weaknesses.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>

              <div className="actionable-tip">
                <strong>💡 Tip:</strong> {weeklyReview.actionable}
              </div>
            </div>
          )}

          <div className="insight-card">
            <div className="card-title">
              <TrendingUp size={18} />
              <h4>Pattern Recognition</h4>
            </div>
            <div className="pattern-item">
              <span className="pattern-label">Win Rate on Breakouts</span>
              <div className="progress-bar">
                <div className="fill" style={{ width: '75%' }}></div>
              </div>
              <span className="pattern-value">75%</span>
            </div>
            <div className="pattern-item">
              <span className="pattern-label">Avg Hold Time</span>
              <span className="pattern-value">14 Days</span>
            </div>
          </div>
        </div>
      </div>

      {editingTransaction && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close-x" onClick={() => setEditingTransaction(null)}>
              <X size={24} />
            </button>
            <TransactionForm
              onClose={() => setEditingTransaction(null)}
              initialData={editingTransaction}
              initialStep={initialStep}
            />
          </div>
        </div>
      )}

      <style>{`
        .journal-container {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-xl);
          height: 100%;
        }

        .journal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: var(--spacing-lg);
          border-bottom: 1px solid var(--bg-tertiary);
        }

        .header-content h2 {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          font-size: 1.5rem;
          margin-bottom: 4px;
        }

        .header-content p {
          color: var(--text-secondary);
        }

        /* Analysis Section */
        .analysis-section {
            background-color: var(--bg-secondary);
            border: 1px solid var(--bg-tertiary);
            border-radius: var(--radius-lg);
            padding: var(--spacing-lg);
        }

        .section-title {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
            margin-bottom: var(--spacing-lg);
        }

        .section-title h3 {
            font-size: 1.1rem;
            font-weight: 600;
        }

        .health-dimensions-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: var(--spacing-md);
        }

        .dimension-card {
            background-color: var(--bg-primary);
            padding: var(--spacing-md);
            border-radius: var(--radius-md);
            border: 1px solid var(--bg-tertiary);
        }

        .dimension-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-weight: 500;
            font-size: 0.9rem;
        }

        .dim-score.good { color: var(--accent-success); }
        .dim-score.avg { color: var(--accent-warning); }
        .dim-score.bad { color: var(--accent-danger); }

        .dim-bar-bg {
            height: 6px;
            background-color: var(--bg-tertiary);
            border-radius: 3px;
            overflow: hidden;
            margin-bottom: 8px;
        }

        .dim-bar-fill {
            height: 100%;
            border-radius: 3px;
        }

        .dim-desc {
            font-size: 0.8rem;
            color: var(--text-secondary);
            margin-bottom: 8px;
            line-height: 1.3;
            min-height: 2.6em; /* 2 lines */
        }

        .dim-stats {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }

        .stat-pill {
            font-size: 0.7rem;
            background-color: rgba(255,255,255,0.05);
            padding: 2px 6px;
            border-radius: 4px;
            color: var(--text-secondary);
            border: 1px solid var(--bg-tertiary);
        }

        .journal-layout {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: var(--spacing-xl);
          align-items: start;
        }

        .feed-section h3 {
          margin-bottom: var(--spacing-lg);
          font-size: 1.1rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .entries-list {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .journal-list-item {
          background-color: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary);
          border-radius: var(--radius-md);
          overflow: hidden;
          transition: all 0.2s;
        }

        .journal-list-item:hover {
          border-color: var(--accent-primary);
        }

        .journal-list-item.expanded {
          border-color: var(--accent-primary);
          background-color: var(--bg-secondary);
        }

        .list-item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          cursor: pointer;
          background-color: rgba(255,255,255,0.02);
        }
        
        .list-item-header:hover {
          background-color: rgba(255,255,255,0.04);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: var(--spacing-lg);
        }

        .asset-badge {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          min-width: 100px;
        }

        .symbol {
          font-weight: 700;
          font-size: 1rem;
        }

        .type {
          font-size: 0.7rem;
          padding: 2px 6px;
          border-radius: 4px;
          text-transform: uppercase;
          font-weight: 600;
        }

        .type.buy { background: rgba(16, 185, 129, 0.1); color: var(--accent-success); }
        .type.sell { background: rgba(239, 68, 68, 0.1); color: var(--accent-danger); }

        .date {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text-secondary);
          font-size: 0.85rem;
        }
        
        .financials-compact {
          display: flex;
          gap: var(--spacing-md);
          font-size: 0.9rem;
          font-weight: 500;
          color: var(--text-primary);
        }

        .amount { color: var(--text-secondary); }
        .price { color: var(--text-primary); }

        .toggle-btn {
          background: none;
          border: none;
          color: var(--text-secondary);
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .chevron {
          transition: transform 0.2s;
        }

        .chevron.rotated {
          transform: rotate(90deg);
        }

        .list-item-body {
          padding: 16px;
          border-top: 1px solid var(--bg-tertiary);
          background-color: var(--bg-primary);
        }

        .thesis-section {
          margin-bottom: var(--spacing-md);
        }

        .thesis-section h4 {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          color: var(--text-accent);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .thesis-section ul {
          list-style-type: disc;
          padding-left: 20px;
          color: var(--text-secondary);
          font-size: 0.9rem;
        }

        .thesis-section li {
          margin-bottom: 4px;
        }
        
        .item-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: var(--spacing-md);
          padding-top: var(--spacing-md);
          border-top: 1px dashed var(--bg-tertiary);
        }

        .edit-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
        }

        .insights-sidebar {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-lg);
          position: sticky;
          top: 20px;
        }

        .insight-card {
          background-color: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary);
          border-radius: var(--radius-lg);
          padding: var(--spacing-lg);
        }

        .review-card {
          border-color: var(--accent-primary);
          background: linear-gradient(to bottom right, var(--bg-secondary), rgba(99, 102, 241, 0.05));
        }

        .card-title {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          margin-bottom: var(--spacing-md);
          font-weight: 600;
        }

        .text-accent { color: var(--accent-primary); }

        .summary {
          font-style: italic;
          margin-bottom: var(--spacing-md);
          line-height: 1.5;
        }

        .review-section {
          margin-bottom: var(--spacing-md);
        }

        .review-section h5 {
          font-size: 0.8rem;
          text-transform: uppercase;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .review-section ul {
          padding-left: 16px;
          font-size: 0.9rem;
        }

        .actionable-tip {
          background-color: rgba(255, 255, 255, 0.05);
          padding: var(--spacing-md);
          border-radius: var(--radius-md);
          font-size: 0.9rem;
        }

        .pattern-item {
          margin-bottom: var(--spacing-md);
        }

        .pattern-label {
          display: block;
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .progress-bar {
          height: 6px;
          background-color: var(--bg-tertiary);
          border-radius: 3px;
          overflow: hidden;
          margin-bottom: 4px;
        }

        .fill {
          height: 100%;
          background-color: var(--accent-success);
        }

        .pattern-value {
          font-weight: 600;
          font-size: 0.9rem;
        }

        .btn-primary {
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: var(--accent-primary);
          color: white;
          padding: 10px 20px;
          border-radius: var(--radius-md);
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-primary:hover {
          background-color: var(--accent-secondary);
        }
        
        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        
        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 1000;
          padding: 1rem;
        }

        .modal-content {
          background-color: var(--bg-secondary);
          border-radius: var(--radius-lg);
          width: 100%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
          box-shadow: var(--shadow-xl);
          border: 1px solid var(--bg-tertiary);
        }

        .modal-close-x {
          position: absolute;
          top: 1rem;
          right: 1rem;
          z-index: 10;
          background: rgba(0, 0, 0, 0.2);
          color: var(--text-primary);
          border-radius: 50%;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          cursor: pointer;
          transition: background 0.2s;
        }
        .modal-close-x:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        
        @media (max-width: 768px) {
            .journal-layout {
                grid-template-columns: 1fr;
            }
        }
      `}</style>
    </div>
  );
};

export default Journal;
