// Service to capture market context snapshots for transaction metadata

export const captureContextSnapshot = async () => {
    // In a real app, this would fetch from APIs (CoinGecko, Alternative.me, etc.)
    // For now, we return realistic mock data

    return {
        timestamp: new Date().toISOString(),
        btcDominance: 54.2, // Mock BTC Dominance %
        fearAndGreedIndex: 72, // Mock Fear & Greed (Greed)
        marketSentiment: 'Greed',
        topSector: 'AI & Big Data', // Mock current hot sector
        globalMarketCapChange: 1.2, // Mock 24h change %
    };
};

export const getOutcomeOptions = () => [
    { id: 'target_hit', label: 'Target Hit (Success)', description: 'Narrative played out as expected.' },
    { id: 'stop_loss', label: 'Stop Loss (Invalidated)', description: 'Price action invalidated the thesis.' },
    { id: 'narrative_fail', label: 'Narrative Failed', description: 'Fundamental thesis was proven wrong.' },
    { id: 'market_shift', label: 'Market Shift', description: 'External market conditions changed.' },
    { id: 'time_exit', label: 'Time Based Exit', description: 'Opportunity cost became too high.' }
];

export const getExitFactors = () => ({
    market: [
        'Market Overheated',
        'Sector Rotation',
        'Macro Headwinds'
    ],
    technical: [
        'Trend Breakdown',
        'Resistance Rejection',
        'Indicator Overbought'
    ],
    fundamental: [
        'News Event (Negative)',
        'Metric Deterioration',
        'Team/Project Issue'
    ],
    personal: [
        'Better Opportunity Found',
        'Risk Management',
        'Emotional Exit'
    ]
});
