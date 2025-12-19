import React, { useState, useEffect, useMemo } from 'react';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { useAuth } from '../context/AuthContext';
import { addNote } from '../services/notebookService';
import { getPortfolioFeeds } from '../services/twitterService';
import { searchCoins } from '../services/coinGeckoApi';
import { detectAssetEvents, generateWidgetData } from '../services/analysisService';
import { RefreshCw, AlertTriangle, Activity, Zap, Check, X, ChevronDown, TrendingUp, Award, ExternalLink, ArrowRight, FileText, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './Feeds.css';

const TweetItem = ({ tweet }) => {
    // ... existing code ...
    return null; // Functionality moved to cards, keeping for consistent clean up if needed
};

const Feeds = () => {
    const { user } = useAuth(); // Add Auth Context
    const { t } = useLanguage();
    const { transactions } = useTransactions();
    const { prices, refreshPrices } = usePrices();
    const navigate = useNavigate();

    // ... existing state ...

    const handleAddToNote = async (text, asset, type) => {
        if (!user) {
            alert("Please login to save notes.");
            return;
        }

        const isOpp = type === 'Opportunity';
        const noteTitle = `${type}: ${asset} – ${isOpp ? 'Opportunity' : 'Risk'}`;

        try {
            await addNote(user.uid, {
                title: noteTitle,
                content: text,
                tags: [type.toLowerCase(), asset],
                asset: asset,
                type: 'token',
                noteCategory: 'highlight', // Matches desktop category for these
                color: isOpp ? 'var(--accent-primary)' : '#ef4444',
                sourceRef: {
                    asset: asset,
                    group: type.toLowerCase(),
                    sourceType: `feed_mobile_${type.toLowerCase()}`
                }
            });
            alert("✅ Insight saved to Notebook!");
        } catch (error) {
            console.error("Failed to save note", error);
            alert("Failed to save note.");
        }
    };

    // State
    const [holdingsFeed, setHoldingsFeed] = useState([]);
    const [loading, setLoading] = useState(false);
    const [signalsReady, setSignalsReady] = useState(false);
    const [lastGenerated, setLastGenerated] = useState(null);
    const [showAssetSelector, setShowAssetSelector] = useState(false);

    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Search Effect
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (searchQuery.trim().length >= 1) {
                setIsSearching(true);
                try {
                    const results = await searchCoins(searchQuery);
                    setSearchResults(results);
                } catch (error) {
                    console.error("Search failed", error);
                } finally {
                    setIsSearching(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 500); // Debounce 500ms

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleSelectResult = (coin) => {
        const symbol = coin.symbol.toUpperCase();
        if (!selectedAssets.includes(symbol)) {
            setSelectedAssets([...selectedAssets, symbol]);
            // Also cache the icon
            if (coin.large) {
                setAssetIcons(prev => ({ ...prev, [symbol]: coin.large }));
                localStorage.setItem(`icon_${symbol}`, coin.large);
            }
        }
        setSearchQuery('');
        setSearchResults([]);
    };
    const [selectedAssets, setSelectedAssets] = useState(() => {
        try {
            const saved = localStorage.getItem('feeds_selected_assets');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error("Failed to parse saved assets", e);
            return [];
        }
    });

    // Persist selected assets
    useEffect(() => {
        localStorage.setItem('feeds_selected_assets', JSON.stringify(selectedAssets));
    }, [selectedAssets]);
    const [assetIcons, setAssetIcons] = useState({});

    // --- Icon Resolution Logic ---
    useEffect(() => {
        const fetchIcons = async () => {
            if (selectedAssets.length === 0) return;

            // Only fetch if we have selected assets
            // We need to check if we already have icons or if they are cached
            let updates = {};
            let needsUpdate = false;

            // Check existing icons to avoid re-fetching
            const missingAssets = selectedAssets.filter(a => !assetIcons[a]);

            if (missingAssets.length === 0) return;

            for (const asset of missingAssets) {
                // Check local storage first
                const cached = localStorage.getItem(`icon_${asset}`);
                if (cached) {
                    updates[asset] = cached;
                    needsUpdate = true;
                } else {
                    // Fetch from API
                    try {
                        const { searchCoin } = await import('../services/coinGeckoApi');
                        const coinData = await searchCoin(asset);
                        if (coinData && coinData.large) {
                            updates[asset] = coinData.large;
                            localStorage.setItem(`icon_${asset}`, coinData.large);
                            needsUpdate = true;
                        }
                    } catch (err) {
                        console.error(`Failed to fetch icon for ${asset}`, err);
                    }
                }
            }

            if (needsUpdate) {
                setAssetIcons(prev => ({ ...prev, ...updates }));
            }
        };

        fetchIcons();
    }, [selectedAssets]);

    // --- Cache Logic ---
    useEffect(() => {
        const cachedData = localStorage.getItem('portfolio_signals_cache');
        const cachedTime = localStorage.getItem('portfolio_signals_timestamp');

        if (cachedData && cachedTime) {
            const now = Date.now();
            const age = now - parseInt(cachedTime);
            const fourHours = 4 * 60 * 60 * 1000;

            if (age < fourHours) {
                setHoldingsFeed(JSON.parse(cachedData));
                setLastGenerated(parseInt(cachedTime));
                setSignalsReady(true);
            }
        }
    }, []);

    const saveToCache = (data) => {
        const now = Date.now();
        localStorage.setItem('portfolio_signals_cache', JSON.stringify(data));
        localStorage.setItem('portfolio_signals_timestamp', now.toString());
        setLastGenerated(now);
        setSignalsReady(true);
    };

    const [generationStatus, setGenerationStatus] = useState('');

    // --- Signal Generation ---
    const generateSignals = async () => {
        setLoading(true);
        setGenerationStatus(t('step1'));

        try {
            // Step 1: Fetch Market Data (Prices, Volume, Volatility)
            console.log('[Signal Pipeline] Step 1: Refreshing prices...');
            await refreshPrices(); // Ensure this is awaited

            // Step 2: Fetch Social Data (Tweets, Sentiment)
            // Step 2: Fetch Social Data (Tweets, Sentiment)
            setGenerationStatus(t('step2'));
            console.log('[Signal Pipeline] Step 2: Fetching social feeds (Force Refresh)...');

            // Identify Assets
            const holdingsMap = transactions.reduce((acc, tx) => {
                const symbol = tx.asset.toUpperCase();
                if (!acc[symbol]) acc[symbol] = 0;
                if (tx.type === 'buy') acc[symbol] += parseFloat(tx.amount || 0);
                else if (tx.type === 'sell') acc[symbol] -= parseFloat(tx.amount || 0);
                return acc;
            }, {});
            const allAssets = Object.keys(holdingsMap).filter(s => holdingsMap[s] > 0);

            // Use selected assets if available, otherwise default to all
            const targets = selectedAssets.length > 0 ? selectedAssets : (allAssets.length > 0 ? allAssets : ['BTC', 'ETH']);

            // Force refresh to bypass cache
            const feeds = await getPortfolioFeeds(targets, true);

            // Step 3: AI Processing
            // Step 3: AI Processing
            setGenerationStatus(t('step3'));
            console.log('[Signal Pipeline] Step 3: Analyzing events...');
            // Simulate brief processing time for UX (detectAssetEvents is fast)
            await new Promise(resolve => setTimeout(resolve, 800));

            // Step 4: Update Dashboard
            // Step 4: Update Dashboard
            setGenerationStatus(t('step4'));
            console.log('[Signal Pipeline] Step 4: Updating state...');
            setHoldingsFeed(feeds);
            saveToCache(feeds);

            // Step 5: Completed
            // Step 5: Completed
            setGenerationStatus(t('step5'));
            console.log('[Signal Pipeline] Step 5: Done.');

            // Clear status after delay
            setTimeout(() => setGenerationStatus(''), 3000);

        } catch (error) {
            console.error("Signal generation failed:", error);
            setGenerationStatus(t('genFailed'));
        } finally {
            setLoading(false);
        }
    };

    // --- Analyzed Assets Logic ---
    const analyzedAssets = useMemo(() => {
        const holdingsMap = transactions.reduce((acc, tx) => {
            const symbol = tx.asset.toUpperCase();
            if (!acc[symbol]) acc[symbol] = 0;
            if (tx.type === 'buy') acc[symbol] += parseFloat(tx.amount || 0);
            else if (tx.type === 'sell') acc[symbol] -= parseFloat(tx.amount || 0);
            return acc;
        }, {});
        const all = Object.keys(holdingsMap).filter(s => holdingsMap[s] > 0);
        return all;
    }, [transactions]);

    // Initialize selected assets - Only if empty to avoid overwriting user manual selection
    useEffect(() => {
        if (analyzedAssets.length > 0 && selectedAssets.length === 0) {
            console.log('[Feeds] Initializing selected assets from holdings:', analyzedAssets);
            setSelectedAssets(analyzedAssets);
        }
    }, [analyzedAssets]);

    // --- Visual Metrics Logic ---
    const metrics = useMemo(() => {
        // 0. Detect Events across all targets
        const targets = selectedAssets.length > 0 ? selectedAssets : analyzedAssets;
        const allEvents = targets.flatMap(asset => {
            const assetTweets = holdingsFeed.filter(t => t.asset === asset);
            const priceData = prices[asset];
            const txData = transactions.find(t => t.asset === asset && t.status === 'open') || {};
            return detectAssetEvents(asset, priceData, assetTweets, txData);
        });

        // 6. Narrative & Social Intelligence Board
        // Filter: Must be narrative-driven AND have at least 1 tweet or news source
        const boardEvents = allEvents
            .filter(e => e.isNarrative && (e.sources?.tweets > 0 || e.sources?.news > 0))
            .sort((a, b) => b.importance - a.importance)
            .slice(0, 7);

        // Calculate Total Tweets Analyzed
        const totalTweetsAnalyzed = holdingsFeed.length;

        // 7. Generate Rich Widget Data
        const widgetData = generateWidgetData(allEvents, holdingsFeed, transactions, prices);

        return {
            widgets: widgetData,
            boardEvents,
            totalTweetsAnalyzed
        };
    }, [holdingsFeed, signalsReady, transactions, prices, selectedAssets, analyzedAssets]);

    const [expandedEventId, setExpandedEventId] = useState(null);

    const toggleEventExpansion = (idx) => {
        setExpandedEventId(expandedEventId === idx ? null : idx);
    };

    const toggleAsset = (asset) => {
        if (selectedAssets.includes(asset)) {
            setSelectedAssets(selectedAssets.filter(a => a !== asset));
        } else {
            setSelectedAssets([...selectedAssets, asset]);
        }
    };

    const handleWidgetClick = (path) => {
        navigate(path);
    };

    return (
        <div className="feeds-container centered-layout">
            {/* 1. Header Section */}
            <div className="dashboard-header">
                <h1>{t('feedsTitle')}</h1>
                <p className="dashboard-subtitle">{t('feedsSubtitle')}</p>
            </div>

            {/* 2. Primary CTA Section */}
            <div className="signal-cta-container">
                <button
                    className={`signal-cta-btn ${loading ? 'loading' : ''} ${signalsReady ? 'ready' : ''}`}
                    onClick={generateSignals}
                    disabled={loading}
                >
                    {loading ? <RefreshCw className="spin-icon" /> : <Zap fill="currentColor" />}
                    {loading ? t('analyzing') : t('generateIntelligence')}
                </button>
                {lastGenerated && !loading && (
                    <span className="last-updated-text">
                        {t('lastUpdated')}: {formatDistanceToNow(lastGenerated)} {t('ago')}
                    </span>
                )}
            </div>

            {/* 3. Target Assets Selector */}
            <div className="target-assets-section">
                <div className="target-label">{t('targetAssets')} ({selectedAssets.length}):</div>

                <div className="target-assets-display">
                    {selectedAssets.slice(0, 3).map(asset => (
                        <div key={asset} className="target-asset-pill">
                            <div className="coin-icon-placeholder">
                                {asset[0]}
                            </div>
                            {asset}
                        </div>
                    ))}
                    {selectedAssets.length > 3 && (
                        <span className="more-assets">+{selectedAssets.length - 3}</span>
                    )}
                </div>

                <div className="asset-selector-wrapper centered">
                    <button
                        className="edit-holdings-btn-simple"
                        onClick={() => setShowAssetSelector(!showAssetSelector)}
                    >
                        [ {t('selectAssets')} ] <ChevronDown size={14} />
                    </button>

                    {showAssetSelector && (
                        <div className="asset-selector-dropdown">
                            <div className="selector-header">
                                <span>{t('selectAssets')}</span>
                                <X size={16} className="close-icon" onClick={() => setShowAssetSelector(false)} />
                            </div>

                            {/* Add Asset Input */}
                            <div className="add-asset-input-row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-tertiary)', display: 'flex', gap: '8px', flexDirection: 'column' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                    <input
                                        type="text"
                                        placeholder={t('searchAssets')}
                                        className="simple-input"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{
                                            flex: 1,
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid var(--bg-tertiary)',
                                            color: 'white',
                                            padding: '8px 10px',
                                            borderRadius: '6px',
                                            fontSize: '0.8rem'
                                        }}
                                        autoFocus
                                    />
                                    {isSearching && <Loader2 size={16} className="animate-spin text-slate-400" />}
                                </div>
                            </div>

                            {/* Search Results */}
                            {(searchResults.length > 0) && (
                                <div className="selector-list" style={{ maxHeight: '200px', borderBottom: '1px solid var(--bg-tertiary)', backgroundColor: 'rgba(15, 23, 42, 0.5)' }}>
                                    <div style={{ padding: '4px 12px', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>{t('searchResults')}</div>
                                    {searchResults.map(coin => (
                                        <div
                                            key={coin.id}
                                            className="selector-item"
                                            onClick={() => handleSelectResult(coin)}
                                            style={{ padding: '8px 12px' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {coin.thumb ? (
                                                    <img src={coin.thumb} alt={coin.symbol} style={{ width: '20px', height: '20px', borderRadius: '50%' }} />
                                                ) : (
                                                    <div className="coin-icon-placeholder" style={{ width: '20px', height: '20px', fontSize: '0.6rem' }}>{coin.symbol[0]}</div>
                                                )}
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 600 }}>{coin.symbol}</span>
                                                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{coin.name}</span>
                                                </div>
                                            </div>
                                            <div style={{ marginLeft: 'auto' }}>
                                                {selectedAssets.includes(coin.symbol.toUpperCase()) ? <Check size={14} className="text-emerald-400" /> : <plus size={14} className="text-slate-500" />}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="selector-list">
                                {analyzedAssets.map(asset => (
                                    <div
                                        key={asset}
                                        className={`selector-item ${selectedAssets.includes(asset) ? 'selected' : ''}`}
                                        onClick={() => toggleAsset(asset)}
                                    >
                                        <div className="checkbox">
                                            {selectedAssets.includes(asset) && <Check size={12} />}
                                        </div>
                                        <span>{asset}</span>
                                    </div>
                                ))}
                                {/* Show manually added assets that are NOT in holdings */}
                                {selectedAssets.filter(a => !analyzedAssets.includes(a)).map(asset => (
                                    <div
                                        key={asset}
                                        className="selector-item selected"
                                        onClick={() => toggleAsset(asset)}
                                    >
                                        <div className="checkbox">
                                            <Check size={12} />
                                        </div>
                                        <span>{asset} (Manual)</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Asset Intelligence List */}
            <div className="asset-intel-list">
                {selectedAssets.map(asset => {
                    // Use metrics logic if available or fallback to feed analysis
                    const assetFeed = holdingsFeed.filter(f => f.asset === asset);
                    // Analyze sentiment/type more robustly. Backend returns 'bullish'/'bearish' or 'opportunity'/'risk'
                    // Helper to determine type safely
                    const isOpp = (i) =>
                        (i.category === 'Opportunity') ||
                        (i.sentiment === 'Positive') ||
                        (i.type === 'opportunity') ||
                        (i.sentiment === 'bullish');

                    const isRisk = (i) =>
                        (i.category === 'Risk Alert') ||
                        (i.sentiment === 'Negative') ||
                        (i.type === 'risk') ||
                        (i.sentiment === 'bearish');

                    const oppCount = assetFeed.filter(isOpp).length;
                    const riskCount = assetFeed.filter(isRisk).length;

                    // Construct CoinGecko Image URL or use resolved icon
                    const isExpanded = expandedEventId === asset;


                    return (
                        <div key={asset} className={`asset-intel-card ${isExpanded ? 'active' : ''}`} onClick={() => toggleEventExpansion(asset)}>
                            <div className="asset-col">
                                <div className="coin-icon-large">
                                    <img
                                        src={assetIcons[asset] || `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/${asset.toLowerCase()}.png`}
                                        alt={asset}
                                        className="coin-icon-img"
                                        style={{ display: 'block' }}
                                        onError={(e) => {
                                            const target = e.target;
                                            // Fallback chain
                                            if (target.src === assetIcons[asset]) {
                                                // Resolved icon failed, try generic CDN
                                                target.src = `https://cdn.jsdelivr.net/gh/atomiclabs/cryptocurrency-icons@1a63530be6e374711a8554f31b17e4cb92c25fa5/128/color/${asset.toLowerCase()}.png`;
                                            } else if (target.src.includes('atomiclabs')) {
                                                // AtomicLabs failed, try LiveCoinWatch
                                                target.src = `https://lcw.nyc3.cdn.digitaloceanspaces.com/production/currencies/64/${asset.toLowerCase()}.png`;
                                            } else {
                                                target.style.display = 'none';
                                                target.nextSibling.style.display = 'flex';
                                            }
                                        }}
                                    />
                                    {/* Fallback Placeholder */}
                                    <div className="coin-icon-img flex items-center justify-center bg-slate-800 text-slate-200 font-bold rounded-full border border-slate-700" style={{ display: 'none' }}>
                                        {asset[0]}
                                    </div>
                                </div>
                                <div className="asset-info">
                                    <span className="asset-symbol">{asset}</span>
                                    <span className="asset-subtitle">Market Intel</span>
                                </div>
                            </div>

                            <div className="intel-summary-col">
                                <span className="intel-text">
                                    <span className="highlight-white">{oppCount} {t('opportunities_count')}</span> • <span className="highlight-white">{riskCount} {t('risks_count')}</span>
                                </span>
                                <span className="intel-subtext">{t('aiMarketIntel')} {asset}</span>
                            </div>

                            <div className="intel-badges-col">
                                <div className="intel-badge opp">
                                    <TrendingUp size={14} /> {oppCount}
                                </div>
                                <div className="intel-badge risk">
                                    <AlertTriangle size={14} /> {riskCount}
                                </div>
                                <ChevronDown size={16} className={`card-arrow ${isExpanded ? 'rotated' : ''}`} />
                            </div>

                            {isExpanded && (
                                <div className="asset-intel-details" onClick={(e) => e.stopPropagation()}>
                                    {/* Opportunities Section */}
                                    {oppCount > 0 && (
                                        <div className="intel-section-block">
                                            <h4 className="intel-section-title text-emerald-400">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></div>
                                                {t('opportunities')}
                                            </h4>
                                            <div className="intel-items-list">
                                                {assetFeed.filter(isOpp).map((item, idx) => (
                                                    <div key={idx} className="intel-detail-item">
                                                        <div className="intel-content-row">
                                                            <div className="intel-text-wrapper">
                                                                <p className="intel-detail-text">• {item.text || item.summary}</p>
                                                                {item.url && (
                                                                    <div className="intel-source-row">
                                                                        <span className="source-label">SOURCE:</span>
                                                                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="source-link">
                                                                            {item.author || 'News'} <ExternalLink size={10} />
                                                                        </a>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <button
                                                                className="add-to-note-btn-icon"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleAddToNote(item.text || item.summary, asset, 'Opportunity');
                                                                }}
                                                            >
                                                                <FileText size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Risks Section */}
                                    {riskCount > 0 && (
                                        <div className="intel-section-block">
                                            <h4 className="intel-section-title text-rose-400">
                                                <div className="w-2 h-2 rounded-full bg-rose-500 mr-2"></div>
                                                {t('risks')}
                                            </h4>
                                            <div className="intel-items-list">
                                                {assetFeed.filter(isRisk).map((item, idx) => (
                                                    <div key={idx} className="intel-detail-item">
                                                        <div className="intel-content-row">
                                                            <div className="intel-text-wrapper">
                                                                <p className="intel-detail-text">• {item.text || item.summary}</p>
                                                                {item.url && (
                                                                    <div className="intel-source-row">
                                                                        <span className="source-label">SOURCE:</span>
                                                                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="source-link">
                                                                            {item.author || 'News'} <ExternalLink size={10} />
                                                                        </a>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <button
                                                                className="add-to-note-btn-icon"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleAddToNote(item.text || item.summary, asset, 'Risk');
                                                                }}
                                                            >
                                                                <FileText size={16} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="intel-card-footer">
                                        <button
                                            className="go-to-asset-btn"
                                            onClick={() => handleWidgetClick(`/asset/${asset}`)}
                                        >
                                            {t('goToAssetPage')} <ArrowRight size={14} className="ml-1" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

        </div>
    );
};

export default Feeds;
