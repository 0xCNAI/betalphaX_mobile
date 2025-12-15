
import React, { useState, useEffect } from 'react';
import { getNewsDashboard } from '../services/twitterService';
import { Loader2, ExternalLink, Calendar, MessageSquare, Map, RefreshCw } from 'lucide-react';

const ImportantEvents = ({ symbol, onDataLoaded }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchData = async (forceRefresh = false) => {
        if (!symbol) return;
        setLoading(true);
        setError(null);
        try {
            // Pass forceRefresh to service (even if service doesn't fully support it yet, good practice)
            const result = await getNewsDashboard(symbol, forceRefresh);
            if (result) {
                setData(result);
                if (onDataLoaded) onDataLoaded(result);
            } else {
                setError("No data available");
            }
        } catch (err) {
            setError("Failed to load events");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [symbol]);

    if (loading) {
        return (
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 mb-6 flex items-center justify-center min-h-[200px]">
                <div className="flex flex-col items-center gap-3 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                    <span className="text-sm">Analyzing Community & Events...</span>
                </div>
            </div>
        );
    }

    if (error || !data) return null;

    return (
        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6 mb-6">
            <div className="flex justify-between items-start mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="bg-blue-500/20 text-blue-400 p-1.5 rounded-lg">
                        <Calendar className="w-5 h-5" />
                    </span>
                    Important Events & Insights
                </h2>
                <button
                    onClick={() => fetchData(true)}
                    disabled={loading}
                    className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors text-gray-400 hover:text-white disabled:opacity-50"
                    title="Refresh Analysis"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="space-y-8">
                {/* 1. Recent Community Discussions */}
                {data.discussions && data.discussions.length > 0 && (
                    <section>
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4" />
                            Recent Community Discussions
                        </h3>
                        <div className="grid gap-4">
                            {data.discussions.map((theme, idx) => (
                                <div key={idx} className="bg-white/5 rounded-lg p-4 border border-white/5">
                                    <h4 className="text-blue-300 font-medium mb-3">{theme.theme}</h4>
                                    <ul className="space-y-3">
                                        {theme.points.map((point, pIdx) => (
                                            <li key={pIdx} className="text-gray-300 text-sm flex items-start gap-2">
                                                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-500/50 shrink-0" />
                                                <span className="flex-1">
                                                    {point.detail}
                                                    {point.source_url && (
                                                        <a
                                                            href={point.source_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 ml-2 text-xs text-blue-400/70 hover:text-blue-400 transition-colors"
                                                        >
                                                            Source <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* 2. Past Month Events */}
                {data.past_month_events && data.past_month_events.length > 0 && (
                    <section>
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Calendar className="w-4 h-4" />
                            Past Month Events
                        </h3>
                        <div className="overflow-hidden rounded-lg border border-white/10">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white/5 text-gray-400">
                                    <tr>
                                        <th className="px-4 py-3 font-medium w-24">Date</th>
                                        <th className="px-4 py-3 font-medium w-1/3">Event</th>
                                        <th className="px-4 py-3 font-medium">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {data.past_month_events.map((event, idx) => (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3 text-gray-400 font-mono">{event.date}</td>
                                            <td className="px-4 py-3 text-white font-medium">{event.event}</td>
                                            <td className="px-4 py-3 text-gray-300">
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
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {/* 3. Future Roadmap */}
                {data.future_events && data.future_events.length > 0 && (
                    <section>
                        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Map className="w-4 h-4" />
                            Future Roadmap
                        </h3>
                        <div className="overflow-hidden rounded-lg border border-white/10">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-white/5 text-gray-400">
                                    <tr>
                                        <th className="px-4 py-3 font-medium w-24">Timeline</th>
                                        <th className="px-4 py-3 font-medium w-1/3">Event</th>
                                        <th className="px-4 py-3 font-medium">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {data.future_events.map((event, idx) => (
                                        <tr key={idx} className="hover:bg-white/5 transition-colors">
                                            <td className="px-4 py-3 text-blue-300 font-medium">{event.timeline}</td>
                                            <td className="px-4 py-3 text-white font-medium">{event.event}</td>
                                            <td className="px-4 py-3 text-gray-300">
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
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>
        </div >
    );
};

export default ImportantEvents;
