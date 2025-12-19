import React, { useState, useEffect, useCallback } from 'react';
import { getNewsDashboard } from '../services/twitterService';
import { translateText } from '../services/translationService';
import { Loader2, ExternalLink, Calendar, MessageSquare, Map, RefreshCw, BookOpen, CheckSquare, Square } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const ImportantEvents = React.forwardRef(({ symbol, onCreateNote, embedded = false, onDataLoaded, selectable = false, onSelectionChange, externalSelectAll = false, onRefreshChange }, ref) => {
    const { t, language } = useLanguage();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [translatedData, setTranslatedData] = useState(null);

    // Translation Effect
    useEffect(() => {
        const translateData = async () => {
            if (!data || language !== 'zh-TW') {
                setTranslatedData(null);
                return;
            }

            // If already translated for this data instance (simple check), skip
            if (translatedData && translatedData._id === data._id) return;

            const newData = { ...data, _id: data._id || Date.now() }; // Ensure ID for stability

            // 1. Discussions
            if (newData.discussions) {
                newData.discussions = await Promise.all(newData.discussions.map(async (theme) => ({
                    ...theme,
                    theme: await translateText(theme.theme, 'zh-TW'),
                    points: await Promise.all(theme.points.map(async (p) => ({
                        ...p,
                        detail: await translateText(p.detail, 'zh-TW')
                    })))
                })));
            }

            // 2. Past Events
            if (newData.past_month_events) {
                newData.past_month_events = await Promise.all(newData.past_month_events.map(async (e) => ({
                    ...e,
                    event: await translateText(e.event, 'zh-TW'),
                    details: await translateText(e.details, 'zh-TW')
                })));
            }

            // 3. Future Events
            if (newData.future_events) {
                newData.future_events = await Promise.all(newData.future_events.map(async (e) => ({
                    ...e,
                    event: await translateText(e.event, 'zh-TW'),
                    details: await translateText(e.details, 'zh-TW'),
                    timeline: await translateText(e.timeline, 'zh-TW') // Translate "Q1 2024" etc? Maybe.
                })));
            }

            setTranslatedData(newData);
        };

        translateData();
    }, [data, language]);

    const displayData = (language === 'zh-TW' && translatedData) ? translatedData : data;

    const fetchData = useCallback(async (forceRefresh = false) => {
        if (!symbol) {
            setLoading(false);
            return;
        }

        if (forceRefresh) {
            setRefreshing(true);
            if (onRefreshChange) onRefreshChange(true);
        } else {
            setLoading(true);
        }

        setError(null);
        try {
            const result = await getNewsDashboard(symbol, forceRefresh, 'important_events');
            if (result) {
                setData(result);
                setLastUpdated(new Date());
                if (onDataLoaded) {
                    onDataLoaded(result);
                }
            } else {
                setError("No data available");
            }
        } catch (err) {
            console.error("Failed to load events:", err);
            // Keep silent on error if refreshing to avoid wiping UI if it's just a flake
            if (!forceRefresh) setError("Failed to load events");
        } finally {
            setLoading(false);
            setRefreshing(false);
            if (forceRefresh && onRefreshChange) onRefreshChange(false);
        }
    }, [symbol, onDataLoaded, onRefreshChange]);

    React.useImperativeHandle(ref, () => ({
        refresh: () => {
            fetchData(true);
        }
    }));

    // Expose refresh method to parent
    React.useImperativeHandle(ref, () => ({
        refresh: () => fetchData(true)
    }));

    useEffect(() => {
        fetchData(false);
    }, [fetchData]);

    // ... (rest of the component)

    // Handle external Select All
    useEffect(() => {
        if (selectable && displayData) {
            const newIds = new Set();
            if (externalSelectAll) {
                displayData.discussions?.forEach((t, i) => t.points.forEach((_, j) => newIds.add(`disc-${i}-${j}`)));
                displayData.past_month_events?.forEach((_, i) => newIds.add(`past-${i}`));
                displayData.future_events?.forEach((_, i) => newIds.add(`future-${i}`));
            }
            setSelectedIds(newIds);
            // Notify selection change immediately when Select All changes
            notifySelection(newIds);
        }
    }, [externalSelectAll, selectable, displayData]);

    const notifySelection = (ids) => {
        if (onSelectionChange && displayData) {
            const selectedItems = [];
            displayData.discussions?.forEach((theme, i) => {
                theme.points.forEach((point, j) => {
                    if (ids.has(`disc-${i}-${j}`)) {
                        selectedItems.push({
                            section: 'Community Discussion',
                            date: new Date().toISOString().split('T')[0], // Approximate
                            title: theme.theme,
                            detail: point.detail,
                            source: point.source_url
                        });
                    }
                });
            });
            displayData.past_month_events?.forEach((event, i) => {
                if (ids.has(`past-${i}`)) {
                    selectedItems.push({
                        section: 'Past Event',
                        date: event.date,
                        title: event.event,
                        detail: event.details,
                        source: event.source_url
                    });
                }
            });
            displayData.future_events?.forEach((event, i) => {
                if (ids.has(`future-${i}`)) {
                    selectedItems.push({
                        section: 'Future Roadmap',
                        date: event.timeline,
                        title: event.event,
                        detail: event.details,
                        source: event.source_url
                    });
                }
            });
            onSelectionChange(selectedItems);
        }
    };

    const toggleSelection = (id) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
        notifySelection(newSet);
    };

    const handleRefresh = () => {
        fetchData(true);
    };

    const renderCheckbox = (id) => {
        const isSelected = selectedIds.has(id);
        return (
            <button
                onClick={() => toggleSelection(id)}
                className={`mr-3 transition-colors ${isSelected ? 'text-indigo-400' : 'text-gray-600 hover:text-gray-400'}`}
                title={isSelected ? "Remove from Note" : "Add to Note"}
            >
                {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
            </button>
        );
    };

    const renderHeader = () => {
        if (embedded) return null;
        return (
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-blue-400" />
                    {t('importantEvents')}
                </h3>
                <div className="flex items-center gap-2">
                    {lastUpdated && (
                        <span className="text-xs text-gray-500">
                            Updated: {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className={`p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white ${refreshing ? 'animate-spin text-blue-400' : ''}`}
                        title="Refresh Events"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    };

    if (loading && !displayData) {
        return (
            <div className={embedded ? "flex items-center justify-center min-h-[100px]" : "bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 mb-6 flex items-center justify-center min-h-[200px]"}>
                <div className="flex flex-col items-center gap-3 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                    <span className="text-sm">{t('analyzingCommunity')}</span>
                </div>
            </div>
        );
    }

    if (error && !displayData) {
        return (
            <div className={embedded ? "w-full" : "bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 mb-6"}>
                {renderHeader()}
                <div className="text-center py-8 text-gray-400 bg-white/5 rounded-lg border border-dashed border-white/10">
                    <p>{t('unableToLoadEvents')}</p>
                </div>
            </div>
        );
    }

    if (!displayData && !loading && !error) {
        return (
            <div className={embedded ? "w-full" : "bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 mb-6"}>
                {renderHeader()}
                <div className="text-center py-8 text-gray-500 bg-white/5 rounded-lg border border-dashed border-white/10">
                    <p>{t('noEventsData')}</p>
                </div>
            </div>
        );
    }

    if (!displayData) return null;

    return (
        <div className={embedded ? "w-full" : "bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 mb-6"}>
            {renderHeader()}

            <div className="space-y-8">
                {/* 1. Recent Community Discussions */}
                {displayData.discussions && displayData.discussions.length > 0 && (
                    <section>
                        <h5 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <MessageSquare size={18} />
                            {t('recentDiscussions')}
                        </h5>
                        <div className="grid gap-4">
                            {displayData.discussions.map((theme, idx) => (
                                <div key={idx} className="bg-white/5 rounded-lg p-4 border border-white/5">
                                    <h4 className="text-blue-300 font-medium mb-3">{theme.theme}</h4>
                                    <ul className="space-y-3">
                                        {theme.points.map((point, pIdx) => (
                                            <li key={pIdx} className="text-gray-300 text-sm flex items-start">
                                                {selectable ? renderCheckbox(`disc-${idx}-${pIdx}`) : (
                                                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500/50 shrink-0 mr-2" />
                                                )}
                                                <span className="flex-1 pt-0.5">
                                                    {point.detail}
                                                    {point.source_url && (
                                                        <a
                                                            href={point.source_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 ml-2 text-xs text-blue-400/70 hover:text-blue-400 transition-colors"
                                                        >
                                                            {t('source')} <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </span>
                                                {onCreateNote && !selectable && (
                                                    <button
                                                        onClick={() => onCreateNote(`Community Insight: ${theme.theme} - ${point.detail}`, point.source_url)}
                                                        className="text-gray-500 hover:text-blue-400 transition-colors ml-2"
                                                        title={t('saveToNotebook')}
                                                    >
                                                        <BookOpen size={14} />
                                                    </button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* 2. Past Month Events */}
                {displayData.past_month_events && displayData.past_month_events.length > 0 && (
                    <section>
                        <h5 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                            <Calendar size={18} />
                            {t('pastMonthEvents')}
                        </h5>
                        <div className="overflow-hidden rounded-lg border border-white/10">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white/5 text-gray-400">
                                    <tr>
                                        {selectable && <th className="px-4 py-3 w-10"></th>}
                                        <th className="px-4 py-3 font-medium w-24">{t('date')}</th>
                                        <th className="px-4 py-3 font-medium w-1/3">{t('event')}</th>
                                        <th className="px-4 py-3 font-medium">{t('details')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {displayData.past_month_events.map((event, idx) => (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                                            {selectable && (
                                                <td className="pl-4 py-3 alignment-top">
                                                    {renderCheckbox(`past-${idx}`)}
                                                </td>
                                            )}
                                            <td className="px-4 py-3 text-gray-400 font-mono align-top">{event.date}</td>
                                            <td className="px-4 py-3 text-white font-medium align-top">{event.event}</td>
                                            <td className="px-4 py-3 text-gray-300 flex items-start justify-between">
                                                <span>
                                                    {event.details}
                                                    {event.source_url && (
                                                        <a
                                                            href={event.source_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-block ml-2 text-blue-400/70 hover:text-blue-400"
                                                        >
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </span>
                                                {onCreateNote && !selectable && (
                                                    <button
                                                        onClick={() => onCreateNote(`Event(${event.date}): ${event.event} - ${event.details}`, event.source_url)}
                                                        className="text-gray-500 hover:text-blue-400 transition-colors ml-2 shrink-0"
                                                        title={t('saveToNotebook')}
                                                    >
                                                        <BookOpen size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )
                }

                {/* 3. Future Roadmap */}
                {
                    displayData.future_events && displayData.future_events.length > 0 && (
                        <section>
                            <h5 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                <Map size={18} />
                                {t('futureRoadmap')}
                            </h5>
                            <div className="overflow-hidden rounded-lg border border-white/10">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-white/5 text-gray-400">
                                        <tr>
                                            {selectable && <th className="px-4 py-3 w-10"></th>}
                                            <th className="px-4 py-3 font-medium w-24">{t('timeline')}</th>
                                            <th className="px-4 py-3 font-medium w-1/3">{t('event')}</th>
                                            <th className="px-4 py-3 font-medium">{t('details')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {displayData.future_events.map((event, idx) => (
                                            <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                {selectable && (
                                                    <td className="pl-4 py-3 alignment-top">
                                                        {renderCheckbox(`future-${idx}`)}
                                                    </td>
                                                )}
                                                <td className="px-4 py-3 text-blue-300 font-medium align-top">{event.timeline}</td>
                                                <td className="px-4 py-3 text-white font-medium align-top">{event.event}</td>
                                                <td className="px-4 py-3 text-gray-300 flex items-start justify-between">
                                                    <span>
                                                        {event.details}
                                                        {event.source_url && (
                                                            <a
                                                                href={event.source_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="inline-block ml-2 text-blue-400/70 hover:text-blue-400"
                                                            >
                                                                <ExternalLink className="w-3 h-3" />
                                                            </a>
                                                        )}
                                                    </span>
                                                    {onCreateNote && !selectable && (
                                                        <button
                                                            onClick={() => onCreateNote(`Roadmap(${event.timeline}): ${event.event} - ${event.details}`, event.source_url)}
                                                            className="text-gray-500 hover:text-blue-400 transition-colors ml-2 shrink-0"
                                                            title="Save to Notebook"
                                                        >
                                                            <BookOpen size={14} />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section >
                    )
                }
            </div >
            {
                (!displayData.discussions?.length && !displayData.past_month_events?.length && !displayData.future_events?.length) && (
                    <div className="text-center py-8 text-gray-400 bg-white/5 rounded-lg border border-dashed border-white/10">
                        <p>{t('noSignificantEvents')}</p>
                    </div>
                )
            }
        </div >
    );
});

export default ImportantEvents;
