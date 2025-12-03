import React, { useState, useEffect } from 'react';
import { AlertTriangle, Target, TrendingUp, Sparkles } from 'lucide-react';
import { analyzeMaximumRisk, analyzeProfitTarget, analyzePotentialOpportunity } from '../services/guardianAnalysis';

// Hook for analysis logic
export const useGuardianAnalysis = (symbol, transactions, currentPrice) => {
  const [risk, setRisk] = useState(null);
  const [profit, setProfit] = useState(null);
  const [opportunity, setOpportunity] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const analyzeAll = async () => {
      setLoading(true);

      // Filter transactions for this asset
      const assetTransactions = transactions.filter(tx => tx.asset === symbol);

      // Run all analyses
      let [riskRes, profitRes, opportunityRes] = await Promise.all([
        analyzeMaximumRisk(symbol, assetTransactions, currentPrice),
        analyzeProfitTarget(symbol, assetTransactions, currentPrice),
        analyzePotentialOpportunity(symbol, assetTransactions, currentPrice)
      ]);

      // ZEC Specific Template (Mock Logic)
      if (symbol === 'ZEC') {
        riskRes = {
          ...riskRes,
          message: "Privacy coin volatility detected. Monitor regulatory news closely.",
          level: 'medium'
        };
        profitRes = {
          ...profitRes,
          message: "Consider taking profits during privacy-narrative spikes."
        };
        opportunityRes = {
          ...opportunityRes,
          message: "Accumulation zone detected. Privacy upgrades may drive adoption.",
          hasOpportunity: true
        };
      }

      setRisk(riskRes);
      setProfit(profitRes);
      setOpportunity(opportunityRes);
      setLoading(false);
    };

    if (symbol && transactions && currentPrice) {
      analyzeAll();
    }
  }, [symbol, transactions, currentPrice]);

  return { risk, profit, opportunity, loading };
};

const InsightMessage = ({ message, compact }) => {
  const [expanded, setExpanded] = useState(false);

  if (!message) return <p className={`insight-message ${compact ? '!text-xs !leading-tight' : ''}`}>Analyzing...</p>;

  return (
    <div>
      <p className={`insight-message ${compact ? '!text-xs !leading-tight' : ''} text-wrap-fix ${!expanded ? 'line-clamp-3' : ''}`}>
        {message}
      </p>
      {message.length > 100 && !compact && (
        <button
          onClick={(e) => {
            e.preventDefault();
            setExpanded(!expanded);
          }}
          className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-1 font-medium"
        >
          {expanded ? 'Show Less' : 'Show More'}
        </button>
      )}
    </div>
  );
};

