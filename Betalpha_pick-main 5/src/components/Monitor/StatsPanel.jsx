import React from 'react';

export default function StatsPanel({ stats }) {
    if (!stats) {
        return <div className="text-center p-4 text-gray-400">Loading statistics...</div>;
    }

    const successRate = stats.totalCalls > 0
        ? ((stats.successCount / stats.totalCalls) * 100).toFixed(1)
        : 0;

    return (
        <div className="bg-gray-800 rounded-lg p-6 shadow-lg mb-6 border border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-white">📊 Statistics</h2>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="bg-gray-700 p-4 rounded-lg text-center">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Calls</div>
                    <div className="text-2xl font-bold text-white">{stats.totalCalls || 0}</div>
                    <div className="text-xs text-gray-400 mt-1">
                        {stats.successCount || 0} success / {(stats.totalCalls - stats.successCount) || 0} errors
                    </div>
                </div>

                <div className="bg-gray-700 p-4 rounded-lg text-center">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Total Cost</div>
                    <div className="text-2xl font-bold text-red-400">
                        ${(stats.totalCost || 0).toFixed(4)}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">USD</div>
                </div>

                <div className="bg-gray-700 p-4 rounded-lg text-center">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Avg Latency</div>
                    <div className="text-2xl font-bold text-blue-400">
                        {Math.round(stats.avgLatency || 0)}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">ms</div>
                </div>

                <div className="bg-gray-700 p-4 rounded-lg text-center">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Success Rate</div>
                    <div className="text-2xl font-bold text-green-400">
                        {successRate}%
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                        {stats.totalCalls || 0} requests
                    </div>
                </div>

                <div className="bg-gray-700 p-4 rounded-lg text-center">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Input Tokens</div>
                    <div className="text-xl font-bold text-white">
                        {(stats.totalInputTokens || 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">tokens</div>
                </div>

                <div className="bg-gray-700 p-4 rounded-lg text-center">
                    <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Output Tokens</div>
                    <div className="text-xl font-bold text-white">
                        {(stats.totalOutputTokens || 0).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">tokens</div>
                </div>
            </div>

            {/* Feature Breakdown */}
            {stats.featureBreakdown && stats.featureBreakdown.length > 0 && (
                <div className="mt-8">
                    <h3 className="text-lg font-semibold mb-3 text-gray-300">🎯 Top Features by Cost</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                                <tr>
                                    <th className="px-4 py-2 rounded-tl-lg">Feature</th>
                                    <th className="px-4 py-2">Calls</th>
                                    <th className="px-4 py-2">Total Cost</th>
                                    <th className="px-4 py-2 rounded-tr-lg">Avg Latency</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.featureBreakdown.map((item, idx) => (
                                    <tr key={idx} className="border-b border-gray-700 hover:bg-gray-700/50">
                                        <td className="px-4 py-2 font-medium text-white">{item.feature}</td>
                                        <td className="px-4 py-2">{item.count}</td>
                                        <td className="px-4 py-2 text-red-400 font- mono">
                                            ${item.totalCost.toFixed(4)}
                                        </td>
                                        <td className="px-4 py-2">{Math.round(item.avgLatency)}ms</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Model Breakdown */}
            {stats.modelBreakdown && stats.modelBreakdown.length > 0 && (
                <div className="mt-8">
                    <h3 className="text-lg font-semibold mb-3 text-gray-300">🤖 Model Usage</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-300">
                            <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                                <tr>
                                    <th className="px-4 py-2 rounded-tl-lg">Model</th>
                                    <th className="px-4 py-2">Calls</th>
                                    <th className="px-4 py-2 rounded-tr-lg">Total Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.modelBreakdown.map((item, idx) => (
                                    <tr key={idx} className="border-b border-gray-700 hover:bg-gray-700/50">
                                        <td className="px-4 py-2 font-medium text-white">{item.model}</td>
                                        <td className="px-4 py-2">{item.count}</td>
                                        <td className="px-4 py-2 text-red-400 font-mono">
                                            ${item.totalCost.toFixed(4)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
