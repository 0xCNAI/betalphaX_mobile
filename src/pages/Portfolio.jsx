import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, Target, Upload, Loader2, Shield, Activity, PieChart, Brain, Plus, X, Wallet, ArrowDown, FileText } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { calculatePortfolioPnL } from '../utils/pnlCalculator';
import AssetList from '../components/AssetList';
import PortfolioHistoryChart from '../components/PortfolioHistoryChart';
import UnifiedImportModal from '../components/UnifiedImportModal';
import TransactionForm from '../components/TransactionForm';
import NoteForm from '../components/NoteForm';
import Modal from '../components/Modal';

import { generatePortfolioOverview, cacheOverview, getCachedOverview } from '../services/analysisService';
import PortfolioAIOverview from '../components/PortfolioAIOverview';

import { useAuth } from '../context/AuthContext';

const Portfolio = () => {
    const { user, signOut } = useAuth();
    const { transactions, bulkAddTransactions, addTransaction } = useTransactions();
    const { getPrice, loading: pricesLoading, error, lastUpdate } = usePrices();
    const [showUnifiedImport, setShowUnifiedImport] = useState(false);
    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
    const [showAddTransaction, setShowAddTransaction] = useState(false);
    const [showAIInsights, setShowAIInsights] = useState(false);
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);

    // Mock States for UI Design
    const [totalBalance, setTotalBalance] = useState(0);
    const [dailyPnL, setDailyPnL] = useState(0);
    const [realizedPnL, setRealizedPnL] = useState(0);
    const [unrealizedPnL, setUnrealizedPnL] = useState(0);
    const [totalPnL, setTotalPnL] = useState(0);


    // Calculate real-time total balance and PnL
    useEffect(() => {
        let total = 0;
        let pnl = 0;

        const currentPricesMap = {};
        transactions.forEach(tx => {
            const p = getPrice(tx.asset);
            if (p) currentPricesMap[tx.asset] = p.price;
        });

        // Calculate Portfolio P&L
        const { realizedPnL: calculatedRealizedPnL, unrealizedPnL: calculatedUnrealizedPnL, totalPnL: calculatedTotalPnL } = calculatePortfolioPnL(transactions, currentPricesMap);
        setRealizedPnL(calculatedRealizedPnL);
        setUnrealizedPnL(calculatedUnrealizedPnL);
        setTotalPnL(calculatedTotalPnL);

        // Calculate Holdings based on Ledger (Buy - Sell)
        const assetHoldings = transactions.reduce((acc, tx) => {
            const symbol = tx.asset.toUpperCase();
            if (!acc[symbol]) acc[symbol] = 0;

            const amount = parseFloat(tx.amount || 0);

            if (tx.type === 'buy') {
                acc[symbol] += amount;
            } else if (tx.type === 'sell') {
                acc[symbol] -= amount;
            }
            return acc;
        }, {});

        Object.entries(assetHoldings).forEach(([symbol, amount]) => {
            // Filter out dust/negative amounts
            if (amount > 0.000001) {
                const priceData = getPrice(symbol);
                const currentPrice = priceData && priceData.price > 0 ? priceData.price : 0;

                const value = amount * currentPrice;
                total += value;

                if (priceData && priceData.change24h) {
                    const startValue = value / (1 + (priceData.change24h / 100));
                    pnl += (value - startValue);
                }
            }
        });

        setTotalBalance(total);
        setDailyPnL(pnl);
    }, [transactions, pricesLoading, lastUpdate, getPrice]);

    const handleImport = (transactions) => {
        bulkAddTransactions(transactions);
        setShowUnifiedImport(false);
    };

    const handleManualAdd = (transaction) => {
        setShowUnifiedImport(false);
    };

    const handleAddNote = () => {
        setIsNoteModalOpen(true);
    };

    // Prepare prices object for AI Overview
    const currentPricesForAI = {};
    transactions.forEach(tx => {
        const p = getPrice(tx.asset);
        if (p) currentPricesForAI[tx.asset] = p;
    });

    if (showAIInsights) {
        return (
            <div className="portfolio-page">
                <div className="page-header">
                    <button className="btn-icon" onClick={() => setShowAIInsights(false)}>
                        <X size={24} />
                    </button>
                    <h2 style={{ fontSize: '1.2rem', margin: 0 }}>AI Insights</h2>
                    <div style={{ width: 24 }}></div>
                </div>
                <PortfolioAIOverview transactions={transactions} prices={currentPricesForAI} user={user} />
            </div>
        );
    }

    return (
        <div className="portfolio-page">
            {/* Header: AI Insights (Left) and Import (Right) */}
            <div className="page-header-compact">
                <button className="btn-header-action" onClick={() => setShowAIInsights(true)}>
                    <Sparkles size={16} />
                    <span>AI Insights</span>
                </button>
                <button className="btn-header-action" onClick={() => setShowUnifiedImport(true)}>
                    <ArrowDown size={16} />
                    <span>Import</span>
                </button>
            </div>

            {/* Top Section: Balance & Chart */}
            <div className="top-grid-compact">
                <div className="dashboard-card-compact">
                    <div className="balance-card-compact">
                        <div className="balance-header-compact">
                            <h3 className="text-secondary text-sm uppercase tracking-wider">Total Balance</h3>
                        </div>

                        <div className="balance-content-compact">
                            <div className="main-balance-compact">
                                <span className="currency-symbol-compact">$</span>
                                <span className="amount-compact">{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>

                            <div className="daily-change-compact">
                                <span className={`stat-change ${dailyPnL >= 0 ? 'positive' : 'negative'}`}>
                                    {dailyPnL >= 0 ? '+' : ''}{dailyPnL.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} (24h)
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Chart Section */}
                    <div className="chart-section-mobile">
                        <PortfolioHistoryChart compact={true} height={180} />
                    </div>

                    {/* Action Buttons Row: Add Transaction (Left), Add Note (Right) */}
                    <div className="action-buttons-row">
                        <button className="btn-action-primary" onClick={() => setIsTransactionModalOpen(true)}>
                            <Plus size={18} />
                            <span>Add Transaction</span>
                        </button>
                        <button className="btn-action-secondary" onClick={handleAddNote}>
                            <FileText size={18} />
                            <span>Add Note</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom: Asset List */}
            <div className="content-section">
                <AssetList />
            </div>

            {/* Sign Out Button */}
            <div className="footer-actions">
                <button className="btn-sign-out-danger" onClick={signOut}>
                    Sign Out
                </button>
            </div>

            {/* Modals */}
            {showUnifiedImport && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-end sm:items-center z-50 sm:p-4">
                    <div className="bg-slate-900 w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-2xl overflow-y-auto border-slate-800 shadow-2xl relative animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-200">
                        <button className="absolute top-4 right-4 p-2 bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors z-10" onClick={() => setShowUnifiedImport(false)}>
                            <X size={20} />
                        </button>
                        <UnifiedImportModal onClose={() => setShowUnifiedImport(false)} onImport={handleImport} onManualAdd={handleManualAdd} />
                    </div>
                </div>
            )}

            {isTransactionModalOpen && (
                <Modal isOpen={isTransactionModalOpen} onClose={() => setIsTransactionModalOpen(false)}>
                    <TransactionForm onClose={() => setIsTransactionModalOpen(false)} />
                </Modal>
            )}

            {isNoteModalOpen && (
                <Modal isOpen={isNoteModalOpen} onClose={() => setIsNoteModalOpen(false)} title="Add New Note">
                    <NoteForm onClose={() => setIsNoteModalOpen(false)} />
                </Modal>
            )}

            <style>{`
        .portfolio-page {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
          padding-bottom: 80px;
          color: #e2e8f0; /* Default text color light slate */
        }

        .page-header-compact {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-xs);
          padding: 0 var(--spacing-sm);
        }

        /* Unified Header Button Style */
        .btn-header-action {
            display: flex;
            align-items: center;
            gap: 6px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #94a3b8; /* slate-400 */
            padding: 8px 14px;
            border-radius: 999px; /* Pill shape */
            font-size: 0.8rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .btn-header-action:hover {
            background: rgba(255, 255, 255, 0.08);
            color: #f8fafc; /* slate-50 */
            border-color: rgba(255, 255, 255, 0.2);
        }

        .top-grid-compact {
            display: flex;
            flex-direction: column;
            gap: var(--spacing-md);
        }

        .dashboard-card-compact {
            display: flex;
            flex-direction: column;
            gap: var(--spacing-md);
            /* Removed card background to make it cleaner/more open on mobile, 
               or keeps it minimal. If needed, can add back a subtle bg */
        }

        .balance-card-compact {
            display: flex;
            flex-direction: column;
            align-items: center;
            padding: var(--spacing-xs) 0;
            text-align: center;
        }

        .balance-header-compact h3 {
            font-size: 0.7rem;
            color: #64748b; /* slate-500 */
            margin: 0;
            opacity: 0.9;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .balance-content-compact {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            margin-top: 4px;
        }

        .main-balance-compact {
            display: flex;
            align-items: baseline;
            gap: 4px;
        }

        .currency-symbol-compact {
            font-size: 1.5rem;
            font-weight: 600;
            color: #94a3b8; /* slate-400 */
        }

        .amount-compact {
            font-size: 2.75rem;
            font-weight: 700;
            color: #f8fafc; /* slate-50 */
            letter-spacing: -1px;
            
            /* Premium Text Shadow/Glow (Subtle) */
            text-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
        }

        .daily-change-compact {
            font-size: 0.95rem;
            font-weight: 500;
        }

        .chart-section-mobile {
            width: 100%;
            height: 180px;
            margin-bottom: var(--spacing-sm);
            /* Add subtle glow line under chart if supported by chart lib, otherwise container styling */
        }

        /* Action Buttons Row */
        .action-buttons-row {
            display: flex;
            flex-direction: row;
            gap: 12px;
            padding: 0 var(--spacing-sm);
        }

        /* Primary Button: Add Transaction (Left, Blue/Indigo Gradient) */
        .btn-action-primary {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px; /* Reduced from 8px */
            padding: 10px; /* Reduced from 12px */
            border-radius: 12px;
            font-size: 0.85rem; /* Reduced from 0.95rem */
            font-weight: 600;
            border: none;
            cursor: pointer;
            transition: all 0.2s;
            
            /* Gradient Background matching Design */
            background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
            color: white;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .btn-action-primary:hover {
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
            filter: brightness(1.1);
        }

        /* Secondary Button: Add Note (Right, Dark Glassmorphism) */
        .btn-action-secondary {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px; /* Reduced from 8px */
            padding: 10px; /* Reduced from 12px */
            border-radius: 12px;
            font-size: 0.85rem; /* Reduced from 0.95rem */
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;

            /* Dark Glass Style */
            background: rgba(30, 41, 59, 0.6); /* slate-800 alpha */
            border: 1px solid rgba(148, 163, 184, 0.1); /* slate-400 alpha */
            color: #e2e8f0; /* slate-200 */
        }

        .btn-action-secondary:hover {
            background: rgba(30, 41, 59, 0.8);
            border-color: rgba(148, 163, 184, 0.2);
            color: white;
        }

        .content-section {
            margin-top: var(--spacing-sm);
        }

        .footer-actions {
            padding: var(--spacing-lg) var(--spacing-sm);
            display: flex;
            justify-content: center;
            opacity: 0.8;
        }

        .btn-sign-out-danger {
            width: 100%;
            padding: 12px;
            background: transparent;
            color: #ef4444; /* red-500 */
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 12px;
            font-weight: 500;
            font-size: 0.95rem;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn-sign-out-danger:active {
            background: rgba(239, 68, 68, 0.1);
        }

        .stat-change { font-size: 0.9rem; letter-spacing: 0.02em; }
        .positive { color: #4ade80; /* green-400 brighter for dark mode */ }
        .negative { color: #f87171; /* red-400 brighter for dark mode */ }
        
        /* Modal Overrides for Dark Theme */
        .transaction-modal {
            background-color: #0f172a; /* slate-900 */
            border: 1px solid #1e293b; /* slate-800 */
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
            color: #e2e8f0;
        }
        
        .modal-header {
            border-bottom: 1px solid #1e293b;
            background-color: #0f172a;
        }
        
        .modal-header h2 {
            color: white;
        }

      `}</style>
        </div>
    );
};

export default Portfolio;
