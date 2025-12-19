/**
 * @typedef {'manual' | 'highlight'} NoteCategory
 * @typedef {'feed_guardian_opportunity' | 'feed_guardian_risk' | 'asset_important_event' | 'asset_social_tweet' | 'manual'} NoteSourceType
 *
 * @typedef {Object} NoteSourceRef
 * @property {string | null} [asset]     // asset symbol, e.g. 'ALCX'
 * @property {string | null} [group]     // 'opportunity' | 'risk' | 'event' | 'social'
 * @property {string | null} [externalId]// tweet id, news id, or synthetic id
 * @property {string | null} [meta]      // optional JSON-encoded extra info
 */

/**
 * @typedef {Object} Note
 * @property {string} id - Unique identifier
 * @property {string} userId - User ID
 * @property {'general' | 'token'} type - Type of note
 * @property {string} content - Note content
 * @property {string} date - ISO date string (YYYY-MM-DD)
 * @property {string | null} [asset] - Asset symbol (e.g., 'BTC') - REQUIRED for highlights
 * @property {string | null} [coinId] - CoinGecko ID (e.g., 'bitcoin') - SHOULD be set when available
 * @property {string} createdAt - ISO timestamp
 * @property {string | null} [updatedAt] - ISO timestamp
 * @property {'note'} kind - Discriminator for mixed lists
 * 
 * @property {string | null} [title]         // short label (for highlight summary)
 * @property {NoteCategory} [noteCategory]   // 'manual' | 'highlight'
 * @property {NoteSourceType} [sourceType]   // where this note/highlight came from
 * @property {NoteSourceRef | null} [sourceRef]
 * @property {number} [importance]           // 1–5, default 3
 * @property {boolean} [forTraining]         // default false
 * @property {string[]} [tags]               // e.g. ['narrative', 'risk', 'social']
 */

export const createNote = (data) => {
    return {
        userId: data.userId || '',

        // Context
        asset: data.asset ? data.asset.toUpperCase() : null,
        coinId: data.coinId || null,
        txId: data.txId || null,

        // Content
        type: data.type || 'journal',
        title: data.title || '',
        content: data.content || '',
        kind: 'note',

        // Metadata
        noteCategory: data.noteCategory || 'manual',
        sourceType: data.sourceType || 'manual',
        sourceRef: data.sourceRef || null,

        importance: typeof data.importance === 'number' ? data.importance : 3,
        forTraining: typeof data.forTraining === 'boolean' ? data.forTraining : false,
        tags: Array.isArray(data.tags) ? data.tags : [],

        // Timestamps
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt || new Date().toISOString(),

        schemaVersion: 1
    };
};
