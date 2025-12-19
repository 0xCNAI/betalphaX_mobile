import React, { useState, useEffect } from 'react';
import { AdvancedRealTimeChart } from 'react-ts-tradingview-widgets';
import { Settings, RefreshCw } from 'lucide-react';

const EXCHANGES = ['BINANCE', 'COINBASE', 'KRAKEN', 'BYBIT', 'OKX', 'KUCOIN'];

const TradingViewChart = ({ symbol, theme = 'dark', height = 400 }) => {
    // Parse initial symbol to extract exchange and ticker if present
    const parseInitialSymbol = (sym) => {
        if (sym.includes(':')) {
            const [ex, ticker] = sym.split(':');
            return { exchange: ex, ticker: ticker };
        }
        // If no colon, treat as "Auto" exchange (let TradingView decide)
        // unless it's a raw ticker like "BTC", then we might want to default to Binance later.
        // But for "FLUIDUSDT", we want Auto.
        return { exchange: 'AUTO', ticker: sym };
    };

    const initial = parseInitialSymbol(symbol);
    const [exchange, setExchange] = useState(initial.exchange);
    const [internalTicker, setInternalTicker] = useState(initial.ticker);
    const [showSettings, setShowSettings] = useState(false);
    const [chartKey, setChartKey] = useState(0);

    // Reset when prop changes
    useEffect(() => {
        const parsed = parseInitialSymbol(symbol);
        setExchange(parsed.exchange);
        setInternalTicker(parsed.ticker);
        setChartKey(prev => prev + 1);
    }, [symbol]);

    const handleExchangeChange = (newExchange) => {
        setExchange(newExchange);
        setChartKey(prev => prev + 1);
        setShowSettings(false);
    };

    const constructSymbol = () => {
        let tickerBase = internalTicker;

        // If Auto, just return the ticker (e.g. "FLUIDUSDT")
        if (exchange === 'AUTO') {
            // If it's a raw ticker like "BTC" (no pair), append USDT for safety
            if (!tickerBase.includes('USD')) {
                return `${tickerBase}USDT`;
            }
            return tickerBase;
        }

        // ... existing logic for specific exchanges ...
        if ((exchange === 'COINBASE' || exchange === 'KRAKEN') && tickerBase.endsWith('USDT')) {
            tickerBase = tickerBase.replace('USDT', 'USD');
        }

        if (exchange === 'BINANCE' && tickerBase.endsWith('USD') && !tickerBase.endsWith('USDT')) {
            tickerBase = tickerBase + 'T';
        }

        // If the original prop didn't have a colon, it was just "BTC".
        // In that case internalTicker is "BTC".
        // We need to append the quote currency.
        if (!symbol.includes(':') && !tickerBase.includes('USD')) {
            if (exchange === 'COINBASE' || exchange === 'KRAKEN') {
                return `${exchange}:${tickerBase}USD`;
            }
            return `${exchange}:${tickerBase}USDT`;
        }

        return `${exchange}:${tickerBase}`;
    };

    return (
        <div className="tradingview-container" style={{ position: 'relative', width: '100%', minWidth: 0, overflow: 'hidden', height: height, marginBottom: '16px' }}>

            {/* Controls Overlay */}
            <div style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                zIndex: 10,
                display: 'flex',
                gap: '8px'
            }}>
                <button
                    onClick={() => setShowSettings(!showSettings)}
                    style={{
                        background: 'rgba(30, 41, 59, 0.8)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '4px',
                        padding: '4px',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                    title="Change Exchange"
                >
                    <Settings size={16} />
                </button>
            </div>

            {/* Exchange Selector Dropdown */}
            {showSettings && (
                <div style={{
                    position: 'absolute',
                    top: '40px',
                    right: '10px',
                    zIndex: 20,
                    background: '#1e293b',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.5)'
                }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px', padding: '0 4px' }}>
                        Select Source
                    </div>
                    {EXCHANGES.map(ex => (
                        <button
                            key={ex}
                            onClick={() => handleExchangeChange(ex)}
                            style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                padding: '6px 12px',
                                background: exchange === ex ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                                color: exchange === ex ? '#818cf8' : '#cbd5e1',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.85rem',
                                marginBottom: '2px'
                            }}
                        >
                            {ex}
                        </button>
                    ))}
                </div>
            )}

            <AdvancedRealTimeChart
                key={chartKey}
                symbol={constructSymbol()}
                theme={theme}
                autosize
                interval="D"
                timezone="Etc/UTC"
                style="1"
                locale="en"
                toolbar_bg="#f1f3f6"
                enable_publishing={false}
                hide_top_toolbar={false}
                hide_legend={false}
                save_image={false}
                allow_symbol_change={true}
            />
        </div>
    );
};

export default TradingViewChart;
