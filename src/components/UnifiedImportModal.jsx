import React, { useState } from 'react';
import { X, Wallet, PenTool, ArrowRight } from 'lucide-react';
import ImportWizard from './ImportWizard';
import ImportPortfolioModal from './ImportPortfolioModal';

const UnifiedImportModal = ({ onClose, onImport, onManualAdd }) => {
    const [activeTab, setActiveTab] = useState('wallet'); // 'wallet' | 'manual'

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content unified-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="header-title">
                        <h2>Import Portfolio</h2>
                    </div>
                    <button onClick={onClose} className="modal-close"><X size={24} /></button>
                </div>

                <div className="modal-tabs">
                    <button
                        className={`tab-btn ${activeTab === 'wallet' ? 'active' : ''}`}
                        onClick={() => setActiveTab('wallet')}
                    >
                        <Wallet size={18} />
                        Wallet
                    </button>
                    <button
                        className={`tab-btn ${activeTab === 'manual' ? 'active' : ''}`}
                        onClick={() => setActiveTab('manual')}
                    >
                        <PenTool size={18} />
                        Manual Add
                    </button>
                </div>

                <div className="modal-body">
                    {activeTab === 'wallet' ? (
                        <div className="tab-content wallet-tab">
                            <ImportWizard
                                onClose={onClose}
                                onImport={onImport}
                                isEmbedded={true} // Prop to adjust styling if needed
                            />
                        </div>
                    ) : (
                        <div className="tab-content manual-tab">
                            <ImportPortfolioModal
                                onClose={onClose}
                                onImport={onImport}
                                isEmbedded={true}
                            />
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .unified-modal {
                    max-width: 1000px;
                    width: 95vw;
                    height: 90vh;
                    max-height: 90vh;
                    display: flex;
                    flex-direction: column;
                    background-color: var(--bg-secondary);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--bg-tertiary);
                    overflow: hidden;
                }

                .modal-header {
                    padding: var(--spacing-md) var(--spacing-lg);
                    border-bottom: 1px solid var(--bg-tertiary);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background-color: var(--bg-secondary);
                }

                .modal-header h2 {
                    font-size: 1.25rem;
                    font-weight: 600;
                    margin: 0;
                }

                .modal-tabs {
                    display: flex;
                    border-bottom: 1px solid var(--bg-tertiary);
                    background-color: var(--bg-primary);
                }

                .tab-btn {
                    flex: 1;
                    padding: 16px;
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    transition: all 0.2s;
                    border-bottom: 2px solid transparent;
                }

                .tab-btn:hover {
                    background-color: var(--bg-secondary);
                    color: var(--text-primary);
                }

                .tab-btn.active {
                    color: var(--accent-primary);
                    border-bottom-color: var(--accent-primary);
                    background-color: rgba(99, 102, 241, 0.05);
                }

                .modal-body {
                    flex: 1;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .tab-content {
                    flex: 1;
                    overflow-y: auto;
                    height: 100%;
                }

                /* Adjustments for embedded components */
                .wallet-tab .wizard-modal {
                    width: 100%;
                    height: 100%;
                    max-width: none;
                    max-height: none;
                    border: none;
                    box-shadow: none;
                }
                
                .wallet-tab .wizard-header {
                    display: none; /* Hide internal header */
                }

                .manual-tab {
                    padding: 0; /* Remove padding as ImportPortfolioModal handles it */
                    height: 100%;
                }
            `}</style>
        </div>
    );
};

export default UnifiedImportModal;
