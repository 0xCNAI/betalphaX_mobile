/**
 * Factory function to create a standardized MetricsSummary object.
 * 
 * @param {Object} data - Partial metrics data
 * @returns {Object} Complete MetricsSummary object
 */
export const createMetricsSummary = (data) => {
    return {
        schemaVersion: 1,
        userId: data.userId || '',
        date: data.date || new Date().toISOString().split('T')[0], // YYYY-MM-DD
        updatedAt: new Date().toISOString(),

        // Daily Stats
        daily_tx_count: Number(data.daily_tx_count) || 0,
        daily_realized_pnl: Number(data.daily_realized_pnl) || 0,
        daily_volume: Number(data.daily_volume) || 0,

        // Cumulative Stats (Snapshot at this day)
        total_realized_pnl: Number(data.total_realized_pnl) || 0,
        total_unrealized_pnl: Number(data.total_unrealized_pnl) || 0,
        win_rate: Number(data.win_rate) || 0,

        // Optional: Breakdown by tag/strategy
        tags_summary: data.tags_summary || {}, // { "scalp": { count: 10, pnl: 500 } }

        ...data
    };
};
