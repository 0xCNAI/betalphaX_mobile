import React, { createContext, useState, useContext, useEffect } from 'react';
import { useTransactions } from './TransactionContext';
import { getPricesForTickers, getPriceForTicker } from '../services/priceService';

const PriceContext = createContext();

export const usePrices = () => useContext(PriceContext);

export const PriceProvider = ({ children }) => {
    const { transactions } = useTransactions();
    const [prices, setPrices] = useState(() => {
        // Initialize from localStorage if available
        try {
            const cached = localStorage.getItem('priceCache');
            return cached ? JSON.parse(cached) : {};
        } catch (e) {
            return {};
        }
    });
    const [icons, setIcons] = useState(() => {
        // Initialize icons from localStorage
        try {
            const cached = localStorage.getItem('iconCache');
            return cached ? JSON.parse(cached) : {};
        } catch (e) {
            return {};
        }
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdate, setLastUpdate] = useState(null);

    // Extract unique tickers from transactions + default popular ones
    const defaultTickers = ['BTC', 'ETH', 'SOL'];
    const userTickers = transactions.map(tx => tx.asset);
    const tickers = [...new Set([...defaultTickers, ...userTickers])];

    const refreshPrices = async (silent = false) => {
        if (tickers.length === 0) {
            setLoading(false);
            return;
        }

        // Optimistic: If we have prices, don't show loading spinner (Stale-While-Revalidate)
        const hasData = Object.keys(prices).length > 0;
        if (!silent && !hasData) setLoading(true);

        // Debounce: Don't fetch if updated less than 10 seconds ago (unless forced/initial)
        if (lastUpdate && (Date.now() - lastUpdate.getTime() < 10000) && !silent) {
            setLoading(false);
            return;
        }

        try {
            const newPrices = await getPricesForTickers(tickers);

            // Merge with existing prices
            setPrices(prev => {
                const updated = { ...prev, ...newPrices };
                // Save to localStorage
                localStorage.setItem('priceCache', JSON.stringify(updated));
                return updated;
            });

            setLastUpdate(new Date());
            setError(null);
        } catch (err) {
            console.error('[PriceContext] Error refreshing prices:', err);
            // Don't set global error if we have cached data, just log it
            if (Object.keys(prices).length === 0) {
                setError('Failed to fetch prices');
            }
        } finally {
            setLoading(false);
        }
    };

    // Fetch icon for a specific ticker
    const fetchIcon = async (ticker) => {
        if (!ticker) return null;
        const upperTicker = ticker.toUpperCase();

        // Check cache first
        if (icons[upperTicker]) {
            return icons[upperTicker];
        }

        try {
            const { searchCoin } = await import('../services/coinGeckoApi');
            const coinData = await searchCoin(ticker);

            if (coinData && coinData.thumb) {
                const iconUrl = coinData.thumb;
                setIcons(prev => {
                    const updated = { ...prev, [upperTicker]: iconUrl };
                    localStorage.setItem('iconCache', JSON.stringify(updated));
                    return updated;
                });
                return iconUrl;
            }
        } catch (error) {
            // Suppress 429 errors for icons to avoid console noise
            if (error.message && error.message.includes('429')) {
                // Silently fail or log debug only
                // console.debug(`[PriceContext] Rate limited fetching icon for ${ticker}`);
            } else {
                console.error(`[PriceContext] Error fetching icon for ${ticker}:`, error);
            }
        }

        return null;
    };

    // Initial fetch and auto-refresh
    useEffect(() => {
        refreshPrices();

        const interval = setInterval(() => {
            refreshPrices(true); // Silent refresh
        }, 30000); // 30 seconds

        return () => clearInterval(interval);
    }, [JSON.stringify(tickers)]); // Re-fetch when tickers change

    // Fetch icons for all tickers
    useEffect(() => {
        tickers.forEach(ticker => {
            if (!icons[ticker.toUpperCase()]) {
                fetchIcon(ticker);
            }
        });
    }, [JSON.stringify(tickers)]);

    const getPrice = (ticker) => {
        if (!ticker) return { price: 0, change24h: 0 };
        const upperTicker = ticker.toUpperCase();
        return prices[upperTicker] || { price: 0, change24h: 0 };
    };

    const getIcon = (ticker) => {
        if (!ticker) return null;
        const upperTicker = ticker.toUpperCase();
        return icons[upperTicker] || null;
    };

    return (
        <PriceContext.Provider value={{
            prices,
            loading,
            error,
            lastUpdate,
            refreshPrices: () => refreshPrices(false),
            getPrice,
            getIcon,
            fetchIcon,
            fetchPriceForTicker: async (ticker) => {
                // Direct fetch for a specific ticker (e.g. in forms)
                const data = await getPriceForTicker(ticker);
                if (data) {
                    setPrices(prev => ({ ...prev, [ticker.toUpperCase()]: data }));
                }
                return data;
            }
        }}>
            {children}
        </PriceContext.Provider>
    );
};
