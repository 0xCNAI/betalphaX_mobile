import React, { useState, useEffect, useMemo } from 'react';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { getPortfolioFeeds } from '../services/twitterService';
import { detectAssetEvents, generateWidgetData } from '../services/analysisService';
import { RefreshCw, AlertTriangle, Activity, Zap, Check, X, ChevronDown, TrendingUp, Award, ExternalLink, ArrowRight } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import './Feeds.css';

const TweetItem = ({ tweet }) => {
    const [expanded, setExpanded] = useState(false);
    const maxLength = 150;
    const isLong = tweet.text.length > maxLength;
    const displayText = expanded || !isLong ? tweet.text : `${tweet.text.slice(0, maxLength)}...`;

    return (
        <div className="tweet-item">
            <div className="tweet-header">
                <span className={`tweet-sentiment ${tweet.sentiment}`}>
                    {tweet.sentiment}
                </span>
                <span className="tweet-date">
                    {formatDistanceToNow(new Date(tweet.timestamp))} ago
                </span>
            </div>
            <p className="tweet-text">
                {displayText}
                {isLong && (
                    <button className="show-more-btn" onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}>
                        {expanded ? 'Show less' : 'Show more'}
                    </button>
                )}
            </p>
            <div className="tweet-footer">
                <div className="tweet-metrics">
                    <span title="Likes">❤️ {tweet.likes || 0}</span>
                    <span title="Retweets">↻ {tweet.retweets || 0}</span>
                    <span title="Replies">💬 {tweet.replies || 0}</span>
                </div>
                {tweet.url && (
                    <a
                        href={tweet.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tweet-link"
                        onClick={(e) => e.stopPropagation()}
                    >
                        View Tweet <ExternalLink size={12} style={{ marginLeft: '4px' }} />
                    </a>
                )}
            </div>
        </div>
    );
};