export const GuardianRiskCard = ({ risk, compact = false }) => (
  <div className={`guardian-card risk-card ${risk?.level || 'low'} ${compact ? 'compact !p-2 !gap-1' : ''}`}>
    <div className={`card-header ${compact ? '!mb-1' : ''}`}>
      <AlertTriangle size={compact ? 14 : 20} />
      <h4 className={compact ? '!text-xs' : ''}>Risk</h4>
    </div>
    <div className="card-content">
      <InsightMessage message={risk?.message} compact={compact} />
      {risk?.avgCost && !compact && (
        <div className="metrics">
          <div className="metric">
            <span className="metric-label">Avg Cost</span>
            <span className="metric-value">${risk.avgCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Price</span>
            <span className="metric-value">${risk.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
        </div>
      )}
    </div>
  </div>
);

export const GuardianProfitCard = ({ profit, compact = false }) => (
  <div className={`guardian-card profit-card ${compact ? 'compact !p-2 !gap-1' : ''}`}>
    <div className={`card-header ${compact ? '!mb-1' : ''}`}>
      <Target size={compact ? 14 : 20} />
      <h4 className={compact ? '!text-xs' : ''}>Target</h4>
    </div>
    <div className="card-content">
      <InsightMessage message={profit?.message} compact={compact} />
      {profit?.targetPrice && !compact && (
        <div className="metrics">
          <div className="metric">
            <span className="metric-label">Target</span>
            <span className="metric-value highlight">${profit.targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Trim</span>
            <span className="metric-value">{profit.reductionPercent}%</span>
          </div>
        </div>
      )}
    </div>
  </div>
);

export const GuardianOpportunityCard = ({ opportunity, compact = false }) => (
  <div className={`guardian-card opportunity-card ${opportunity?.hasOpportunity ? 'active' : ''} ${compact ? 'compact' : ''}`}>
    <div className="card-header">
      <TrendingUp size={compact ? 16 : 20} />
      <h4>Opportunity</h4>
    </div>
    <div className="card-content">
      <InsightMessage message={opportunity?.message} compact={compact} />
      {opportunity?.currentRSI && !compact && (
        <div className="metrics">
          <div className="metric">
            <span className="metric-label">RSI</span>
            <span className="metric-value">{opportunity.currentRSI.toFixed(1)}</span>
          </div>
        </div>
      )}
    </div>
  </div>
);

const TradingGuardian = ({ symbol, transactions, currentPrice }) => {
  const { risk, profit, opportunity, loading } = useGuardianAnalysis(symbol, transactions, currentPrice);

  if (loading) {
    return (
      <div className="trading-guardian loading">
        <div className="guardian-header">
          <Sparkles size={24} className="sparkle-icon" />
          <h3>Trading Guardian</h3>
        </div>
        <p className="loading-text">Analyzing...</p>
        <style>{styles}</style>
      </div>
    );
  }

  return (
    <div className="trading-guardian">
      <div className="guardian-header">
        <Sparkles size={24} className="sparkle-icon" />
        <h3>Trading Guardian</h3>
        <span className="subtitle">AI-Powered Insights</span>
      </div>

      <div className="guardian-grid">
        <GuardianRiskCard risk={risk} />
        <GuardianProfitCard profit={profit} />
        <GuardianOpportunityCard opportunity={opportunity} />
      </div>

      <style>{styles}</style>
    </div>
  );
};

const styles = `
  .trading-guardian {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.05), rgba(168, 85, 247, 0.05));
    border: 1px solid var(--accent-primary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-xl);
    margin-bottom: var(--spacing-xl);
  }

  .trading-guardian.loading {
    text-align: center;
    padding: var(--spacing-xl);
  }

  .loading-text {
    color: var(--text-secondary);
    margin-top: var(--spacing-md);
  }

  .guardian-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-lg);
  }

  .sparkle-icon {
    color: var(--accent-primary);
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .guardian-header h3 {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 0;
    background: linear-gradient(to right, var(--accent-primary), var(--accent-secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .subtitle {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-left: auto;
  }

  .guardian-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: var(--spacing-lg);
  }

  .guardian-card {
    background-color: var(--bg-secondary);
    border: 1px solid var(--bg-tertiary);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    transition: all 0.3s ease;
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: auto;
    min-height: fit-content;
  }
  
  .guardian-card.compact {
    padding: 12px;
    gap: 8px;
    border-radius: var(--radius-md);
  }

  .guardian-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }
  
  .guardian-card.compact:hover {
    transform: none;
    box-shadow: none;
    border-color: var(--accent-primary);
  }

  .card-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding-bottom: var(--spacing-sm);
    border-bottom: 1px solid var(--bg-tertiary);
  }
  
  .guardian-card.compact .card-header {
    padding-bottom: 6px;
    margin-bottom: 0;
  }

  .card-header h4 {
    font-size: 1rem;
    font-weight: 600;
    margin: 0;
  }
  
  .guardian-card.compact .card-header h4 {
    font-size: 0.9rem;
  }

  .card-header svg {
    color: var(--text-accent);
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }
  
  .guardian-card.compact .card-content {
    gap: 6px;
  }

  .insight-message {
    font-size: 0.95rem;
    line-height: 1.6;
    color: var(--text-primary);
    margin: 0;
  }
  
    font-size: 0.85rem;
    line-height: 1.4;
    overflow: hidden;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-md);
    margin-top: var(--spacing-sm);
  }

  .metric {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .metric-label {
    font-size: 0.75rem;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .metric-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .metric-value.highlight {
    color: var(--accent-success);
    font-size: 1.1rem;
  }

  /* Risk level styling */
  .risk-card.high {
    border-color: var(--accent-danger);
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.05), rgba(239, 68, 68, 0.02));
  }

  .risk-card.high .card-header svg {
    color: var(--accent-danger);
  }

  .risk-card.medium {
    border-color: var(--accent-warning);
    background: linear-gradient(135deg, rgba(245, 158, 11, 0.05), rgba(245, 158, 11, 0.02));
  }

  .risk-card.medium .card-header svg {
    color: var(--accent-warning);
  }

  .risk-card.low {
    border-color: var(--accent-success);
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(16, 185, 129, 0.02));
  }

  .risk-card.low .card-header svg {
    color: var(--accent-success);
  }

  /* Profit card styling */
  .profit-card {
    border-color: var(--accent-primary);
  }

  .profit-card .card-header svg {
    color: var(--accent-primary);
  }

  /* Opportunity card styling */
  .opportunity-card.active {
    border-color: var(--accent-success);
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.05), rgba(16, 185, 129, 0.02));
  }

  .opportunity-card.active .card-header svg {
    color: var(--accent-success);
  }

  @media (max-width: 768px) {
    .guardian-grid {
      grid-template-columns: 1fr;
    }

    .guardian-header {
      flex-wrap: wrap;
    }

    .subtitle {
      margin-left: 0;
      width: 100%;
      margin-top: var(--spacing-xs);
    }
  }
`;

export default TradingGuardian;
