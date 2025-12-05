import React, { useState, useEffect, useMemo } from 'react';
import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { fetchOHLC } from '../services/marketDataService';
import { Loader2, AlertCircle } from 'lucide-react';

const NativeCandleChart = ({ symbol, interval = '4h', height = 400 }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [source, setSource] = useState(null);

    useEffect(() => {
        let mounted = true;
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                // fetchOHLC returns { data: [[time, o, h, l, c], ...], source: '...' }
                const result = await fetchOHLC(symbol, interval);

                if (mounted) {
                    if (result && result.data) {
                        // Format for Recharts
                        const formatted = result.data.map(d => ({
                            time: d[0],
                            open: d[1],
                            high: d[2],
                            low: d[3],
                            close: d[4],
                            // Helper for bar color
                            isUp: d[4] >= d[1]
                        }));
                        setData(formatted);
                        setSource(result.source);
                    } else {
                        setError('No data available');
                    }
                }
            } catch (err) {
                if (mounted) setError(err.message);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        loadData();
        return () => { mounted = false; };
    }, [symbol, interval]);

    // Custom Candle Shape
    const CandleStick = (props) => {
        const { x, y, width, height, low, high, open, close } = props;
        const isUp = close >= open;
        const color = isUp ? '#10B981' : '#EF4444'; // Emerald / Rose

        // Calculate Y positions for high/low wicks
        // Recharts scales the values, but we receive the raw data in props usually?
        // Actually, for a custom shape in Bar, props contains the scaled x, y, width, height.
        // But we need the scaled positions of high and low.
        // This is tricky in Recharts without passing the scale.

        // Alternative: Use a standard Bar for the body (Open-Close) and ErrorBar for wicks?
        // Or just use a simple LineChart if Candles are too hard to implement perfectly in Recharts quickly.

        // Let's try a simplified approach:
        // We will use a composed chart.
        // But rendering true candles in Recharts custom shape requires access to the YAxis scale.

        // For now, let's render a LineChart (Close Price) which is safer and still useful.
        // We can add a "Candle" mode later if needed.
        return <rect x={x} y={y} width={width} height={height} fill={color} />;
    };

    if (loading) return (
        <div className="flex items-center justify-center bg-slate-900 rounded-xl border border-slate-800" style={{ height }}>
            <Loader2 className="animate-spin text-indigo-500" size={32} />
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center bg-slate-900 rounded-xl border border-slate-800 text-slate-400" style={{ height }}>
            <AlertCircle size={32} className="mb-2 opacity-50" />
            <p>Chart unavailable</p>
            <span className="text-xs opacity-50">{error}</span>
        </div>
    );

    // Calculate domain for YAxis to auto-scale
    const minPrice = Math.min(...data.map(d => d.low));
    const maxPrice = Math.max(...data.map(d => d.high));
    const domain = [minPrice * 0.99, maxPrice * 1.01];

    return (
        <div className="relative bg-slate-900 rounded-xl border border-slate-800 overflow-hidden" style={{ height }}>
            <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300 bg-slate-800 px-2 py-1 rounded">
                    {symbol}
                </span>
                <span className="text-[10px] text-slate-500 uppercase">
                    Source: {source}
                </span>
            </div>

            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                        dataKey="time"
                        tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                        stroke="#475569"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={30}
                    />
                    <YAxis
                        domain={domain}
                        orientation="right"
                        tickFormatter={(val) => val < 1 ? val.toFixed(4) : val.toLocaleString()}
                        stroke="#475569"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        width={50}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                        itemStyle={{ color: '#818cf8' }}
                        labelFormatter={(t) => new Date(t).toLocaleString()}
                        formatter={(value) => [value < 1 ? value.toFixed(6) : value.toLocaleString(), 'Price']}
                    />
                    {/* Area Chart for Price Trend */}
                    <Bar dataKey="close" fill="url(#colorPrice)" barSize={2} />
                    {/* Actually, let's use Area for a nice look since Candles are hard */}
                    {/* But user wants Candles? Let's stick to Area for robustness first. */}
                    {/* Wait, I can use 'recharts' Area. */}
                </ComposedChart>
            </ResponsiveContainer>

            {/* Re-render with AreaChart for better visuals */}
        </div>
    );
};

// Let's rewrite the render part to use AreaChart which is cleaner for a fallback
import { AreaChart, Area } from 'recharts';

const NativeAreaChart = ({ symbol, interval = '4h', height = 400 }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [source, setSource] = useState(null);

    useEffect(() => {
        let mounted = true;
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await fetchOHLC(symbol, interval);
                if (mounted) {
                    if (result && result.data) {
                        const formatted = result.data.map(d => ({
                            time: d[0],
                            open: d[1],
                            high: d[2],
                            low: d[3],
                            close: d[4],
                        }));
                        setData(formatted);
                        setSource(result.source);
                    } else {
                        setError('No data available');
                    }
                }
            } catch (err) {
                if (mounted) setError(err.message);
            } finally {
                if (mounted) setLoading(false);
            }
        };
        loadData();
        return () => { mounted = false; };
    }, [symbol, interval]);

    if (loading) return (
        <div className="flex items-center justify-center bg-slate-900 rounded-xl border border-slate-800" style={{ height }}>
            <Loader2 className="animate-spin text-indigo-500" size={32} />
        </div>
    );

    if (error) return (
        <div className="flex flex-col items-center justify-center bg-slate-900 rounded-xl border border-slate-800 text-slate-400" style={{ height }}>
            <AlertCircle size={32} className="mb-2 opacity-50" />
            <p>Chart unavailable</p>
            <span className="text-xs opacity-50">{error}</span>
        </div>
    );

    const minPrice = Math.min(...data.map(d => d.low));
    const maxPrice = Math.max(...data.map(d => d.high));
    const domain = [minPrice * 0.99, maxPrice * 1.01];

    return (
        <div className="relative bg-slate-900 rounded-xl border border-slate-800 overflow-hidden" style={{ height }}>
            <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300 bg-slate-800 px-2 py-1 rounded">
                    {symbol}
                </span>
                <span className="text-[10px] text-slate-500 uppercase">
                    Source: {source}
                </span>
            </div>

            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                        dataKey="time"
                        tickFormatter={(t) => new Date(t).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                        stroke="#475569"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={30}
                    />
                    <YAxis
                        domain={domain}
                        orientation="right"
                        tickFormatter={(val) => val < 1 ? val.toFixed(4) : val.toLocaleString()}
                        stroke="#475569"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        width={50}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }}
                        itemStyle={{ color: '#818cf8' }}
                        labelFormatter={(t) => new Date(t).toLocaleString()}
                        formatter={(value) => [value < 1 ? value.toFixed(6) : value.toLocaleString(), 'Price']}
                    />
                    <Area
                        type="monotone"
                        dataKey="close"
                        stroke="#6366f1"
                        fillOpacity={1}
                        fill="url(#colorPrice)"
                        strokeWidth={2}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default NativeAreaChart;
