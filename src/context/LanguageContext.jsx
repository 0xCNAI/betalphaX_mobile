import React, { createContext, useState, useContext, useEffect } from 'react';

const LanguageContext = createContext();

const translations = {
    en: {
        portfolio: 'Portfolio',
        feeds: 'Feeds',
        journal: 'AI Journal',
        settings: 'Settings',
        dashboard: 'Portfolio Dashboard',
        trackPerformance: 'Track your crypto performance and AI insights.',
        importPortfolio: 'Import Portfolio',
        totalBalance: 'Total Balance',
        dailyPnL: 'Daily PnL',
        portfolioOverview: 'Portfolio Overview',
        winRate: 'Win Rate',
        avgRR: 'Avg R/R',
        health: 'Health',
        yourAssets: 'Your Assets',
        asset: 'Asset',
        attention: 'Attention',
        price: 'Price',
        holdings: 'Holdings',
        avgBuy: 'Avg. Buy',
        value: 'Value',
        pnl: 'PnL',
        change24h: '24h Change',
        addTransaction: 'Add Transaction',
        buy: 'Buy',
        sell: 'Sell',
        backToPortfolio: 'Back to Portfolio',
        totalHoldings: 'Total Holdings',
        currentValue: 'Current Value',
        totalPnL: 'Total PnL',
        transactionHistory: 'Transaction History',
        buyThesis: 'Buy Thesis',
        exitSignals: 'Exit Signals',
        noHistory: 'No transactions found for this asset.',
        loadingPrices: 'Loading prices...',
        pricesLive: 'Prices live',
        priceError: 'Price fetch error',
        step1: 'Step 1: Select Asset',
        step1_5: 'Step 1.5: Select Transaction Type',
        step2_1: 'Step 2.1: Fundamental Reasons',
        step2_2: 'Step 2.2: Event-Driven / News',
        step2_3: 'Step 2.3: Technical Analysis',
        step3: 'Step 3: Sell Signals',
        step4: 'Step 4: Transaction Details',
        continue: 'Continue',
        back: 'Back',
        next: 'Next',
        submit: 'Submit Transaction',
        update: 'Update Transaction',
        buyMore: 'Buy More',
        reducePosition: 'Reduce your position',
        addToPosition: 'Add to your position',
    },
    'zh-TW': {
        portfolio: '投資組合',
        feeds: '動態',
        journal: 'AI 日誌',
        settings: '設定',
        dashboard: '投資組合儀表板',
        trackPerformance: '追蹤您的加密貨幣績效與 AI 洞察。',
        importPortfolio: '匯入投資組合',
        totalBalance: '總資產',
        dailyPnL: '今日損益',
        portfolioOverview: '投資組合總覽',
        winRate: '勝率',
        avgRR: '平均盈虧比',
        health: '健康度',
        yourAssets: '您的資產',
        asset: '資產',
        attention: '關注度',
        price: '價格',
        holdings: '持倉量',
        avgBuy: '平均成本',
        value: '價值',
        pnl: '損益',
        change24h: '24小時漲跌',
        addTransaction: '新增交易',
        buy: '買入',
        sell: '賣出',
        backToPortfolio: '返回投資組合',
        totalHoldings: '總持倉',
        currentValue: '目前價值',
        totalPnL: '總損益',
        transactionHistory: '交易歷史',
        buyThesis: '買入理由',
        exitSignals: '出場信號',
        noHistory: '此資產尚無交易記錄。',
        loadingPrices: '載入價格中...',
        pricesLive: '即時價格',
        priceError: '價格獲取錯誤',
        step1: '步驟 1: 選擇資產',
        step1_5: '步驟 1.5: 選擇交易類型',
        step2_1: '步驟 2.1: 基本面理由',
        step2_2: '步驟 2.2: 事件驅動 / 新聞',
        step2_3: '步驟 2.3: 技術分析',
        step3: '步驟 3: 賣出信號',
        step4: '步驟 4: 交易詳情',
        continue: '繼續',
        back: '返回',
        next: '下一步',
        submit: '提交交易',
        update: '更新交易',
        buyMore: '加倉',
        reducePosition: '減倉',
        addToPosition: '增加持倉',
        // Feeds
        marketFeeds: '市場動態',
        refreshFeeds: '重新整理',
        feedsSubtitle: '即時社群趨勢與加密貨幣新聞聚合',
        trendingOnX: 'X (Twitter) 趨勢',
        topCryptoTweets: '熱門加密貨幣推文',
        loadingFeeds: '載入動態中...',
        noTrendingFeeds: '目前沒有熱門動態。',
        showMore: '顯示更多',
        cryptoNews: '加密貨幣新聞',
        aggregated: '聚合新聞',
        loadingNews: '載入新聞中...',
        noNews: '目前沒有新聞。',
        trackToken: '追蹤您的代幣',
        trackTokenSubtitle: '獲取個人化動態與情緒分析',
        trackTokenBtn: '追蹤代幣',
        trackingActive: '追蹤中',
        inProgress: '(處理中)',
        // Journal
        aiTradingJournal: 'AI 交易日誌',
        journalSubtitle: '回顧您的決策並獲取 AI 洞察。',
        generateReview: '生成週報',
        analyzing: '分析中...',
        recentEntries: '最近條目',
        buyThesis: '買入理由',
        exitStrategy: '出場策略',
        weeklyAiReview: 'AI 週報',
        strengths: '優點',
        areasForImprovement: '改進空間',
        tip: '建議',
        patternRecognition: '模式識別',
        winRateBreakouts: '突破交易勝率',
        avgHoldTime: '平均持倉時間',
        days: '天',
        // Transaction Form
        selectAsset: '選擇資產',
        enterTicker: '輸入您想交易的資產代碼。',
        assetSymbol: '資產代碼',
        selectType: '選擇交易類型',
        alreadyHold: '您已經持有',
        wantToBuySell: '您想加倉還是賣出？',
        fundamentalReasons: '基本面理由',
        selectFundamental: '選擇您決策的基本面理由。',
        eventDriven: '事件驅動 / 新聞',
        selectEvent: '選擇新聞或事件驅動的理由。',
        technicalAnalysis: '技術分析',
        selectTechnical: '選擇支持您決策的技術指標。',
        sellSignals: '賣出信號',
        selectExit: '根據您的買入理由選擇出場策略。',
        transactionDetails: '交易詳情',
        enterDetails: '輸入您的交易詳細資訊。',
        amount: '數量',
        date: '日期',
        notes: '筆記 / 分析',
        addNotes: '新增具體細節或筆記...',
        addLink: '新增資源連結 (http://...)',
        customReason: '新增自訂理由...',
        customSignal: '新增自訂賣出信號...',
        aiInsights: 'AI 洞察',
        maxSell: '最大可賣:',
        insufficientBalance: '餘額不足',
    }
};

export const LanguageProvider = ({ children }) => {
    const [language, setLanguage] = useState('en');

    // Load saved language from localStorage
    useEffect(() => {
        const savedLang = localStorage.getItem('appLanguage');
        if (savedLang) {
            setLanguage(savedLang);
        }
    }, []);

    const changeLanguage = (lang) => {
        setLanguage(lang);
        localStorage.setItem('appLanguage', lang);
    };

    const t = (key) => {
        return translations[language][key] || key;
    };

    return (
        <LanguageContext.Provider value={{ language, changeLanguage, t }}>
            {children}
        </LanguageContext.Provider>
    );
};

export const useLanguage = () => useContext(LanguageContext);
