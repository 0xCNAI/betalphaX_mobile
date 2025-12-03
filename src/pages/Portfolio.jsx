import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, Target, Upload, Loader2, Shield, Activity, PieChart, Brain, Plus, X, Wallet } from 'lucide-react';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { calculatePortfolioPnL } from '../utils/pnlCalculator';
import AssetList from '../components/AssetList';
import PortfolioHistoryChart from '../components/PortfolioHistoryChart';
import WalletImportModal from '../components/WalletImportModal';
import TransactionForm from '../components/TransactionForm';

import { generatePortfolioOverview, cacheOverview, getCachedOverview } from '../services/analysisService';
import PortfolioAIOverview from '../components/PortfolioAIOverview';

import { useAuth } from '../context/AuthContext';

const Portfolio = () => {
    const { user } = useAuth();
    const { transactions, bulkAddTransactions, addTransaction } = useTransactions();
    const { getPrice, loading: pricesLoading, error, lastUpdate } = usePrices();
    const [showUnifiedImport, setShowUnifiedImport] = useState(false);
    const [showAddTransaction, setShowAddTransaction] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
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
            if (p) currentPricesMap[tx.asset] = p.price; // calculatePortfolioPnL expects just the price number
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
                // Use current price, or 0 if not available (don't use cost basis as fallback to avoid confusion)
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
        // TransactionForm handles the actual adding via context, we just close the modal
        setShowUnifiedImport(false);
    };

    // Prepare prices object for AI Overview
    const currentPricesForAI = {};
    transactions.forEach(tx => {
        const p = getPrice(tx.asset);
        if (p) currentPricesForAI[tx.asset] = p;
    });

    return (
        <div className="portfolio-page">
            <div className="page-header">
                <div>
                    <h1>Portfolio Dashboard</h1>
                    <p className="text-secondary">Track your crypto performance and AI insights.</p>
                </div>
                <button className="btn-wallet-import" onClick={() => setShowUnifiedImport(true)}>
                    <Wallet size={18} />
                    Import Portfolio
                </button>
            </div>

            {/* Top Section: Split View */}
            <div className="top-grid">

                {/* Left: Value & History */}
                <div className="dashboard-card value-history-card">
                    <div className="balance-card total-balance">
                        <div className="balance-header">
                            <div className="icon-wrapper">
                                <Wallet size={24} />
                            </div>
                            <h3>Total Balance</h3>

                            {/* P&L Display - Moved to top-right */}
                            <div className="pnl-summary-topright">
                                <div className="pnl-item">
                                    <span className="pnl-label">Realized P&L</span>
                                    <span className="pnl-value" style={{
                                        color: realizedPnL > 0 ? 'var(--accent-success)' : realizedPnL < 0 ? 'var(--accent-danger)' : 'var(--text-secondary)'
                                    }}>
                                        {realizedPnL >= 0 ? '+' : ''}${realizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="pnl-item">
                                    <span className="pnl-label">Unrealized P&L</span>
                                    <span className="pnl-value" style={{
                                        color: unrealizedPnL > 0 ? 'var(--accent-success)' : unrealizedPnL < 0 ? 'var(--accent-danger)' : 'var(--text-secondary)'
                                    }}>
                                        {unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <div className="pnl-item">
                                    <span className="pnl-label">Total P&L</span>
                                    <span className="pnl-value" style={{
                                        color: totalPnL > 0 ? 'var(--accent-success)' : totalPnL < 0 ? 'var(--accent-danger)' : 'var(--text-secondary)'
                                    }}>
                                        {totalPnL >= 0 ? '+' : ''}${totalPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>
                        </div>


                        <div className="balance-content">
                            <div className="main-balance">
                                <span className="currency-symbol">$</span>
                                <span className="amount">{totalBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>

                            {/* Daily Change - Moved next to Total Balance */}
                            <div className="daily-change-inline">
                                <span className={`stat-change ${dailyPnL >= 0 ? 'positive' : 'negative'}`}>
                                    {dailyPnL >= 0 ? '+' : ''}{dailyPnL.toLocaleString(undefined, { style: 'currency', currency: 'USD' })} (24h)
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="mini-chart-container">
                        <PortfolioHistoryChart compact={true} />
                    </div>
                </div>

                {/* Right: AI Portfolio Overview */}
                <PortfolioAIOverview transactions={transactions} prices={currentPricesForAI} user={user} />
            </div>

            {/* Middle: Add Transaction Button */}
            <button className="btn-add-transaction-large" onClick={() => setIsTransactionModalOpen(true)}>
                <Plus size={24} />
                Add New Transaction
            </button>

            {isImportModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-end sm:items-center z-50 sm:p-4">
                    <div className="bg-slate-900 w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-2xl overflow-y-auto border-slate-800 shadow-2xl relative animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-200">
                        <button className="absolute top-4 right-4 p-2 bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors z-10" onClick={() => setIsImportModalOpen(false)}>
                            <X size={20} />
                        </button>
                        <WalletImportModal onClose={() => setIsImportModalOpen(false)} />
                    </div>
                </div>
            )}

            {isTransactionModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-end sm:items-center z-50 sm:p-4">
                    <div className="bg-slate-900 w-full h-full sm:h-auto sm:max-h-[90vh] sm:max-w-xl sm:rounded-2xl overflow-y-auto border-slate-800 shadow-2xl relative animate-in slide-in-from-bottom-5 sm:zoom-in-95 duration-200">
                        <button className="absolute top-4 right-4 p-2 bg-slate-800 text-slate-400 hover:text-white rounded-full transition-colors z-10" onClick={() => setIsTransactionModalOpen(false)}>
                            <X size={20} />
                        </button>
                        <TransactionForm onClose={() => setIsTransactionModalOpen(false)} />
                    </div>
                </div>
            )}

            {/* Bottom: Asset List */}
            <div className="content-section">
                <AssetList />
            </div>



            {/* Modals */}
            {/* Original UnifiedImportModal and TransactionForm modals removed as per instruction */}

            <style>{`
        .portfolio-page {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-lg);
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-sm);
        }

        .page-header h1 {
            font-size: 1.8rem;
            margin-bottom: 4px;
        }

        .top-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--spacing-lg);
            height: 320px; /* Fixed height for alignment */
        }

        .dashboard-card {
            background-color: var(--bg-secondary);
            border: 1px solid var(--bg-tertiary);
            border-radius: var(--radius-lg);
            padding: var(--spacing-lg);
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        }

        /* Left Card Styles */
        .value-history-card {
            justify-content: space-between;
        }

        .balance-info {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .stat-value {
            font-size: 2.5rem;
            font-weight: 700;
            background: linear-gradient(to right, #fff, #a5b4fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        .mini-chart-container {
            flex: 1;
            margin-top: var(--spacing-md);
            min-height: 100px; /* Ensure minimum visibility */
            width: 100%;
            position: relative; /* For absolute positioning of chart if needed */
            overflow: hidden;
        }

        /* Balance Card Styles */
        .balance-card {
            margin-bottom: var(--spacing-md);
        }

        .balance-header {
            display: flex;
            align-items: flex-start;
            gap: var(--spacing-sm);
            margin-bottom: var(--spacing-md);
            position: relative;
        }

        .balance-header .icon-wrapper {
            flex-shrink: 0;
        }

        .balance-header h3 {
            flex-shrink: 0;
            margin: 0;
            font-size: 0.9rem;
            color: var(--text-secondary);
        }

        /* P&L Summary in Top-Right */
        .pnl-summary-topright {
            display: flex;
            gap: 1rem;
            margin-left: auto;
            align-items: flex-start;
        }

        .pnl-summary-topright .pnl-item {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 2px;
        }

        .pnl-summary-topright .pnl-label {
            font-size: 0.65rem;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }


        .pnl-summary-topright .pnl-value {
            font-size: 0.85rem;
            font-weight: 600;
        }

        /* Main Balance - Largest Element */
        .balance-content {
            margin-top: var(--spacing-sm);
            display: flex;
            align-items: baseline;
            gap: var(--spacing-sm); /* Reduced from lg to sm for tighter spacing */
        }

        .main-balance {
            display: flex;
            align-items: baseline;
            gap: 4px;
        }

        .main-balance .currency-symbol {
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--text-secondary);
        }

        .main-balance .amount {
            font-size: 3rem;
            font-weight: 700;
            line-height: 1;
            background: linear-gradient(to right, #fff, #a5b4fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }

        /* Daily Change - Inline with Total Balance */
        .daily-change-inline {
            display: flex;
            align-items: baseline;
            margin-left: 0; /* Removed extra margin for tighter spacing */
        }

        .daily-change-inline .stat-change {
            font-size: 1rem;
            font-weight: 600;
        }



        /* Right Card Styles */
        .health-risk-card {
            gap: var(--spacing-md);
        }

        .card-header-row {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
        }

        .health-header {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .health-score-badge {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--text-primary);
            border: 2px solid var(--accent-primary);
            border-radius: 50%;
            width: 48px;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            background-color: rgba(255,255,255,0.05);
        }

        .risk-header-label {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.9rem;
            color: var(--text-secondary);
            font-weight: 600;
        }

        .risk-list-container {
            flex: 1;
            overflow: hidden;
            background-color: rgba(0,0,0,0.2);
            border-radius: var(--radius-md);
            border: 1px solid var(--bg-tertiary);
        }

        .risk-list-scroll {
            height: 100%;
            overflow-y: auto;
            padding: var(--spacing-sm);
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        
        .risk-list-scroll::-webkit-scrollbar {
            width: 4px;
        }
        .risk-list-scroll::-webkit-scrollbar-thumb {
            background-color: var(--bg-tertiary);
            border-radius: 2px;
        }

        .risk-item-compact {
            background-color: var(--bg-primary);
            padding: 8px 12px;
            border-radius: var(--radius-sm);
            border-left: 3px solid var(--accent-warning);
        }

        .risk-item-header {
            display: flex;
            justify-content: space-between;
            font-size: 0.85rem;
            font-weight: 600;
            margin-bottom: 4px;
        }

        .risk-alerts-compact {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
        }

        .risk-tag {
            font-size: 0.7rem;
            padding: 2px 6px;
            border-radius: 4px;
            background-color: rgba(255,255,255,0.05);
            color: var(--text-secondary);
        }
        .risk-tag.danger { color: var(--accent-danger); background-color: rgba(239, 68, 68, 0.1); }
        .risk-tag.warning { color: var(--accent-warning); background-color: rgba(245, 158, 11, 0.1); }

        .empty-state-compact {
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: var(--text-secondary);
            font-size: 0.9rem;
        }

        /* Add Transaction Button */
        .btn-add-transaction-large {
            width: 100%;
            padding: var(--spacing-lg);
            background-color: var(--accent-primary);
            color: white;
            border: none;
            border-radius: var(--radius-lg);
            font-size: 1.2rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: var(--spacing-md);
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .btn-add-transaction-large:hover {
            background-color: var(--accent-secondary);
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
        }

        .btn-import {
          display: flex;
          align-items: center;
          gap: var(--spacing-xs);
          padding: var(--spacing-sm) var(--spacing-md);
          background-color: var(--bg-tertiary);
          color: var(--text-secondary);
          border: 1px solid var(--bg-tertiary);
          border-radius: var(--radius-md);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-import:hover {
            background-color: var(--bg-secondary);
            color: var(--text-primary);
        }

        .stat-label { color: var(--text-secondary); font-size: 0.875rem; }
        .stat-change { font-size: 0.875rem; }
        .positive { color: var(--accent-success); }
        .negative { color: var(--accent-danger); }

        @media (max-width: 768px) {
            .top-grid {
                display: flex;
                flex-direction: column;
                height: auto;
                gap: var(--spacing-md);
            }
            .dashboard-card {
                height: auto;
                min-height: 280px;
            }
            .page-header {
                flex-direction: column;
                align-items: flex-start;
                gap: var(--spacing-md);
            }
            .btn-wallet-import {
                width: 100%;
                justify-content: center;
            }
            .pnl-summary-topright {
                flex-direction: column;
                gap: 4px;
            }
            .balance-header {
                flex-direction: column;
                align-items: flex-start;
            }
            .daily-change-inline {
                margin-left: 0;
                margin-top: 4px;
            }
            .balance-content {
                flex-direction: column;
                align-items: flex-start;
            }
        }
        
        .transaction-modal {
            max-width: 800px;
            width: 95vw;
            max-height: 90vh;
            overflow-y: auto;
            background-color: var(--bg-secondary);
            border-radius: var(--radius-lg);
            border: 1px solid var(--bg-tertiary);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            display: flex;
            flex-direction: column;
        }

        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            backdrop-filter: blur(4px);
        }

        .modal-header {
            padding: var(--spacing-lg);
            border-bottom: 1px solid var(--bg-tertiary);
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            background-color: var(--bg-secondary);
            z-index: 10;
        }

        .modal-header h2 {
            font-size: 1.25rem;
            font-weight: 600;
        }

        .modal-close {
            background: none;
            border: none;
            color: var(--text-secondary);
            cursor: pointer;
            padding: 4px;
            border-radius: 4px;
            transition: all 0.2s;
        }

        .modal-close:hover {
            background-color: var(--bg-tertiary);
            color: var(--text-primary);
        }

        .btn-wallet-import {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background-color: var(--bg-tertiary);
            color: var(--text-primary);
            border: 1px solid var(--accent-primary);
            border-radius: var(--radius-md);
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }

        .btn-wallet-import:hover {
            background-color: var(--accent-primary);
            color: white;
            box-shadow: 0 0 10px rgba(99, 102, 241, 0.3);
        }
      `}</style>
        </div>
    );
};

export default Portfolio;
