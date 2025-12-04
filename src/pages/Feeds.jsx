import React, { useState, useEffect, useMemo } from 'react';
import { useTransactions } from '../context/TransactionContext';
import { useBuyThesis } from '../context/BuyThesisContext';
import { getPortfolioFeeds, getTweetsFromUser } from '../services/twitterService';
import { summarizeTweet } from '../services/geminiService';
import { generatePortfolioOverview } from '../services/analysisService';
import { Search, Plus, X, RefreshCw, Filter, UserPlus, Trash2, ChevronDown, ChevronUp, AlertTriangle, TrendingUp, Activity, HelpCircle } from 'lucide-react';
import './Feeds.css';

const Feeds = () => {
    const { transactions } = useTransactions();
    const { addThesis } = useBuyThesis();

    // Tabs: 'holdings' | 'kol'
    const [activeTab, setActiveTab] = useState('holdings');

    // Holdings Feed State
    const [holdingsFeed, setHoldingsFeed] = useState([]);
    const [availableAssets, setAvailableAssets] = useState([]);
    const [selectedAssets, setSelectedAssets] = useState(['BTC', 'ETH']); // Default
    const [isSelectingAssets, setIsSelectingAssets] = useState(false);

    // KOL Feed State
    const [kolFeed, setKolFeed] = useState([]);
    const [trackedKOLs, setTrackedKOLs] = useState([]);
    const [newKOL, setNewKOL] = useState('');

    // Analysis State
    const [portfolioOverview, setPortfolioOverview] = useState(null);

    // Shared State
    const [loading, setLoading] = useState(false);
    const [toastMsg, setToastMsg] = useState(null);

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    // --- Initialization ---
    useEffect(() => {
        // 1. Calculate available assets from holdings
        const holdingsMap = transactions.reduce((acc, tx) => {
            const symbol = tx.asset.toUpperCase();
            if (!acc[symbol]) acc[symbol] = { symbol, amount: 0, value: 0 };

            const amount = parseFloat(tx.amount || 0);
            const price = parseFloat(tx.price || 0); // Assuming price is stored in tx

            if (tx.type === 'buy') {
                acc[symbol].amount += amount;
                acc[symbol].value += amount * price;
            } else if (tx.type === 'sell') {
                acc[symbol].amount -= amount;
                acc[symbol].value -= amount * price;
            }
            return acc;
        }, {});

        const assets = Object.keys(holdingsMap).filter(s => holdingsMap[s].amount > 0);
        setAvailableAssets(assets);

        // 2. Initial Fetch for Holdings (Default BTC/ETH)
        fetchHoldingsFeed(['BTC', 'ETH']);

        // 3. Load saved KOLs from local storage
        const savedKOLs = localStorage.getItem('tracked_kols');
        if (savedKOLs) {
            setTrackedKOLs(JSON.parse(savedKOLs));
        }

        // 4. Generate Portfolio Overview
        const assetObjects = Object.values(holdingsMap).filter(a => a.amount > 0);
        if (assetObjects.length > 0) {
            generatePortfolioOverview(assetObjects).then(overview => {
                setPortfolioOverview(overview);
            });
        }

    }, [transactions]);

    // --- Signal Prioritization Logic ---
    const processFeeds = (feeds) => {
        // Sort Priority: Risk Alert > Opportunity > Sentiment Shift
        // Secondary Sort: Engagement Score
        // Tertiary Sort: Timestamp

        const categoryWeight = {
            'Risk Alert': 3,
            'Opportunity': 2,
            'Sentiment Shift': 1
        };

        return [...feeds].sort((a, b) => {
            const catA = categoryWeight[a.category] || 0;
            const catB = categoryWeight[b.category] || 0;

            if (catA !== catB) return catB - catA; // Higher category first

            // If same category, sort by engagement score (if available) or raw likes
            const scoreA = a.engagementScore || (a.likes / 1000) || 0;
            const scoreB = b.engagementScore || (b.likes / 1000) || 0;

            if (scoreA !== scoreB) return scoreB - scoreA;

            return new Date(b.timestamp) - new Date(a.timestamp);
        });
    };

    // --- Holdings Feed Logic ---
    const fetchHoldingsFeed = async (assetsToFetch) => {
        setLoading(true);
        try {
            const feeds = await getPortfolioFeeds(assetsToFetch);
            const processed = processFeeds(feeds);
            setHoldingsFeed(processed);
        } catch (error) {
            console.error("Error fetching holdings feed:", error);
            showToast("Failed to fetch signals");
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateSignals = () => {
        fetchHoldingsFeed(selectedAssets);
        setIsSelectingAssets(false);

        // Also refresh overview
        const holdingsMap = transactions.reduce((acc, tx) => {
            const symbol = tx.asset.toUpperCase();
            if (!acc[symbol]) acc[symbol] = { symbol, amount: 0, value: 0 };
            if (tx.type === 'buy') acc[symbol].amount += parseFloat(tx.amount || 0);
            else if (tx.type === 'sell') acc[symbol].amount -= parseFloat(tx.amount || 0);
            return acc;
        }, {});
        const assetObjects = Object.values(holdingsMap).filter(a => a.amount > 0);
        if (assetObjects.length > 0) {
            generatePortfolioOverview(assetObjects).then(overview => {
                setPortfolioOverview(overview);
            });
        }
    };

    const toggleAssetSelection = (asset) => {
        setSelectedAssets(prev => {
            if (prev.includes(asset)) return prev.filter(a => a !== asset);
            return [...prev, asset];
        });
    };

    const selectAllAssets = () => {
        setSelectedAssets(availableAssets);
    };

    const selectTop5Assets = () => {
        setSelectedAssets(availableAssets.slice(0, 5));
    };

    // --- KOL Feed Logic ---
    const fetchKOLFeed = async (force = false) => {
        if (trackedKOLs.length === 0) {
            setKolFeed([]);
            return;
        }

        setLoading(true);
        try {
            const promises = trackedKOLs.map(kol => getTweetsFromUser(kol, 5));
            const results = await Promise.all(promises);

            const allTweets = results.flat();
            const processed = processFeeds(allTweets);
            setKolFeed(processed);
        } catch (error) {
            console.error("Error fetching KOL feed:", error);
            showToast("Failed to fetch KOL insights");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 'kol') {
            fetchKOLFeed();
        }
    }, [activeTab, trackedKOLs]);

    const addKOL = () => {
        if (!newKOL) return;
        if (trackedKOLs.length >= 5) {
            showToast("Max 5 KOLs allowed");
            return;
        }

        const handle = newKOL.trim().replace('@', '');
        if (trackedKOLs.includes(handle)) {
            showToast("KOL already tracked");
            return;
        }

        const updated = [...trackedKOLs, handle];
        setTrackedKOLs(updated);
        localStorage.setItem('tracked_kols', JSON.stringify(updated));
        setNewKOL('');
        showToast(`Added @${handle}`);
    };

    const removeKOL = (handle) => {
        const updated = trackedKOLs.filter(k => k !== handle);
        setTrackedKOLs(updated);
        localStorage.setItem('tracked_kols', JSON.stringify(updated));
    };

    // --- Shared: Add Thesis Logic ---
    const handleAddThesis = async (e, item) => {
        e.preventDefault();
        e.stopPropagation();
        showToast(`Adding signal to thesis...`);

        try {
            // Use the AI explanation if available, otherwise summarize
            const thesisTag = item.category || await summarizeTweet(item.text);

            addThesis({
                id: item.id,
                asset: item.asset || 'GENERAL',
                source: 'twitter',
                content: item.text,
                summaryTag: thesisTag,
                explanation: item.explanation || "Added from Portfolio Signals",
                url: item.link,
                author: item.authorName,
                timestamp: item.timestamp,
                createdAt: new Date().toISOString(),
                sentiment: item.sentiment
            });
            showToast(`Signal added to Buy Thesis!`);
        } catch (error) {
            console.error('Error adding thesis:', error);
            showToast('Failed to add signal');
        }
    };

    // --- Summary Metrics ---
    const summaryMetrics = useMemo(() => {
        // Use portfolioOverview if available, otherwise fallback to feed analysis
        if (portfolioOverview) {
            return {
                riskCount: portfolioOverview.riskAssets.length,
                oppCount: portfolioOverview.opportunities.length,
                sentimentLabel: portfolioOverview.sentiment.label || 'Neutral',
                topAsset: '-' // We can calculate this or add it to overview
            };
        }

        const currentFeed = activeTab === 'holdings' ? holdingsFeed : kolFeed;

        const riskCount = currentFeed.filter(i => i.category === 'Risk Alert').length;
        const oppCount = currentFeed.filter(i => i.category === 'Opportunity').length;

        // Calculate Net Sentiment
        let sentimentScore = 0;
        currentFeed.forEach(i => {
            if (i.sentiment === 'Positive') sentimentScore++;
            if (i.sentiment === 'Negative') sentimentScore--;
        });

        let sentimentLabel = 'Neutral';
        if (sentimentScore > 2) sentimentLabel = 'Bullish';
        if (sentimentScore < -2) sentimentLabel = 'Bearish';

        // Most mentioned asset
        const assetCounts = {};
        currentFeed.forEach(i => {
            if (i.asset) {
                assetCounts[i.asset] = (assetCounts[i.asset] || 0) + 1;
            }
        });
        const topAsset = Object.keys(assetCounts).reduce((a, b) => assetCounts[a] > assetCounts[b] ? a : b, '-');

        return { riskCount, oppCount, sentimentLabel, topAsset };
    }, [holdingsFeed, kolFeed, activeTab, portfolioOverview]);

    // --- Daily Summary Generation (Expandable Panels) ---
    const summaryPanels = useMemo(() => {
        const currentFeed = activeTab === 'holdings' ? holdingsFeed : kolFeed;
        if (currentFeed.length === 0) return [];

        const panels = [];

        // 1. Market Overview Panel
        const { riskCount, oppCount, sentimentLabel, topAsset } = summaryMetrics;
        let overviewText = `Sentiment is ${sentimentLabel}. `;
        if (riskCount > 0) overviewText += `${riskCount} risk alerts detected. `;
        if (oppCount > 0) overviewText += `${oppCount} opportunities identified. `;
        if (topAsset && topAsset !== '-') overviewText += `${topAsset} is the top trending asset.`;

        panels.push({
            id: 'market-overview',
            asset: 'Market Overview',
            sentiment: sentimentLabel,
            action: riskCount > 0 ? '⚠️ Caution' : 'Stable',
            signals: [{ text: overviewText, category: 'General' }], // Dummy signal for overview
            isOverview: true
        });

        // 2. Group by Asset
        const assetGroups = {};
        currentFeed.forEach(item => {
            const asset = item.asset || 'General';
            if (!assetGroups[asset]) {
                assetGroups[asset] = {
                    asset,
                    signals: [],
                    riskCount: 0,
                    oppCount: 0,
                    sentimentScore: 0,
                    totalEngagement: 0
                };
            }
            assetGroups[asset].signals.push(item);
            if (item.category === 'Risk Alert') assetGroups[asset].riskCount++;
            if (item.category === 'Opportunity') assetGroups[asset].oppCount++;

            if (item.sentiment === 'Positive') assetGroups[asset].sentimentScore++;
            if (item.sentiment === 'Negative') assetGroups[asset].sentimentScore--;

            assetGroups[asset].totalEngagement += (item.likes || 0) + (item.engagementScore || 0);
        });

        // 3. Sort by Activity
        const sortedAssets = Object.values(assetGroups).sort((a, b) => {
            const countA = a.signals.length;
            const countB = b.signals.length;
            if (countA !== countB) return countB - countA;
            return b.totalEngagement - a.totalEngagement;
        });

        // 4. Generate Panels for Top 5
        sortedAssets.slice(0, 5).forEach(group => {
            let sentimentLabel = 'Neutral';
            if (group.sentimentScore > 0) sentimentLabel = 'Bullish';
            if (group.sentimentScore < 0) sentimentLabel = 'Bearish';

            let action = "Monitor";
            if (group.riskCount > 0) action = "⚠️ Monitor Risks";
            else if (group.oppCount > 0) action = "🚀 Watch Breakout";
            else if (sentimentLabel === 'Bullish') action = "Accumulate";

            // Get Top 3 Signals
            const topSignals = group.signals.sort((a, b) => {
                const catWeight = { 'Risk Alert': 3, 'Opportunity': 2, 'Sentiment Shift': 1 };
                const wA = catWeight[a.category] || 0;
                const wB = catWeight[b.category] || 0;
                if (wA !== wB) return wB - wA;
                return (b.engagementScore || 0) - (a.engagementScore || 0);
            }).slice(0, 3);

            panels.push({
                id: group.asset,
                asset: group.asset,
                sentiment: sentimentLabel,
                action,
                signals: topSignals,
                isOverview: false
            });
        });

        return panels;
    }, [summaryMetrics, holdingsFeed, kolFeed, activeTab]);

    return (
        <div className="feeds-container">
            {toastMsg && <div className="toast-notification">{toastMsg}</div>}

            <header className="feeds-header">
                <div className="header-content">
                    <h1>Portfolio Signals</h1>
                    <div className="tabs">
                        <button
                            className={`tab-btn ${activeTab === 'holdings' ? 'active' : ''}`}
                            onClick={() => setActiveTab('holdings')}
                        >
                            Holdings Signals
                        </button>
                        <button
                            className={`tab-btn ${activeTab === 'kol' ? 'active' : ''}`}
                            onClick={() => setActiveTab('kol')}
                        >
                            KOL Insights
                        </button>
                    </div>
                </div>
            </header>

            {/* --- Today's Highlights Summary --- */}
            <div className="summary-block">
                <div className="summary-card risk">
                    <div className="card-header-row">
                        <div className="icon"><AlertTriangle size={20} /></div>
                        <Tooltip text="Number of holdings with high-risk events detected today, such as delistings, protocol issues, negative governance updates, or sudden negative sentiment spikes." />
                    </div>
                    <div className="data">
                        <span className="value">{summaryMetrics.riskCount}</span>
                        <span className="label">Risk Alerts</span>
                    </div>
                </div>
                <div className="summary-card opp">
                    <div className="card-header-row">
                        <div className="icon"><TrendingUp size={20} /></div>
                        <Tooltip text="Signals indicating potential upside, such as breakouts, strong risk-reward setups, smart-money inflows, or major product launches related to your holdings." />
                    </div>
                    <div className="data">
                        <span className="value">{summaryMetrics.oppCount}</span>
                        <span className="label">Opportunities</span>
                    </div>
                </div>
                <div className="summary-card sentiment">
                    <div className="card-header-row">
                        <div className="icon"><Activity size={20} /></div>
                        <Tooltip text="Overall social and news sentiment across all your holdings, aggregated from relevant mentions and classified as Positive, Neutral, or Negative." />
                    </div>
                    <div className="data">
                        <span className="value">{summaryMetrics.sentimentLabel}</span>
                        <span className="label">Net Sentiment</span>
                    </div>
                </div>
                <div className="summary-card asset">
                    <div className="card-header-row">
                        <div className="icon-placeholder"></div>
                        <Tooltip text="The asset from your portfolio that received the highest number of mentions, engagement, or attention across today’s market signals." />
                    </div>
                    <div className="data">
                        <span className="value">{summaryMetrics.topAsset}</span>
                        <span className="label">Top Asset</span>
                    </div>
                </div>
            </div>

            {/* --- Today's Summary Section (Expandable Panels) --- */}
            <div className="todays-summary">
                <h3>Today's Summary</h3>
                {summaryPanels.length > 0 ? (
                    <div className="summary-panel-list">
                        {summaryPanels.map((panel) => (
                            <SummaryPanel key={panel.id} panel={panel} />
                        ))}
                    </div>
                ) : (
                    <p className="empty-summary">No signals detected yet. Generate signals to see today's summary.</p>
                )}
            </div>

            <div className="feeds-content-wrapper">
                {/* --- Holdings Feed View --- */}
                {activeTab === 'holdings' && (
                    <div className="feed-view">
                        <div className="controls-bar">
                            <div className="asset-selector-wrapper">
                                <button
                                    className="btn-secondary"
                                    onClick={() => setIsSelectingAssets(!isSelectingAssets)}
                                >
                                    <Filter size={16} /> Filter Holdings ({selectedAssets.length})
                                </button>

                                {isSelectingAssets && (
                                    <div className="asset-dropdown">
                                        <div className="dropdown-header">
                                            <button onClick={selectAllAssets} className="text-xs text-indigo-400">Select All</button>
                                            <button onClick={selectTop5Assets} className="text-xs text-indigo-400">Top 5</button>
                                        </div>
                                        <div className="asset-list">
                                            {availableAssets.map(asset => (
                                                <label key={asset} className="asset-checkbox">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedAssets.includes(asset)}
                                                        onChange={() => toggleAssetSelection(asset)}
                                                    />
                                                    {asset}
                                                </label>
                                            ))}
                                            {availableAssets.length === 0 && <span className="text-xs text-slate-500">No assets in portfolio</span>}
                                        </div>
                                        <div className="dropdown-footer">
                                            <button className="btn-primary small w-full" onClick={handleGenerateSignals}>
                                                Generate Signals
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button className="btn-primary" onClick={handleGenerateSignals} disabled={loading}>
                                {loading ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                                Generate Signals
                            </button>
                        </div>

                        <div className="feed-list-container">
                            {loading ? (
                                <div className="loading-state">Analyzing market signals...</div>
                            ) : holdingsFeed.length > 0 ? (
                                <div className="feed-list">
                                    {holdingsFeed.map((item, index) => (
                                        <SignalCard key={item.id || index} item={item} onAddThesis={handleAddThesis} />
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-state">No signals found. Try selecting different assets.</div>
                            )}
                        </div>
                    </div>
                )}

                {/* --- KOL Feed View --- */}
                {activeTab === 'kol' && (
                    <div className="feed-view">
                        <div className="controls-bar">
                            <div className="kol-input-wrapper">
                                <input
                                    type="text"
                                    placeholder="@username"
                                    value={newKOL}
                                    onChange={(e) => setNewKOL(e.target.value)}
                                    className="form-input"
                                    onKeyDown={(e) => e.key === 'Enter' && addKOL()}
                                />
                                <button className="btn-secondary" onClick={addKOL}>
                                    <UserPlus size={16} /> Track
                                </button>
                            </div>
                            <div className="tracked-kols">
                                {trackedKOLs.map(kol => (
                                    <span key={kol} className="kol-tag">
                                        @{kol}
                                        <button onClick={() => removeKOL(kol)}><X size={12} /></button>
                                    </span>
                                ))}
                                <span className="text-xs text-slate-500 ml-2">{trackedKOLs.length}/5</span>
                            </div>
                        </div>

                        <div className="feed-list-container">
                            {loading ? (
                                <div className="loading-state">Analyzing KOL insights...</div>
                            ) : kolFeed.length > 0 ? (
                                <div className="feed-list">
                                    {kolFeed.map((item, index) => (
                                        <SignalCard key={item.id || index} item={item} onAddThesis={handleAddThesis} />
                                    ))}
                                </div>
                            ) : (
                                <div className="empty-state">
                                    {trackedKOLs.length === 0 ? "Add a KOL to start tracking." : "No insights found."}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Signal Card Component ---
const SignalCard = ({ item, onAddThesis }) => {
    const [expanded, setExpanded] = useState(false);

    // Determine Category Color
    const getCategoryStyle = (cat) => {
        switch (cat) {
            case 'Risk Alert': return 'tag-risk';
            case 'Opportunity': return 'tag-opp';
            default: return 'tag-sentiment';
        }
    };

    // Determine Sentiment Color
    const getSentimentColor = (sent) => {
        if (sent === 'Positive') return 'text-green-400';
        if (sent === 'Negative') return 'text-red-400';
        return 'text-slate-400';
    };

    return (
        <div className="signal-card">
            <div className="signal-header">
                <div className="tags-row">
                    <span className={`category-tag ${getCategoryStyle(item.category)}`}>
                        {item.category || 'Signal'}
                    </span>
                    {item.asset && <span className="asset-tag">[{item.asset}]</span>}
                </div>
                <div className="meta-info">
                    <span className="author">{item.name}</span>
                    <span className="date">{item.timestamp ? new Date(item.timestamp).toLocaleDateString() : ''}</span>
                </div>
            </div>

            <div className="signal-content" onClick={() => setExpanded(!expanded)}>
                <p className={`text-content ${expanded ? 'expanded' : ''}`}>
                    {item.text}
                </p>
                {!expanded && item.text.length > 100 && (
                    <span className="show-more">Show More</span>
                )}
            </div>

            {item.explanation && (
                <div className="ai-explanation">
                    <strong>💡 AI Insight:</strong> {item.explanation}
                </div>
            )}

            <div className="signal-footer">
                <div className="metrics">
                    <span title="Likes">❤️ {item.likes || 0}</span>
                    {item.engagementScore && (
                        <span title="Impact Score">🔥 {item.engagementScore}</span>
                    )}
                    <span className={`sentiment-indicator ${getSentimentColor(item.sentiment)}`}>
                        {item.sentiment}
                    </span>
                </div>
                <div className="actions">
                    <button
                        className="action-btn"
                        onClick={(e) => onAddThesis(e, item)}
                    >
                        + Add to Thesis
                    </button>
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="link-btn">
                        View on X
                    </a>
                </div>
            </div>
        </div>
    );
};

// --- Summary Panel Component ---
const SummaryPanel = ({ panel }) => {
    const [expanded, setExpanded] = useState(false);

    return (
        <div className={`summary-panel ${panel.isOverview ? 'overview-panel' : ''}`} onClick={() => setExpanded(!expanded)}>
            <div className="panel-header">
                <div className="panel-title-group">
                    <span className="panel-asset">{panel.asset}</span>
                    <span className={`sentiment-badge ${panel.sentiment.toLowerCase()}`}>{panel.sentiment}</span>
                </div>
                <div className="panel-actions">
                    <span className="action-badge">{panel.action}</span>
                    {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </div>
            </div>

            <div className={`panel-content ${expanded ? 'expanded' : ''}`}>
                {expanded ? (
                    <ul className="signal-bullet-list">
                        {panel.signals.map((sig, idx) => (
                            <li key={idx} className="signal-bullet">
                                {sig.category && sig.category !== 'General' && (
                                    <span className={`bullet-tag ${sig.category === 'Risk Alert' ? 'risk' : 'opp'}`}>
                                        {sig.category === 'Risk Alert' ? '⚠️' : '🚀'}
                                    </span>
                                )}
                                <span className="bullet-text">{sig.explanation || sig.text}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="panel-preview">
                        {panel.signals[0]?.explanation || panel.signals[0]?.text || "No details available."}
                    </p>
                )}
            </div>
        </div>
    );
};

// --- Tooltip Component ---
const Tooltip = ({ text }) => (
    <div className="tooltip-container">
        <HelpCircle size={14} className="tooltip-icon" />
        <div className="tooltip-content">
            {text}
        </div>
    </div>
);

export default Feeds;
