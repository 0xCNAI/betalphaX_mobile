import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Plus, AlertCircle, Eye, EyeOff, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import Modal from './Modal';
import TransactionForm from './TransactionForm';
import { calculateAttentionLevel } from '../services/guardianAnalysis';

const AssetList = ({ onImport }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [attentionLevels, setAttentionLevels] = useState({});
  const [expandedAsset, setExpandedAsset] = useState(null);
  const [showDust, setShowDust] = useState(false);
  const { transactions } = useTransactions();
  const { getPrice, getIcon, loading: pricesLoading } = usePrices();
  const navigate = useNavigate();

  // Aggregate transactions by asset
  // Sort transactions by date to ensure correct calculation order
  // Use createdAt as tie-breaker for same-day transactions to ensure Buy -> Sell order if entered sequentially
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateDiff = new Date(a.date) - new Date(b.date);
    if (dateDiff !== 0) return dateDiff;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });

  const assetsMap = sortedTransactions.reduce((acc, tx) => {
    // Group by 'group' field if available, otherwise fallback to 'asset'
    const groupKey = tx.group || tx.asset;

    if (!acc[groupKey]) {
      const priceData = getPrice(tx.asset); // Use the main asset price for the group card
      acc[groupKey] = {
        id: groupKey,
        name: groupKey,
        symbol: groupKey,
        holdings: 0,
        totalCost: 0,
        price: priceData.price,
        change24h: priceData.change24h,
        breakdown: []
      };
    }

    const asset = acc[groupKey];

    if (tx.type === 'buy') {
      asset.totalCost += parseFloat(tx.amount) * parseFloat(tx.price || 0); // Handle null price
      asset.holdings += parseFloat(tx.amount);

      // Aggregate breakdown if present
      if (tx.holdings_breakdown && Array.isArray(tx.holdings_breakdown)) {
        // Inject the original asset name into the breakdown item for display
        const enrichedBreakdown = tx.holdings_breakdown.map(item => ({
          ...item,
          originalAsset: tx.asset // Pass the specific asset name (e.g., cbBTC)
        }));
        asset.breakdown.push(...enrichedBreakdown);
      }
    } else {
      // When selling, reduce total cost proportionally to maintain average buy price
      if (asset.holdings > 0) {
        const avgPrice = asset.totalCost / asset.holdings;
        asset.totalCost -= parseFloat(tx.amount) * avgPrice;
        asset.holdings -= parseFloat(tx.amount);

        // Note: We don't remove from breakdown on sell because tracking which specific "chunk" was sold is complex.
        // For now, the breakdown represents "sources of inflow".
      }
    }

    return acc;
  }, {});

  // Filter out dust, but keep negative holdings (liabilities) if significant
  const assets = Object.values(assetsMap).filter(a => Math.abs(a.holdings) > 0.000001);

  // Calculate attention levels for all assets
  useEffect(() => {
    const calculateLevels = async () => {
      const levels = {};

      for (const asset of assets) {
        const assetTransactions = transactions.filter(tx => tx.asset === asset.symbol);
        const level = await calculateAttentionLevel(asset, assetTransactions, asset.price);
        levels[asset.symbol] = level;
      }

      setAttentionLevels(levels);
    };

    if (assets.length > 0) {
      calculateLevels();
    }
  }, [assets.length, transactions.length]); // Recalculate when assets or transactions change

  const toggleExpand = (e, symbol) => {
    e.stopPropagation();
    setExpandedAsset(expandedAsset === symbol ? null : symbol);
  };

  return (
    <div className="asset-list-container">
      <div className="section-header">
        <h3>Your Assets</h3>
        {onImport && (
          <button className="btn-primary" onClick={onImport}>
            <Download size={18} />
            Import
          </button>
        )}
      </div>

      <div className="table-container desktop-only">
        <table className="asset-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th className="text-center">Attention</th>
              <th className="text-right">Price</th>
              <th className="text-right">Holdings</th>
              <th className="text-right">Avg. Buy</th>
              <th className="text-right">Value</th>
              <th className="text-right">PnL</th>
              <th className="text-right">24h Change</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => {
              const currentPrice = asset.price || 0;
              const currentValue = asset.holdings * currentPrice;
              const avgBuyPrice = asset.holdings > 0 ? asset.totalCost / asset.holdings : 0;
              const totalPnL = currentValue - asset.totalCost;
              const pnlPercent = asset.totalCost > 0 ? (totalPnL / asset.totalCost) * 100 : 0;
              const isExpanded = expandedAsset === asset.symbol;
              const hasBreakdown = asset.breakdown && asset.breakdown.length > 0;
              const isPositive = asset.change24h >= 0;

              return (
                <React.Fragment key={asset.symbol}>
                  <tr
                    className="asset-row"
                    onClick={() => navigate(`/asset/${asset.symbol}`)}
                  >
                    <td className="asset-name-cell">
                      <div className="asset-wrapper">
                        {hasBreakdown && (
                          <button
                            className="btn-expand-row"
                            onClick={(e) => toggleExpand(e, asset.symbol)}
                          >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        )}
                        {getIcon(asset.symbol) && (
                          <img src={getIcon(asset.symbol)} alt={asset.symbol} className="token-icon" />
                        )}
                        <div className="asset-info">
                          <span className="asset-symbol">{asset.symbol}</span>
                        </div>
                      </div>
                    </td>
                    <td className="text-center">
                      {attentionLevels[asset.symbol] ? (
                        <div className="attention-indicator" title={attentionLevels[asset.symbol].reason}>
                          <span className={`attention-badge ${attentionLevels[asset.symbol].color}`}>
                            {attentionLevels[asset.symbol].level === 'extreme' && <AlertCircle size={14} />}
                            {attentionLevels[asset.symbol].level === 'needed' && <Eye size={14} />}
                            {attentionLevels[asset.symbol].level === 'none' && <EyeOff size={14} />}
                            <span className="badge-text">{attentionLevels[asset.symbol].label}</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-secondary">-</span>
                      )}
                    </td>
                    <td className="text-right">${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className={`text-right ${asset.holdings < 0 ? 'text-danger' : ''}`}>
                      {asset.holdings.toLocaleString(undefined, { maximumFractionDigits: 4 })} {asset.symbol}
                    </td>
                    <td className="text-right text-secondary">
                      ${avgBuyPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="text-right font-medium">${currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className={`text-right ${totalPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                      {totalPnL >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                      <div className="pnl-value-small">
                        {totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </div>
                    </td>
                    <td className={`text-right ${isPositive ? 'text-success' : 'text-danger'}`}>
                      <div className="change-cell">
                        {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                        {Math.abs(asset.change24h).toFixed(1)}%
                      </div>
                    </td>
                  </tr>
                  {isExpanded && hasBreakdown && (
                    <tr className="breakdown-row">
                      <td colSpan="8">
                        {/* Desktop Breakdown (Same as before) */}
                        <div className="breakdown-container">
                          <div className="breakdown-header-row">
                            <h4>On-Chain Holdings Breakdown</h4>
                            <label className="show-dust-toggle">
                              <input
                                type="checkbox"
                                checked={showDust}
                                onChange={(e) => setShowDust(e.target.checked)}
                              />
                              <span>Show Dust</span>
                            </label>
                          </div>
                          <div className="breakdown-columns">
                            {/* Assets Column */}
                            <div className="breakdown-column">
                              <h5 className="column-title">Assets</h5>
                              <div className="breakdown-grid">
                                {asset.breakdown
                                  .filter(item => !item.isLiability && (showDust || Math.abs(item.usdValue) >= 10))
                                  .sort((a, b) => Math.abs(b.usdValue) - Math.abs(a.usdValue))
                                  .map((item, idx) => (
                                    <div key={`asset-${idx}`} className="breakdown-card">
                                      <div className="breakdown-header">
                                        <div className="source-info">
                                          <span className="chain-badge">{item.chain || 'N/A'}</span>
                                          {item.protocol_id === 'manual' ? (
                                            <span className={`source-tag ${item.protocolName === 'Manual Entry' ? 'manual' : ''}`}>
                                              {item.protocolName || 'Manual Added'}
                                            </span>
                                          ) : (
                                            <span className="source-tag">{item.protocolName || item.source}</span>
                                          )}
                                        </div>
                                        {item.protocol_id !== 'wallet' && item.protocol_id !== 'manual' && <span className="protocol-tag">DeFi</span>}
                                        {item.protocol_id === 'manual' && <span className="protocol-tag manual">User</span>}
                                      </div>
                                      <div className="breakdown-body">
                                        <div className="breakdown-stat">
                                          <span className="label">Asset</span>
                                          <span className="value">{item.originalAsset || item.rawSymbol || item.symbol}</span>
                                        </div>
                                        <div className="breakdown-stat">
                                          <span className="label">Amount</span>
                                          <span className="value">{item.amount.toFixed(4)}</span>
                                        </div>
                                        <div className="breakdown-stat">
                                          <span className="label">Value</span>
                                          <span className="value">${item.usdValue.toFixed(2)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                {asset.breakdown.filter(item => !item.isLiability && (showDust || Math.abs(item.usdValue) >= 10)).length === 0 && (
                                  <div className="empty-column-msg">No Assets</div>
                                )}
                              </div>
                            </div>

                            {/* Liabilities Column */}
                            <div className="breakdown-column">
                              <h5 className="column-title">Liabilities</h5>
                              <div className="breakdown-grid">
                                {asset.breakdown
                                  .filter(item => item.isLiability && (showDust || Math.abs(item.usdValue) >= 10))
                                  .sort((a, b) => Math.abs(b.usdValue) - Math.abs(a.usdValue))
                                  .map((item, idx) => (
                                    <div key={`liability-${idx}`} className="breakdown-card liability-card">
                                      <div className="breakdown-header">
                                        <div className="source-info">
                                          {item.chain && <span className="chain-badge">{item.chain}</span>}
                                          <span className="source-tag">{item.protocolName || item.source}</span>
                                        </div>
                                        <span className="liability-badge">Debt</span>
                                      </div>
                                      <div className="breakdown-body">
                                        <div className="breakdown-stat">
                                          <span className="label">Asset</span>
                                          <span className="value">{item.rawSymbol || item.symbol}</span>
                                        </div>
                                        <div className="breakdown-stat">
                                          <span className="label">Amount</span>
                                          <span className="value text-danger">
                                            -{item.amount.toFixed(4)}
                                          </span>
                                        </div>
                                        <div className="breakdown-stat">
                                          <span className="label">Value</span>
                                          <span className="value">${item.usdValue.toFixed(2)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                {asset.breakdown.filter(item => item.isLiability && (showDust || Math.abs(item.usdValue) >= 10)).length === 0 && (
                                  <div className="empty-column-msg">No Liabilities</div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="mobile-asset-list mobile-only">
        {/* Mobile Header Row */}
        <div className="mobile-list-header">
          <span className="col-header">Asset</span>
          <span className="col-header right">Price 24h</span>
          <span className="col-header right">Total PnL</span>
        </div>

        {assets.map((asset) => {
          const currentPrice = asset.price || 0;
          const currentValue = asset.holdings * currentPrice;
          const totalPnL = currentValue - asset.totalCost;
          const pnlPercent = asset.totalCost > 0 ? (totalPnL / asset.totalCost) * 100 : 0;
          const isPositive = asset.change24h >= 0;
          const isPnLPositive = totalPnL >= 0;

          return (
            <div
              key={asset.symbol}
              className="asset-card-compact"
              onClick={() => navigate(`/asset/${asset.symbol}`)}
            >
              {/* Col 1: Asset (Icon + Symbol + Holdings) */}
              <div className="asset-main-col">
                <div className="asset-icon-wrapper">
                  {getIcon(asset.symbol) && (
                    <img src={getIcon(asset.symbol)} alt={asset.symbol} className="token-icon-large" />
                  )}
                </div>

                <div className="asset-info-wrapper">
                  <div className="info-top">
                    <span className="asset-symbol-text">{asset.symbol}</span>
                    <span className="asset-holdings-inline">{asset.holdings.toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                  </div>
                  <div className="info-bottom">
                    <span className="asset-value-sub">${currentValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                  </div>
                </div>
              </div>

              {/* Col 2: Price 24h */}
              <div className="asset-price-col">
                <span className="asset-price-text">${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span className={`change-text-small ${isPositive ? 'text-success' : 'text-danger'}`}>
                  {isPositive ? '+' : ''}{asset.change24h.toFixed(1)}%
                </span>
              </div>

              {/* Col 3: Total PnL (Value + PnL) */}
              <div className="asset-value-col">
                <span className="asset-value-text">${currentValue.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                <span className={`pnl-value-sub ${isPnLPositive ? 'text-success' : 'text-danger'}`}>
                  ({isPnLPositive ? '+' : ''}${totalPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })})
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Transaction"
      >
        <TransactionForm onClose={() => setIsModalOpen(false)} />
      </Modal>

      <style>{`
        .asset-list-container {
          background-color: var(--bg-secondary);
          border-radius: var(--radius-lg);
          border: 1px solid var(--bg-tertiary);
          overflow: hidden;
        }

        .section-header {
          padding: var(--spacing-lg);
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid var(--bg-tertiary);
        }

        .section-header h3 {
          font-size: 1.1rem;
          font-weight: 600;
        }

        .btn-primary {
          background-color: var(--accent-primary);
          color: white;
          padding: var(--spacing-sm) var(--spacing-md);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          font-weight: 500;
          transition: background-color 0.2s;
        }

        .btn-primary:hover {
          background-color: var(--accent-secondary);
        }

        .table-container {
          overflow-x: auto;
        }

        .asset-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 800px; /* Increased min-width for new columns */
        }

        .asset-table th {
          text-align: left;
          padding: var(--spacing-xs) var(--spacing-md);
          color: var(--text-secondary);
          font-weight: 500;
          font-size: 0.875rem;
          border-bottom: 1px solid var(--bg-tertiary);
        }

        /* Fix for alignment: specific selector to override default left alignment */
        .asset-table th.text-right {
          text-align: right;
        }

        .asset-table td {
          padding: var(--spacing-sm);
          border-bottom: 1px solid var(--bg-tertiary);
          color: var(--text-primary);
        }

        .asset-table tr:last-child td {
          border-bottom: none;
        }

        .asset-row {
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .asset-row:hover {
          background-color: var(--bg-tertiary);
        }

        .asset-info {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
        }

        .token-icon {
          width: 24px;
          height: 24px;
          border-radius: 50%;
        }

        .asset-symbol {
          font-weight: 600;
          background-color: var(--bg-tertiary);
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 0.8rem;
        }

        .asset-name {
          color: var(--text-secondary);
        }

        .text-right {
          text-align: right;
        }

        .text-center {
          text-align: center;
        }

        .text-secondary {
          color: var(--text-secondary);
        }

        .font-medium {
          font-weight: 500;
        }

        .asset-table td.text-success {
          color: var(--accent-success);
        }

        .asset-table td.text-danger {
          color: var(--accent-danger);
        }

        .change-cell {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 4px;
        }

        .pnl-info {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }

        .pnl-percent {
          font-size: 0.75rem;
          opacity: 0.8;
        }

        .pnl-value-small {
            font-size: 0.7rem;
            color: var(--text-secondary);
        }

        .attention-indicator {
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .attention-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          font-size: 0.75rem;
          font-weight: 600;
          white-space: nowrap;
        }

        .attention-badge.red {
          background-color: rgba(239, 68, 68, 0.15);
          color: var(--accent-danger);
          border: 1px solid var(--accent-danger);
        }

        .attention-badge.yellow {
          background-color: rgba(245, 158, 11, 0.15);
          color: var(--accent-warning);
          border: 1px solid var(--accent-warning);
        }

        .attention-badge.green {
          background-color: rgba(16, 185, 129, 0.15);
          color: var(--accent-success);
          border: 1px solid var(--accent-success);
        }

        .badge-text {
          font-size: 0.7rem;
        }

        .asset-wrapper {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .btn-expand-row {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            transition: color 0.2s;
        }
        .btn-expand-row:hover {
            color: var(--text-primary);
        }

        .breakdown-row td {
            background-color: rgba(0, 0, 0, 0.2);
            padding: 0 !important;
        }

        .breakdown-container {
            padding: 16px 24px;
        }

        .breakdown-container h4 {
            margin: 0;
            font-size: 0.9rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .breakdown-header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }

        .show-dust-toggle {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.8rem;
            color: var(--text-secondary);
            cursor: pointer;
            user-select: none;
        }

        .show-dust-toggle input {
            cursor: pointer;
        }

        .breakdown-columns {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
        }

        .breakdown-column {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .column-title {
            font-size: 0.85rem;
            color: var(--text-secondary);
            margin: 0;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--bg-tertiary);
        }

        .breakdown-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 12px;
        }

        .empty-column-msg {
            font-size: 0.8rem;
            color: var(--text-secondary);
            font-style: italic;
            padding: 8px;
            opacity: 0.6;
        }

        @media (max-width: 768px) {
            .breakdown-columns {
                grid-template-columns: 1fr;
            }
        }

        .breakdown-card {
            background-color: var(--bg-tertiary);
            border-radius: var(--radius-sm);
            padding: 12px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .breakdown-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
        }

        .source-tag {
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--text-primary);
        }

        .protocol-tag {
            font-size: 0.7rem;
            background-color: var(--accent-primary);
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
        }

        .protocol-tag.manual {
            background-color: var(--bg-tertiary);
            color: var(--text-secondary);
            border: 1px solid var(--text-secondary);
        }

        .source-tag.manual {
            color: var(--accent-primary);
            font-weight: 700;
        }

        .breakdown-body {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .breakdown-stat {
            display: flex;
            justify-content: space-between;
            font-size: 0.85rem;
        }

        .breakdown-stat .label {
            color: var(--text-secondary);
        }

        .breakdown-stat .value {
            font-family: var(--font-mono);
        }
        @media (max-width: 1024px) {
          .badge-text {
            display: none;
          }
        }

        .source-info {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .chain-badge {
            font-size: 0.7rem;
            text-transform: uppercase;
            background-color: rgba(255,255,255,0.1);
            padding: 2px 4px;
            border-radius: 4px;
            color: var(--text-secondary);
        }

        .liability-card {
            border-color: var(--accent-danger);
            background-color: rgba(239, 68, 68, 0.05);
        }

        .liability-badge {
            font-size: 0.7rem;
            background-color: var(--accent-danger);
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
        }

        /* Mobile Card Styles */
        .mobile-asset-list {
          display: none;
          flex-direction: column;
          gap: 0; /* Remove gap for list look */
        }

        .mobile-list-header {
            display: grid;
            grid-template-columns: 1.5fr 0.8fr 1fr; /* Previously 1.2fr 1fr 1.2fr */
            padding: 8px 12px;
            border-bottom: 1px solid var(--bg-tertiary);
            background-color: var(--bg-secondary);
        }

        .col-header {
            font-size: 0.75rem;
            color: var(--text-secondary);
            font-weight: 600;
            text-transform: uppercase;
        }
        .col-header.right { text-align: right; }

        .asset-card-compact {
          background-color: var(--bg-secondary);
          padding: 12px 12px;
          display: grid;
          grid-template-columns: 1.5fr 0.8fr 1fr; /* Matched to header */
          align-items: center;
          gap: 8px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .asset-card-compact:last-child {
            border-bottom: none;
        }

        /* Col 1 Styles */
        .asset-main-col {
            display: flex;
            align-items: center;
            gap: 10px;
            overflow: hidden; /* Prevent overflow */
        }

        .asset-icon-wrapper {
            flex-shrink: 0;
        }

        .token-icon-large {
            width: 26px;
            height: 26px;
            border-radius: 50%;
            display: block;
        }

        .asset-info-wrapper {
            display: flex;
            flex-direction: column;
            justify-content: center;
            overflow: hidden;
        }

        .info-top {
            display: flex;
            align-items: baseline;
            gap: 4px; /* Reduced gap */
        }

        .asset-symbol-text {
            font-weight: 700;
            font-size: 0.8rem; /* Further reduced from 0.85rem */
            color: var(--text-primary);
            white-space: nowrap;
        }

        .asset-holdings-inline {
            font-size: 0.75rem; /* Reduced font size */
            color: var(--text-secondary);
            font-weight: 500;
        }

        .info-bottom {
            display: flex;
        }
        
        .asset-value-sub {
            font-size: 0.8rem; /* Reduced font size */
            color: var(--text-secondary);
            font-weight: 500;
        }

        .asset-holdings-text {
            font-size: 0.8rem;
            color: var(--text-secondary);
        }

        /* Col 2 Styles */
        .asset-price-col {
            text-align: right;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            justify-content: center;
        }

        .asset-price-text {
            font-size: 0.9rem;
            color: var(--text-primary);
            font-weight: 500;
        }

        .change-text-small {
            font-size: 0.75rem;
            font-weight: 500;
        }

        /* Col 3 Styles */
        .asset-value-col {
            text-align: right;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            justify-content: center;
        }

        .asset-value-text {
            font-weight: 700;
            font-size: 0.95rem;
            color: var(--text-primary);
        }

        .pnl-value-sub {
            font-size: 0.75rem;
            font-weight: 500;
        }

        .text-success { color: var(--accent-success); }
        .text-danger { color: var(--accent-danger); }
        .change-pill.negative { background: rgba(239, 68, 68, 0.1); color: var(--accent-danger); }

        .card-middle {
          display: flex;
          justify-content: space-between;
          padding: 8px 0;
          border-top: 1px solid rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .stat-col {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .stat-col.right { align-items: flex-end; }

        .stat-col .label { font-size: 0.7rem; color: var(--text-secondary); text-transform: uppercase; }
        .stat-col .value { font-size: 0.9rem; font-weight: 500; }

        .card-bottom {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .badge-text-mobile {
          font-size: 0.7rem;
        }

        @media (max-width: 768px) {
          .desktop-only { display: none; }
          .mobile-only { display: flex; }
          .section-header { padding: 12px; }
          .asset-list-container { border-radius: 0; border-left: none; border-right: none; }
        }
      `}</style>
    </div>
  );
};

export default AssetList;
