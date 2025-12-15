import React, { useState, useEffect } from 'react';
import { Bell, Settings, Plus, X, User, ExternalLink, RefreshCw, List, PlusCircle } from 'lucide-react';
import { searchCryptoTweets } from '../services/twitterService';
import { getUserTrackingList, updateUserTrackingList } from '../services/userService';
import { getCoinMetadata } from '../services/coinGeckoApi';
import { formatDistanceToNow } from 'date-fns';

const SocialNotificationWidget = ({ symbol, user, compact = false, onAddToThesis }) => {
    // const [activeTab, setActiveTab] = useState('feed'); // Removed tabs
    const [feed, setFeed] = useState([]);
    const [loading, setLoading] = useState(true);
    const [trackedHandles, setTrackedHandles] = useState([]);
    const [recommendedKOLs, setRecommendedKOLs] = useState([]);
    const [newHandleInput, setNewHandleInput] = useState('');
    const [lastViewed, setLastViewed] = useState(Date.now());
    const [hasNewUpdates, setHasNewUpdates] = useState(false);
    const [error, setError] = useState(null);

    // Load initial data
    useEffect(() => {
        if (symbol && user) {
            loadData();
        }
    }, [symbol, user]);

    // Check for updates periodically (every 60s)
    useEffect(() => {
        if (!feed.length) return;

        const interval = setInterval(() => {
            const latestTweetTime = new Date(feed[0].timestamp).getTime();
            if (latestTweetTime > lastViewed) {
                setHasNewUpdates(true);
            }
        }, 60000);

        return () => clearInterval(interval);
    }, [feed, lastViewed]);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            // 0. Get Project Metadata (Twitter Handle & Name)
            const metadata = await getCoinMetadata(symbol);

            // 1. Get User's Tracking List
            const userList = await getUserTrackingList(user.uid, symbol);
            setTrackedHandles(userList);

            // 2. Search Tweets (Use Robust Twitter Service)
            // This combines searches for the symbol ($TICKER) and tracked handles 
            const tweets = await searchCryptoTweets(symbol, 20, metadata?.twitter_screen_name, true);

            // Format tweets to match widget expectation
            const formattedFeed = tweets.map(t => ({
                id: t.id,
                author: t.author,
                timestamp: t.timestamp,
                text: t.text,
                url: t.link || t.url,
                likes: t.likes,
                retweets: t.retweets
            }));

            setFeed(formattedFeed);

            // Update last viewed to now
            setLastViewed(Date.now());
            setHasNewUpdates(false);

        } catch (err) {
            console.error('Error loading social data:', err);
            setError('Failed to load social insights.');
        } finally {
            setLoading(false);
        }
    };

    const handleAddHandle = async (handleToAdd) => {
        const handle = handleToAdd.trim();
        if (!handle) return;

        // Basic validation
        const cleanHandle = handle.startsWith('@') ? handle : `@${handle}`;

        if (trackedHandles.includes(cleanHandle)) return;
        if (trackedHandles.length >= 5) {
            alert('Maximum 5 tracked accounts allowed.');
            return;
        }

        const newList = [...trackedHandles, cleanHandle];
        setTrackedHandles(newList);
        setNewHandleInput('');

        try {
            await updateUserTrackingList(user.uid, symbol, newList);
            // Refresh feed
            const newFeed = await getTrackedFeed(symbol, newList);
            setFeed(newFeed);
        } catch (err) {
            console.error('Error updating tracking list:', err);
            // Revert on error
            setTrackedHandles(trackedHandles);
            alert('Failed to save changes.');
        }
    };

    const handleRemoveHandle = async (handleToRemove) => {
        const newList = trackedHandles.filter(h => h !== handleToRemove);
        setTrackedHandles(newList);

        try {
            await updateUserTrackingList(user.uid, symbol, newList);
            // Refresh feed
            const newFeed = await getTrackedFeed(symbol, newList);
            setFeed(newFeed);
        } catch (err) {
            console.error('Error updating tracking list:', err);
            setTrackedHandles(trackedHandles);
        }
    };

    const [visibleCount, setVisibleCount] = useState(5);

    // Reset visible count when feed changes
    useEffect(() => {
        setVisibleCount(5);
    }, [symbol]);

    // Unified Content Renderer
    const renderUnifiedContent = () => {
        if (loading) return <div className="p-4 text-center text-gray-400 text-sm">Loading...</div>;
        if (error) return <div className="p-4 text-center text-red-400 text-sm">{error}</div>;

        const visibleFeed = feed.slice(0, visibleCount);

        return (
            <div className="flex flex-col h-full">
                {/* Top: Management Section (Compact) */}
                <div className="p-3 border-b border-slate-800 bg-slate-900/30 space-y-3">
                    {/* Tracked Accounts Row (Ultra Compact) */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Tracked ({trackedHandles.length}/5)</span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                            {trackedHandles.map(handle => (
                                <span key={handle} className="flex items-center bg-indigo-500/10 text-indigo-300 text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/20">
                                    {handle}
                                    <button onClick={() => handleRemoveHandle(handle)} className="ml-1 text-indigo-400 hover:text-white transition-colors">
                                        <X size={10} />
                                    </button>
                                </span>
                            ))}

                            {/* Add Input Inline */}
                            <div className="flex items-center gap-1">
                                <input
                                    type="text"
                                    value={newHandleInput}
                                    onChange={(e) => setNewHandleInput(e.target.value)}
                                    placeholder="@add"
                                    className="w-14 bg-transparent border-b border-slate-700 text-[10px] text-white focus:outline-none focus:border-indigo-500 px-1 py-0 placeholder:text-slate-600"
                                />
                                <button
                                    onClick={() => handleAddHandle(newHandleInput)}
                                    disabled={!newHandleInput}
                                    className="text-indigo-400 hover:text-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <Plus size={12} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Recommended Row */}
                    {recommendedKOLs.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/50">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">Suggested:</span>
                            {recommendedKOLs.slice(0, 3).map(kol => {
                                const isTracked = trackedHandles.includes(kol.handle) || trackedHandles.includes(`@${kol.handle}`);
                                if (isTracked) return null;
                                return (
                                    <button
                                        key={kol.handle}
                                        onClick={() => handleAddHandle(`@${kol.handle}`)}
                                        className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20 text-emerald-400/80 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors"
                                    >
                                        + {kol.handle}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Bottom: Feed List */}
                <div className="flex-1 overflow-y-auto bg-slate-950/30">
                    {feed.length === 0 ? (
                        <p className="text-center text-slate-500 text-sm p-8">No updates found. Try adding more accounts.</p>
                    ) : (
                        <div className="feed-rows">
                            {visibleFeed.map((item, index) => (
                                <div key={index} className="feed-row compact group relative">
                                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                                        <div className="feed-row-header">
                                            <span className="feed-author text-indigo-300 group-hover:text-indigo-200">{item.author}</span>
                                            <span className="feed-time text-[10px]">{formatDistanceToNow(new Date(item.timestamp))} ago</span>
                                        </div>
                                        <TweetContent text={item.text || item.content} />
                                    </a>
                                    {onAddToThesis && (
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onAddToThesis(item.text || item.content, item.url);
                                            }}
                                            className="absolute bottom-2 right-2 p-1.5 text-slate-400 hover:text-emerald-400 bg-slate-900/80 rounded-full transition-colors border border-slate-700 shadow-sm"
                                            title="Add to Buy Thesis"
                                        >
                                            <PlusCircle size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}

                            {visibleCount < feed.length && (
                                <button
                                    onClick={() => setVisibleCount(prev => prev + 5)}
                                    className="w-full py-3 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors border-t border-slate-800"
                                >
                                    Load More ({feed.length - visibleCount} remaining)
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // Helper component for Tweet content
    const TweetContent = ({ text }) => {
        const [expanded, setExpanded] = useState(false);
        return (
            <div>
                <p className={`feed-content text-slate-300 group-hover:text-slate-200 text-wrap-fix ${!expanded ? 'line-clamp-3' : ''}`}>
                    {text}
                </p>
                {text && text.length > 150 && (
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            setExpanded(!expanded);
                        }}
                        className="text-[10px] text-indigo-400 hover:text-indigo-300 mt-1 font-medium"
                    >
                        {expanded ? 'Show Less' : 'Show More'}
                    </button>
                )}
            </div>
        );
    };

    return (
        <div className={`social-widget ${compact ? 'compact-mode' : ''}`}>
            {/* Header */}
            <div className="widget-header">
                <div className="widget-title-group">
                    <Bell size={16} className="text-indigo-400" />
                    <h3 className="widget-title">Social Signals</h3>
                    {hasNewUpdates && <span className="new-badge">New</span>}
                </div>
                <div className="widget-controls">
                    {/* Removed Tab Toggle */}
                    <button onClick={() => loadData()} className="btn-icon" title="Refresh">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="widget-content">
                {renderUnifiedContent()}
            </div>

            <style>{`
                .social-widget {
                    display: flex;
                    flex-direction: column;
                    background: var(--bg-secondary);
                    border-radius: var(--radius-lg);
                    border: 1px solid var(--bg-tertiary);
                    overflow: visible;
                    height: auto;
                    min-height: fit-content;
                }
                .social-widget.compact-mode {
                    border: none;
                    background: transparent;
                }

                .widget-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px;
                    border-bottom: 1px solid var(--bg-tertiary);
                    background: rgba(0,0,0,0.1);
                    flex-shrink: 0;
                }

                .widget-title-group {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .widget-title {
                    font-size: 0.9rem;
                    font-weight: 600;
                    margin: 0;
                }
                .new-badge {
                    font-size: 0.7rem;
                    background: var(--accent-primary);
                    color: white;
                    padding: 1px 4px;
                    border-radius: 4px;
                }

                .widget-controls {
                    display: flex;
                    gap: 8px;
                }
                .btn-icon {
                    background: none;
                    border: none;
                    color: var(--text-secondary);
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    transition: all 0.2s;
                }
                .btn-icon:hover, .btn-icon.active {
                    color: var(--text-primary);
                    background: var(--bg-tertiary);
                }

                .widget-content {
                    flex: 1;
                    overflow-y: auto;
                    min-height: 0;
                }

                .feed-rows {
                    display: flex;
                    flex-direction: column;
                }

                .feed-row {
                    display: block;
                    padding: 12px;
                    border-bottom: 1px solid var(--bg-tertiary);
                    text-decoration: none;
                    transition: background 0.2s;
                }
                .feed-row:hover {
                    background: var(--bg-tertiary);
                }
                .feed-row.compact {
                    padding: 10px;
                }

                .feed-row-header {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 4px;
                    font-size: 0.8rem;
                }
                .feed-author {
                    font-weight: 600;
                    color: var(--text-primary);
                }
                .feed-time {
                    color: var(--text-secondary);
                }
                .feed-content {
                    font-size: 0.85rem;
                    color: var(--text-secondary);
                    line-height: 1.4;
                    margin: 0;
                    white-space: pre-wrap;       /* Preserve newlines but wrap text */
                    word-break: break-word;      /* Break long words if needed */
                    overflow-wrap: break-word;   /* Standard property */
                    max-width: 100%;             /* Ensure it doesn't exceed container */
                }
            `}</style>
        </div>
    );
};

export default SocialNotificationWidget;
