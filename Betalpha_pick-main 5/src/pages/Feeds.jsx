import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { prefetchAssetData } from '../services/feedService';
import { getUserSavedAssets, updateUserSavedAssets } from '../services/userService';
import { addNote } from '../services/noteService';
import { TICKER_MAP, searchCoins, getCoinMetadata, getCoinId } from '../services/coinGeckoApi';
import { RefreshCw, Zap, ChevronDown, Search, Check, X, Sparkles, AlertTriangle, TrendingUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import RowShell from '../components/ui/RowShell';
import FeedsExpanded from '../components/FeedsExpanded';
import './Feeds.css';

// Debounce helper
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

const AssetSelectionModal = ({ isOpen, onClose, currentSelection, onSave, assetMetadata }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    // Selection is now an array of objects: { symbol, name, thumb, id }
    // Initialize from currentSelection (strings) by trying to find metadata or using placeholders
    const [tempSelection, setTempSelection] = useState([]);

    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Initial load: Sync selection and hydrate with metadata
    useEffect(() => {
        if (isOpen) {
            // Hydrate strings to objects
            const initialList = currentSelection.map(symbol => {
                const meta = assetMetadata[symbol];
                return {
                    symbol,
                    name: meta?.name || symbol,
                    thumb: meta?.logo || null,
                    id: meta?.id || null
                };
            });
            setTempSelection(initialList);
            setSearchTerm('');
            setSearchResults([]);
        }
    }, [isOpen, currentSelection, assetMetadata]);

    // Handle Search
    useEffect(() => {
        const fetchCoins = async () => {
            if (!debouncedSearchTerm) {
                setSearchResults([]);
                return;
            }

            setIsSearching(true);
            try {
                const results = await searchCoins(debouncedSearchTerm);
                setSearchResults(results);
            } catch (error) {
                console.error("Search failed:", error);
                setSearchResults([]);
            } finally {
                setIsSearching(false);
            }
        };

        fetchCoins();
    }, [debouncedSearchTerm]);

    const handleToggle = (coin) => {
        const exists = tempSelection.find(item => item.symbol === coin.symbol);

        if (exists) {
            setTempSelection(prev => prev.filter(item => item.symbol !== coin.symbol));
        } else {
            // Add the full coin object (ensure we have necessary fields)
            setTempSelection(prev => [...prev, {
                symbol: coin.symbol,
                name: coin.name || coin.symbol,
                thumb: coin.thumb || null,
                id: coin.id || null
            }]);
        }
    };

    // Shared row renderer to ensure consistent format
    const renderAssetRow = (coin, isSelected, onClick) => (
        <div
            key={coin.symbol}
            className={`asset-row ${isSelected ? 'selected' : ''}`}
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem', borderRadius: '8px',
                background: isSelected ? 'rgba(59, 130, 246, 0.1)' : 'rgba(30, 41, 59, 0.4)',
                border: isSelected ? '1px solid rgba(59, 130, 246, 0.4)' : '1px solid rgba(255,255,255,0.05)',
                cursor: 'pointer', marginBottom: '8px', transition: 'all 0.2s'
            }}
        >
            <div className="asset-info" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {coin.thumb ? (
                    <img src={coin.thumb} alt={coin.symbol} style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                ) : (
                    <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: 'linear-gradient(135deg, #64748b, #475569)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.7rem', fontWeight: 'bold'
                    }}>
                        {coin.symbol.substring(0, 2)}
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: '600', color: '#fff' }}>{coin.symbol}</span>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{coin.name}</span>
                </div>
            </div>
            <div className="custom-checkbox">
                {isSelected ? (
                    <div style={{ background: '#3b82f6', borderRadius: '4px', padding: '2px' }}>
                        <Check size={14} color="#fff" strokeWidth={3} />
                    </div>
                ) : (
                    <div style={{ width: '18px', height: '18px', border: '2px solid #475569', borderRadius: '4px' }}></div>
                )}
            </div>
        </div>
    );

    if (!isOpen) return null;

    return (
        <div className="asset-modal-overlay" onClick={onClose}>
            <div className="asset-modal-container" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                <div className="asset-modal-header">
                    <div className="asset-modal-title">
                        <h2>Manage Analysis Targets</h2>
                        <span className="asset-modal-subtitle">Search to add assets. Uncheck to remove.</span>
                    </div>
                    <button className="asset-modal-close" onClick={onClose}><X size={20} /></button>
                </div>

                {/* SEARCH AREA */}
                <div className="asset-search-section">
                    <div className="asset-search-bar">
                        <Search size={16} className="asset-search-icon" />
                        <input
                            type="text"
                            className="asset-search-input"
                            placeholder="Search token name or ticker (e.g. RAIL, ALCX)..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            autoFocus
                        />
                    </div>
                </div>

                <div className="asset-list-content" style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>

                    {/* 1. SEARCH RESULTS */}
                    {isSearching ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Searching CoinGecko...</div>
                    ) : (
                        searchResults.length > 0 && (
                            <div style={{ marginBottom: '2rem' }}>
                                <h4 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Search Results</h4>
                                {searchResults.map(coin => {
                                    const isSelected = tempSelection.some(item => item.symbol === coin.symbol);
                                    return renderAssetRow(coin, isSelected, () => handleToggle(coin));
                                })}
                            </div>
                        )
                    )}

                    {!isSearching && searchTerm && searchResults.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '1rem', color: '#64748b' }}>No matches found on CoinGecko.</div>
                    )}


                    {/* 2. SELECTED ASSETS (Review List) */}
                    <div style={{ marginTop: searchResults.length > 0 ? '1rem' : '0' }}>
                        <h4 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.75rem', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Selected Assets ({tempSelection.length})</span>
                            {tempSelection.length > 4 && <span style={{ fontSize: '0.75rem' }}>Scroll to see all</span>}
                        </h4>

                        {tempSelection.length === 0 ? (
                            <div style={{ padding: '1.5rem', textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px', color: '#64748b' }}>
                                No assets selected. Search to add.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                {tempSelection.map(coin => (
                                    renderAssetRow(coin, true, () => handleToggle(coin))
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="asset-modal-footer">
                    <button className="asset-save-btn" onClick={() => onSave(tempSelection)} style={{ width: '100%' }}>
                        Save Selection ({tempSelection.length})
                    </button>
                </div>
            </div>
        </div>
    );
};

// Helper: Parse bold text in signals (kept for reference in FeedsExpanded)
// Now moved to FeedsExpanded.jsx component

// FeedsAssetRow - Uses RowShell + FeedsExpanded pattern
const FeedsAssetRow = ({ assetData, assetMetadata, getIcon, change24h, riskCount, opportunityCount, risks, opportunities, navigate, onCreateHighlight }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const { t } = useLanguage();
    const symbol = assetData.symbol;
    const logo = assetMetadata[symbol]?.logo || assetData.logo || getIcon(symbol);

    return (
        <RowShell
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded(v => !v)}
            leftContent={
                <>
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-800">
                        {logo ? (
                            <img
                                src={logo}
                                alt={symbol}
                                className="h-8 w-8 rounded-full object-cover"
                                onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                        ) : (
                            <span className="text-[10px] font-bold uppercase text-slate-400">
                                {symbol.substring(0, 3)}
                            </span>
                        )}
                    </div>
                    <div className="min-w-0 overflow-hidden">
                        <div className="text-sm font-semibold text-white truncate">{symbol}</div>
                        <div className="text-[10px] text-slate-500 truncate">
                            {change24h !== 0 ? `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%` : t('marketIntel')}
                        </div>
                    </div>
                </>
            }
            centerContent={
                <>
                    <div className="text-sm font-medium text-slate-100 truncate line-clamp-1">
                        {opportunityCount} {t('opportunitiesCount')} · {riskCount} {t('risksCount')}
                    </div>
                    <div className="text-xs text-slate-400 truncate line-clamp-1">
                        {t('aiMarketIntelFor')} {symbol}
                    </div>
                </>
            }
            rightContent={
                <>
                    {opportunityCount > 0 && (
                        <div className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                            <TrendingUp className="h-3 w-3" />
                            {opportunityCount}
                        </div>
                    )}
                    {riskCount > 0 && (
                        <div className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                            <AlertTriangle className="h-3 w-3" />
                            {riskCount}
                        </div>
                    )}
                </>
            }
        >
            {/* Expanded: FeedsExpanded with full sources/bookopen */}
            <FeedsExpanded
                asset={symbol}
                opportunities={opportunities}
                risks={risks}
                onCreateHighlight={onCreateHighlight}
                onNavigate={() => navigate(`/asset/${symbol}`)}
            />
        </RowShell>
    );
};

const Feeds = () => {
    const { t } = useLanguage();
    const { transactions } = useTransactions();
    const { prices, getIcon } = usePrices();
    const { user } = useAuth();
    const navigate = useNavigate();

    // 1. User's actual holdings (Default for analysis)
    const holdingAssets = useMemo(() => {
        return [...new Set(transactions
            .filter(t => t.status === 'open')
            .map(t => t.asset)
        )];
    }, [transactions]);

    // Active Targets Logic
    // Store as array of strings (legacy) OR array of objects {symbol, logo, id} (new)
    // We'll normalize to objects in state if possible, or just strings
    const [selectedAssetsInfo, setSelectedAssetsInfo] = useState(() => {
        const saved = localStorage.getItem('selected_assets_v2'); // New key for rich objects
        if (saved) return JSON.parse(saved); // Expect [{symbol, logo...}]

        // Fallback to legacy
        const legacy = localStorage.getItem('selected_assets');
        if (legacy) {
            const arr = JSON.parse(legacy);
            // Convert to partial objects
            return arr.map(s => ({ symbol: s }));
        }
        return [];
    });

    // Computed simple list of symbols for API calls
    const activeTargets = useMemo(() => {
        if (selectedAssetsInfo.length > 0) return selectedAssetsInfo.map(a => a.symbol);
        if (holdingAssets.length > 0) return holdingAssets;
        return ['BTC', 'ETH', 'SOL'];
    }, [selectedAssetsInfo, holdingAssets]);

    // Sync with Firestore (Legacy support + V2)
    // We might only be syncing strings to firestore 'preferences/dashboard', 
    // but locally we want rich data.
    // For now, let's just keep syncing strings to firestore to avoid breaking schema there 
    // unless we want to migrate firestore too. Let's keep firestore as strings for now.
    useEffect(() => {
        if (user?.uid && selectedAssetsInfo.length === 0) {
            getUserSavedAssets(user.uid).then(saved => {
                if (saved && saved.length > 0) {
                    // We only get strings from firestore, so we make partial objects
                    // They will lack logos until re-selected or fetched
                    const rich = saved.map(s => ({ symbol: s }));
                    setSelectedAssetsInfo(rich);
                }
            });
        }
    }, [user]);

    // State
    const [fullAssetData, setFullAssetData] = useState(() => {
        const saved = localStorage.getItem('feeds_analysis_cache');
        return saved ? JSON.parse(saved) : {};
    });

    const [assetMetadata, setAssetMetadata] = useState({}); // Lightweight metadata for UI logos
    const [loading, setLoading] = useState(false);
    const [progressStep, setProgressStep] = useState('');

    // Check if we have valid data to show immediately
    const [signalsReady, setSignalsReady] = useState(() => {
        return Object.keys(fullAssetData).length > 0;
    });

    const [showAssetSelector, setShowAssetSelector] = useState(false);

    const [lastUpdated, setLastUpdated] = useState(() => {
        const saved = localStorage.getItem('feeds_last_updated');
        return saved ? new Date(saved) : null;
    });

    // Persist Cache Effect
    useEffect(() => {
        if (Object.keys(fullAssetData).length > 0) {
            localStorage.setItem('feeds_analysis_cache', JSON.stringify(fullAssetData));
        }
    }, [fullAssetData]);

    // Quick Metadata Fetch for Logos
    // Now we also look at selectedAssetsInfo for logos!
    useEffect(() => {
        const fetchMeta = async () => {
            const newMeta = { ...assetMetadata };
            let changed = false;

            // 1. Populate from our rich selection first (fastest)
            selectedAssetsInfo.forEach(asset => {
                if (asset.thumb && (!newMeta[asset.symbol]?.logo)) {
                    newMeta[asset.symbol] = { logo: asset.thumb };
                    changed = true;
                }
            });

            // 2. Fetch missing
            for (const symbol of activeTargets) {
                if (!newMeta[symbol]) {
                    const id = await getCoinId(symbol); // Fallback to map
                    if (id) {
                        const data = await getCoinMetadata(id);
                        if (data?.image) {
                            newMeta[symbol] = { logo: data.image };
                            changed = true;
                        }
                    }
                }
            }
            if (changed) setAssetMetadata(newMeta);
        };
        fetchMeta();
    }, [activeTargets, selectedAssetsInfo]);


    // Handlers
    const loadFeeds = async (forceRefresh = false) => {
        setLoading(true);
        // Only reset signalsReady if we are forcing a completely fresh state that shouldn't show old data
        // But typically we want to keep showing old data until new data arrives? 
        // For now, let's keep the UX of "Start fresh" if user clicks button to be safe, 
        // OR we can leave signalsReady=true but show loading overlay.
        // User asked for cache, so better to not clear immediately unless necessary.
        if (forceRefresh) setSignalsReady(false);

        try {
            setProgressStep(`Initializing analysis for ${activeTargets.length} assets...`);

            // Call the service with onProgress callback
            const results = await prefetchAssetData(
                activeTargets,
                user,
                transactions,
                prices,
                forceRefresh,
                (step) => setProgressStep(step) // Update UI with step name
            );

            setFullAssetData(results); // This triggers the persist effect

            const now = new Date();
            setLastUpdated(now);
            localStorage.setItem('feeds_last_updated', now.toISOString());

            setSignalsReady(true);
        } catch (error) {
            console.error("Failed to generate signals:", error);
        } finally {
            setLoading(false);
            setProgressStep('');
        }
    };

    const saveAssetSelection = async (newSelectionObjects) => {
        // newSelectionObjects is array of {symbol, name, thumb...}
        setSelectedAssetsInfo(newSelectionObjects);

        // Save Rich Data locally
        localStorage.setItem('selected_assets_v2', JSON.stringify(newSelectionObjects));

        // Save Simple Data via Legacy Key (for backup) and Firestore
        const symbols = newSelectionObjects.map(a => a.symbol);
        localStorage.setItem('selected_assets', JSON.stringify(symbols));

        setShowAssetSelector(false);

        if (user?.uid) {
            await updateUserSavedAssets(user.uid, symbols);
        }
    };

    const handleCreateHighlightFromFeed = async (assetSymbol, coinId, payload) => {
        if (!user) return;
        try {
            await addNote(user.uid, {
                ...payload,
                type: 'token',
                asset: assetSymbol,
                coinId: coinId || null,
            });
            alert("Saved to Notebook!"); // Quick feedback
        } catch (error) {
            console.error("Failed to save highlight:", error);
            alert("Failed to save highlight.");
        }
    };

    // --- FILTER LOGIC (Rule 3: Only show assets with >= 1 Risk OR >= 1 Opp) ---
    const visibleCards = useMemo(() => {
        if (!signalsReady) return [];

        return Object.values(fullAssetData)
            .filter(asset => !asset.error)
            .filter(asset => {
                const risks = asset.intelligence?.riskCount || 0;
                const opps = asset.intelligence?.opportunityCount || 0;
                return risks > 0 || opps > 0;
            });
    }, [fullAssetData, signalsReady]);

    return (
        <div className="feeds-container">
            {/* 1. Header & CTA */}
            <div className="feeds-header">
                <h1>{t('feedsDashboardTitle') || 'Market Intelligence Dashboard'}</h1>
                <p className="feeds-subtitle">{t('feedsDashboardSubtitle') || 'Unified AI analysis of Risks and Opportunities across your market.'}</p>

                <div className="signal-cta-container">
                    <button
                        className={`signal-cta-btn ${loading ? 'loading' : ''} ${signalsReady ? 'ready' : ''}`}
                        onClick={() => loadFeeds(true)}
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <RefreshCw className="spin-icon" size={18} />
                                <span className="analyzing-text">{t('analyzing') || 'Analyzing'}</span>
                            </>
                        ) : (
                            <>
                                <Zap size={18} />
                                {t('generateIntelligence') || 'Generate Intelligence'}
                            </>
                        )}
                    </button>
                    {!loading && lastUpdated && (
                        <div className="last-updated-text">
                            Last updated: {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                        </div>
                    )}
                </div>
            </div>

            {/* 2. Analyzed Assets List */}
            <div className="holdings-selector">
                <span className="holdings-label">{t('targetAssets') || 'TARGET ASSETS'} ({activeTargets.length}):</span>
                <div className="holdings-list">
                    {activeTargets.map((asset, index) => {
                        // Use metadata first, fall back to full data, or null
                        const logo = assetMetadata[asset]?.logo || fullAssetData[asset]?.logo || getIcon(asset);

                        return (
                            <span key={asset} className="holding-item" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                {logo && <img src={logo} alt="" style={{ width: '16px', height: '16px', borderRadius: '50%' }} />}
                                {asset} {index < activeTargets.length - 1 && <span style={{ margin: '0 4px', opacity: 0.3 }}>•</span>}
                            </span>
                        );
                    })}
                </div>

                <div className="asset-selector-wrapper">
                    <button
                        className="edit-holdings-btn"
                        onClick={() => setShowAssetSelector(true)}
                    >
                        [ {t('selectAssets') || 'Select Assets'} ] <ChevronDown size={14} />
                    </button>
                </div>
            </div>

            {/* Asset Selection Modal */}
            <AssetSelectionModal
                isOpen={showAssetSelector}
                onClose={() => setShowAssetSelector(false)}
                currentSelection={activeTargets} // Pass list of symbols to hydrate
                assetMetadata={assetMetadata}    // Pass current metadata to help hydrate
                onSave={saveAssetSelection}
            />

            {/* 3. DASHBOARD CONTENT (Unified Card List) */}
            <div className="dashboard-content" style={{ marginTop: '2rem', position: 'relative', minHeight: '400px' }}>

                {/* STATE 1: INITIAL (Blurred Placeholder) */}
                {!loading && !signalsReady && (
                    <div className="initial-placeholder" style={{
                        position: 'absolute', inset: 0,
                        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.4) 0%, rgba(15, 23, 42, 0.8) 100%)',
                        backdropFilter: 'blur(10px)',
                        borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        zIndex: 10
                    }}>
                        <div style={{ marginBottom: '1.5rem', textAlign: 'center', maxWidth: '400px' }}>
                            <Sparkles size={48} color="#64748b" style={{ margin: '0 auto 1.5rem', opacity: 0.8 }} />
                            <h3 style={{ color: '#fff', marginBottom: '0.75rem', fontSize: '1.25rem' }}>{t('readyToAnalyze') || 'Ready to Analyze Market'}</h3>
                            <p style={{ color: '#94a3b8', lineHeight: '1.6' }}>
                                {t('aiScanDescription') || 'AI will scan social sentiment, technical indicators, and news for your'}
                                <span style={{ color: '#f8fafc', fontWeight: '600' }}> {activeTargets.length} {t('selectedAssets') || 'selected assets'}</span>.
                            </p>
                        </div>
                        <button
                            className="signal-cta-btn"
                            onClick={() => loadFeeds(true)}
                            style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
                        >
                            <Zap size={20} /> Generate Intelligence
                        </button>
                    </div>
                )}

                {/* STATE 2: LOADING */}
                {loading && (
                    <div className="loading-state" style={{
                        textAlign: 'center', padding: '6rem 2rem', color: '#64748b',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%'
                    }}>
                        <div className="loading-spinner-container" style={{ position: 'relative', width: '60px', height: '60px', marginBottom: '2rem' }}>
                            <div className="spinner-ring" style={{
                                position: 'absolute', inset: 0, borderRadius: '50%',
                                border: '3px solid transparent', borderTopColor: '#3b82f6',
                                animation: 'spin 1s linear infinite'
                            }}></div>
                            <div className="spinner-ring-2" style={{
                                position: 'absolute', inset: '10px', borderRadius: '50%',
                                border: '3px solid transparent', borderTopColor: '#c084fc',
                                animation: 'spin 1.5s linear infinite reverse'
                            }}></div>
                        </div>

                        <h3 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '1rem', fontWeight: '600' }}>
                            Analyzing Market Intelligence...
                        </h3>

                        <div style={{
                            background: 'rgba(15, 23, 42, 0.6)', padding: '0.5rem 1rem',
                            borderRadius: '20px', border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <span style={{ fontSize: '0.95rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                                {progressStep || 'Initializing...'}
                            </span>
                        </div>
                    </div>
                )}

                {/* STATE 3: RESULTS (Unified Cards) */}
                {!loading && signalsReady && (
                    <div className="results-grid" style={{ animation: 'fadeIn 0.5s ease', marginBottom: '4rem' }}>
                        {visibleCards.length === 0 ? (
                            <div className="empty-state" style={{
                                textAlign: 'center', padding: '4rem',
                                background: 'rgba(30,41,59,0.5)', borderRadius: '16px', border: '1px dashed rgba(255,255,255,0.1)'
                            }}>
                                <Check size={48} color="#10b981" style={{ margin: '0 auto 1rem' }} />
                                <h3 style={{ color: '#fff', marginBottom: '0.5rem' }}>All Quiet</h3>
                                <p style={{ color: '#94a3b8' }}>No significant Risks or Opportunities detected.</p>
                                <button
                                    className="text-btn"
                                    onClick={() => loadFeeds(true)}
                                    style={{ marginTop: '1rem', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                    Force Re-Analyze
                                </button>
                            </div>
                        ) : (
                            visibleCards.map((assetData) => {
                                const { intelligence = {} } = assetData;
                                const { risks = [], opportunities = [], riskCount = 0, opportunityCount = 0 } = intelligence;
                                const change24h = assetData.price?.change24h ?? assetData.price?.priceChange24h ?? 0;

                                return (
                                    <FeedsAssetRow
                                        key={assetData.symbol}
                                        assetData={assetData}
                                        assetMetadata={assetMetadata}
                                        getIcon={getIcon}
                                        change24h={change24h}
                                        riskCount={riskCount}
                                        opportunityCount={opportunityCount}
                                        risks={risks}
                                        opportunities={opportunities}
                                        navigate={navigate}
                                        onCreateHighlight={(payload) => handleCreateHighlightFromFeed(assetData.symbol, assetMetadata[assetData.symbol]?.id, payload)}
                                    />
                                );
                            })
                        )}

                        {/* DISCLAIMER FOOTER */}
                        <div style={{
                            marginTop: '3rem',
                            padding: '1.5rem',
                            borderTop: '1px solid rgba(255,255,255,0.1)',
                            textAlign: 'center',
                            opacity: 0.6,
                            fontSize: '0.8rem',
                            color: '#94a3b8'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                                <AlertTriangle size={14} />
                                <span style={{ fontWeight: '600', textTransform: 'uppercase' }}>Disclaimer</span>
                            </div>
                            <p style={{ maxWidth: '600px', margin: '0 auto', lineHeight: '1.5' }}>
                                This dashboard provides aggregated market intelligence for informational purposes only.
                                Features are powered by AI and may produce inaccurate or incomplete results.
                                Always conduct your own research (DYOR) before making investment decisions.
                                BetAlpha Pick is not a financial advisor.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Feeds;
