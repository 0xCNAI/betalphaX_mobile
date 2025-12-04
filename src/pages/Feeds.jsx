import React, { useState, useEffect, useMemo } from 'react';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { getPortfolioFeeds } from '../services/twitterService';
import { detectAssetEvents, generateWidgetData } from '../services/analysisService';
import { RefreshCw, AlertTriangle, Activity, Zap, Check, X, ChevronDown, TrendingUp, Award, ExternalLink } from 'lucide-react';
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
        <div className="feeds-container">
            {/* 1. Header Section */}
            <div className="feeds-header">
                <h1>Portfolio Signals</h1>
                <p className="feeds-subtitle">Daily AI insights generated from your current holdings.</p>
            </div>

            {/* 2. Primary CTA Section */}
            <div className="signal-cta-container">
                <button
                    className={`signal-cta-btn ${loading ? 'loading' : ''} ${signalsReady ? 'ready' : ''}`}
                    onClick={generateSignals}
                    disabled={loading}
                >
                    {loading ? <RefreshCw className="spin-icon" /> : <Zap />}
                    {loading ? 'Analyzing...' : (signalsReady ? 'Refresh Signals' : 'Generate Signals')}
                </button>
                {generationStatus && (
                    <div className="generation-status-text" style={{ marginTop: '8px', fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                        {generationStatus}
                    </div>
                )}
                {lastGenerated && !loading && (
                    <span className="last-updated-text">
                        Last updated: {formatDistanceToNow(lastGenerated)} ago
                    </span>
                )}
            </div>

            {/* 3. Holdings Selector */}
            <div className="holdings-selector">
                <span className="holdings-label">Holdings Analyzed Today ({analyzedAssets.length}):</span>
                <div className="holdings-list">
                    {selectedAssets.length > 0 ? (
                        selectedAssets.map((asset, index) => (
                            <span key={asset} className="holding-item">
                                {asset} {index < selectedAssets.length - 1 && '•'}
                            </span>
                        ))
                    ) : (
                        <span className="holding-item placeholder">Select assets to analyze...</span>
                    )}
                </div>

                <div className="asset-selector-wrapper">
                    <button
                        className="edit-holdings-btn"
                        onClick={() => setShowAssetSelector(!showAssetSelector)}
                    >
                        [ Select Asset ] <ChevronDown size={14} />
                    </button>

                    {showAssetSelector && (
                        <div className="asset-selector-dropdown">
                            <div className="selector-header">
                                <span>Select Assets</span>
                                <X size={16} className="close-icon" onClick={() => setShowAssetSelector(false)} />
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
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* 4. Visual Widgets Grid - NEW LAYOUT */}
            <div className="visual-widget-grid">

                {/* RISK WIDGET */}
                <div className="visual-widget risk" onClick={() => handleWidgetClick('/risk')}>
                    <div className="widget-header">
                        <div className="widget-icon-wrapper risk">
                            <AlertTriangle size={20} />
                        </div>
                        <span className="widget-title">Risk Alerts</span>
                    </div>

                    {metrics.widgets && metrics.widgets.risk ? (
                        <div className="widget-content">
                            <div className="widget-headline">{metrics.widgets.risk.headline}</div>
                            <div className="widget-subline">{metrics.widgets.risk.subline}</div>

                            <div className="widget-metrics-row">
                                <div className="metric-item">
                                    <span className="metric-val">{metrics.widgets.risk.metrics.activeFlags}</span>
                                    <span className="metric-lbl">Flags</span>
                                </div>
                                <div className="metric-item">
                                    <span className="metric-val">{metrics.widgets.risk.metrics.highestVol}</span>
                                    <span className="metric-lbl">High Vol</span>
                                </div>
                                <div className="metric-item">
                                    <span className="metric-val">{metrics.widgets.risk.metrics.negativeEvents}</span>
                                    <span className="metric-lbl">Events</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="widget-loading">Loading...</div>
                    )}
                </div>

                {/* OPPORTUNITY WIDGET */}
                <div className="visual-widget opp" onClick={() => handleWidgetClick('/opportunities')}>
                    <div className="widget-header">
                        <div className="widget-icon-wrapper opp">
                            <TrendingUp size={20} />
                        </div>
                        <span className="widget-title">Opportunities</span>
                    </div>

                    {metrics.widgets && metrics.widgets.opp ? (
                        <div className="widget-content">
                            <div className="widget-headline">{metrics.widgets.opp.headline}</div>
                            <div className="widget-subline">{metrics.widgets.opp.subline}</div>

                            <div className="widget-metrics-row">
                                <div className="metric-item">
                                    <span className="metric-val">{metrics.widgets.opp.metrics.momentumCount}</span>
                                    <span className="metric-lbl">Momentum</span>
                                </div>
                                <div className="metric-item">
                                    <span className="metric-val">{metrics.widgets.opp.metrics.socialBuzzCount}</span>
                                    <span className="metric-lbl">Buzz</span>
                                </div>
                                {metrics.widgets.opp.metrics.newOpp && (
                                    <div className="metric-item highlight">
                                        <span className="metric-val"><Zap size={12} fill="currentColor" /></span>
                                        <span className="metric-lbl">New</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="widget-loading">Loading...</div>
                    )}
                </div>

                {/* SENTIMENT WIDGET */}
                <div className="visual-widget sentiment" onClick={() => handleWidgetClick('/sentiment')}>
                    <div className="widget-header">
                        <div className="widget-icon-wrapper sentiment">
                            <Activity size={20} />
                        </div>
                        <span className="widget-title">Net Sentiment</span>
                    </div>

                    {metrics.widgets && metrics.widgets.sentiment ? (
                        <div className="widget-content">
                            <div className="widget-headline">{metrics.widgets.sentiment.headline}</div>
                            <div className="widget-subline">{metrics.widgets.sentiment.subline}</div>

                            <div className="widget-metrics-row">
                                <div className="metric-item bullish">
                                    <span className="metric-val">{metrics.widgets.sentiment.metrics.bullishCount}</span>
                                    <span className="metric-lbl">Bullish</span>
                                </div>
                                <div className="metric-item bearish">
                                    <span className="metric-val">{metrics.widgets.sentiment.metrics.bearishCount}</span>
                                    <span className="metric-lbl">Bearish</span>
                                </div>
                                <div className="metric-item">
                                    <span className="metric-val">{metrics.widgets.sentiment.metrics.highEngagementCount}</span>
                                    <span className="metric-lbl">Viral</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="widget-loading">Loading...</div>
                    )}
                </div>

                {/* TOP ASSET WIDGET */}
                <div className="visual-widget top-asset" onClick={() => handleWidgetClick('/asset-details')}>
                    <div className="widget-header">
                        <div className="widget-icon-wrapper top-asset">
                            <Award size={20} />
                        </div>
                        <span className="widget-title">Top Asset</span>
                    </div>

                    {metrics.widgets && metrics.widgets.topAsset ? (
                        <div className="widget-content">
                            <div className="widget-headline">{metrics.widgets.topAsset.headline}</div>
                            <ul className="widget-bullet-list">
                                {metrics.widgets.topAsset.subline.map((line, i) => (
                                    <li key={i}>{line}</li>
                                ))}
                            </ul>

                            <div className="widget-breakdown">
                                <div className="breakdown-item">
                                    <span>Perf</span>
                                    <div className="progress-bar"><div className="fill" style={{ width: `${metrics.widgets.topAsset.metrics.performance}%`, background: '#10b981' }}></div></div>
                                </div>
                                <div className="breakdown-item">
                                    <span>Liq</span>
                                    <div className="progress-bar"><div className="fill" style={{ width: `${metrics.widgets.topAsset.metrics.liquidity}%`, background: '#3b82f6' }}></div></div>
                                </div>
                                <div className="breakdown-item">
                                    <span>Sent</span>
                                    <div className="progress-bar"><div className="fill" style={{ width: `${metrics.widgets.topAsset.metrics.sentiment}%`, background: '#8b5cf6' }}></div></div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="widget-loading">Loading...</div>
                    )}
                </div>

            </div>

            {/* 5. Narrative & Social Intelligence Board */}
            {metrics.boardEvents && metrics.boardEvents.length > 0 ? (
                <div className="event-board">
                    <div className="event-board-header">
                        <h3>Narrative & Social Intelligence</h3>
                        <span className="event-count">
                            {metrics.boardEvents.length} Active Narratives • {metrics.totalTweetsAnalyzed} Tweets Analyzed
                        </span>
                    </div>
                    <div className="event-list">
                        {metrics.boardEvents.map((event, idx) => (
                            <div
                                key={idx}
                                className={`event-row ${expandedEventId === idx ? 'expanded' : ''}`}
                                onClick={() => toggleEventExpansion(idx)}
                            >
                                <div className="event-row-main">
                                    <div className="event-asset-col">
                                        <span className="event-asset-badge">{event.asset}</span>
                                    </div>
                                    <div className="event-desc-col">
                                        <span className="event-desc">{event.headline}</span>
                                        <div className="event-meta">
                                            <span className={`stance-tag ${event.stance?.toLowerCase() || 'neutral'}`}>
                                                {event.stance || 'NEUTRAL'}
                                            </span>
                                            <span className="event-source">
                                                • {event.sources?.tweets || 0} tweets
                                                {event.sources?.news > 0 && `, ${event.sources.news} news`}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded Tweet Details */}
                                {expandedEventId === idx && event.tweets && event.tweets.length > 0 && (
                                    <div className="event-details" onClick={(e) => e.stopPropagation()}>
                                        <div className="details-header">Top Contributing Tweets</div>
                                        <div className="tweet-list">
                                            {event.tweets.map((tweet, tIdx) => (
                                                <TweetItem key={tIdx} tweet={tweet} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="event-board empty">
                    <div className="event-board-header">
                        <h3>Narrative & Social Intelligence</h3>
                    </div>
                    <div className="event-empty-state">
                        No significant social or news events detected today.
                    </div>
                </div>
            )}
        </div>
    );
};

export default Feeds;
