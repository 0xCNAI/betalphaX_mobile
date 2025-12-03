const DEBANK_PROXY_API = '/api/debank';

/**
 * Calculate Cost Basis for an asset based on history
 * @param {string} address - Wallet address
 * @param {string} chainId - Chain ID (optional, if specific)
 * @param {string} tokenId - Token ID (optional)
 * @param {string} aggregatedSymbol - Symbol to filter history by (e.g., 'ETH')
 * @returns {Promise<Object>} - { avgPrice, totalCost, confidenceLevel }
 */
export async function calculateCostBasis(address, aggregatedSymbol) {
    try {
        console.log(`[HistoryService] Calculating cost basis for ${aggregatedSymbol}...`);

        // We fetch history for all chains to be safe, or we could optimize if we knew the chain.
        // For now, let's fetch the general history list.
        // DeBank history API is paginated. We'll fetch the last 200 txs to estimate.
        // Note: Deep history analysis is expensive and slow. We do a "Best Effort" recent history scan.

        const params = {
            id: address,
            page_count: 20, // Fetch reasonable chunk
            token_id: '' // Fetch all for now, filter locally? Or can we filter by token?
            // DeBank /history_list doesn't support filtering by token_id easily in the free/pro tier unified endpoint sometimes.
            // Let's check the endpoint capability. 
            // /user/history_list supports chain_id, token_id.
        };

        // Strategy: Since we aggregated (e.g. ETH on Arb + ETH on Mainnet), 
        // we might need to fetch history for multiple tokens if we want perfection.
        // BUT, for "Smart Import", we usually focus on the main token.
        // Let's try to fetch history without token_id filter first (all history) and filter locally,
        // OR if that's too much, we just return a null state and ask user to input.

        // Better Strategy for MVP:
        // Fetch global history (limit 100) and filter for the symbol.
        // This is "Best Effort".

        const response = await fetchDeBankData('/user/history_list', params);
        const historyList = response.history_list || [];

        let totalCost = 0;
        let totalAmount = 0;
        let foundTxCount = 0;

        // Iterate backwards (oldest to newest) if possible? 
        // DeBank returns newest first.
        // FIFO logic is hard with partial history.
        // Weighted Average Cost is more robust for partial data.

        for (const tx of historyList) {
            // Check if tx involves our target symbol
            // A tx can have 'receives', 'sends'.

            // We are looking for 'receive' (Buy/In) to calculate cost.
            const receives = tx.receives || [];

            for (const token of receives) {
                if (isSymbolMatch(token.symbol, aggregatedSymbol)) {
                    // It's a buy/in
                    const price = token.price;
                    const amount = token.amount;

                    if (price && amount) {
                        totalCost += price * amount;
                        totalAmount += amount;
                        foundTxCount++;
                    }
                }
            }
        }

        if (totalAmount === 0) {
            return {
                avgPrice: null,
                totalCost: 0,
                confidenceLevel: 'none',
                message: 'No recent purchase history found'
            };
        }

        const avgPrice = totalCost / totalAmount;

        return {
            avgPrice,
            totalCost,
            confidenceLevel: foundTxCount > 5 ? 'high' : 'medium',
            scannedTxCount: historyList.length
        };

    } catch (error) {
        console.error('[HistoryService] Cost basis calculation failed:', error);
        return { avgPrice: null, error: error.message };
    }
}

// --- Helper ---

function isSymbolMatch(txSymbol, targetSymbol) {
    if (!txSymbol) return false;
    // Simple match or Family match
    // Reuse the regex logic from importService if possible, or simple check
    if (txSymbol.toUpperCase() === targetSymbol.toUpperCase()) return true;

    // Handle ETH family
    if (targetSymbol === 'ETH' && /^(W?ETH|stETH|rETH)$/i.test(txSymbol)) return true;
    if (targetSymbol === 'BTC' && /^(WBTC|BTCB)$/i.test(txSymbol)) return true;

    return false;
}

async function fetchDeBankData(path, params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `${DEBANK_PROXY_API}?path=${path}&${query}`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`DeBank API Error: ${response.statusText}`);
    }
    return await response.json();
}
