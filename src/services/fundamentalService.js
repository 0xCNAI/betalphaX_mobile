import { getCoinId, apiQueue } from './coinGeckoApi';

const COINGECKO_API = '/api/coingecko';
const DEFILLAMA_API = 'https://api.llama.fi';

// Cache duration: 1 hour (reduced API calls to avoid 429 errors)
const CACHE_DURATION = 60 * 60 * 1000;

/**
 * Fetch fundamental data for a token (Valuation + Growth)
 * @param {string} ticker - The ticker symbol (e.g., "AAVE")
 * @param {string} [tokenName] - Optional token name for DefiLlama slug guessing
 * @returns {Promise<Object>} - Fundamental data object
 */
export async function getTokenFundamentals(ticker, tokenName) {
    try {
        // 1. Check Cache (v2 to invalidate old bad data)
        const cacheKey = `fundamental_data_v2_${ticker.toUpperCase()}`;
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) {
                console.log(`[FundamentalService] Returning cached data for ${ticker}`);
                return data;
            }
        }

        const coinId = await getCoinId(ticker);
        console.log(`[FundamentalService] Fetching for ${ticker} -> ID: ${coinId}`);

        if (!coinId) {
            console.warn(`[FundamentalService] No CoinGecko ID found for ${ticker}`);
            return null;
        }

        // 2. Fetch Valuation from CoinGecko
        let valuationData = null;
        let categories = [];
        let name = tokenName;

        try {
            // Use shared apiQueue for rate limiting
            const cgResponse = await apiQueue.add(async () => {
                const res = await fetch(
                    `${COINGECKO_API}/coins/${coinId}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false`
                );
                if (res.status === 429) throw new Error('Rate limited');
                return res;
            });

            if (cgResponse.ok) {
                const cgData = await cgResponse.json();
                name = cgData.name; // Use official name from CG if available
                categories = cgData.categories || [];

                const mcap = cgData.market_data?.market_cap?.usd || 0;
                const fdv = cgData.market_data?.fully_diluted_valuation?.usd || mcap; // Fallback to mcap if FDV missing

                const fdv_mcap_ratio = mcap > 0 ? (fdv / mcap) : 0;

                valuationData = {
                    mcap,
                    fdv,
                    fdv_mcap_ratio,
                    isHighRisk: fdv_mcap_ratio > 3,
                    isHealthy: fdv_mcap_ratio < 1.2
                };
            }
        } catch (err) {
            console.error('FundamentalService: CoinGecko fetch failed', err);
        }

        // 3. Fetch Growth Trends from DefiLlama
        let growthData = null;
        if (name) {
            try {
                // Simple slug strategy: lowercase and replace spaces with dashes
                const slug = name.toLowerCase().replace(/\s+/g, '-');

                const llamaResponse = await fetch(`${DEFILLAMA_API}/protocol/${slug}`);

                if (llamaResponse.ok) {
                    const llamaData = await llamaResponse.json();
                    const tvlData = llamaData.tvl || [];

                    if (tvlData.length > 0) {
                        // Sort by date just in case
                        tvlData.sort((a, b) => a.date - b.date);

                        const currentTvl = tvlData[tvlData.length - 1].totalLiquidityUSD;

                        // Find data point ~30 days ago
                        const now = Date.now() / 1000;
                        const thirtyDaysAgo = now - (30 * 24 * 60 * 60);

                        // Find closest data point to 30 days ago
                        const oldTvlData = tvlData.find(d => d.date >= thirtyDaysAgo);
                        const oldTvl = oldTvlData ? oldTvlData.totalLiquidityUSD : currentTvl;

                        const changePercent = oldTvl > 0
                            ? ((currentTvl - oldTvl) / oldTvl) * 100
                            : 0;

                        growthData = {
                            tvl_current: currentTvl,
                            tvl_30d_change_percent: changePercent,
                            hasTvl: true
                        };
                    }
                }
            } catch (err) {
                console.warn('FundamentalService: DefiLlama fetch failed or not found', err);
            }
        }

        const result = {
            valuation: valuationData,
            growth: growthData,
            tags: categories
        };

        // 4. Save to Cache
        if (valuationData || growthData) {
            localStorage.setItem(cacheKey, JSON.stringify({
                timestamp: Date.now(),
                data: result
            }));
        }

        return result;

    } catch (error) {
        console.error('FundamentalService: Error fetching fundamentals', error);
        return null;
    }
}
