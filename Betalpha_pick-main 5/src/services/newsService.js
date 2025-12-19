/**
 * Service to fetch real crypto news from CryptoCompare API
 * Falls back to smart mock data if API fails
 */

const CRYPTOCOMPARE_NEWS_API = 'https://min-api.cryptocompare.com/data/v2/news/';

const SOURCES = [
    "CoinDesk",
    "CoinTelegraph",
    "Decrypt",
    "The Block",
    "CryptoSlate",
    "Bloomberg Crypto"
];

const MOCK_TEMPLATES = {
    BTC: [
        { headline: "Bitcoin ETF inflows reach record high of $500M this week.", description: "Institutional investors continue to show strong interest in Bitcoin ETFs, with net inflows reaching unprecedented levels. Analysts suggest this trend indicates growing mainstream acceptance." },
        { headline: "MicroStrategy acquires additional 12,000 BTC.", description: "The business intelligence firm continues its aggressive Bitcoin accumulation strategy, bringing total holdings to over 150,000 BTC. CEO Michael Saylor remains bullish on long-term prospects." },
        { headline: "Hash rate hits new all-time high as miners expand.", description: "Bitcoin network security reaches new peak as mining operations expand globally. The rising hash rate demonstrates continued confidence in the network despite market volatility." },
        { headline: "SEC comments on Bitcoin spot ETF applications.", description: "Regulatory developments continue as the SEC provides feedback on pending spot ETF applications. Market participants await clarity on approval timeline." },
        { headline: "Bitcoin dominance rises to 54% amidst altcoin volatility.", description: "Bitcoin's market share increases as investors rotate into the leading cryptocurrency during uncertain market conditions. Altcoins face selling pressure." }
    ],
    ETH: [
        { headline: "Ethereum Foundation announces date for next major upgrade.", description: "The Ethereum development team sets timeline for upcoming network improvements focused on scalability and efficiency. Stakeholders prepare for transition." },
        { headline: "Layer 2 TVL surpasses $20B on Ethereum network.", description: "Total value locked in Ethereum Layer 2 solutions reaches new milestone, demonstrating growing adoption of scaling solutions. Arbitrum and Optimism lead growth." },
        { headline: "Vitalik Buterin proposes new EIP to lower gas fees.", description: "Ethereum co-founder introduces improvement proposal aimed at reducing transaction costs for users. Community discussion underway." },
        { headline: "Major bank launches stablecoin on Ethereum blockchain.", description: "Traditional financial institution enters crypto space with USD-backed stablecoin on Ethereum. Move signals growing institutional adoption." },
        { headline: "Ethereum staking participation reaches new milestone.", description: "Over 25% of total ETH supply now staked, securing the proof-of-stake network. Staking rewards remain attractive to long-term holders." }
    ],
    SOL: [
        { headline: "Solana network uptime reaches 99.99% over last quarter.", description: "Network stability improvements show results as Solana maintains near-perfect uptime. Previous outage concerns appear addressed by recent upgrades." },
        { headline: "New DeFi protocol on Solana attracts $100M in first week.", description: "Innovative decentralized finance application launches on Solana, quickly gaining traction. High throughput and low fees drive user adoption." },
        { headline: "Solana mobile phone pre-orders exceed expectations.", description: "Saga smartphone sees strong demand from crypto-native users. Device integrates Web3 features and secure key storage." },
        { headline: "NFT volume on Solana flips Ethereum for the first time.", description: "Solana-based NFT marketplaces process higher trading volume than Ethereum counterparts. Lower fees attract creators and collectors." },
        { headline: "Major partnership announced with Visa for USDC settlement.", description: "Payment giant integrates Solana for stablecoin transactions, enabling faster and cheaper cross-border payments." }
    ],
    ZEC: [
        { headline: "Zcash upgrade enhances privacy features and scalability.", description: "Latest network upgrade introduces improved shielded transactions and performance optimizations. Privacy advocates celebrate enhanced anonymity features." },
        { headline: "Exchange delisting concerns impact ZEC price action.", description: "Regulatory pressure on privacy coins leads to exchange delistings in certain jurisdictions. Community debates path forward for privacy-focused cryptocurrencies." },
        { headline: "Zcash Foundation announces new development roadmap.", description: "Non-profit organization outlines plans for protocol improvements and ecosystem growth. Focus on user experience and merchant adoption." },
        { headline: "Privacy coin regulations tighten in European markets.", description: "New compliance requirements affect Zcash and other privacy-focused cryptocurrencies. Exchanges implement stricter KYC procedures." },
        { headline: "Zcash mining profitability declines amid market conditions.", description: "Reduced block rewards and price pressure impact miner economics. Some operations consolidate or shut down." }
    ],
    generic: [
        { headline: "Regulatory clarity emerging in key Asian markets.", description: "Several Asian countries announce comprehensive cryptocurrency frameworks. Industry welcomes clear guidelines for compliance." },
        { headline: "Institutional interest growing despite market chop.", description: "Hedge funds and family offices continue allocating to digital assets. Long-term investment thesis remains intact." },
        { headline: "Major exchange announces new listing requirements.", description: "Leading cryptocurrency exchange updates token listing criteria with focus on compliance and project quality." },
        { headline: "Global macro headwinds affecting crypto asset prices.", description: "Interest rate concerns and economic uncertainty create challenging environment for risk assets including cryptocurrencies." },
        { headline: "Venture capital funding for crypto startups sees uptick.", description: "Investment in blockchain and cryptocurrency companies rebounds after prolonged downturn. Infrastructure projects attract capital." }
    ]
};

