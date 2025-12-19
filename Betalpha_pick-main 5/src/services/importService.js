import { fetchPrices } from './coinGeckoApi';

const DEBANK_PROXY_API = '/api/debank-proxy';

// Aggregation Rules
const ASSET_FAMILIES = {
    'ETH': {
        regex: /(^W?ETH$)|(^stETH$)|(^rETH$)|(^cbETH$)|(^aETH$)|(^ETHx$)/i,
        baseSymbol: 'ETH',
        name: 'Ethereum'
    },
    'BTC': {
        regex: /(^W?BTC$)|(^tBTC$)|(^BTCB$)/i,
        baseSymbol: 'BTC',
        name: 'Bitcoin'
    },
    'USDC': {
        regex: /^((a|c)?USDC(\.e|\.b)?)$/i,
        baseSymbol: 'USDC',
        name: 'USD Coin'
    },
    'USDT': {
        regex: /^((a|c)?USDT(\.e|\.b)?)$/i,
        baseSymbol: 'USDT',
        name: 'Tether'
    },
    'DAI': {
        regex: /^((a|c|s)?DAI(\.e|\.b)?)$/i,
        baseSymbol: 'DAI',
        name: 'Dai'
    }
};

const EXCLUDED_SYMBOLS = ['ETHW', 'ETF', 'BET'];

/**
 * Fetch raw assets from wallet and DeFi protocols without aggregation
 * @param {string} address - Wallet address
 * @returns {Promise<Array>} - Flat list of assets
 */
export async function fetchRawAssets(address) {
    try {
        console.log(`[ImportService] Fetching raw assets for ${address}...`);

        // 1. Parallel Fetching: Wallet Balances & DeFi Positions
        const [tokenList, protocolList] = await Promise.all([
            fetchDeBankData('/user/all_token_list', { id: address }),
            fetchDeBankData('/user/all_complex_protocol_list', { id: address })
        ]);

        // 2. Flatten DeFi Positions & Wallet Assets
        const flatAssets = [];

        // A. Add Wallet Tokens
        if (Array.isArray(tokenList)) {
            tokenList.forEach(token => {
                if (token.is_wallet) {
                    flatAssets.push({
                        ...token,
                        source: 'Wallet',
                        protocol_id: 'wallet',
                        protocolName: 'Wallet',
                        chain: token.chain,
                        isLiability: false
                    });
                }
            });
        }

        // B. Flatten Protocol Assets (Supply AND Borrow)
        if (Array.isArray(protocolList)) {
            protocolList.forEach(protocol => {
                const portfolioItemList = protocol.portfolio_item_list || [];
                portfolioItemList.forEach(item => {
                    // Handle Supply (Assets)
                    const supplyTokens = item.detail?.supply_token_list || [];
                    supplyTokens.forEach(token => {
                        flatAssets.push({
                            ...token,
                            source: protocol.name || 'DeFi',
                            protocol_id: protocol.id,
                            protocolName: protocol.name,
                            chain: protocol.chain,
                            isLiability: false
                        });
                    });

                    // Handle Borrow (Liabilities)
                    const borrowTokens = item.detail?.borrow_token_list || [];
                    borrowTokens.forEach(token => {
                        flatAssets.push({
                            ...token,
                            source: protocol.name || 'DeFi',
                            protocol_id: protocol.id,
                            protocolName: protocol.name,
                            chain: protocol.chain,
                            isLiability: true,
                            amount: -Math.abs(token.amount) // Ensure negative amount for logic
                        });
                    });
                });
            });
        }

        return flatAssets;
    } catch (error) {
        console.error('[ImportService] Fetch raw assets failed:', error);
        throw error;
    }
}

/**
 * Aggregate and normalize assets based on grouping rules
 * @param {Array} flatAssets - Flat list of assets
 * @param {Object} customMapping - Optional map of { Symbol: ParentSymbol } to override defaults
 * @param {number} minUsdThreshold - Minimum USD value to include
 * @returns {Promise<Array>} - Aggregated assets
 */
