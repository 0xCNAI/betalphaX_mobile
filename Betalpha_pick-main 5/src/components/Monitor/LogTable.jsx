import React, { useState } from 'react';

export default function LogTable({ logs }) {
    const [expandedRow, setExpandedRow] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });

    const handleSort = (key) => {
        setSortConfig({
            key,
            direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
        });
    };

    const sortedLogs = [...logs].sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const exportToCSV = () => {
        const headers = [
            'Timestamp', 'Model', 'Feature', 'Status',
            'Input Tokens', 'Output Tokens', 'Total Cost (USD)', 'Latency (ms)'
        ];

        const rows = logs.map(log => [
            log.timestamp,
            log.model,
            log.feature,
            log.status,
            log.inputTokens,
            log.outputTokens,
            log.totalCostUsd,
            log.latencyMs
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gemini-logs-${new Date().toISOString()}.csv`;
        a.click();
    };

    const SortIcon = ({ colKey }) => {
        if (sortConfig.key !== colKey) return <span className="text-gray-600 ml-1">↕</span>;
        return <span className="ml-1 text-white">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                <h2 className="text-xl font-bold text-white">📋 API Call Logs</h2>
                <button
                    onClick={exportToCSV}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium transition-colors"
                >
                    Export to CSV
                </button>
            </div>

            {logs.length === 0 ? (
                <p className="text-center text-gray-500 py-10">
                    No logs yet. Waiting for API calls...
                </p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-gray-300">
                        <thead className="text-xs text-gray-400 uppercase bg-gray-700">
                            <tr>
                                <th className="px-4 py-3 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('timestamp')}>
                                    Time <SortIcon colKey="timestamp" />
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('model')}>
                                    Model <SortIcon colKey="model" />
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('feature')}>
                                    Feature <SortIcon colKey="feature" />
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('status')}>
                                    Status <SortIcon colKey="status" />
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('inputTokens')}>
                                    Input <SortIcon colKey="inputTokens" />
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('outputTokens')}>
                                    Output <SortIcon colKey="outputTokens" />
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('totalCostUsd')}>
                                    Cost <SortIcon colKey="totalCostUsd" />
                                </th>
                                <th className="px-4 py-3 cursor-pointer hover:bg-gray-600" onClick={() => handleSort('latencyMs')}>
                                    Latency <SortIcon colKey="latencyMs" />
                                </th>
                                <th className="px-4 py-3">Details</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700">
                            {sortedLogs.map((log) => (
                                <React.Fragment key={log.id}>
                                    <tr className="hover:bg-gray-700/50">
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-400 text-xs">
                                            {new Date(log.timestamp).toLocaleString('zh-TW')}
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-cyan-400">
                                            {log.model}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-white">
                                            {log.feature}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${log.status === 'success' ? 'bg-green-900/50 text-green-400' : 'bg-red-900/50 text-red-400'
                                                }`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-gray-400">{log.inputTokens.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-gray-400">{log.outputTokens.toLocaleString()}</td>
                                        <td className="px-4 py-3 font-mono text-xs text-red-400">
                                            ${(log.totalCostUsd || 0).toFixed(6)}
                                        </td>
                                        <td className="px-4 py-3 text-gray-400">{log.latencyMs}ms</td>
                                        <td className="px-4 py-3">
                                            <button
                                                onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                                                className="text-blue-400 hover:text-blue-300 text-xs underline"
                                            >
                                                {expandedRow === log.id ? 'Hide' : 'Show'}
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedRow === log.id && (
                                        <tr>
                                            <td colSpan="9" className="bg-gray-900/50 p-4 border-b border-gray-700">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
                                                    <div>
                                                        <div className="mb-1"><strong className="text-gray-500">Endpoint:</strong> <span className="font-mono text-gray-300">{log.endpoint}</span></div>
                                                        <div className="mb-1"><strong className="text-gray-500">User ID:</strong> <span className="font-mono text-gray-300">{log.userId || 'N/A'}</span></div>
                                                        <div className="mb-1"><strong className="text-gray-500">Asset ID:</strong> <span className="font-mono text-gray-300">{log.assetId || 'N/A'}</span></div>
                                                        <div className="mb-1"><strong className="text-gray-500">Page:</strong> <span className="font-mono text-gray-300">{log.page || 'N/A'}</span></div>
                                                    </div>
                                                    <div>
                                                        <div className="mb-1"><strong className="text-gray-500">Input Chars:</strong> {log.inputChars?.toLocaleString()}</div>
                                                        <div className="mb-1"><strong className="text-gray-500">Output Chars:</strong> {log.outputChars?.toLocaleString()}</div>
                                                        <div className="mb-1"><strong className="text-gray-500">Input Cost:</strong> ${log.inputCostUsd?.toFixed(6)}</div>
                                                        <div className="mb-1"><strong className="text-gray-500">Output Cost:</strong> ${log.outputCostUsd?.toFixed(6)}</div>
                                                    </div>
                                                </div>
                                                {log.errorMessage && (
                                                    <div className="mt-3 p-3 bg-red-900/30 border border-red-800 rounded text-red-300 text-sm">
                                                        <strong>Error:</strong> {log.errorMessage}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
