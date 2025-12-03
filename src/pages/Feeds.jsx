import React, { useState, useEffect } from 'react';
import { useTransactions } from '../context/TransactionContext';
import { useBuyThesis } from '../context/BuyThesisContext';
import { getMajorCryptoFeeds, getMockTweets, getPortfolioFeeds } from '../services/twitterService';
import { getNewsForAsset } from '../services/newsService';
import { summarizeTweet } from '../services/geminiService';
import './Feeds.css';

const Feeds = () => {
    const { transactions, updateTransaction } = useTransactions();
    const { addThesis, isThesisSaved } = useBuyThesis();
    const [trends, setTrends] = useState([]);
    const [news, setNews] = useState([]);
    const [loading, setLoading] = useState(true);
    const [trackingStatus, setTrackingStatus] = useState('');
    const [toastMsg, setToastMsg] = useState(null);
    const [processingThesis, setProcessingThesis] = useState(null);

    const showToast = (msg) => {
        setToastMsg(msg);
        setTimeout(() => setToastMsg(null), 3000);
    };

    const handleAddThesis = async (e, tweet, ticker) => {
        e.preventDefault(); // Prevent link navigation
        e.stopPropagation();

        setProcessingThesis(tweet.id);
        showToast(`Analyzing tweet for $${ticker}...`);

        try {
            // Generate a short thesis tag using Gemini
            const thesisTag = await summarizeTweet(tweet.text);

            // 1. Save to Global Buy Thesis Context (for future use)
            addThesis({
                id: tweet.id,
                asset: ticker,
                source: 'twitter',
                content: tweet.text,
                summaryTag: thesisTag, // Save the generated tag
                url: tweet.url,
                author: tweet.name,
                timestamp: tweet.timestamp,
                createdAt: new Date().toISOString()
            });

            // 2. Automatically add to the LATEST transaction for this asset
            // const { updateTransaction } = useTransactions(); // Removed invalid hook call
            // Note: We need to ensure updateTransaction is available. 
            // Since we can't destructure it inside the function if it wasn't destructured at the top,
            // we need to update the component destructuring first.
            // Let's assume we will update the top-level destructuring in a separate edit or rely on the user to do it?
            // No, I must do it correctly. I will update the top level destructuring in this same file.

            // Wait, I can't change the top level destructuring in this specific block replace.
            // I will assume I will update line 10 as well.

            // Find latest transaction for this asset
            const assetTxs = transactions
                .filter(t => t.asset === ticker)
                .sort((a, b) => new Date(b.date) - new Date(a.date));

            if (assetTxs.length > 0) {
                const latestTx = assetTxs[0];

                // Prepare updates
                const currentTags = latestTx.tags || [];
                const currentLinks = latestTx.tagLinks || {};

                // Avoid duplicates
                if (!currentTags.includes(thesisTag)) {
                    const updatedTx = {
                        ...latestTx,
                        tags: [...currentTags, thesisTag],
                        tagLinks: {
                            ...currentLinks,
                            [thesisTag]: tweet.url || `https://x.com/${tweet.name}/status/${tweet.id}`
                        }
                    };

                    await updateTransaction(updatedTx);
                    showToast(`Added "${thesisTag}" to latest $${ticker} transaction!`);
                } else {
                    showToast(`Tag "${thesisTag}" already exists on latest transaction.`);
                }
            } else {
                showToast(`Saved thesis: $${ticker} (${thesisTag}). No transaction found to update.`);
            }

        } catch (error) {
            console.error('Error adding thesis:', error);
            showToast('Failed to analyze tweet');
        } finally {
            setProcessingThesis(null);
        }
    };

    const extractTickers = (text, primaryAsset) => {
        const regex = /\$([A-Za-z]+)/g;
        const matches = [...text.matchAll(regex)].map(m => m[1].toUpperCase());
        let unique = [...new Set(matches)];

        // Ensure primary asset is included if valid
        if (primaryAsset && !unique.includes(primaryAsset)) {
            unique.unshift(primaryAsset);
        }

        // Filter: Only show tags for assets currently in holdings
        // We can get holdings from the transactions context
        const holdings = transactions.reduce((acc, tx) => {
            const symbol = tx.asset.toUpperCase();
            if (!acc[symbol]) acc[symbol] = 0;
            if (tx.type === 'buy') acc[symbol] += parseFloat(tx.amount || 0);
            else if (tx.type === 'sell') acc[symbol] -= parseFloat(tx.amount || 0);
            return acc;
        }, {});

        unique = unique.filter(ticker => holdings[ticker] > 0);

        return unique.slice(0, 3);
    };

    const refreshFeeds = () => {
        localStorage.removeItem('feedsCache_v3');
        localStorage.removeItem('feedsCacheTimestamp_v3');
        setLoading(true);
        fetchData();
    };

    const fetchData = async () => {
        // Check cache first
        try {
            const cachedData = localStorage.getItem('feedsCache_v3');
            const cacheTimestamp = localStorage.getItem('feedsCacheTimestamp_v3');
            const ONE_HOUR = 60 * 60 * 1000; // 1 hour in milliseconds

            if (cachedData && cacheTimestamp) {
                const age = Date.now() - parseInt(cacheTimestamp);
                if (age < ONE_HOUR) {
                    // Use cached data
                    const parsed = JSON.parse(cachedData);
                    if (parsed && parsed.trends && parsed.news) {
                        setTrends(parsed.trends);
                        setNews(parsed.news);
                        setLoading(false);
                        console.log('[Feeds] Using cached data');
                        return;
                    }
                }
            }
        } catch (e) {
            console.warn('[Feeds] Cache corrupted, fetching fresh data', e);
            localStorage.removeItem('feedsCache_v3');
        }

        // Fetch fresh data
        setLoading(true);
        try {
            // 1. Get user's portfolio holdings
            const holdings = transactions.reduce((acc, tx) => {
                const symbol = tx.asset.toUpperCase();
                if (!acc[symbol]) acc[symbol] = 0;
                if (tx.type === 'buy') acc[symbol] += parseFloat(tx.amount || 0);
                else if (tx.type === 'sell') acc[symbol] -= parseFloat(tx.amount || 0);
                return acc;
            }, {});

            const myAssets = Object.keys(holdings).filter(symbol => {
                // Filter out zero balance AND major coins (too much noise)
                return holdings[symbol] > 0 && !['BTC', 'ETH', 'SOL'].includes(symbol);
            });
            console.log('[Feeds] Fetching for assets (excluding majors):', myAssets);

            // 2. Fetch feeds for portfolio assets
            // If myAssets is empty (only holds BTC/ETH/SOL), we might show nothing or a message
            const feedsData = await getPortfolioFeeds(myAssets);
            setTrends(feedsData || []);

            // Fetch news for major assets
            const btcNews = await getNewsForAsset('BTC', 3);
            const ethNews = await getNewsForAsset('ETH', 3);
            const solNews = await getNewsForAsset('SOL', 3);

            // Combine and shuffle news slightly to mix sources
            const combinedNews = [...(btcNews || []), ...(ethNews || []), ...(solNews || [])]
                .sort(() => Math.random() - 0.5)
                .slice(0, 10);

            setNews(combinedNews);

            // Cache the data
            localStorage.setItem('feedsCache_v3', JSON.stringify({
                trends: feedsData || [],
                news: combinedNews
            }));
            localStorage.setItem('feedsCacheTimestamp_v3', Date.now().toString());
            console.log('[Feeds] Cached fresh data');
        } catch (error) {
            console.error('Error fetching feeds:', error);
            // If error, try to load whatever is in cache even if expired
            const cachedData = localStorage.getItem('feedsCache_v3');
            if (cachedData) {
                try {
                    const parsed = JSON.parse(cachedData);
                    setTrends(parsed.trends || []);
                    setNews(parsed.news || []);
                } catch (e) { }
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [transactions]); // Re-fetch when transactions change

    const handleTrackToken = () => {
        setTrackingStatus('(In Progress)');
        setTimeout(() => setTrackingStatus('Tracking Active'), 2000);
    };

    return (
        <div className="feeds-container">
            {toastMsg && (
                <div className="toast-notification" style={{
                    position: 'fixed',
                    bottom: '20px',
                    right: '20px',
                    backgroundColor: 'var(--accent-primary)',
                    color: 'white',
                    padding: '12px 24px',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    zIndex: 1000,
                    animation: 'slideIn 0.3s ease-out'
                }}>
                    {toastMsg}
                </div>
            )}
            <header className="feeds-header">
                <div className="header-content">
                    <h1>Market Feeds</h1>
                    <button onClick={refreshFeeds} className="refresh-feeds-btn" title="Refresh Feeds">
                        ↻
                    </button>
                </div>
                <p>Real-time social trends and crypto news aggregation</p>
            </header>

            <div className="feeds-content">
                {/* Left Segment: Trending on X */}
                <section className="feed-segment twitter-trends">
                    <div className="segment-header flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                            🔥 Trending on X
                        </h2>
                        <span className="source-badge text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20 whitespace-nowrap">
                            Top Portfolio Tweets
                        </span>
                    </div>

                    <div className="feed-list-container">
                        {loading ? (
                            <div className="loading-spinner">Loading feeds...</div>
                        ) : trends.length > 0 ? (
                            <div className="feed-list">
                                {trends.map((item, index) => {
                                    const tickers = extractTickers(item.text, item.asset);
                                    return (
                                        <a key={index} href={item.url || '#'} target="_blank" rel="noopener noreferrer" className="feed-item">
                                            <div className="feed-item-header">
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span className="feed-source">{item.name}</span>
                                                    <span className="feed-date">{item.volume}</span>
                                                </div>

                                                {/* Buy Thesis Tags */}
                                                <div className="feed-tags" style={{ display: 'flex', gap: '6px' }}>
                                                    {tickers.map(ticker => (
                                                        <span
                                                            key={ticker}
                                                            className="thesis-tag"
                                                            onClick={(e) => handleAddThesis(e, item, ticker)}
                                                            title="Add to Buy Thesis"
                                                            style={{
                                                                fontSize: '0.75rem',
                                                                backgroundColor: 'rgba(99, 102, 241, 0.15)',
                                                                color: 'var(--accent-primary)',
                                                                padding: '2px 8px',
                                                                borderRadius: '12px',
                                                                cursor: 'pointer',
                                                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                                                transition: 'all 0.2s'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.target.style.backgroundColor = 'var(--accent-primary)';
                                                                e.target.style.color = 'white';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.target.style.backgroundColor = 'rgba(99, 102, 241, 0.15)';
                                                                e.target.style.color = 'var(--accent-primary)';
                                                            }}
                                                        >
                                                            + ${ticker}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="feed-main">
                                                <p className="feed-overview">{item.text}</p>
                                            </div>
                                        </a>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="empty-state">No trending feeds available.</div>
                        )}
                        <div className="show-more-bar">
                            <span>Show More</span>
                        </div>
                    </div>
                </section>

                {/* Right Segment: Crypto News */}
                <section className="feed-segment crypto-news">
                    <div className="segment-header flex items-center justify-between mb-4">
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                            📰 Crypto News
                        </h2>
                        <span className="source-badge text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 whitespace-nowrap">
                            Aggregated
                        </span>
                    </div>

                    <div className="feed-list-container">
                        {loading ? (
                            <div className="loading-spinner">Loading news...</div>
                        ) : news.length > 0 ? (
                            <div className="feed-list">
                                {news.map((item, index) => (
                                    <a key={index} href={item.link || '#'} target="_blank" rel="noopener noreferrer" className="feed-item news-link">
                                        <div className="feed-item-header">
                                            <span className="feed-source">{item.source}</span>
                                            <span className="feed-date">{new Date(item.publishedAt * 1000).toLocaleDateString()}</span>
                                        </div>
                                        <div className="feed-main">
                                            <h3 className="feed-title">{item.headline}</h3>
                                            <p className="feed-overview">{item.description}</p>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">No news available.</div>
                        )}
                        <div className="show-more-bar">
                            <span>Show More</span>
                        </div>
                    </div>
                </section>
            </div>

            {/* Track Token Section with Blurred List Background */}
            <div className="track-token-section">
                <div className="blurred-list-background">
                    {/* Mock items for the blur effect */}
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="feed-item mock-item">
                            <div className="feed-item-header">
                                <span className="feed-source">@CryptoWhale</span>
                                <span className="feed-date">Just now</span>
                            </div>
                            <div className="feed-main">
                                <span className="feed-title">$TOKEN breaking out!</span>
                                <p className="feed-overview">Huge volume coming in, this is the start of something big...</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="track-overlay">
                    <div className="track-content">
                        <h3>Track Your Token</h3>
                        <p>Get personalized feeds and sentiment analysis</p>
                        <button className="track-token-btn" onClick={handleTrackToken}>
                            {trackingStatus || 'Track Token'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Feeds;
