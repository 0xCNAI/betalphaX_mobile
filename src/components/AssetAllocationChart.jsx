import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';

const COLORS = [
    '#6366f1', // Indigo
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#f59e0b', // Amber
    '#10b981', // Emerald
    '#3b82f6', // Blue
    '#f97316', // Orange
    '#14b8a6', // Teal
];

const AssetAllocationChart = () => {
    const { transactions } = useTransactions();
    const { getPrice } = usePrices();
    const [allocationData, setAllocationData] = useState([]);
    const [totalValue, setTotalValue] = useState(0);

    useEffect(() => {
        calculateAllocation();
    }, [transactions, getPrice]);

    const calculateAllocation = () => {
        // Group holdings by asset
        const assetData = transactions.reduce((acc, tx) => {
            if (tx.status === 'open') {
                if (!acc[tx.asset]) acc[tx.asset] = { amount: 0, costBasis: 0 };
                const amount = parseFloat(tx.amount);
                acc[tx.asset].amount += amount;
                acc[tx.asset].costBasis += (amount * tx.price);
            }
            return acc;
        }, {});

        // Calculate value for each asset
        let total = 0;
        const data = Object.entries(assetData)
            .filter(([_, data]) => data.amount > 0)
            .map(([symbol, assetInfo]) => {
                const priceData = getPrice(symbol);
                // Use real price if available, else fallback to average entry price
                const currentPrice = priceData.price > 0 ? priceData.price : (assetInfo.costBasis / assetInfo.amount);

                const value = assetInfo.amount * currentPrice;
                total += value;
                return {
                    name: symbol,
                    value: value,
                    amount: assetInfo.amount,
                    price: currentPrice
                };
            })
            .sort((a, b) => b.value - a.value); // Sort by value descending

        setAllocationData(data);
        setTotalValue(total);
    };

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const percentage = ((data.value / totalValue) * 100).toFixed(2);

            return (
                <div className="custom-tooltip">
                    <div className="tooltip-header">{data.name}</div>
                    <div className="tooltip-row">
                        <span>Value:</span>
                        <span className="tooltip-value">${data.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <div className="tooltip-row">
                        <span>Allocation:</span>
                        <span className="tooltip-value">{percentage}%</span>
                    </div>
                    <div className="tooltip-row">
                        <span>Holdings:</span>
                        <span className="tooltip-value">{data.amount.toLocaleString()} {data.name}</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    if (allocationData.length === 0) {
        return (
            <div className="chart-empty">
                <p>No assets to display</p>
                <small>Add transactions to see your asset allocation</small>
            </div>
        );
    }

    return (
        <div className="allocation-chart-container">
            <div className="chart-header">
                <h3>Asset Allocation</h3>
                <div className="total-value">
                    Total: ${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            </div>

            <div className="chart-content">
                <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Pie
                            data={allocationData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                        >
                            {allocationData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                    </PieChart>
                </ResponsiveContainer>
            </div>

            <style>{`
        .allocation-chart-container {
          background-color: var(--bg-secondary);
          border-radius: var(--radius-lg);
          border: 1px solid var(--bg-tertiary);
          padding: var(--spacing-lg);
          height: 100%;
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

        .total-value {
          font-size: 0.875rem;
          color: var(--text-secondary);
          font-weight: 500;
        }

        .chart-content {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-md);
        }

        .custom-tooltip {
          background-color: var(--bg-primary);
          border: 1px solid var(--bg-tertiary);
          border-radius: var(--radius-md);
          padding: var(--spacing-sm) var(--spacing-md);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .tooltip-header {
          font-weight: 600;
          font-size: 0.875rem;
          margin-bottom: var(--spacing-xs);
          color: var(--accent-primary);
        }

        .tooltip-row {
          display: flex;
          justify-content: space-between;
          gap: var(--spacing-md);
          font-size: 0.75rem;
          color: var(--text-secondary);
          margin-bottom: 4px;
        }

        .tooltip-value {
          color: var(--text-primary);
          font-weight: 500;
        }

        .chart-empty {
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
      `}</style>
        </div>
    );
};

export default AssetAllocationChart;