const Feeds = () => {
    const { transactions } = useTransactions();
    const { prices, refreshPrices } = usePrices();
    const navigate = useNavigate();

    // State
    const [holdingsFeed, setHoldingsFeed] = useState([]);
    const [loading, setLoading] = useState(false);
    const [signalsReady, setSignalsReady] = useState(false);
    const [lastGenerated, setLastGenerated] = useState(null);
    const [showAssetSelector, setShowAssetSelector] = useState(false);
    const [selectedAssets, setSelectedAssets] = useState([]);

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
        setGenerationStatus('Step 1/5: Fetching Market Data...');

        try {
            // Step 1: Fetch Market Data (Prices, Volume, Volatility)
            console.log('[Signal Pipeline] Step 1: Refreshing prices...');
            await refreshPrices(); // Ensure this is awaited

            // Step 2: Fetch Social Data (Tweets, Sentiment)
            setGenerationStatus('Step 2/5: Fetching Social Data...');
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
            setGenerationStatus('Step 3/5: AI Processing Events & Signals...');
            console.log('[Signal Pipeline] Step 3: Analyzing events...');
            // Simulate brief processing time for UX (detectAssetEvents is fast)
            await new Promise(resolve => setTimeout(resolve, 800));

            // Step 4: Update Dashboard
            setGenerationStatus('Step 4/5: Updating Dashboard...');
            console.log('[Signal Pipeline] Step 4: Updating state...');
            setHoldingsFeed(feeds);
            saveToCache(feeds);

            // Step 5: Completed
            setGenerationStatus('Step 5/5: Completed');
            console.log('[Signal Pipeline] Step 5: Done.');

            // Clear status after delay
            setTimeout(() => setGenerationStatus(''), 3000);

        } catch (error) {
            console.error("Signal generation failed:", error);
            setGenerationStatus('Error: Failed to generate signals.');
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

    // Initialize selected assets
    useEffect(() => {
        if (analyzedAssets.length > 0 && selectedAssets.length === 0) {
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
                <h1>Market Intelligence Dashboard</h1>
                <p className="dashboard-subtitle">Unified AI analysis of Risks and Opportunities across your market.</p>
            </div>

            {/* 2. Primary CTA Section */}
            <div className="signal-cta-container">
                <button
                    className={`signal-cta-btn ${loading ? 'loading' : ''} ${signalsReady ? 'ready' : ''}`}
                    onClick={generateSignals}
                    disabled={loading}
                >
                    {loading ? <RefreshCw className="spin-icon" /> : <Zap fill="currentColor" />}
                    {loading ? 'Analyzing...' : 'Generate Intelligence'}
                </button>
                {lastGenerated && !loading && (
                    <span className="last-updated-text">
                        Last updated: {formatDistanceToNow(lastGenerated)} ago
                    </span>
                )}
            </div>

            {/* 3. Target Assets Selector */}
            <div className="target-assets-section">
                <div className="target-label">TARGET ASSETS ({selectedAssets.length}):</div>

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
                        [ Select Assets ] <ChevronDown size={14} />
                    </button>

                    {showAssetSelector && (
                        <div className="asset-selector-dropdown">
                            <div className="selector-header">
                                <span>Select Assets</span>
                                <X size={16} className="close-icon" onClick={() => setShowAssetSelector(false)} />
                            </div>

                            {/* Add Asset Input */}
                            <div className="add-asset-input-row" style={{ padding: '8px 12px', borderBottom: '1px solid var(--bg-tertiary)', display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Add Ticker (e.g. SOL)"
                                    className="simple-input"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            const val = e.target.value.trim().toUpperCase();
                                            if (val && !selectedAssets.includes(val)) {
                                                setSelectedAssets([...selectedAssets, val]);
                                                e.target.value = '';
                                            }
                                        }
                                    }}
                                    style={{
                                        flex: 1,
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid var(--bg-tertiary)',
                                        color: 'white',
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        fontSize: '0.8rem'
                                    }}
                                />
                            </div>

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
                    const oppCount = assetFeed.filter(i => i.sentiment === 'bullish' || i.type === 'opportunity').length;
                    const riskCount = assetFeed.filter(i => i.sentiment === 'bearish' || i.type === 'risk').length;

                    // Construct CoinGecko Image URL (Using simple assumption for now, can be improved with metadata map)
                    // Common pattern: https://assets.coingecko.com/coins/images/<ID>/small/<NAME>.png
                    // We will reliance on a generic placeholder with text if image fails to load, but here we just try to be more dynamic if possible
                    // Ideally we should use coin_id from a mapping. For now, use a robust fallback UI.

                    return (
                    const isExpanded = expandedEventId === asset;

                    return (
                        <div key={asset} className={`asset-intel-card ${isExpanded ? 'active' : ''}`} onClick={() => toggleEventExpansion(asset)}>
                            <div className="asset-col">
                                <div className="coin-icon-large">
                                    {/* Use a clear visual if no image */}
                                    <div className="coin-icon-img flex items-center justify-center bg-slate-800 text-slate-200 font-bold rounded-full border border-slate-700">
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
                                    <span className="highlight-white">{oppCount} opportunities</span> • <span className="highlight-white">{riskCount} risks</span>
                                </span>
                                <span className="intel-subtext">AI market intelligence for {asset}</span>
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
                                                OPPORTUNITIES
                                            </h4>
                                            <div className="intel-items-list">
                                                {assetFeed.filter(i => i.sentiment === 'bullish' || i.type === 'opportunity').map((item, idx) => (
                                                    <div key={idx} className="intel-detail-item">
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
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Risks Section */}
                                    {riskCount > 0 && (
                                        <div className="intel-section-block">
                                            <h4 className="intel-section-title text-rose-400">
                                                <div className="w-2 h-2 rounded-full bg-rose-500 mr-2"></div>
                                                RISKS
                                            </h4>
                                            <div className="intel-items-list">
                                                {assetFeed.filter(i => i.sentiment === 'bearish' || i.type === 'risk').map((item, idx) => (
                                                    <div key={idx} className="intel-detail-item">
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
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="intel-card-footer">
                                        <button
                                            className="go-to-asset-btn"
                                            onClick={() => handleWidgetClick(`/asset/${asset}`)}
                                        >
                                            Go to Asset Page <ArrowRight size={14} className="ml-1" />
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
