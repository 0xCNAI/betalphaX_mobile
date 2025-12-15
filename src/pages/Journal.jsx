import React, { useState } from 'react';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { Brain, ArrowRight, TrendingDown, Edit2, FileText, Wallet } from 'lucide-react';
import TransactionForm from '../components/TransactionForm';
import Modal from '../components/Modal';

const Journal = () => {
  const { transactions } = useTransactions();
  const { getIcon } = usePrices();

  // Edit state
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [initialStep, setInitialStep] = useState(1);

  const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date));

  const [expandedIds, setExpandedIds] = useState([]);

  const toggleExpand = (id) => {
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="journal-container">

      <div className="journal-layout">
        <div className="feed-section">
          <h3>Recent Entries</h3>

          {/* Header Row */}
          <div className="entries-header-row" style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 1fr 0.8fr 30px', // Adjusted for better spacing
            padding: '0 16px 8px 16px',
            color: 'var(--text-secondary)',
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            fontWeight: '600',
            letterSpacing: '0.5px'
          }}>
            <span>Ticker</span>
            <span>Amount</span>
            <span>Price</span>
            <span></span> {/* Spacer for chevron */}
          </div>

          <div className="entries-list">
            {sortedTransactions.map((tx) => {
              const isExpanded = expandedIds.includes(tx.id);
              return (
                <div key={tx.id} className={`journal-list-item ${isExpanded ? 'expanded' : ''}`}>
                  <div className="list-item-header" onClick={() => toggleExpand(tx.id)} style={{
                    display: 'grid',
                    gridTemplateColumns: '1.4fr 1fr 0.8fr 30px', // Match header
                    alignItems: 'center',
                    padding: '12px 16px'
                  }}>
                    {/* Column 1: Ticker & Type */}
                    <div className="asset-badge" style={{ minWidth: 'auto' }}>
                      {getIcon && getIcon(tx.asset) && (
                        <img
                          src={getIcon(tx.asset)}
                          alt={tx.asset}
                          style={{ width: '20px', height: '20px', borderRadius: '50%', marginRight: '6px' }}
                        />
                      )}
                      <span className="symbol">{tx.asset}</span>
                      <span className={`type ${tx.type}`} style={{ fontSize: '0.65rem', marginLeft: '4px' }}>{tx.type.toUpperCase()}</span>
                    </div>

                    {/* Column 2: Amount (No Ticker) */}
                    <span className="amount" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      {parseFloat(tx.amount).toLocaleString()}
                    </span>

                    {/* Column 3: Price */}
                    <span className="price" style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '500' }}>
                      @ ${tx.price ? tx.price.toLocaleString() : '0.00'}
                    </span>

                    {/* Column 4: Chevron */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <ArrowRight size={16} className={`chevron ${isExpanded ? 'rotated' : ''}`} style={{ color: 'var(--text-secondary)' }} />
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
      </div>

      {/* Transaction Modal (Edit Mode) */}
      {editingTransaction && (
        <Modal isOpen={!!editingTransaction} onClose={() => setEditingTransaction(null)}>
          <TransactionForm
            onClose={() => setEditingTransaction(null)}
            initialData={editingTransaction}
            initialStep={initialStep}
          />
        </Modal>
      )}

      <style>{`
        .journal-container {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-xl);
          height: 100%;
          max-width: 100%; /* Ensure full width */
        }

        .journal-layout {
          display: flex; /* Changed from grid to flex for full width */
          flex-direction: column;
          gap: var(--spacing-xl);
          width: 100%;
        }

        .feed-section {
            width: 100%; /* Ensure section takes full width */
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
        
        .amount { color: var(--text-secondary); }
        .price { color: var(--text-primary); }

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
      `}</style>
    </div>
  );
};

export default Journal;
