/**
 * Factory function to create a standardized Transaction object.
 * Enforces schema version 2 and initializes all fields.
 * 
 * @param {Object} data - Partial transaction data
 * @returns {Object} Complete Transaction object
 */
export const createTransaction = (data) => {
    return {
        userId: data.userId || '',
        asset: data.asset ? data.asset.toUpperCase() : '',
        chain: data.chain || null,
        type: data.type || 'buy',
        amount: Number(data.amount) || 0,
        price: Number(data.price) || 0,
        status: data.status || 'open',
        // Time Fields
        date: data.date || new Date().toISOString().split('T')[0], // YYYY-MM-DD
        timestamp: data.timestamp || new Date().toISOString(), // ISO String for sorting
        createdAt: data.createdAt || new Date().toISOString(), // Creation time

        // Position / Grouping
        positionId: data.positionId || null,
        entryIndex: data.entryIndex || null,

        // Notes
        memo: data.memo || '',
        exitMemo: data.exitMemo || '',
        tags: Array.isArray(data.tags) ? data.tags : [],
        exitTags: Array.isArray(data.exitTags) ? data.exitTags : [],

        // Emotion
        confidence: data.confidence || null,
        emotion: data.emotion || null,

        // AI Fields
        ai_entry_summary: data.ai_entry_summary || null,
        ai_exit_plan: data.ai_exit_plan || null,
        ai_risk_comment: data.ai_risk_comment || null,

        // AI Technical Analysis Snapshot
        ai_ta_snapshot: data.ai_ta_snapshot || {
            short_term: {
                trend: null, // "bullish", "bearish", "neutral"
                support: null,
                resistance: null
            },
            long_term: {
                trend: null,
                support: null,
                resistance: null
            },
            overall_verdict: null, // "buy", "sell", "hold"
            volatility_comment: null
        },

        // AI Fundamental Insights (New Step 4)
        ai_fundamental_insights: data.ai_fundamental_insights || {
            items: [], // { title, body, tag, confidence }
            user_approved: false,
            generated_at: null
        },

        // Important Events Snapshot (New Step 4)
        important_events_snapshot: data.important_events_snapshot || {
            items: [], // { date, title, source_type, source_url, raw_text }
            user_approved: false,
            generated_at: null
        },

        // AI Event Insights (New Step 4)
        ai_events_insights: data.ai_events_insights || {
            items: [], // { event_index, impact, impact_direction, ai_comment }
            user_approved: false,
            generated_at: null
        },

        // Market Context
        market_context_snapshot: data.market_context_snapshot || {
            timestamp: Date.now(),
            // Global Market
            btcDominance: null,
            fearAndGreedIndex: null,
            globalMarketCapChange: null,
            marketSentiment: null,
            topSector: null,
            // Token Level
            fdv_ratio: null,
            tvl_trend_30d: null,
            sector_tags: [],
            // Price / TA
            price: null,
            price_change_24h: null,
            rsi_1h: null,
            rsi_4h: null,
            rsi_1d: null,
            macd_1h: null,
            macd_4h: null,
            structure_4h: null,
            structure_1d: null,
            near_level: null,
            // Narrative
            narratives: [],
            news_sentiment: null,
            social_buzz_level: null
        },

        // Result
        closeDate: data.closeDate || null,
        closePrice: data.closePrice || null,
        pnl: Number(data.pnl) || 0,
        pnl_abs: data.pnl_abs || null,
        pnl_pct: data.pnl_pct || null,
        respected_plan: data.respected_plan || null,

        // Legacy / Other
        reasons: Array.isArray(data.reasons) ? data.reasons : [],
        sellSignals: Array.isArray(data.sellSignals) ? data.sellSignals : [],

        // Preserve any other fields passed in (for backward compatibility)
        ...data,

        // Force schema version (override any passed version)
        schemaVersion: 2
    };
};
