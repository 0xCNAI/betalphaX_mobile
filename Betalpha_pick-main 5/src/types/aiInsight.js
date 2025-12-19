/**
 * Factory function to create a standardized AiInsight object.
 * 
 * @param {Object} data - Partial insight data
 * @returns {Object} Complete AiInsight object
 */
export const createAiInsight = (data) => {
    return {
        schemaVersion: 1,
        userId: data.userId || '',
        type: data.type || 'weekly_review', // 'weekly_review' | 'behavior_pattern' | 'trade_replay'

        period_start: data.period_start || null,
        period_end: data.period_end || null,

        related_position_ids: Array.isArray(data.related_position_ids) ? data.related_position_ids : [],

        generatedAt: data.generatedAt || new Date().toISOString(),

        summary: data.summary || '',
        key_points: Array.isArray(data.key_points) ? data.key_points : [],
        tags: Array.isArray(data.tags) ? data.tags : [], // ['FOMO', 'Early Exit', 'Overconfident']

        ...data
    };
};
