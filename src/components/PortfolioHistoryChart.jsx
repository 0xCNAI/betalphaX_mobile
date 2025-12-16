import React, { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';

const PortfolioHistoryChart = ({ compact = false }) => {
    const { transactions } = useTransactions();
    const { getPrice } = usePrices();
    const [chartData, setChartData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [timeframe, setTimeframe] = useState(30); // Default to 30 days

    useEffect(() => {
        const generateChartData = () => {
            if (transactions.length === 0) {
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                // 1. Identify all assets and their key price points
                const assetPricePoints = {};
                const assets = [...new Set(transactions.map(t => t.asset))];

                assets.forEach(asset => {
                    const points = [];
                    // Add transaction points
                    transactions.filter(t => t.asset === asset).forEach(t => {
                        points.push({
                            timestamp: new Date(t.date).getTime(),
                            price: t.price
                        });
                    });

                    // Add current price point
                    const currentPriceData = getPrice(asset);
                    // Fallback to last transaction price if current price is missing
                    const lastTxPrice = points.length > 0 ? points[points.length - 1].price : 0;
                    const currentPrice = currentPriceData.price > 0 ? currentPriceData.price : lastTxPrice;

                    points.push({
                        timestamp: Date.now(),
                        price: currentPrice
                    });

                    // Sort by time
                    points.sort((a, b) => a.timestamp - b.timestamp);
                    assetPricePoints[asset] = points;
                });

                // 2. Generate daily data points for the timeframe
                const data = [];
                const now = Date.now();
                const msPerDay = 24 * 60 * 60 * 1000;

                for (let i = timeframe; i >= 0; i--) {
                    const timestamp = now - (i * msPerDay);
                    const dateStr = new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

                    let totalValue = 0;

                    assets.forEach(asset => {
                        // A. Calculate Holdings at this timestamp
                        const holdings = transactions.reduce((acc, tx) => {
                            const txTime = new Date(tx.date).getTime();
                            if (tx.asset === asset && txTime <= timestamp) {
                                const amount = parseFloat(tx.amount || 0);
                                if (tx.type === 'buy') {
                                    return acc + amount;
                                } else if (tx.type === 'sell') {
                                    return acc - amount;
                                }
                            }
                            return acc;
                        }, 0);

                        if (holdings > 0) {
                            // B. Interpolate Price at this timestamp
                            const points = assetPricePoints[asset];
                            let price = 0;

                            if (points.length === 0) {
                                price = 0;
                            } else if (timestamp <= points[0].timestamp) {
                                price = points[0].price;
                            } else if (timestamp >= points[points.length - 1].timestamp) {
                                price = points[points.length - 1].price;
                            } else {
                                for (let j = 0; j < points.length - 1; j++) {
                                    if (timestamp >= points[j].timestamp && timestamp < points[j + 1].timestamp) {
                                        const p1 = points[j];
                                        const p2 = points[j + 1];
                                        const ratio = (timestamp - p1.timestamp) / (p2.timestamp - p1.timestamp);
                                        price = p1.price + (p2.price - p1.price) * ratio;
                                        break;
                                    }
                                }
                            }

                            totalValue += holdings * price;
                        }
                    });

                    data.push({
                        date: dateStr,
                        timestamp: timestamp,
                        value: totalValue
                    });
                }

                setChartData(data);
            } catch (error) {
                console.error("Error generating chart data:", error);
            } finally {
                setLoading(false);
            }
        };

        generateChartData();
    }, [transactions, timeframe, getPrice]);

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
