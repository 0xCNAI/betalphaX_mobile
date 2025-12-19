import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, TrendingUp, TrendingDown, Calendar, Tag, Edit2, X, FileText, Sparkles, History, ChevronDown, ChevronRight, ChevronUp, Brain, Wallet, ExternalLink, BarChart3, MessageCircle, Plus, RefreshCw, BookOpen, Trash2, Target, Activity, CheckSquare, Loader2 } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { calculateAssetPnL } from '../utils/pnlCalculator';
import { addNote } from '../services/noteService';
import { getBestTradingViewSymbol } from '../services/coinGeckoApi';
import { summarizeTweet } from '../services/geminiService';
import TradingGuardian, { useGuardianAnalysis, GuardianRiskCard, GuardianProfitCard, GuardianOpportunityCard } from '../components/TradingGuardian';
import SocialNotificationWidget from '../components/SocialNotificationWidget';
import ImportantEvents from '../components/ImportantEvents';
import FundamentalWidget from '../components/FundamentalWidget';

import TradingViewChart from '../components/TradingViewChart';
import TADiagnosis from '../components/TADiagnosis';
import TransactionForm from '../components/TransactionForm';
import Modal from '../components/Modal';
import NoteForm from '../components/NoteForm';
import './AssetDetails.css';

const CollapsibleSection = ({ title, icon: Icon, children, defaultOpen = false, rightElement = null, forceMount = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hasLoaded, setHasLoaded] = useState(defaultOpen || forceMount);

  const toggle = () => {
    if (!isOpen && !hasLoaded) setHasLoaded(true);
    setIsOpen(!isOpen);
  };

  return (
    <div className="asset-card p-0 overflow-hidden mb-4">
      <div
        className="p-4 flex justify-between items-center cursor-pointer bg-slate-900/50 hover:bg-slate-800/50 transition-colors"
        onClick={toggle}
      >
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
          {Icon && <Icon size={16} className="text-indigo-400" />} {title}
        </h3>
        <div className="flex items-center gap-3">
          {rightElement && (
            <div onClick={(e) => e.stopPropagation()}>
              {rightElement}
            </div>
          )}
          {isOpen ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
        </div>
      </div>

      {hasLoaded && (
        <div className={isOpen ? 'block p-4 border-t border-slate-800' : 'hidden'}>
          {children}
        </div>
      )}

    </div>
  );
};

const AssetDetails = () => {
  const { symbol } = useParams();
  const { transactions, deleteTransaction, getIcon } = useTransactions();
  const { user } = useAuth();
  const { getPrice } = usePrices();
  const { t } = useLanguage();

  const [expandedTxIds, setExpandedTxIds] = useState([]);
  // Edit/Create Transaction State
  const [isRefreshingEvents, setIsRefreshingEvents] = useState(false);
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [initialStep, setInitialStep] = useState(1);
  const [initialTransactionType, setInitialTransactionType] = useState('buy');

  const importantEventsRef = useRef(null);

  // ... existing logic

  // Function to run review


  // ... existing render ...

  // INSERT UI above Transaction History or in a new "Coach" tab/section



  // const [editingNote, setEditingNote] = useState(null); // Removed editing note state for history
  // const [assetNotes, setAssetNotes] = useState([]); // Removed asset notes fetching

  const [tvSymbol, setTvSymbol] = useState(null);

  // Ref for ImportantEvents to trigger refresh


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

  // Find the correct CoinGecko ID from transactions if available
  const storedCoinId = assetTransactions.find(t => t.coinId)?.coinId;
  const storedCoinName = assetTransactions.find(t => t.coinName)?.coinName;

  const toggleTxExpand = (id) => {
    setExpandedTxIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const priceData = getPrice(symbol);
  const currentPrice = priceData.price || 0;

  // Calculate Asset P&L (Now uses Moving Average Cost logic)
  const {
    realizedPnL,
    unrealizedPnL,
    totalPnL,
    avgBuyPrice: avgCost,
    holdings: currentHoldings,
    totalCost: currentCostBasis
  } = calculateAssetPnL(assetTransactions, currentPrice);

  const currentValue = currentHoldings * currentPrice;

  const pnlPercent = currentCostBasis > 0 ? ((totalPnL / currentCostBasis) * 100).toFixed(2) : 0;

  const assetData = {
    name: symbol,
    symbol: symbol,
    price: currentPrice,
    holdings: currentHoldings,
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
      <div className="asset-page-container">
        {/* 1. Header Section (Compact) */}
        <div className="asset-header shrink-0">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <div className="flex items-center gap-3">
              {getIcon && getIcon(symbol) && (
                <img src={getIcon(symbol)} alt={symbol} className="w-10 h-10 rounded-full" />
              )}
              <div>
                <h1 className="text-2xl font-bold text-white leading-none">{symbol}</h1>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span>${currentPrice.toLocaleString()}</span>
                  <span className={`flex items-center ${assetData.change24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {assetData.change24h >= 0 ? <TrendingUp size={14} className="mr-1" /> : <TrendingDown size={14} className="mr-1" />}
                    {Math.abs(assetData.change24h).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-4 gap-4 mr-2">
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t('holdings')}</div>
                <div className="text-lg font-bold text-white">{currentHoldings.toLocaleString()} {symbol}</div>
                <div className="text-xs text-slate-400">${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t('avgCost')}</div>
                <div className="text-lg font-bold text-white">${avgCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t('unrealizedPnL')}</div>
                <div className={`text-lg font-bold ${unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className={`text-xs ${unrealizedPnL >= 0 ? 'text-emerald-500/70' : 'text-rose-500/70'}`}>
                  {unrealizedPnL >= 0 ? '+' : ''}{(currentCostBasis > 0 ? (unrealizedPnL / currentCostBasis * 100) : 0).toFixed(2)}%
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">{t('realizedPnL')}</div>
                <div className={`text-lg font-bold ${realizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {realizedPnL >= 0 ? '+' : ''}${realizedPnL.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div className="text-xs text-slate-500/70">
                  {t('banked')}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* 2. Main Content Grid */}
        <div className="asset-page-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {/* Left Column: Chart + Fundamental + Social */}
          <div className="asset-column" style={{ minWidth: 0 }}>
            {/* Chart */}
            <div className="asset-card relative min-h-[500px] pt-4">
              <TradingViewChart symbol={tvSymbol || symbol} coinId={storedCoinId} autosize />
            </div>

            {/* Fundamental Intelligence */}
            <CollapsibleSection title={t('fundamentalIntelligence')} icon={Brain} defaultOpen={true}>
              <FundamentalWidget symbol={symbol} coinId={storedCoinId} coinName={storedCoinName} embedded={true} />
            </CollapsibleSection>



            {/* Social Intelligence */}
            <CollapsibleSection title={t('socialIntelligence')} icon={MessageCircle}>
              <SocialNotificationWidget
                symbol={symbol}
                user={user}
                onCreateNote={async (text, url) => {
                  if (!user) return;
                  const payload = {
                    noteCategory: 'highlight',
                    sourceType: 'social_feed',
                    sourceRef: {
                      asset: symbol,
                      group: 'social',
                      externalId: null, // Could add ID if available
                      meta: JSON.stringify({ url })
                    },
                    title: `[Social] ${symbol} Update`,
                    content: `${text}\n\nLink: ${url}`,
                    tags: ['social', symbol],
                    importance: 3,
                    forTraining: false
                  };

                  try {
                    await addNote(user.uid, {
                      ...payload,
                      type: 'token',
                      asset: symbol,
                      coinId: storedCoinId || null
                    });
                    alert("Saved to Notebook!");
                  } catch (err) {
                    console.error("Failed to save note:", err);
                    alert("Failed to save note.");
                  }
                }}
                compact={true}
              />
            </CollapsibleSection>

            {/* Important Events (News Dashboard) */}
            <CollapsibleSection
              title={t('importantEvents')}
              icon={Calendar}
              defaultOpen={false}
              rightElement={
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (importantEventsRef.current) {
                      importantEventsRef.current.refresh();
                    } else {
                      console.warn("ImportantEvents ref is null");
                    }
                  }}
                  className={`px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 rounded text-blue-400 text-xs font-bold flex items-center gap-1 transition-colors z-10 ${isRefreshingEvents ? 'opacity-70 cursor-wait' : ''}`}
                  title={t('refresh')}
                  disabled={isRefreshingEvents}
                >
                  <RefreshCw size={12} className={isRefreshingEvents ? 'animate-spin' : ''} />
                  {isRefreshingEvents ? t('refreshing') : t('refresh')}
                </button>
              }
              forceMount={true}
            >
              <ImportantEvents
                ref={importantEventsRef}
                symbol={symbol}
                coinId={storedCoinId}
                embedded={true}
                onRefreshChange={setIsRefreshingEvents}
                onCreateNote={async (text, url) => {
                  if (!user) return;
                  const payload = {
                    noteCategory: 'highlight',
                    sourceType: 'important_event',
                    sourceRef: {
                      asset: symbol,
                      group: 'event',
                      externalId: null,
                      meta: JSON.stringify({ url })
                    },
                    title: `[Event] ${symbol} Insight`,
                    content: `${text}\n\nLink: ${url}`,
                    tags: ['event', symbol],
                    importance: 3,
                    forTraining: false
                  };

                  try {
                    await addNote(user.uid, {
                      ...payload,
                      type: 'token',
                      asset: symbol,
                      coinId: storedCoinId || null
                    });
                    alert("Saved to Notebook!");
                  } catch (err) {
                    console.error("Failed to save note:", err);
                    alert("Failed to save note.");
                  }
                }}
              />
            </CollapsibleSection>
          </div>

          {/* Right Column: AI + Actions + History + Holdings */}
          <div className="asset-column" style={{ minWidth: 0 }}>
            {/* AI Diagnosis */}
            <div className="asset-card shrink-0 p-0 overflow-hidden ta-card-container">
              <TADiagnosis
                symbol={symbol}
                currentPrice={currentPrice}
                iconUrl={getIcon && getIcon(symbol)}
                autoRun={true}
              />
            </div>

            {/* Top: Buy/Sell Section */}
            <div className="asset-card shrink-0">
              <button
                className="w-full bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all text-sm"
                onClick={() => {
                  // setEditingNote(null);
                  setIsNoteModalOpen(true);
                }}
              >
                <BookOpen size={16} /> {t('addNewNote')}
              </button>
            </div>

            <div className="asset-card shrink-0">
              <div className="flex gap-2">
                <button
                  className="flex-1 bg-green-500/10 hover:bg-green-500/20 text-green-500 border border-green-500/30 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all"
                  onClick={() => {
                    setInitialTransactionType('buy');
                    setInitialStep(1);
                    setIsTransactionModalOpen(true);
                  }}
                >
                  <TrendingUp size={18} /> {t('buy')}
                </button>
                <button
                  className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all"
                  onClick={() => {
                    setInitialTransactionType('sell');
                    setInitialStep(1);
                    setIsTransactionModalOpen(true);
                  }}
                >
                  <TrendingDown size={18} /> {t('sell')}
                </button>
              </div>
            </div>

            {/* Bottom: Transaction History (Accordion Style) */}
            <div className="asset-card flex flex-col">
              <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900/50 -mx-5 -mt-4 mb-4 rounded-t-xl">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <History size={14} /> {t('history')}
                </h3>
                <span className="text-xs text-slate-500">{assetTransactions.length} txs</span>
              </div>
              <div className="flex-1 space-y-2">
                {assetTransactions.length === 0 ? (
                  <div className="text-center text-slate-500 text-sm py-8">{t('noTransactions')}</div>
                ) : (
                  assetTransactions
                    .sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
                    .map((item) => {
                      const tx = item;
                      const isExpanded = expandedTxIds.includes(tx.id);
                      return (
                        <div key={tx.id} className={`journal-list-item ${isExpanded ? 'expanded' : ''}`}>
                          <div className="list-item-header" onClick={() => toggleTxExpand(tx.id)}>
                            <div className="header-left">
                              <div className="asset-badge">
                                {getIcon && getIcon(symbol) && (
                                  <img
                                    src={getIcon(symbol)}
                                    alt={symbol}
                                    style={{ width: '20px', height: '20px', borderRadius: '50%', marginRight: '6px' }}
                                  />
                                )}
                                <span className="symbol">{symbol}</span>
                                <span className={`type ${tx.type}`}>{tx.type.toUpperCase()}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm text-slate-400 flex items-center gap-2 whitespace-nowrap">
                                  <Calendar size={14} />
                                  {new Date(tx.date).toLocaleDateString('en-CA')}
                                </span>
                                <span className="text-xs text-slate-500 ml-6 whitespace-nowrap">
                                  {new Date(tx.date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                </span>
                              </div>
                            </div>

                            <div className="header-right">
                              <div className="financials-compact">
                                <span className="amount">{tx.amount} {symbol}</span>
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
                                <h4><Brain size={14} /> {t('buyThesis')}</h4>
                                {(tx.tags && tx.tags.length > 0) || (tx.selectedReasons && tx.selectedReasons.length > 0) ? (
                                  <div className="tags-display" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                    {(tx.tags && tx.tags.length > 0 ? tx.tags : (tx.reasons || tx.selectedReasons || [])).map((tag, i) => {
                                      const link = tx.reasonLinks?.[tag] || tx.reasonLinks?.[tag.trim()];
                                      const TagEl = link ? 'a' : 'span';
                                      const tagProps = link ? {
                                        href: link,
                                        target: "_blank",
                                        rel: "noopener noreferrer",
                                        onClick: (e) => e.stopPropagation() // Prevent expanding row
                                      } : {};

                                      return (
                                        <TagEl
                                          key={i}
                                          className="tag-pill"
                                          {...tagProps}
                                          style={{
                                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                            color: 'var(--accent-success)',
                                            padding: '4px 10px',
                                            borderRadius: '14px',
                                            fontSize: '0.8rem',
                                            fontWeight: '500',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            cursor: link ? 'pointer' : 'default',
                                            textDecoration: 'none'
                                          }}
                                        >
                                          {tag}
                                          {link && <ExternalLink size={10} />}
                                        </TagEl>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <p className="text-secondary">{t('noThesis')}</p>
                                )}
                              </div>

                              {((tx.sellSignals && tx.sellSignals.length > 0) || (tx.selectedSellSignals && tx.selectedSellSignals.length > 0) || (tx.exitTags && tx.exitTags.length > 0) || tx.exitStrategy) && (
                                <div className="thesis-section">
                                  <h4><TrendingDown size={14} /> {t('exitStrategy')}</h4>
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
                                  <h4><FileText size={14} /> {t('investmentNote')}</h4>
                                  <p className="text-secondary text-wrap-fix" style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
                                    {tx.memo || tx.notes}
                                  </p>
                                </div>
                              )}

                              {tx.holdings_breakdown && tx.holdings_breakdown.length > 0 && (
                                <div className="thesis-section">
                                  <h4><Wallet size={14} /> {t('onChainSource')}</h4>
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
                                  <Edit2 size={14} /> {t('editTransaction')}
                                </button>
                                <button
                                  className="btn-secondary delete-btn"
                                  style={{
                                    color: 'var(--accent-danger)',
                                    borderColor: 'rgba(239, 68, 68, 0.3)',
                                    background: 'rgba(239, 68, 68, 0.05)',
                                    marginLeft: '8px'
                                  }}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (window.confirm(t('deleteConfirm'))) {
                                      await deleteTransaction(tx.id);
                                    }
                                  }}
                                >
                                  <Trash2 size={14} /> {t('deleteTransaction')}
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
        </div >

        {/* Modals */}


        {
          editingTransaction && (
            <Modal isOpen={!!editingTransaction} onClose={() => setEditingTransaction(null)}>
              <TransactionForm
                onClose={() => setEditingTransaction(null)}
                initialData={editingTransaction}
                initialStep={initialStep}
              />
            </Modal>
          )
        }

        {
          isTransactionModalOpen && (
            <Modal isOpen={isTransactionModalOpen} onClose={() => setIsTransactionModalOpen(false)}>
              <TransactionForm
                onClose={() => setIsTransactionModalOpen(false)}
                initialData={{ asset: symbol }}
                initialStep={initialStep}
                initialType={initialTransactionType}
              />
            </Modal>
          )
        }

        {isNoteModalOpen && (
          <Modal isOpen={isNoteModalOpen} onClose={() => setIsNoteModalOpen(false)}>
            <NoteForm
              initialAsset={symbol}
              // initialNote={editingNote} // Removed editing
              onClose={() => {
                setIsNoteModalOpen(false);
                // setEditingNote(null);
              }}
            />
          </Modal>
        )}

      </div >
      <style>{`
        .asset-page-container {
          display: flex;
          flex-direction: column;
          gap: 24px;
          height: 100%;
          padding: 24px;
          width: 100%;
        }

        .asset-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .asset-page-grid {
          display: grid;
          grid-template-columns: 1fr 400px;
          gap: 24px;
          align-items: start;
        }

        @media (max-width: 1280px) {
          .asset-page-grid {
            grid-template-columns: 1fr;
          }
        }

        .asset-card {
          background-color: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary);
          border-radius: 12px;
          padding: 20px;
          height: fit-content;
        }

        .asset-column {
          display: flex;
          flex-direction: column;
          gap: 24px;
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
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }

        .list-item-header {
          padding: 12px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: pointer;
          background-color: rgba(255,255,255,0.02);
        }

        .list-item-header:hover {
          background-color: rgba(255,255,255,0.04);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: var(--spacing-lg);
        }

        .asset-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background-color: var(--bg-tertiary);
          padding: 4px 8px;
          border-radius: 4px;
          min-width: 100px;
        }

        .asset-badge .symbol {
          font-weight: 700;
          font-size: 1rem;
          color: var(--text-primary);
        }

        .asset-badge .type {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          color: #fff;
        }

        .asset-badge .type.buy {
          background-color: var(--accent-success);
        }

        .asset-badge .type.sell {
          background-color: var(--accent-danger);
        }

        .date {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .financials-compact {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 2px;
        }

        .amount {
          font-weight: 600;
          color: var(--text-primary);
        }

        .price {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }

        .toggle-btn {
          margin-left: 12px;
        }

        .chevron {
          transition: transform 0.2s;
          color: var(--text-secondary);
        }

        .chevron.rotated {
          transform: rotate(90deg);
        }

        .list-item-body {
          padding: 16px;
          border-top: 1px solid var(--bg-tertiary);
          background-color: rgba(0,0,0,0.2);
        }

        .thesis-section {
          margin-bottom: 16px;
        }

        .thesis-section h4 {
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--text-secondary);
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .text-wrap-fix {
          white-space: pre-wrap;
          overflow-wrap: break-word;
          max-width: 100%;
        }

        .item-actions {
          display: flex;
          justify-content: flex-end;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid var(--bg-tertiary);
        }

        .btn-secondary {
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          font-size: 0.85rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
        }

        .btn-secondary:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
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
