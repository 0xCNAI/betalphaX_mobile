import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { useAuth } from '../context/AuthContext';
import { getPortfolioHistory } from '../services/historyService';

const PortfolioHistoryChart = ({ compact = false }) => {
    const { user } = useAuth();
    const { transactions } = useTransactions();
    const { getPrice } = usePrices();
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState(30);

    useEffect(() => {
        const loadHistory = async () => {
            if (!user) return;
            setLoading(true);
            try {
                // 1. Fetch persistent history from Firebase
                const historyInDb = await getPortfolioHistory(user.uid, timeframe);

                // 2. Calculate "Today/Now" (Real-time)
                // We calculate this live so the chart always ends at the current moment
                let currentTotal = 0;

                // Calculate current holdings
                const currentHoldings = transactions.reduce((acc, tx) => {
                    const amount = parseFloat(tx.amount || 0);
                    if (tx.type === 'buy') acc[tx.asset] = (acc[tx.asset] || 0) + amount;
                    else if (tx.type === 'sell') acc[tx.asset] = (acc[tx.asset] || 0) - amount;
                    return acc;
                }, {});

                Object.entries(currentHoldings).forEach(([symbol, amount]) => {
                    if (amount > 0.000001) {
                        const priceData = getPrice(symbol);
                        const price = priceData ? priceData.price : 0;
                        currentTotal += amount * price;
                    }
                });

                const nowPoint = {
                    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    timestamp: Date.now(),
                    value: currentTotal
                };

                // 3. Merge: Filter DB history to ensure we don't duplicate "today" if it was already saved
                // (Though saving happens on load, so it might exist. If it does, using live value for the very end is usually better for UX)
                const todayStr = new Date().toISOString().split('T')[0];

                // Exclude today's snapshot from DB if we are appending a fresh live one, 
                // OR just use DB data. 
                // Better UX: Use DB data for past days, append "Current" as the last point.
                const pastHistory = historyInDb.filter(h => h.date !== todayStr);

                // Transform DB data to chart format
                const formattedHistory = pastHistory.map(h => ({
                    date: new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    timestamp: h.timestamp ? h.timestamp.toMillis() : new Date(h.date).getTime(),
                    value: h.totalBalance
                }));

                // Combine
                let finalData = [...formattedHistory, nowPoint];

                // UX Improvement: If only 1 point (today), show a flat line instead of a single dot
                if (finalData.length === 1) {
                    const singlePoint = finalData[0];
                    const startTimestamp = singlePoint.timestamp - (24 * 60 * 60 * 1000); // 24h ago
                    const startPoint = {
                        date: new Date(startTimestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                        timestamp: startTimestamp,
                        value: singlePoint.value
                    };
                    finalData = [startPoint, singlePoint];
                }

                setChartData(finalData);

            } catch (err) {
                console.error("Failed to load portfolio history:", err);
            } finally {
                setLoading(false);
            }
        };

        loadHistory();
    }, [user, transactions, timeframe, getPrice]);

    if (loading) {
        return (
            <div className={`chart-loading ${compact ? 'compact' : ''}`}>
                <Loader2 className="spinner" size={compact ? 20 : 30} />
                {!compact && <span>Generating history...</span>}
            </div>
        );
    }

    if (chartData.length === 0 || chartData.every(d => d.value === 0)) {
        return (
            <div className={`chart-empty ${compact ? 'compact' : ''}`}>
                <p>No data</p>
                {!compact && <small>Add open positions to see growth.</small>}
            </div>
        );
    }

    return (
        <div className={`chart-container ${compact ? 'compact' : ''}`}>
            {!compact && (
                <div className="chart-header">
                    <h3>Portfolio Value</h3>
                    <div className="time-controls">
                        <button className={`time-btn ${timeframe === 7 ? 'active' : ''}`} onClick={() => setTimeframe(7)}>7D</button>
                        <button className={`time-btn ${timeframe === 30 ? 'active' : ''}`} onClick={() => setTimeframe(30)}>30D</button>
                        <button className={`time-btn ${timeframe === 90 ? 'active' : ''}`} onClick={() => setTimeframe(90)}>3M</button>
                    </div>
                </div>
            )}

            <div className="chart-wrapper" style={{ height: compact ? '100%' : 'auto', minHeight: compact ? '100px' : 'auto' }}>
                <ResponsiveContainer width="100%" height={compact ? "100%" : 300}>
                    <AreaChart data={chartData} margin={compact ? { top: 5, right: 0, left: -20, bottom: 0 } : { top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        {!compact && <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />}
                        <XAxis
                            dataKey="date"
                            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={30}
                            hide={compact}
                        />
                        <YAxis
                            domain={['auto', 'auto']}
                            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(value) => `$${value.toLocaleString(undefined, { notation: "compact" })}`}
                            width={compact ? 40 : 60}
                            hide={compact}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'rgba(23, 23, 23, 0.9)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '12px',
                                color: '#f8fafc',
                                fontSize: '0.8rem',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                            }}
                            itemStyle={{ color: '#3b82f6' }}
                            formatter={(value) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Value']}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#3b82f6"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#colorValue)"
                            animationDuration={1000}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <style>{`
        .chart-container {
          background-color: var(--bg-secondary);
          border-radius: var(--radius-lg);
          border: 1px solid var(--bg-tertiary);
          padding: var(--spacing-lg);
          margin-bottom: var(--spacing-xl);
        }
        
        .chart-container.compact {
            background-color: transparent;
            border: none;
            padding: 0;
            margin-bottom: 0;
            height: 100%;
            display: flex;
            align-items: flex-end;
        }

        .chart-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-lg);
        }

        .chart-header h3 {
          font-size: 1.1rem;
          font-weight: 600;
        }

        .time-controls {
          display: flex;
          gap: var(--spacing-xs);
          background-color: var(--bg-primary);
          padding: 4px;
          border-radius: var(--radius-md);
        }

        .time-btn {
          background: transparent;
          border: none;
          color: var(--text-secondary);
          padding: 4px 12px;
          border-radius: var(--radius-sm);
          font-size: 0.8rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .time-btn:hover {
          color: var(--text-primary);
        }

        .time-btn.active {
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
          font-weight: 500;
        }

        .chart-wrapper {
          width: 100%;
        }

        .chart-loading, .chart-empty {
          height: 300px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: var(--spacing-md);
          background-color: var(--bg-secondary);
          border-radius: var(--radius-lg);
          border: 1px solid var(--bg-tertiary);
          color: var(--text-secondary);
        }
        
        .chart-loading.compact, .chart-empty.compact {
            height: 100%;
            background: transparent;
            border: none;
        }
        
        .spinner {
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
};

const Loader2 = ({ className, size = 24 }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
);

export default PortfolioHistoryChart;
