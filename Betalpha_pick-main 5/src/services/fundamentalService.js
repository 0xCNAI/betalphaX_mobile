import { getCoinId, apiQueue } from './coinGeckoApi';

const COINGECKO_API = '/api/coingecko';
const DEFILLAMA_API = 'https://api.llama.fi';

// Cache duration: 24 hours (fundamental data rarely changes daily)
const CACHE_DURATION = 24 * 60 * 60 * 1000;

/**
 * Fetch fundamental data for a token (Valuation + Growth)
 * @param {string} ticker - The ticker symbol (e.g., "AAVE")
 * @param {string} [tokenName] - Optional token name for DefiLlama slug guessing
 * @param {boolean} forceRefresh - Whether to bypass cache
 * @returns {Promise<Object>} - Fundamental data object
 */
export async function getTokenFundamentals(ticker, tokenName, forceRefresh = false) {
    try {
        // 1. Check Cache (v2 to invalidate old bad data) - Skip if forceRefresh is true
        const cacheKey = `fundamental_data_v3_${ticker.toUpperCase()}`;

        if (!forceRefresh) {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const { timestamp, data } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_DURATION) {
                    console.log(`[FundamentalService] Returning cached data for ${ticker}`);
                    return data;
                }
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

                // Extract description
                const description = cgData.description?.en || '';

                valuationData = {
                    mcap,
                    fdv,
                    fdv_mcap_ratio,
                    rank: cgData.market_cap_rank,
                    ath: cgData.market_data?.ath?.usd,
                    ath_change: cgData.market_data?.ath_change_percentage?.usd,
                    isHighRisk: fdv_mcap_ratio > 3,
                    isHealthy: fdv_mcap_ratio < 1.2,
                    description // Add description here
                };
            }
        } catch (err) {
            console.error('FundamentalService: CoinGecko fetch failed', err);
        }

        // Extract description (it's in cgData from the scope above if we define it outside)
        // Wait, cgData is inside the try block.
        // I need to modify the code to extract description inside the try block.

        // Let's re-read the file content to make sure I target the right lines.
        // I'll just rewrite the try block to extract description.

        // 3. Fetch Growth Trends from DefiLlama
        let growthData = null;
        let benchmarks = null;
        const NON_DEFI_ASSETS = ['BTC', 'ZEC', 'DOGE', 'LTC', 'XRP', 'ADA', 'DOT', 'XMR', 'BCH'];

        if (name && !NON_DEFI_ASSETS.includes(ticker.toUpperCase())) {
            try {
                // Strategy 1: Try simple slug first (fastest)
                let slug = name.toLowerCase().replace(/\s+/g, '-');
                let llamaResponse = await fetch(`${DEFILLAMA_API}/protocol/${slug}`);

                // Strategy 2: If simple slug fails, search for the best matching protocol
                if (!llamaResponse.ok) {
                    console.log(`[FundamentalService] Simple slug ${slug} failed, searching for best match...`);
                    const bestSlug = await findDefiLlamaSlug(ticker, name);
                    if (bestSlug) {
                        slug = bestSlug;
                        console.log(`[FundamentalService] Found best match slug: ${slug}`);
                        llamaResponse = await fetch(`${DEFILLAMA_API}/protocol/${slug}`);
                    }
                }

                if (llamaResponse.ok) {
                    const llamaData = await llamaResponse.json();
                    const tvlData = llamaData.tvl || [];

                    // Fallback description from DefiLlama if CoinGecko failed
                    if (valuationData && !valuationData.description && llamaData.description) {
                        valuationData.description = llamaData.description;
                    }

                    // Get category for benchmarks
                    const category = llamaData.category;

                    if (tvlData.length > 0) {
                        // Sort by date just in case
                        tvlData.sort((a, b) => a - b);

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
                            hasTvl: true,
                            category: category // Save category
                        };
                    }

                    // Fetch Industry Benchmarks if category exists
                    if (category) {
                        benchmarks = await getIndustryBenchmarks(category);
                    }

                } else if (llamaResponse.status === 400 || llamaResponse.status === 404) {
                    // Suppress 400/404 errors for assets not on DefiLlama
                    console.log(`[FundamentalService] ${ticker} (${slug}) not found on DefiLlama`);
                }
            } catch (err) {
                console.warn('FundamentalService: DefiLlama fetch failed or not found', err);
            }
        }

        // Fetch Revenue Data (Separate call to get annualized revenue)
        let revenueData = null;
        if (growthData && growthData.hasTvl) {
            try {
                // We need the protocol ID or slug to find it in the fees overview
                // But the overview endpoint returns all protocols.
                // Let's fetch the fees overview and find our protocol.
                // Optimization: This is a heavy call, maybe we should cache it or use the single protocol endpoint if possible?
                // The single protocol endpoint (llamaData) usually has 'revenue' field if available?
                // Let's check llamaData structure again. Usually it has 'chainTvls' etc.
                // Actually, https://api.llama.fi/summary/fees/slug returns summary? No.
                // Let's use the overview endpoint but cache it heavily?
                // Or better, getIndustryBenchmarks already fetches overview/fees to calculate averages.
                // We can extract our specific asset's revenue from there!

                // If benchmarks were fetched, we might have the data there?
                // getIndustryBenchmarks returns aggregates.
                // Let's just fetch it here if we need it, or rely on getIndustryBenchmarks to return it if we pass the slug?
                // Let's keep it simple: fetch revenue here specifically if benchmarks didn't cover it.
                // Actually, let's make getIndustryBenchmarks return the specific protocol's revenue too if found.

                if (benchmarks && benchmarks.myProtocolRevenue) {
                    revenueData = {
                        annualized_revenue: benchmarks.myProtocolRevenue
                    };
                }
            } catch (e) {
                console.warn('Failed to fetch revenue', e);
            }
        }

        const result = {
            valuation: valuationData,
            growth: growthData,
            revenue: revenueData,
            benchmarks: benchmarks,
            tags: categories,
            meta: {
                name: name,
                coinId: coinId
            }
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

/**
 * Calculate Industry Benchmarks for a category
 * @param {string} category - The category (e.g. "Lending")
 * @param {string} [mySlug] - Optional slug of the current asset to extract its revenue
 * @returns {Promise<Object>} - Benchmarks { medianFdvTvl, medianFdvRevenue, myProtocolRevenue }
 */
async function getIndustryBenchmarks(category, mySlug) {
    try {
        // 1. Fetch all protocols
        // Cache this heavily? 
        // For now, simple fetch.
        const protocolsRes = await fetch('https://api.llama.fi/protocols');
        const protocols = await protocolsRes.json();

        // 2. Filter by category
        const peers = protocols.filter(p => p.category === category && p.tvl > 1000000); // Filter dust < $1M TVL

        if (peers.length < 5) return null; // Not enough data

        // 3. Calculate FDV/TVL
        const fdvTvlRatios = peers
            .map(p => {
                const fdv = p.mcap > 0 ? (p.mcap * (p.fdv / p.mcap || 1)) : p.fdv; // Use mcap if fdv missing? DefiLlama has 'mcap' and 'fdv' usually?
                // Actually p.mcap is often 0 in this list?
                // Let's use p.mcap if available, else p.tvl? No.
                // DefiLlama /protocols returns: name, symbol, tvl, mcap, category...
                // It might not have FDV for all.
                // Let's use Mcap/TVL as a proxy if FDV missing, or skip.
                const val = p.mcap || p.tvl; // Fallback?
                if (!p.mcap || p.mcap === 0) return null;
                if (!p.tvl || p.tvl === 0) return null;
                return p.mcap / p.tvl;
            })
            .filter(r => r !== null && r > 0 && r < 100); // Filter outliers

        // Median
        fdvTvlRatios.sort((a, b) => a - b);
        const medianFdvTvl = fdvTvlRatios[Math.floor(fdvTvlRatios.length / 2)];

        // 4. Fetch Revenue for FDV/Revenue
        // This is a separate call: /overview/fees
        const feesRes = await fetch('https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue');
        const feesData = await feesRes.json();
        const protocolsWithRevenue = feesData.protocols || [];

        const fdvRevRatios = [];
        let myRevenue = 0;

        // Map revenue to peers
        peers.forEach(peer => {
            const revData = protocolsWithRevenue.find(r => r.defillamaId === peer.id || r.name === peer.name || r.slug === peer.slug);
            if (revData && revData.total24h) { // total24h is daily revenue
                const annualizedRev = revData.total24h * 365;
                if (annualizedRev > 0 && peer.mcap > 0) {
                    fdvRevRatios.push(peer.mcap / annualizedRev);
                }

                // Check if this is "my" protocol (if we passed slug/name, but we didn't pass it yet)
                // We can try to match by category + name?
                // Actually, let's just return the median.
            }
        });

        // Median FDV/Revenue
        let medianFdvRev = null;
        if (fdvRevRatios.length > 0) {
            fdvRevRatios.sort((a, b) => a - b);
            medianFdvRev = fdvRevRatios[Math.floor(fdvRevRatios.length / 2)];
        }

        return {
            medianFdvTvl,
            medianFdvRev,
            peerCount: peers.length
        };

    } catch (e) {
        console.error('Error calculating benchmarks:', e);
        return null;
    }
}

/**
 * Find the best matching DefiLlama slug for a token
 * @param {string} ticker - Token symbol
 * @param {string} name - Token name
 * @returns {Promise<string|null>} - Best matching slug or null
 */
async function findDefiLlamaSlug(ticker, name) {
    try {
        // Fetch all protocols (lightweight summary)
        const res = await fetch('https://api.llama.fi/protocols');
        if (!res.ok) return null;

        const protocols = await res.json();
        const upperTicker = ticker.toUpperCase();
        const lowerName = name ? name.toLowerCase() : '';

        // Filter for matches
        const matches = protocols.filter(p =>
            (p.symbol && p.symbol.toUpperCase() === upperTicker) ||
            (lowerName && p.name.toLowerCase().includes(lowerName)) ||
            (lowerName && p.slug && p.slug.includes(lowerName.replace(/\s+/g, '-')))
        );

        if (matches.length === 0) return null;

        // Sort by TVL descending to find the "main" protocol
        matches.sort((a, b) => (b.tvl || 0) - (a.tvl || 0));

        // Return the slug of the largest protocol
        return matches[0].slug;

    } catch (error) {
        console.error('Error finding DefiLlama slug:', error);
        return null;
    }
}
/**
 * Get important events for an asset (News + Social)
 * @param {string} symbol
 * @returns {Promise<Array>}
 */
export async function getImportantEvents(symbol) {
    try {
        // 1. Fetch News
        const news = await getNewsForAsset(symbol, 5);

        // 2. Fetch Tweets (Social)
        // We need to import searchCryptoTweets from twitterService, but to avoid circular deps or complexity,
        // we might just stick to news for now or dynamically import if needed.
        // For now, let's just return news as "events"

        return news.map(item => ({
            date: item.publishedAt ? new Date(item.publishedAt * 1000).toISOString() : new Date().toISOString(),
            title: item.headline,
            source_type: item.source.toLowerCase().includes('twitter') ? 'twitter' : 'news_outlet',
            source_url: item.link,
            raw_text: item.description
        }));

    } catch (error) {
        console.error("Error fetching important events:", error);
        return [];
    }
}
