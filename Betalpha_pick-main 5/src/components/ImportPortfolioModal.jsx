import React, { useState } from 'react';
import { Plus, X, Upload, Loader2 } from 'lucide-react';
import { usePrices } from '../context/PriceContext';

const ImportPortfolioModal = ({ onClose, onImport, isEmbedded = false }) => {
    const { getPrice, fetchPriceForTicker } = usePrices();
    const [importRows, setImportRows] = useState([
        { symbol: '', amount: '', price: '', date: new Date().toISOString().split('T')[0], loading: false, error: '' }
    ]);
    const [isImporting, setIsImporting] = useState(false);

    const addRow = () => {
        setImportRows([...importRows, { symbol: '', amount: '', price: '', date: new Date().toISOString().split('T')[0], loading: false, error: '' }]);
    };

    const removeRow = (index) => {
        if (importRows.length > 1) {
            setImportRows(importRows.filter((_, i) => i !== index));
        }
    };

    const handleRowChange = async (index, field, value) => {
        // Update state immediately
        setImportRows(prev => {
            const newRows = [...prev];
            newRows[index] = { ...newRows[index], [field]: value };
            if (field === 'symbol') newRows[index].error = ''; // Clear error on symbol change
            return newRows;
        });

        // Auto-fetch price when symbol is entered
        if (field === 'symbol' && value.length >= 2) {
            // Set loading state
            setImportRows(prev => {
                const newRows = [...prev];
                newRows[index].loading = true;
                return newRows;
            });

            try {
                // Fetch from API (which uses cache/Binance now)
                const priceData = await fetchPriceForTicker(value);

                setImportRows(prev => {
                    const newRows = [...prev];
                    // Only update if the symbol hasn't changed in the meantime
                    if (newRows[index].symbol === value) {
                        if (priceData && priceData.price) {
                            newRows[index].price = priceData.price.toString();
                            newRows[index].error = '';
                        } else {
                            // Don't overwrite price if user manually entered it? 
                            // No, if symbol changed, we expect new price.
                            // But if API fails, maybe keep old price? No, that's confusing.
                            newRows[index].error = 'Price not found';
                        }
                        newRows[index].loading = false;
                    }
                    return newRows;
                });
            } catch (error) {
                setImportRows(prev => {
                    const newRows = [...prev];
                    if (newRows[index].symbol === value) {
                        newRows[index].error = 'Failed to fetch price';
                        newRows[index].loading = false;
                    }
                    return newRows;
                });
            }
        }
    };

    const validateImport = () => {
        // Filter out empty rows
        const validRows = importRows.filter(row =>
            row.symbol.trim() && row.amount && row.price && row.date
        );

        if (validRows.length === 0) {
            return { valid: false, message: 'Please add at least one token' };
        }

        // Check for invalid data
        for (const row of validRows) {
            if (isNaN(parseFloat(row.amount)) || parseFloat(row.amount) <= 0) {
                return { valid: false, message: `Invalid amount for ${row.symbol}` };
            }
            if (isNaN(parseFloat(row.price)) || parseFloat(row.price) <= 0) {
                return { valid: false, message: `Invalid price for ${row.symbol}` };
            }
        }

        return { valid: true, rows: validRows };
    };

    const handleImport = () => {
        const validation = validateImport();

        if (!validation.valid) {
            alert(validation.message);
            return;
        }

        setIsImporting(true);

        // Prepare transactions
        const transactions = validation.rows.map(row => ({
            asset: row.symbol.toUpperCase(),
            amount: parseFloat(row.amount),
            price: parseFloat(row.price),
            date: row.date,
            type: 'buy', // Default to buy for imports
            status: 'needs_calculation', // Changed from 'closed' to trigger PnL calc if needed
            holdings_breakdown: [{
                source: 'Manual',
                protocolName: 'Manual Entry',
                amount: parseFloat(row.amount),
                usdValue: parseFloat(row.amount) * parseFloat(row.price),
                chain: null,
                isLiability: false
            }]
        }));

        // Call parent import function
        onImport(transactions);

        if (!isEmbedded) {
            setTimeout(() => {
                setIsImporting(false);
                onClose();
            }, 500);
        } else {
            setIsImporting(false);
            // Parent handles closing if needed, or we just reset
            setImportRows([{ symbol: '', amount: '', price: '', date: new Date().toISOString().split('T')[0], loading: false, error: '' }]);
        }
    };

    const calculateTotal = () => {
        return importRows.reduce((total, row) => {
            const amount = parseFloat(row.amount) || 0;
            const price = parseFloat(row.price) || 0;
            return total + (amount * price);
        }, 0);
    };

    const content = (
        <div className={`modal-content import-modal ${isEmbedded ? 'embedded' : ''}`} onClick={(e) => e.stopPropagation()}>
            {!isEmbedded && (
                <div className="modal-header">
                    <div>
                        <h2>📥 Import Portfolio</h2>
                        <p className="text-secondary">Bulk add multiple tokens to your portfolio</p>
                    </div>
                    <button onClick={onClose} className="modal-close">
                        <X size={24} />
                    </button>
                </div>
            )}

            <div className="modal-body">
                <div className="import-table">
                    <div className="import-table-header">
                        <div className="import-col-symbol">Symbol</div>
                        <div className="import-col-amount">Amount</div>
                        <div className="import-col-price">Price ($)</div>
                        <div className="import-col-date">Date</div>
                        <div className="import-col-actions"></div>
                    </div>

                    <div className="import-table-body">
                        {importRows.map((row, index) => (
                            <div key={index} className="import-row">
                                <div className="import-col-symbol">
                                    <input
                                        type="text"
                                        value={row.symbol}
                                        onChange={(e) => handleRowChange(index, 'symbol', e.target.value.toUpperCase())}
                                        placeholder="BTC"
                                        className="form-input"
                                    />
                                </div>
                                <div className="import-col-amount">
                                    <input
                                        type="number"
                                        value={row.amount}
                                        onChange={(e) => handleRowChange(index, 'amount', e.target.value)}
                                        placeholder="0.00"
                                        step="any"
                                        className="form-input"
                                    />
                                </div>
                                <div className="import-col-price">
                                    <div className="price-input-group">
                                        <input
                                            type="number"
                                            value={row.price}
                                            onChange={(e) => handleRowChange(index, 'price', e.target.value)}
                                            placeholder="0.00"
                                            step="any"
                                            className="form-input"
                                            disabled={row.loading}
                                        />
                                        {row.loading && <Loader2 size={16} className="spin price-loader" />}
                                    </div>
                                    {row.error && <span className="error-text">{row.error}</span>}
                                </div>
                                <div className="import-col-date">
                                    <input
                                        type="date"
                                        value={row.date}
                                        onChange={(e) => handleRowChange(index, 'date', e.target.value)}
                                        className="form-input"
                                    />
                                </div>
                                <div className="import-col-actions">
                                    <button
                                        onClick={() => removeRow(index)}
                                        className="btn-icon-small"
                                        disabled={importRows.length === 1}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <button onClick={addRow} className="btn-add-row">
                    <Plus size={16} /> Add Row
                </button>

                <div className="import-preview">
                    <div className="preview-label">Total Value:</div>
                    <div className="preview-value">${calculateTotal().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
            </div>

            <div className="modal-footer">
                {!isEmbedded && (
                    <button onClick={onClose} className="btn-secondary">
                        Cancel
                    </button>
                )}
                <button
                    onClick={handleImport}
                    className="btn-primary"
                    disabled={isImporting}
                >
                    {isImporting ? (
                        <>
                            <Loader2 size={18} className="spin" />
                            Importing...
                        </>
                    ) : (
                        <>
                            <Upload size={18} />
                            Import {importRows.filter(r => r.symbol && r.amount && r.price).length} Token(s)
                        </>
                    )}
                </button>
            </div>

            <style>{`
          .import-modal {
            max-width: 900px;
            width: 95vw;
          }
          
          .import-modal.embedded {
            width: 100%;
            height: 100%;
            max-width: none;
            box-shadow: none;
            border: none;
            display: flex;
            flex-direction: column;
          }
          
          .import-modal.embedded .modal-body {
            flex: 1;
            overflow-y: auto;
          }

          .import-table {
            margin: var(--spacing-lg) 0;
          }

          .import-table-header,
          .import-row {
            display: grid;
            grid-template-columns: 1.2fr 1.2fr 1.5fr 1.5fr 0.5fr;
            gap: var(--spacing-sm);
            align-items: center;
          }

          .import-table-header {
            font-weight: 600;
            font-size: 0.875rem;
            color: var(--text-secondary);
            padding-bottom: var(--spacing-sm);
            border-bottom: 1px solid var(--bg-tertiary);
            margin-bottom: var(--spacing-sm);
          }

          .import-row {
            margin-bottom: var(--spacing-sm);
          }

          .import-col-symbol,
          .import-col-amount,
          .import-col-price,
          .import-col-date,
          .import-col-actions {
            display: flex;
            flex-direction: column;
          }

          .price-input-group {
            position: relative;
          }

          .price-loader {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            color: var(--accent-primary);
          }

          .error-text {
            font-size: 0.75rem;
            color: var(--accent-danger);
            margin-top: 4px;
          }

          .btn-add-row {
            display: flex;
            align-items: center;
            gap: var(--spacing-xs);
            padding: var(--spacing-sm) var(--spacing-md);
            background-color: var(--bg-tertiary);
            border: 1px dashed var(--accent-primary);
            border-radius: var(--radius-md);
            color: var(--accent-primary);
            cursor: pointer;
            transition: all 0.2s;
            width: 100%;
            justify-content: center;
            font-weight: 500;
          }

          .btn-add-row:hover {
            background-color: rgba(99, 102, 241, 0.1);
          }

          .btn-icon-small {
            background-color: var(--bg-tertiary);
            border: 1px solid var(--bg-tertiary);
            border-radius: var(--radius-sm);
            padding: 6px;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-secondary);
          }

          .btn-icon-small:hover:not(:disabled) {
            background-color: var(--accent-danger);
            border-color: var(--accent-danger);
            color: white;
          }

          .btn-icon-small:disabled {
            opacity: 0.3;
            cursor: not-allowed;
          }

          .import-preview {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--spacing-md);
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1));
            border: 1px solid var(--accent-primary);
            border-radius: var(--radius-md);
            margin-top: var(--spacing-lg);
          }

          .preview-label {
            font-weight: 600;
            color: var(--text-secondary);
          }

          .preview-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--accent-success);
            font-family: var(--font-mono);
          }

          .spin {
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
        </div>
    );

    if (isEmbedded) {
        return content;
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            {content}
        </div>
    );
};

export default ImportPortfolioModal;
