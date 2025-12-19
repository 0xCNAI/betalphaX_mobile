import { getCoinMetadata, getCoinId } from './coinGeckoApi';
import { getUserTrackingList } from './userService';
import { getTrackedFeed } from './socialService';
import { getNewsDashboard } from './twitterService';
import { analyzeMaximumRisk, analyzeProfitTarget, analyzePotentialOpportunity } from './guardianAnalysis';

/**
 * Pre-fetches all necessary data for a list of assets to power the Feed Dashboard
 * and cache data for Asset Pages.
 * 
 * @param {string[]} assets - List of asset symbols (e.g., ['BTC', 'ETH'])
 * @param {object} user - User object (for tracking lists)
 * @param {object} transactions - All transactions (for Guardian analysis)
 * @param {object} prices - Current price map (for Guardian analysis)
 * @param {boolean} forceRefresh - Whether to bypass API caches
 * @returns {Promise<object>} - Map of { [symbol]: { social, events, guardian, timestamp } }
 */
export const prefetchAssetData = async (assets, user, transactions, prices, forceRefresh = false, onProgress = () => { }) => {
    const results = {};
    const timestamp = Date.now();

    onProgress("Initializing analysis...");

    // Process assets in parallel batches to avoid browser limits/timeouts
    // but ensures we don't spam APIs too hard if the list is huge.
    // For now, simple Promise.all is likely fine for < 10 assets.

    const totalAssets = assets.length;
    let completedCount = 0;

    const promises = assets.map(async (symbol) => {
        try {
            // 1. Prepare Data
            // 1. Prepare Data
            onProgress(`Fetching metadata for ${symbol}...`);
            const coinId = await getCoinId(symbol) || symbol; // Fallback to symbol if ID not found

            // Ensure coinId is valid string for cache keys/api
            let metadata = null;
            if (coinId) {
                metadata = await getCoinMetadata(coinId);
            }

            const projectHandle = metadata?.twitterHandle;
            const tokenName = metadata?.name;
            const userList = user ? await getUserTrackingList(user.uid, symbol) : [];

            // 2. Fetch Data in Parallel
            onProgress(`Scanning ${symbol} signals...`);

            // Allow individual updates to be "noisy" in the UI or just stick to "Analyzing X..."

            const [socialFeed, eventsData, risk, profit, opportunity] = await Promise.all([
                // Social
                getTrackedFeed(symbol, userList, projectHandle, tokenName).catch(e => []),
                // Events (Twitter News Dashboard)
                getNewsDashboard(symbol, forceRefresh, 'feeds').catch(e => null),
                // Guardian
                analyzeMaximumRisk(symbol, transactions.filter(t => t.asset === symbol), prices[symbol]?.price || 0).catch(e => null),
                analyzeProfitTarget(symbol, transactions.filter(t => t.asset === symbol), prices[symbol]?.price || 0).catch(e => null),
                analyzePotentialOpportunity(symbol, transactions.filter(t => t.asset === symbol), prices[symbol]?.price || 0).catch(e => null)
            ]);

            // 3. Construct Result Object
            const assetData = {
                symbol,
                timestamp,
                logo: metadata?.image || null, // Prioritize fetched image
                price: prices[symbol] || {},
                // Keep raw data for debugging/fallback
                raw: { social: socialFeed, events: eventsData, guardian: { risk, profit, opportunity } },

                // UNIFIED INTELLIGENCE AGGREGATION
                intelligence: {
                    risks: [],
                    opportunities: [],
                    riskCount: 0,
                    opportunityCount: 0
                }
            };

            // --- MERGE LOGIC ---

            // A. Merge Risks
            // 1. From API (News/Social)
            if (eventsData?.risks && Array.isArray(eventsData.risks)) {
                assetData.intelligence.risks.push(...eventsData.risks);
            }
            // 2. From Guardian (TA)
            if (risk && (risk.level === 'high' || risk.level === 'danger')) {
                assetData.intelligence.risks.push({
                    signal: `Technical Warning: ${risk.message}`,
                    category: 'TA',
                    sources: [] // Internal calculation
                });
            }

            // B. Merge Opportunities
            // 1. From API (News/Social)
            if (eventsData?.opportunities && Array.isArray(eventsData.opportunities)) {
                assetData.intelligence.opportunities.push(...eventsData.opportunities);
            }
            // 2. From Guardian (TA)
            if (opportunity?.hasOpportunity) {
                assetData.intelligence.opportunities.push({
                    signal: `Technical Setup: ${opportunity.message}`,
                    category: 'TA',
                    sources: []
                });
            }
            // 3. From Viral Social (Fallback if not in API)
            const viralTweet = socialFeed?.find(t => (t.likes || 0) > 1000);
            if (viralTweet) {
                // Check if already covered? simplified for now
                assetData.intelligence.opportunities.push({
                    signal: `Viral Activity: Extremely high engagement detected.`,
                    category: 'Sentiment',
                    sources: [{ handle: viralTweet.name, url: viralTweet.url }]
                });
            }

            // C. Counts
            assetData.intelligence.riskCount = assetData.intelligence.risks.length;
            assetData.intelligence.opportunityCount = assetData.intelligence.opportunities.length;

            // 4. Cache individually for Asset Page access
            localStorage.setItem(`cache_asset_${symbol}`, JSON.stringify(assetData));

            results[symbol] = assetData;

            completedCount++;
            onProgress(`Analyzed ${symbol} (${completedCount}/${totalAssets})`);

        } catch (error) {
            console.error(`Failed to prefetch data for ${symbol}`, error);
            results[symbol] = { error: true, symbol };
            completedCount++;
            onProgress(`Error analyzing ${symbol} (${completedCount}/${totalAssets})`);
        }
    });

    onProgress("Finalizing Intelligence Report...");
    await Promise.all(promises);
    return results;
};
