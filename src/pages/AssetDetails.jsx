import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, TrendingUp, TrendingDown, Calendar, Tag, Edit2, X, FileText, Sparkles, History, ChevronDown, ChevronRight, ChevronUp, Brain, Wallet } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { useAuth } from '../context/AuthContext';
import { calculateAssetPnL } from '../utils/pnlCalculator';
import { getBestTradingViewSymbol } from '../services/coinGeckoApi';
import TradingGuardian, { useGuardianAnalysis, GuardianRiskCard, GuardianProfitCard, GuardianOpportunityCard } from '../components/TradingGuardian';
import SocialNotificationWidget from '../components/SocialNotificationWidget';
import ImportantEvents from '../components/ImportantEvents';
import FundamentalWidget from '../components/FundamentalWidget';
import TransactionForm from '../components/TransactionForm';
import TradingViewChart from '../components/TradingViewChart';
import TADiagnosis from '../components/TADiagnosis';
import Modal from '../components/Modal';

const AssetDetails = () => {
  const { symbol } = useParams();
  const { user } = useAuth();
  const { transactions } = useTransactions();
  const { getPrice, getIcon } = usePrices();
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [initialTransactionType, setInitialTransactionType] = useState('buy');
  const [initialStep, setInitialStep] = useState(1);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [expandedTxIds, setExpandedTxIds] = useState([]);
  const [activeTab, setActiveTab] = useState('chart');

  const [tvSymbol, setTvSymbol] = useState(null);

  // Fetch best TradingView symbol
  React.useEffect(() => {
    let mounted = true;
    const fetchSymbol = async () => {
      // Default fallback: append USDT to give TV a better hint
      const defaultSymbol = `${symbol}USDT`;
      try {
        const bestSymbol = await getBestTradingViewSymbol(symbol);
        if (mounted && bestSymbol) {
          setTvSymbol(bestSymbol);
        } else if (mounted) {
          setTvSymbol(defaultSymbol);
        }
      } catch (e) {
        if (mounted) setTvSymbol(defaultSymbol);
      }
    };
    fetchSymbol();
    return () => { mounted = false; };
  }, [symbol]);

  // Filter transactions for this asset
  const assetTransactions = transactions.filter(t => t.asset === symbol);

  const toggleTxExpand = (id) => {
    setExpandedTxIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const priceData = getPrice(symbol);
  const currentPrice = priceData.price || 0;

  // Calculate Asset P&L
  const { realizedPnL, unrealizedPnL, totalPnL, avgBuyPrice: avgCost, holdings: currentHoldings } = calculateAssetPnL(assetTransactions, currentPrice);

  // Calculate holdings (already done in pnlCalculator but keeping logic consistent if needed elsewhere)
  const totalHoldings = assetTransactions.reduce((acc, t) => {
    return t.type === 'buy' ? acc + parseFloat(t.amount) : acc - parseFloat(t.amount);
  }, 0);

  const totalCost = assetTransactions.reduce((acc, t) => {
    return t.type === 'buy' ? acc + (parseFloat(t.amount) * parseFloat(t.price)) : acc - (parseFloat(t.amount) * parseFloat(t.price));
  }, 0);

  const currentValue = totalHoldings * currentPrice;
  // const totalPnL = currentValue - totalCost; // This is now calculated by calculateAssetPnL
  const pnlPercent = totalCost > 0 ? ((totalPnL / totalCost) * 100).toFixed(2) : 0;

  const assetData = {
    name: symbol,
    symbol: symbol,
    price: currentPrice,
    holdings: totalHoldings,
    totalPnL: totalPnL,
    pnlPercent: pnlPercent,
    change24h: priceData.change24h || 0,
  };

  const isPositive = assetData.totalPnL >= 0;

  // Get AI Insights
  const { risk, profit, opportunity, loading: guardianLoading } = useGuardianAnalysis(symbol, transactions, currentPrice);

  // Aggregate Holdings Breakdown
  const holdingsBreakdown = assetTransactions.reduce((acc, tx) => {
    if (tx.type === 'buy' && tx.holdings_breakdown && Array.isArray(tx.holdings_breakdown)) {
      acc.push(...tx.holdings_breakdown);
    }
    return acc;
  }, []);

  return (
    <>
      <div className="flex flex-col bg-slate-950 min-h-[calc(100vh-64px)] pb-24">
        {/* 1. Header Section (Compact) */}
        <div className="p-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-20">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-3">
              <Link to="/" className="p-2 -ml-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
                <ArrowLeft size={20} />
              </Link>
              <div className="flex items-center gap-3">
                {getIcon && getIcon(symbol) && (
                  <img src={getIcon(symbol)} alt={symbol} className="w-8 h-8 rounded-full" />
                )}
                <div>
                  <h1 className="text-xl font-bold text-white leading-none">{symbol}</h1>
                  <div className={`flex items-center text-xs font-medium mt-1 ${assetData.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {assetData.change24h >= 0 ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                    {Math.abs(assetData.change24h).toFixed(2)}%
                  </div>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-white">${currentPrice.toLocaleString()}</div>
              <div className="text-xs text-slate-400">Current Price</div>
            </div>
          </div>

          {/* Holdings Summary Row */}
          <div className="grid grid-cols-3 gap-2 bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Holdings</div>
              <div className="text-sm font-semibold text-slate-200">{currentHoldings.toLocaleString()}</div>
            </div>
            <div className="text-center border-l border-slate-800/50">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Value</div>
              <div className="text-sm font-semibold text-slate-200">${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="text-center border-l border-slate-800/50">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">PnL</div>
              <div className={`text-sm font-semibold ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalPnL >= 0 ? '+' : ''}{pnlPercent}%
              </div>
            </div>
          </div>
        </div>

        {/* 2. Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900 sticky top-[105px] z-10 overflow-x-auto no-scrollbar">
          {['chart', 'fundamental', 'social'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* 3. Tab Content */}
        <div className="p-4 flex-1 min-h-0">
          {activeTab === 'chart' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-300">
              <div className="card-auto relative min-h-[400px] pt-4">
                <TradingViewChart symbol={tvSymbol || symbol} autosize />
              </div>
              <div className="card-auto shrink-0">
                <TADiagnosis
                  symbol={symbol}
                  currentPrice={currentPrice}
                  iconUrl={getIcon && getIcon(symbol)}
                  autoRun={true}
                />
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-4 mt-2">
                <button
                  onClick={() => {
                    setInitialTransactionType('buy');
                    setInitialStep(1);
                    setIsTransactionModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-emerald-900/20"
                >
                  <TrendingUp size={20} /> BUY
                </button>
                <button
                  onClick={() => {
                    setInitialTransactionType('sell');
                    setInitialStep(1);
                    setIsTransactionModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-rose-900/20"
                >
                  <TrendingDown size={20} /> SELL
                </button>
              </div>

              {/* Transaction History (Moved from History Tab) */}
              <div className="card-auto flex flex-col mt-2">
                <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 -mx-4 -mt-4 mb-4 rounded-t-xl">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <History size={14} /> Transaction History
                  </h3>
                  <span className="text-xs text-slate-500">{assetTransactions.length} txs</span>
                </div>
                {/* Transaction History Header */}
                <div className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 px-4 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <div>Type</div>
                  <div>Date</div>
                  <div className="text-right">Amount</div>
                  <div className="text-right">Price</div>
                </div>

                <div className="flex-1 space-y-2">
                  {assetTransactions.length === 0 ? (
                    <div className="text-center text-slate-500 text-sm py-8">No transactions yet.</div>
                  ) : (
                    assetTransactions.sort((a, b) => new Date(b.date) - new Date(a.date)).map((tx) => {
                      const isExpanded = expandedTxIds.includes(tx.id);
                      return (
                        <div key={tx.id} className={`journal-list-item ${isExpanded ? 'expanded' : ''}`}>
                          <div
                            className="grid grid-cols-[auto_1fr_1fr_1fr] gap-2 items-center p-3 cursor-pointer hover:bg-white/5 transition-colors"
                            onClick={() => toggleTxExpand(tx.id)}
                          >
                            {/* Type */}
                            <div>
                              <span className={`type ${tx.type} text-[10px] px-1.5 py-0.5 rounded font-bold uppercase`}>
                                {tx.type === 'buy' ? 'BUY' : 'SELL'}
                              </span>
                            </div>

                            {/* Date */}
                            <div className="text-[11px] text-slate-400 flex items-center gap-1">
                              {new Date(tx.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric', year: '2-digit' })}
                            </div>

                            {/* Amount */}
                            <div className="text-right text-xs font-mono text-slate-300 truncate">
                              {parseFloat(tx.amount).toLocaleString()}
                            </div>

                            {/* Price */}
                            <div className="text-right text-xs font-mono text-slate-300 truncate">
                              ${parseFloat(tx.price).toLocaleString()}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="list-item-body">
                              <div className="thesis-section">
                                <h4><Brain size={14} /> Buy Thesis</h4>
                                {(tx.tags && tx.tags.length > 0) || (tx.selectedReasons && tx.selectedReasons.length > 0) ? (
                                  <div className="tags-display" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                    {(tx.tags && tx.tags.length > 0 ? tx.tags : tx.selectedReasons).map((tag, i) => (
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

                              {((tx.sellSignals && tx.sellSignals.length > 0) || (tx.selectedSellSignals && tx.selectedSellSignals.length > 0) || (tx.exitTags && tx.exitTags.length > 0) || tx.exitStrategy) && (
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
                                  {tx.exitStrategy && (!tx.exitTags || tx.exitTags.length === 0) && (
                                    <div className="tags-display" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                      <span
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
                                        {tx.exitStrategy}
                                      </span>
                                    </div>
                                  )}
                                  {(tx.sellSignals || tx.selectedSellSignals) && (tx.sellSignals || tx.selectedSellSignals).length > 0 && (
                                    <ul className="text-wrap-fix">
                                      {(tx.sellSignals || tx.selectedSellSignals).map((s, i) => <li key={i}>{s}</li>)}
                                    </ul>
                                  )}
                                </div>
                              )}

                              {(tx.memo || tx.notes) && (
                                <div className="thesis-section">
                                  <h4><FileText size={14} /> Investment Note</h4>
                                  <p className="text-secondary text-wrap-fix" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                                    {tx.memo || tx.notes}
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
                                    setEditingTransaction(tx);
                                    setInitialStep(1);
                                  }}
                                >
                                  <Edit2 size={14} /> Edit Transaction
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'fundamental' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-300">
              <FundamentalWidget key={symbol} symbol={symbol} name={assetData.name} />
            </div>
          )}

          {activeTab === 'social' && (
            <div className="flex flex-col gap-4 animate-in fade-in duration-300">
              <div className="card-auto flex flex-col">
                <div className="p-3 border-b border-slate-800 bg-slate-900/50 -mx-4 -mt-4 mb-4 rounded-t-xl">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Sparkles size={14} className="text-indigo-400" /> Social Intelligence
                  </h3>
                </div>
                <div className="flex-1">
                  <SocialNotificationWidget symbol={symbol} user={user} compact={true} />
                </div>
              </div>
              <ImportantEvents symbol={symbol} />
            </div>
          )}


        </div>



        {/* Modals */}
        {editingTransaction && (
          <Modal isOpen={!!editingTransaction} onClose={() => setEditingTransaction(null)}>
            <TransactionForm
              onClose={() => setEditingTransaction(null)}
              initialData={editingTransaction}
              initialStep={initialStep}
            />
          </Modal>
        )}

        {isTransactionModalOpen && (
          <Modal isOpen={isTransactionModalOpen} onClose={() => setIsTransactionModalOpen(false)}>
            <TransactionForm
              onClose={() => setIsTransactionModalOpen(false)}
              initialData={{ asset: symbol }}
              initialStep={initialStep}
              initialType={initialTransactionType}
            />
          </Modal>
        )}

      </div>
      <style>{`
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
          background-color: var(--bg-tertiary);
          color: var(--text-secondary);
        }
        
        .edit-btn:hover {
          background-color: var(--bg-secondary);
          color: var(--text-primary);
        }
      `}</style>
    </>
  );
};

// Helper for exit strategy colors (kept from original)
const getExitStrategyColor = (strategy) => {
  switch (strategy) {
    case 'Take Profit': return 'text-emerald-400 bg-emerald-400';
    case 'Stop Loss': return 'text-rose-400 bg-rose-400';
    case 'Market Structure Break': return 'text-amber-400 bg-amber-400';
    case 'Thesis Invalidation': return 'text-purple-400 bg-purple-400';
    case 'Time-based Exit': return 'text-blue-400 bg-blue-400';
    case 'Rebalancing': return 'text-cyan-400 bg-cyan-400';
    default: return 'text-slate-400 bg-slate-400';
  }
};

export default AssetDetails;
