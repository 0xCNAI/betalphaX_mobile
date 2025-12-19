/**
 * Factory function for AssetSummary
 * Stores aggregated metrics for a specific asset to speed up AI analysis
 * @param {Object} data 
 * @returns {Object} AssetSummary
 */
export const createAssetSummary = (data) => {
    return {
        // 🧩 Basic ID
        asset: data.asset ? data.asset.toUpperCase() : '',
        coinId: data.coinId || '',
        chain: data.chain || null,
        status: data.status || 'flat', // "open" | "closed" | "flat" (flat = has history but current size 0)

        // 💰 Current Position
        current_size: Number(data.current_size) || 0,
        avg_entry_price: Number(data.avg_entry_price) || 0,
        total_cost: Number(data.total_cost) || 0,

        // 📈 PnL (Realized)
        realized_pnl_abs: Number(data.realized_pnl_abs) || 0,
        realized_pnl_pct: Number(data.realized_pnl_pct) || 0,
        lifetime_invested_cost: Number(data.lifetime_invested_cost) || 0, // Total capital deployed EVER

        // 📈 PnL (Unrealized - Snapshot)
        unrealized_pnl_abs: Number(data.unrealized_pnl_abs) || 0,
        unrealized_pnl_pct: Number(data.unrealized_pnl_pct) || 0,

        // 📈 PnL (Total)
        lifetime_pnl_abs: Number(data.lifetime_pnl_abs) || 0,
        lifetime_pnl_pct: Number(data.lifetime_pnl_pct) || 0,

        // 💹 Price Snapshot
        last_price: Number(data.last_price) || 0,
        last_price_at: data.last_price_at || null,

        // ⏱ Timeline
        first_trade_at: data.first_trade_at || null,
        last_trade_at: data.last_trade_at || null,
        last_opened_at: data.last_opened_at || null,
        last_closed_at: data.last_closed_at || null,

        // 🧠 Behavioral Stats
        total_trades: Number(data.total_trades) || 0,
        round_trips: Number(data.round_trips) || 0,
        profitable_round_trips: Number(data.profitable_round_trips) || 0,
        losing_round_trips: Number(data.losing_round_trips) || 0,
        breakeven_round_trips: Number(data.breakeven_round_trips) || 0,

        round_trip_win_rate: Number(data.round_trip_win_rate) || 0,
        avg_round_trip_pnl_pct: Number(data.avg_round_trip_pnl_pct) || 0,
        avg_win_round_trip_pnl_pct: Number(data.avg_win_round_trip_pnl_pct) || 0,
        avg_loss_round_trip_pnl_pct: Number(data.avg_loss_round_trip_pnl_pct) || 0,
        round_trip_expectancy_pct: Number(data.round_trip_expectancy_pct) || 0,

        avg_holding_hours: Number(data.avg_holding_hours) || 0,
        max_holding_hours: Number(data.max_holding_hours) || 0,

        // 📂 Open Cycle Metadata
        open_cycle: data.open_cycle || null,
        /* Expected structure:
        {
            opened_at: string,
            size: number,
            avg_entry_price: number,
            unrealized_pnl_abs: number,
            unrealized_pnl_pct: number,
            max_unrealized_gain_pct: number,
            max_unrealized_drawdown_pct: number
        }
        */

        // 📝 Notes Summary
        notes_count: Number(data.notes_count) || 0,
        last_note_at: data.last_note_at || null,
        last_note_preview: data.last_note_preview || null,

        core_thesis: data.core_thesis || null,
        key_updates: Array.isArray(data.key_updates) ? data.key_updates : [],
        exit_conditions: Array.isArray(data.exit_conditions) ? data.exit_conditions : [],
        major_mistakes: Array.isArray(data.major_mistakes) ? data.major_mistakes : [],

        // 😺 AI Coach Cache
        ai_behavior_summary: data.ai_behavior_summary || null,
        ai_recommended_playbook: data.ai_recommended_playbook || null,
        ai_last_review_at: data.ai_last_review_at || null,
        ai_model_version: data.ai_model_version || null,

        updatedAt: new Date().toISOString(),
        schemaVersion: 1
    };
};

/**
 * Factory function for UserSummary
 * Stores global portfolio metrics
 * @param {Object} data 
 * @returns {Object} UserSummary
 */
export const createUserSummary = (data) => {
    return {
        userId: data.userId || '',

        // 💰 Global Performance
        lifetime_pnl_abs: Number(data.lifetime_pnl_abs) || 0,
        lifetime_pnl_pct: Number(data.lifetime_pnl_pct) || 0,

        total_assets_traded: Number(data.total_assets_traded) || 0,
        total_round_trips: Number(data.total_round_trips) || 0,
        open_positions_count: Number(data.open_positions_count) || 0,

        // 📈 Behavioral Quality
        round_trip_win_rate: Number(data.round_trip_win_rate) || 0,
        avg_round_trip_pnl_pct: Number(data.avg_round_trip_pnl_pct) || 0,
        avg_win_round_trip_pnl_pct: Number(data.avg_win_round_trip_pnl_pct) || 0,
        avg_loss_round_trip_pnl_pct: Number(data.avg_loss_round_trip_pnl_pct) || 0,
        round_trip_expectancy_pct: Number(data.round_trip_expectancy_pct) || 0,

        // ⏱ Global Holding Habits
        avg_holding_hours: Number(data.avg_holding_hours) || 0,
        max_holding_hours: Number(data.max_holding_hours) || 0,
        min_holding_hours: Number(data.min_holding_hours) || 0,

        // 🎨 Style
        preferred_timeframe: data.preferred_timeframe || 'swing',
        risk_profile: data.risk_profile || 'balanced',

        // 🧭 Strengths/Weaknesses (Aggregated)
        best_assets: Array.isArray(data.best_assets) ? data.best_assets : [], // [{ asset, lifetime_pnl_pct }]
        worst_assets: Array.isArray(data.worst_assets) ? data.worst_assets : [],
        best_sectors: Array.isArray(data.best_sectors) ? data.best_sectors : [],
        worst_sectors: Array.isArray(data.worst_sectors) ? data.worst_sectors : [],

        // 🧠 Qualitative
        strengths: Array.isArray(data.strengths) ? data.strengths : [],
        weaknesses: Array.isArray(data.weaknesses) ? data.weaknesses : [],

        // 😺 AI Behavior Archetype (The 20 Questions)
        ai_behavior_archetype: data.ai_behavior_archetype || {
            risk_tolerance: null,
            risk_capacity: null,
            maximum_acceptable_drawdown: null,
            preferred_time_horizon: null,
            strategy_style: null,
            entry_behavior_biases: null,
            exit_behavior_biases: null,
            position_sizing_preference: null,
            emotional_triggers: null,
            discipline_consistency_score: null,
            portfolio_concentration_level: null,
            sector_preferences: null,
            win_rate_perception: null, // "Win rate" (AI interpreted)
            average_rrr_perception: null, // "Average RRR" (AI interpreted)
            max_drawdown_perception: null, // "Max drawdown" (AI interpreted)
            thesis_quality_score: null,
            thesis_drift_tendency: null,
            use_of_technical_analysis: null,
            use_of_fundamental_analysis: null,
            review_journaling_habits: null
        },

        updatedAt: new Date().toISOString(),
        schemaVersion: 1
    };
};
