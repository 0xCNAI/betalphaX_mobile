/**
 * Factory function to create a standardized Position object.
 * 
 * @param {Object} data - Partial position data
 * @returns {Object} Complete Position object
 */
export const createPosition = (data) => {
    return {
        userId: data.userId || '',
        asset: data.asset ? data.asset.toUpperCase() : '',
        chain: data.chain || null,

        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),
        status: data.status || 'open',
        closedAt: data.closedAt || null,

        current_size: Number(data.current_size) || 0,
        total_buy_amount: Number(data.total_buy_amount) || 0,
        total_cost: Number(data.total_cost) || 0,
        avg_entry_price: Number(data.avg_entry_price) || 0,

        realized_pnl_abs: Number(data.realized_pnl_abs) || 0,
        realized_pnl_pct: Number(data.realized_pnl_pct) || 0,

        // Array of transaction IDs belonging to this position
        transactionIds: Array.isArray(data.transactionIds) ? data.transactionIds : [],

        main_thesis: data.main_thesis || null,
        main_exit_reason: data.main_exit_reason || null,

        // Preserve other fields
        ...data,

        // Force schema version
        schemaVersion: 1
    };
};