export async function aggregateAssets(flatAssets, customMapping = null, minUsdThreshold = 10) {
    try {
        // 3. Aggregation & Normalization
        const aggregatedMap = new Map();

        // Helper to get or create group
        const getGroup = (key) => {
            if (!aggregatedMap.has(key)) {
                aggregatedMap.set(key, {
                    symbol: key,
                    totalUsdValue: 0,
                    holdings: [],
                    logo_url: null,
                    price: 0
                });
            }
            return aggregatedMap.get(key);
        };

        for (const asset of flatAssets) {
            const symbol = asset.symbol?.toUpperCase();

            // Check Exclusion List
            if (EXCLUDED_SYMBOLS.includes(symbol)) continue;

            const usdValue = asset.price * asset.amount; // Will be negative for liabilities

            let groupKey = symbol;

            // Determine Group Key
            if (customMapping && customMapping[symbol]) {
                // Use Custom Mapping (from Gemini or User)
                groupKey = customMapping[symbol];
            } else {
                // Use Default Regex Rules
                for (const [familyKey, rule] of Object.entries(ASSET_FAMILIES)) {
                    if (rule.regex.test(symbol)) {
                        groupKey = rule.baseSymbol;
                        break;
                    }
                }
            }

            const group = getGroup(groupKey);

            // Accumulate Value (Net Worth)
            group.totalUsdValue += usdValue;

            // Add to breakdown
            group.holdings.push({
                symbol: asset.symbol, // rawSymbol
                rawSymbol: asset.symbol,
                amount: Math.abs(asset.amount), // Show positive amount in breakdown
                rawAmount: Math.abs(asset.amount),
                usdValue: Math.abs(usdValue), // Show positive value in breakdown
                source: asset.source,
                protocol_id: asset.protocol_id,
                protocolName: asset.protocolName,
                chain: asset.chain,
                price: asset.price,
                logo_url: asset.logo_url,
                isLiability: asset.isLiability
            });

            // Set representative logo/price if it's the base asset or first one
            if (symbol === groupKey || !group.logo_url) {
                group.logo_url = asset.logo_url;
                if (symbol === groupKey) group.price = asset.price;
            }
        }

        // 4. Finalize & Normalize
        const result = [];

        // Fetch base prices for active families if missing
        const activeFamilies = new Set();
        for (const key of aggregatedMap.keys()) {
            if (ASSET_FAMILIES[key]) activeFamilies.add(key);
        }

        let basePrices = {};
        if (activeFamilies.size > 0) {
            try {
                const prices = await fetchPrices(Array.from(activeFamilies));
                basePrices = prices;
            } catch (e) {
                console.warn('[ImportService] Failed to fetch base prices', e);
            }
        }

        for (const [key, group] of aggregatedMap.entries()) {
            // Filter by Threshold (Absolute value, to include significant debts if any?)
            // Usually we filter by net value > threshold.
            if (Math.abs(group.totalUsdValue) < minUsdThreshold) continue;

            let finalPrice = group.price;
            let finalAmount = 0;

            // Value-Based Normalization
            if (ASSET_FAMILIES[key] || (customMapping && Object.values(customMapping).includes(key))) {
                // Family Logic (either default or custom group)
                const basePriceObj = basePrices[key];
                if (basePriceObj && basePriceObj.price) {
                    finalPrice = basePriceObj.price;
                } else if (finalPrice === 0) {
                    // Fallback: Use largest holding's price
                    if (group.holdings.length > 0) {
                        const largest = group.holdings.reduce((prev, current) => (prev.usdValue > current.usdValue) ? prev : current);
                        finalPrice = largest.price;
                    }

                    // Fallback for Stablecoins if still 0
                    if (finalPrice === 0 && ['USDC', 'USDT', 'DAI', 'USD'].includes(key)) {
                        finalPrice = 1.0;
                    }
                }

                if (finalPrice > 0) {
                    finalAmount = group.totalUsdValue / finalPrice;
                }

            } else {
                // Standard Asset
                if (finalPrice === 0 && group.holdings.length > 0) {
                    finalPrice = group.holdings[0].price;
                }

                if (finalPrice > 0) {
                    finalAmount = group.totalUsdValue / finalPrice;
                } else {
                    // Fallback if price is 0 (unlikely for major assets)
                    // Just sum raw amounts (only works if all are same token)
                    finalAmount = group.holdings.reduce((sum, h) => sum + (h.isLiability ? -h.amount : h.amount), 0);
                }
            }

            result.push({
                symbol: key,
                amount: finalAmount,
                price: finalPrice,
                value_usd: group.totalUsdValue,
                logo_url: group.logo_url,
                holdings_breakdown: group.holdings,
                is_aggregated: group.holdings.length > 1
            });
        }

        // Sort by Value Descending
        result.sort((a, b) => b.value_usd - a.value_usd);

        return result;

    } catch (error) {
        console.error('[ImportService] Aggregation failed:', error);
        throw error;
    }
}

/**
 * Scan wallet and aggregate assets (Legacy Wrapper)
 * @param {string} address - Wallet address
 * @param {number} minUsdThreshold - Minimum USD value to include
 * @returns {Promise<Array>} - Aggregated assets
 */
export async function scanAndAggregate(address, minUsdThreshold = 10) {
    console.log(`[ImportService] Scanning ${address} with threshold $${minUsdThreshold}...`);
    const flatAssets = await fetchRawAssets(address);
    return aggregateAssets(flatAssets, null, minUsdThreshold);
}

// --- Helper ---

async function fetchDeBankData(path, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `${DEBANK_PROXY_API}?path=${path}&${query}`;

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
        let errorMsg = `HTTP Error: ${response.status}`;
        try {
            const errorData = JSON.parse(text);
            if (errorData && errorData.error) {
                errorMsg = `DeBank API Error: ${errorData.error}${errorData.message ? ` - ${errorData.message}` : ''}`;
            }
        } catch (e) {
            // If response is not JSON, use status text and log body
            console.error('Non-JSON Error Response:', text.substring(0, 200));
            errorMsg = `API Error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMsg);
    }

    try {
        return JSON.parse(text);
    } catch (e) {
        console.error('Invalid JSON Response:', text.substring(0, 200));
        throw new Error('Invalid API Response: Expected JSON');
    }
}
