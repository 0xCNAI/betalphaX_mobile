import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Loader2, Check, AlertCircle, X, Wallet, ChevronRight, ChevronDown, Sparkles, Folder, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { fetchRawAssets, aggregateAssets } from '../services/importService';
// import { classifyAssets } from '../services/geminiService'; // AI Removed
import { searchCoins } from '../services/coinGeckoApi';

const ImportWizard = ({ onClose, onImport, isEmbedded = false }) => {
    const [step, setStep] = useState(1); // 1: Input, 2: Scanning, 3: Review
    const [address, setAddress] = useState('');
    const [threshold, setThreshold] = useState(10); // Default $10
    const [rawAssets, setRawAssets] = useState([]);
    const [groupMapping, setGroupMapping] = useState({}); // { Symbol: Parent }
    const [aggregatedAssets, setAggregatedAssets] = useState([]);
    const [selectedGroups, setSelectedGroups] = useState(new Set()); // Track selected GROUPS (Parent Symbols)
    const [error, setError] = useState('');
    const [expandedGroup, setExpandedGroup] = useState(null);
    const [loadingMessage, setLoadingMessage] = useState('');

    // Multi-Select Move
    const [checkedAssets, setCheckedAssets] = useState(new Set()); // Set of unique IDs (e.g. "SYMBOL_CHAIN_PROTOCOL")
    const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);

    // Create Group / Search
    const [isCreatingGroup, setIsCreatingGroup] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const searchInputRef = useRef(null);

    const handleScan = async () => {
        if (!address || address.length < 40) {
            setError('Please enter a valid wallet address');
            return;
        }

        setStep(2);
        setError('');
        setLoadingMessage('Scanning Blockchain...');

        try {
            // 1. Fetch Raw Assets
            const assets = await fetchRawAssets(address);
            setRawAssets(assets);

            // 2. Default Grouping
            setGroupMapping({});

            // 3. Initial Aggregation
            const aggregated = await aggregateAssets(assets, {}, threshold);
            setAggregatedAssets(aggregated);

            // 4. Auto-Select All
            const allSymbols = new Set(aggregated.map(g => g.symbol));
            setSelectedGroups(allSymbols);

            setStep(3);
        } catch (err) {
            console.error(err);
            setError('Failed to scan wallet. Please try again.');
            setStep(1);
        }
    };

    // Re-aggregate when mapping or threshold changes
    useEffect(() => {
        if (rawAssets.length > 0) {
            const reAggregate = async () => {
                const aggregated = await aggregateAssets(rawAssets, groupMapping, threshold);
                setAggregatedAssets(aggregated);
            };
            reAggregate();
        }
    }, [groupMapping, threshold, rawAssets]);

    // Search Coins for "Create Group"
    useEffect(() => {
        if (!newGroupName || !isCreatingGroup) {
            setSearchResults([]);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await searchCoins(newGroupName);
                setSearchResults(results || []);
            } catch (error) {
                console.error("Search failed", error);
            } finally {
                setIsSearching(false);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [newGroupName, isCreatingGroup]);


    const toggleGroup = (symbol) => {
        const newSelected = new Set(selectedGroups);
        if (newSelected.has(symbol)) {
            newSelected.delete(symbol);
        } else {
            newSelected.add(symbol);
        }
        setSelectedGroups(newSelected);
    };

    const toggleAll = () => {
        if (selectedGroups.size === aggregatedAssets.length) {
            setSelectedGroups(new Set());
        } else {
            setSelectedGroups(new Set(aggregatedAssets.map(g => g.symbol)));
        }
    };

    const getAssetId = (holding) => `${holding.symbol}_${holding.chain}_${holding.protocolName || holding.source}`;

    const toggleAssetCheck = (assetId) => {
        const newChecked = new Set(checkedAssets);
        if (newChecked.has(assetId)) {
            newChecked.delete(assetId);
        } else {
            newChecked.add(assetId);
        }
        setCheckedAssets(newChecked);
    };

    const handleMoveSelected = (targetGroupSymbol) => {
        const newMapping = { ...groupMapping };

        // Find all selected assets in current aggregation
        aggregatedAssets.forEach(group => {
            group.holdings_breakdown.forEach(h => {
                const id = getAssetId(h);
                if (checkedAssets.has(id)) {
                    // Update mapping for this symbol
                    // Note: This moves ALL holdings of this symbol. 
                    // If user wants to split holdings of same symbol into different groups, 
                    // we would need a more complex mapping (ID -> Parent) instead of (Symbol -> Parent).
                    // For MVP, we map Symbol -> Parent.
                    newMapping[h.symbol] = targetGroupSymbol;
                }
            });
        });

        setGroupMapping(newMapping);
        setCheckedAssets(new Set()); // Clear selection
        setIsMoveModalOpen(false);
        setIsCreatingGroup(false);
        setNewGroupName('');
    };

    const handleCreateGroupSelect = (coin) => {
        handleMoveSelected(coin.symbol.toUpperCase());
    };

    const handleFinalImport = () => {
        const groupsToImport = aggregatedAssets.filter(a => selectedGroups.has(a.symbol));

        // Convert to Transaction format
        const transactions = groupsToImport.map(group => ({
            asset: group.symbol,
            amount: group.amount,
            price: group.price,
            date: new Date().toISOString(),
            type: 'buy',
            status: 'needs_calculation',
            holdings_breakdown: group.holdings_breakdown,
            narrative: {
                primary_reason: 'Smart Wallet Import',
                notes: `Imported from ${address} (Threshold: $${threshold}).`
            }
        }));

        onImport(transactions);
        onClose();
    };

    // Calculate Total Value of Selected Groups
    const totalSelectedValue = aggregatedAssets
        .filter(a => selectedGroups.has(a.symbol))
        .reduce((sum, a) => sum + a.value_usd, 0);

    const content = (
        <div className={`modal-content wizard-modal ${isEmbedded ? 'embedded' : ''}`} onClick={e => e.stopPropagation()}>
            {!isEmbedded && (
                <div className="wizard-header">
                    <div className="header-title">
                        <Wallet className="text-accent" size={24} />
                        <h2>Smart Wallet Import</h2>
                    </div>
                    <button onClick={onClose} className="modal-close"><X size={24} /></button>
                </div>
            )}

            <div className="wizard-body">
                {step === 1 && (
                    <div className="step-input">
                        <p className="step-desc">Enter an EVM address to scan your portfolio.</p>

                        <div className="input-group">
                            <label>Wallet Address</label>
                            <div className="address-input-wrapper">
                                <input
                                    type="text"
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="0x..."
                                    className="form-input address-input"
                                />
                            </div>
                        </div>

                        <div className="input-group threshold-group">
                            <div className="label-row">
                                <label>Minimum Value Threshold</label>
                                <span className="threshold-value">${threshold}</span>
                            </div>
                            <input
                                type="range"
                                min="0"
                                max="1000"
                                step="10"
                                value={threshold}
                                onChange={(e) => setThreshold(Number(e.target.value))}
                                className="range-slider"
                            />
                            <p className="help-text">Assets below ${threshold} will be ignored.</p>
                        </div>

                        {error && <div className="error-message"><AlertCircle size={16} /> {error}</div>}

                        <div className="wizard-actions">
                            <button className="btn-primary full-width" onClick={handleScan}>
                                Scan & Analyze <Sparkles size={18} />
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="step-loading">
                        <Loader2 size={48} className="spin text-accent" />
                        <h3>{loadingMessage}</h3>
                    </div>
                )}

                {step === 3 && (
                    <div className="step-review">
                        <div className="review-header">
                            <div className="review-stats">
                                <span className="stat-count">{selectedGroups.size} groups</span>
                                <span className="stat-total">
                                    Total: ${totalSelectedValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </span>
                            </div>
                            <div className="header-actions">
                                <button className="btn-text" onClick={toggleAll}>
                                    {selectedGroups.size === aggregatedAssets.length ? 'Deselect All' : 'Select All'}
                                </button>
                            </div>
                        </div>

                        <div className="assets-list-scroll">
                            {aggregatedAssets.length === 0 ? (
                                <div className="empty-scan">
                                    <p>No assets found above ${threshold}</p>
                                    <button className="btn-secondary" onClick={() => setStep(1)}>Adjust Threshold</button>
                                </div>
                            ) : (
                                aggregatedAssets.map(group => (
                                    <div key={group.symbol} className={`asset-item ${selectedGroups.has(group.symbol) ? 'selected' : ''}`}>
                                        <div className="asset-main" onClick={() => toggleGroup(group.symbol)}>
                                            <div className="checkbox">
                                                {selectedGroups.has(group.symbol) && <Check size={14} />}
                                            </div>
                                            <div className="asset-icon">
                                                {group.logo_url ? (
                                                    <img src={group.logo_url} alt={group.symbol} />
                                                ) : (
                                                    <div className="icon-placeholder"><Folder size={14} /></div>
                                                )}
                                            </div>
                                            <div className="asset-info">
                                                <span className="asset-symbol">{group.symbol} Group</span>
                                                <span className="asset-amount">{group.holdings_breakdown.length} assets</span>
                                            </div>
                                            <div className="asset-value">
                                                ${group.value_usd.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </div>
                                            <button
                                                className="btn-expand"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedGroup(expandedGroup === group.symbol ? null : group.symbol);
                                                }}
                                            >
                                                <ChevronDown size={16} className={expandedGroup === group.symbol ? 'rotate-180' : ''} />
                                            </button>
                                        </div>

                                        {expandedGroup === group.symbol && (
                                            <div className="asset-breakdown">
                                                {group.holdings_breakdown
                                                    .filter(h => h.usdValue >= 10) // Dust Filter: Only show assets >= $10
                                                    .map((h, idx) => {
                                                        const assetId = getAssetId(h);
                                                        const isChecked = checkedAssets.has(assetId);
                                                        return (
                                                            <div key={idx} className={`breakdown-item ${h.isLiability ? 'liability' : ''}`}>
                                                                <div className="breakdown-left">
                                                                    <div className="breakdown-checkbox" onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        toggleAssetCheck(assetId);
                                                                    }}>
                                                                        {isChecked && <Check size={12} />}
                                                                    </div>
                                                                    <div className="breakdown-info">
                                                                        <span className="source-badge">
                                                                            {h.chain && <span className="chain-tag">{h.chain}</span>}
                                                                            {h.protocolName || h.source}
                                                                        </span>
                                                                        {h.isLiability && <span className="liability-tag">Debt</span>}
                                                                    </div>
                                                                    <span className="breakdown-amount">
                                                                        {h.isLiability ? '-' : ''}{h.amount.toFixed(4)} {h.symbol}
                                                                    </span>
                                                                </div>

                                                                <div className="breakdown-right">
                                                                    <span className="breakdown-value">${h.usdValue.toFixed(2)}</span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                {/* Move Button in Group Footer */}
                                                {group.holdings_breakdown.some(h => checkedAssets.has(getAssetId(h))) && (
                                                    <div className="group-footer-actions">
                                                        <button
                                                            className="btn-primary small move-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setIsMoveModalOpen(true);
                                                            }}
                                                        >
                                                            Move Selected ({group.holdings_breakdown.filter(h => checkedAssets.has(getAssetId(h))).length})
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="wizard-actions">
                            <button className="btn-secondary" onClick={() => setStep(1)}>Back</button>
                            <button
                                className="btn-primary"
                                onClick={handleFinalImport}
                                disabled={selectedGroups.size === 0}
                            >
                                Import Selected ({selectedGroups.size})
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Move Asset Modal */}
            {isMoveModalOpen && (
                <div className="move-modal-overlay" onClick={() => setIsMoveModalOpen(false)}>
                    <div className="move-modal" onClick={e => e.stopPropagation()}>
                        <h3>Move {checkedAssets.size} Assets to...</h3>

                        {!isCreatingGroup ? (
                            <div className="group-options">
                                {aggregatedAssets.map(g => (
                                    <button
                                        key={g.symbol}
                                        className="group-option-btn"
                                        onClick={() => handleMoveSelected(g.symbol)}
                                    >
                                        <Folder size={16} /> {g.symbol} Group
                                    </button>
                                ))}
                                <button
                                    className="group-option-btn create-new"
                                    onClick={() => setIsCreatingGroup(true)}
                                >
                                    <Plus size={16} /> Create New Group
                                </button>
                            </div>
                        ) : (
                            <div className="create-group-section">
                                <div className="search-input-wrapper">
                                    <Search size={16} className="search-icon" />
                                    <input
                                        ref={searchInputRef}
                                        type="text"
                                        placeholder="Search Token (e.g. SOL)"
                                        value={newGroupName}
                                        onChange={e => setNewGroupName(e.target.value)}
                                        autoFocus
                                        className="group-search-input"
                                    />
                                    {isSearching && <Loader2 size={16} className="spin" />}
                                </div>

                                <div className="search-results">
                                    {searchResults.map(coin => (
                                        <button
                                            key={coin.id}
                                            className="search-result-item"
                                            onClick={() => handleCreateGroupSelect(coin)}
                                        >
                                            <img src={coin.thumb} alt={coin.symbol} />
                                            <div className="coin-info">
                                                <span className="coin-symbol">{coin.symbol.toUpperCase()}</span>
                                                <span className="coin-name">{coin.name}</span>
                                            </div>
                                        </button>
                                    ))}
                                    {newGroupName && searchResults.length === 0 && !isSearching && (
                                        <div className="no-results">No tokens found</div>
                                    )}
                                </div>

                                <button className="btn-secondary small" onClick={() => setIsCreatingGroup(false)}>
                                    Cancel
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    const styles = (
        <style>{`
            .wizard-modal {
                max-width: 1200px;
                width: 90vw;
                height: 90vh;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
            }

            .wizard-header {
                padding: var(--spacing-lg);
                border-bottom: 1px solid var(--bg-tertiary);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .header-title {
                display: flex;
                align-items: center;
                gap: var(--spacing-sm);
            }

            .header-title h2 {
                font-size: 1.2rem;
                font-weight: 600;
                margin: 0;
            }

            .text-accent { color: var(--accent-primary); }

            .wizard-body {
                padding: var(--spacing-lg);
                overflow-y: auto;
                flex: 1;
            }

            .step-desc {
                color: var(--text-secondary);
                margin-bottom: var(--spacing-lg);
                font-size: 0.95rem;
            }

            .input-group {
                margin-bottom: var(--spacing-lg);
            }

            .input-group label {
                display: block;
                margin-bottom: var(--spacing-xs);
                font-weight: 500;
                color: var(--text-secondary);
                font-size: 0.9rem;
            }

            .label-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: var(--spacing-xs);
            }

            .threshold-value {
                font-weight: 600;
                color: var(--accent-primary);
            }

            .form-input {
                width: 100%;
                padding: 12px;
                background-color: var(--bg-tertiary);
                border: 1px solid var(--bg-tertiary);
                border-radius: var(--radius-md);
                color: var(--text-primary);
                font-size: 1rem;
                transition: all 0.2s;
            }

            .form-input:focus {
                border-color: var(--accent-primary);
                outline: none;
            }

            .range-slider {
                width: 100%;
                height: 6px;
                background: var(--bg-tertiary);
                border-radius: 3px;
                outline: none;
                -webkit-appearance: none;
            }

            .range-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 18px;
                height: 18px;
                background: var(--accent-primary);
                border-radius: 50%;
                cursor: pointer;
            }

            .help-text {
                font-size: 0.8rem;
                color: var(--text-secondary);
                margin-top: 6px;
            }

            .error-message {
                background-color: rgba(239, 68, 68, 0.1);
                color: var(--accent-danger);
                padding: 10px;
                border-radius: var(--radius-md);
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 0.9rem;
                margin-bottom: var(--spacing-lg);
            }

            .wizard-actions {
                display: flex;
                gap: var(--spacing-md);
                margin-top: var(--spacing-lg);
            }

            .full-width { width: 100%; justify-content: center; gap: 8px; }

            .step-loading {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px 0;
                text-align: center;
            }

            .step-loading h3 { margin-top: var(--spacing-md); margin-bottom: 4px; }
            .step-loading p { color: var(--text-secondary); }

            .review-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: var(--spacing-md);
                padding-bottom: var(--spacing-sm);
                border-bottom: 1px solid var(--bg-tertiary);
            }

            .header-actions {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .stat-count { font-weight: 600; margin-right: 12px; }
            .stat-total { color: var(--text-secondary); font-size: 0.9rem; }
            .btn-text { background: none; border: none; color: var(--accent-primary); cursor: pointer; font-size: 0.9rem; }

            .assets-list-scroll {
                flex: 1;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 8px;
                min-height: 300px;
            }

            .asset-item {
                background-color: var(--bg-tertiary);
                border-radius: var(--radius-md);
                overflow: hidden;
                border: 1px solid transparent;
                transition: all 0.2s;
                flex-shrink: 0;
            }

            .asset-item.selected {
                border-color: var(--accent-primary);
                background-color: rgba(99, 102, 241, 0.05);
            }

            .asset-main {
                display: flex;
                align-items: center;
                padding: 10px;
                cursor: pointer;
                gap: 10px;
            }

            .checkbox {
                width: 20px;
                height: 20px;
                border: 2px solid var(--text-secondary);
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }

            .asset-item.selected .checkbox {
                background-color: var(--accent-primary);
                border-color: var(--accent-primary);
                color: white;
            }

            .asset-icon img { width: 28px; height: 28px; border-radius: 50%; }
            .icon-placeholder { width: 28px; height: 28px; border-radius: 50%; background: var(--bg-secondary); display: flex; align-items: center; justify-content: center; color: var(--text-secondary); }

            .asset-info { flex: 1; display: flex; flex-direction: column; }
            .asset-symbol { font-weight: 600; font-size: 0.95rem; }
            .asset-amount { font-size: 0.8rem; color: var(--text-secondary); }

            .asset-value { font-weight: 600; font-family: var(--font-mono); }

            .btn-expand {
                background: none;
                border: none;
                color: var(--text-secondary);
                padding: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
            }
            
            .rotate-180 { transform: rotate(180deg); transition: transform 0.2s; }

            .asset-breakdown {
                background-color: rgba(0,0,0,0.2);
                padding: 8px 12px;
                font-size: 0.85rem;
                border-top: 1px solid var(--bg-tertiary);
            }

            .breakdown-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 6px;
                color: var(--text-secondary);
                padding: 4px 0;
            }

            .group-footer-actions {
                display: flex;
                justify-content: flex-end;
                padding-top: 8px;
                margin-top: 8px;
                border-top: 1px dashed var(--bg-tertiary);
            }

            .move-btn {
                background-color: var(--accent-primary);
                color: white;
                border: none;
                border-radius: 4px;
                padding: 4px 12px;
                font-size: 0.8rem;
                cursor: pointer;
            }
            
            .breakdown-left {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .breakdown-checkbox {
                width: 16px;
                height: 16px;
                border: 1px solid var(--text-secondary);
                border-radius: 3px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: var(--accent-primary);
            }

            .breakdown-right {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 2px;
            }

            .source-badge {
                background-color: var(--bg-secondary);
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 0.75rem;
            }

            .empty-scan {
                text-align: center;
                padding: 20px;
                color: var(--text-secondary);
            }

            .breakdown-item.liability {
                color: var(--accent-danger);
            }

            .breakdown-info {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .chain-tag {
                text-transform: uppercase;
                font-size: 0.7rem;
                opacity: 0.8;
                margin-right: 4px;
                background-color: rgba(0,0,0,0.2);
                padding: 1px 4px;
                border-radius: 3px;
            }

            .liability-tag {
                font-size: 0.7rem;
                background-color: rgba(239, 68, 68, 0.1);
                color: var(--accent-danger);
                padding: 1px 4px;
                border-radius: 3px;
                border: 1px solid rgba(239, 68, 68, 0.3);
            }

            .move-modal-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(0,0,0,0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 100;
                border-radius: var(--radius-lg);
            }

            .move-modal {
                background-color: var(--bg-secondary);
                padding: 20px;
                border-radius: var(--radius-md);
                width: 80%;
                max-width: 400px;
                border: 1px solid var(--bg-tertiary);
                max-height: 80%;
                display: flex;
                flex-direction: column;
            }

            .move-modal h3 {
                margin-top: 0;
                margin-bottom: 12px;
                font-size: 1rem;
            }

            .group-options {
                display: flex;
                flex-direction: column;
                gap: 8px;
                overflow-y: auto;
                flex: 1;
            }

            .group-option-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px;
                background-color: var(--bg-tertiary);
                border: none;
                border-radius: 4px;
                color: var(--text-primary);
                cursor: pointer;
                text-align: left;
            }

            .group-option-btn:hover {
                background-color: var(--accent-primary);
                color: white;
            }

            .create-new {
                border: 1px dashed var(--text-secondary);
                background: transparent;
            }

            .create-group-section {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .search-input-wrapper {
                display: flex;
                align-items: center;
                background-color: var(--bg-tertiary);
                border: 1px solid var(--bg-tertiary);
                border-radius: 4px;
                padding: 8px;
                gap: 8px;
            }

            .group-search-input {
                background: transparent;
                border: none;
                color: white;
                flex: 1;
                outline: none;
            }

            .search-results {
                max-height: 200px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 4px;
            }

            .search-result-item {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px;
                background: transparent;
                border: none;
                cursor: pointer;
                text-align: left;
                border-radius: 4px;
            }

            .search-result-item:hover {
                background-color: var(--bg-tertiary);
            }

            .search-result-item img {
                width: 20px;
                height: 20px;
                border-radius: 50%;
            }

            .coin-info {
                display: flex;
                flex-direction: column;
            }

            .coin-symbol {
                font-weight: 600;
                font-size: 0.9rem;
                color: var(--text-primary);
            }

            .coin-name {
                font-size: 0.75rem;
                color: var(--text-secondary);
            }

            .no-results {
                text-align: center;
                color: var(--text-secondary);
                padding: 10px;
                font-size: 0.9rem;
            }

            .btn-primary.small {
                padding: 4px 12px;
                font-size: 0.85rem;
            }

            .btn-secondary.small {
                padding: 6px 12px;
                font-size: 0.85rem;
                align-self: flex-end;
            }
            .wizard-modal.embedded {
                width: 100%;
                height: 100%;
                max-width: none;
                max-height: none;
                border: none;
                box-shadow: none;
                display: flex;
                flex-direction: column;
            }
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            @media (max-width: 600px) {
                .label-row {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 4px;
                }
                .threshold-value {
                    align-self: flex-end;
                    font-size: 1.1rem;
                }
                .step-desc {
                    font-size: 0.9rem;
                    margin-bottom: var(--spacing-md);
                }
            }
        `}</style>
    );

    if (isEmbedded) {
        return (
            <>
                {content}
                {styles}
            </>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            {content}
            {styles}
        </div>
    );
};

export default ImportWizard;