/**
 * Fetch real news from CryptoCompare API
 * @param {string} ticker - Asset symbol (e.g., BTC)
 * @returns {Promise<Array>} - Array of news items with source and link
 */
async function fetchRealNews(ticker) {
    try {
        const upperTicker = ticker.toUpperCase();
        const response = await fetch(
            `${CRYPTOCOMPARE_NEWS_API}?lang=EN&categories=${upperTicker}`
        );

        if (!response.ok) {
            throw new Error('CryptoCompare API error');
        }

        const data = await response.json();

        if (data.Data && data.Data.length > 0) {
            return data.Data.slice(0, 5).map(article => {
                // Truncate description to 30 words
                let description = article.body || '';
                const words = description.split(' ');
                if (words.length > 30) {
                    description = words.slice(0, 30).join(' ') + '...';
                }

                return {
                    headline: article.title,
                    description: description,
                    source: article.source_info?.name || article.source || 'Crypto News',
                    link: article.url || article.guid,
                    publishedAt: article.published_on
                };
            });
        }

        return null;
    } catch (error) {
        console.warn('Failed to fetch real news:', error);
        return null;
    }
}

/**
 * Generate mock news as fallback
 * @param {string} ticker - Asset symbol
 * @param {number} count - Number of headlines
 * @returns {Array}
 */
function generateMockNews(ticker, count = 5) {
    const upperTicker = ticker.toUpperCase();
    const specificTemplates = MOCK_TEMPLATES[upperTicker] || [];
    const genericTemplates = MOCK_TEMPLATES.generic;

    const allTemplates = [...specificTemplates, ...genericTemplates];
    const shuffled = allTemplates.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count);

    return selected.map(item => ({
        headline: item.headline,
        description: item.description,
        source: SOURCES[Math.floor(Math.random() * SOURCES.length)],
        link: null
    }));
}

/**
 * Get news headlines for a specific asset
 * @param {string} ticker - Asset symbol (e.g., BTC)
 * @param {number} count - Number of headlines to return
 * @param {boolean} forceRefresh - Whether to bypass cache and fetch fresh data
 * @returns {Promise<Array<Object>>} - Array of news objects with headline, source, link
 */
export const getNewsForAsset = async (ticker, count = 5, forceRefresh = false) => {
    const upperTicker = ticker.toUpperCase();
    const CACHE_KEY = `news_cache_${upperTicker}`;
    const CACHE_TTL = 60 * 60 * 1000; // 1 hour

    // 1. Check Cache
    if (!forceRefresh) {
        try {
            const cached = localStorage.getItem(CACHE_KEY);
            if (cached) {
                const { data, timestamp } = JSON.parse(cached);
                if (Date.now() - timestamp < CACHE_TTL) {
                    console.log(`[NewsService] Returning cached news for ${upperTicker}`);
                    return data.slice(0, count);
                }
            }
        } catch (e) {
            console.warn('Failed to read news cache:', e);
        }
    }

    // 2. Fetch Fresh Data
    // Try to fetch real news first
    const realNews = await fetchRealNews(ticker);

    let newsItems;
    if (realNews && realNews.length > 0) {
        newsItems = realNews;
    } else {
        // Fallback to mock news
        newsItems = generateMockNews(ticker, count);
    }

    // 3. Save to Cache
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: newsItems,
            timestamp: Date.now()
        }));
    } catch (e) {
        console.warn('Failed to save news cache:', e);
    }

    // Return structured objects for UI rendering
    return newsItems.slice(0, count);
};
