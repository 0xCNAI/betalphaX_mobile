import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Search,
  TrendingUp,
  MessageCircle,
  Newspaper,
  AlertTriangle,
  Target,
  Activity,
  Plus,
  X,
  Loader2,
  FastForward,
  HelpCircle,
  FileText,
  ChevronUp,
  Brain,
  Zap
} from 'lucide-react';
import { useBuyThesis } from '../context/BuyThesisContext';

import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { translateText } from '../services/translationService';

import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { searchCoins } from '../services/coinGeckoApi';
import { analyzeTechnicals, generateSellSignals as generateTASellSignals, analyzeSellTechnicals } from '../services/technicalAnalysis';
import { searchCryptoTweets } from '../services/twitterService';
import { getNewsForAsset } from '../services/newsService';
import { generateTagsFromNote } from '../services/geminiService';
import { generatePortfolioOverview, getTradeDiagnosis, getCachedOverview } from '../services/analysisService';
import { captureContextSnapshot, getOutcomeOptions, getExitFactors } from '../services/contextService';
import { runPreTradeReview, savePreTradeReviewToSummary } from '../services/aiCoachService';
import TechnicalAnalysisWidget from './TechnicalAnalysisWidget';
import FundamentalWidget from './FundamentalWidget';
import ImportantEvents from './ImportantEvents'; // Was SocialNotificationWidget


// ...

const TransactionForm = ({ onClose, initialData = null, initialStep = 1, initialType = null }) => {
  const { addTransaction, updateTransaction, transactions } = useTransactions();
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { getPrice, getIcon, fetchPriceForTicker } = usePrices();

  // Helper for Tag Translations
  // Helper for Tag Translations
  const getTagLabel = (tag) => {
    if (!tag) return '';
    // Case 1: Tag is already a key (e.g. from AI)
    if (tag.startsWith('tag_')) {
      // Try to translate
      const label = t(tag);
      // If translation exists and is not just the key itself (depending on t() impl, usually returns key if missing)
      // Assuming t() returns key if missing or explicitly check
      if (label && label !== tag) return label;

      // Fallback: Prettify the key (tag_DefiInnovation -> Defi Innovation)
      return tag.replace(/^tag_/, '').replace(/([A-Z])/g, ' $1').trim();
    }

    // Case 2: Tag is a raw string (e.g. "Long Term Hold") -> Convert to key
    const key = `tag_${tag.replace(/[\/\s]/g, '')}`;
    const label = t(key);
    return label || tag;
  };
  const getExitTagLabel = (tag) => t(`exit_${tag.replace(/[\/\s]/g, '')}`) || tag;

  // Helper for translating arrays of strings
  const translateArray = async (arr) => {
    if (!arr || arr.length === 0) return [];
    if (language !== 'zh-TW') return arr;
    try {
      return await Promise.all(arr.map(item => translateText(item, 'zh-TW')));
    } catch (e) {
      console.error("Translation error:", e);
      return arr;
    }
  };
  // Helper Constants for Sell Flow (Synced with Desktop)
  const getOutcomeOptions = () => [
    { id: 'target_hit', label: t('targetHit') || 'Target Hit (Success)' },
    { id: 'stop_loss', label: t('stopLoss') || 'Stop Loss (Invalidated)' },
    { id: 'narrative_failed', label: t('narrativeFailed') || 'Narrative Failed' },
    { id: 'market_shift', label: t('marketShift') || 'Market Shift' },
    { id: 'time_exit', label: t('timeExit') || 'Time Based Exit' }
  ];

  const getExitFactors = () => ({
    market: [t('marketOverheated') || 'Market Overheated', t('sectorRotation') || 'Sector Rotation', t('macroHeadwinds') || 'Macro Headwinds'],
    technical: [t('trendBreakdown') || 'Trend Breakdown', t('resistanceRejection') || 'Resistance Rejection', t('indicatorOverbought') || 'Indicator Overbought'],
    fundamental: [t('newsEventNegative') || 'News Event (Negative)', t('metricDeterioration') || 'Metric Deterioration', t('teamProjectIssue') || 'Team/Project Issue'],
    strategy: [t('betterOpportunityFound') || 'Better Opportunity Found', t('riskManagement') || 'Risk Management', t('emotionalExit') || 'Emotional Exit']
  });

  const { theses } = useBuyThesis(); // Get saved theses
  const [step, setStep] = useState(initialStep);
  const [quickAdd, setQuickAdd] = useState(false);
  const [formData, setFormData] = useState({
    asset: initialData?.asset || '',
    type: initialData?.type || initialType || 'buy',
    amount: initialData?.amount || '',
    price: initialData?.price || '',
    date: initialData?.date || new Date().toISOString().split('T')[0],
    tags: initialData?.tags || [],
    exitTags: initialData?.exitTags || [],
    investmentNotes: initialData?.investmentNotes || [''],
    exitNotes: initialData?.exitNotes || [''],
    selectedReasons: initialData?.selectedReasons || [],
    selectedSellSignals: initialData?.selectedSellSignals || [],
    customReasons: initialData?.customReasons || {},
    customSellSignal: initialData?.customSellSignal || '',
    reasonDetails: initialData?.reasonDetails || {},
    reasonLinks: initialData?.reasonLinks || {},
    customIndicatorType: initialData?.customIndicatorType || 'Price Target',
    customIndicatorValue: initialData?.customIndicatorValue || '',
    // Preserve other fields from initialData if any
    linkedBuyReasons: initialData?.linkedBuyReasons || [],
    exitFactors: initialData?.exitFactors || [],
    selectedGroup: initialData?.selectedGroup || '',
    selectedChain: initialData?.selectedChain || '',
    ...(initialData || {})
  });

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isAddingChain, setIsAddingChain] = useState(false);
  const [newChainName, setNewChainName] = useState('');

  const inputRef = useRef(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [assetExists, setAssetExists] = useState(false);
  const [overview, setOverview] = useState(null);
  const [diagnosis, setDiagnosis] = useState(null);
  const [preTradeReview, setPreTradeReview] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // AI Widget State
  const [proTaData, setProTaData] = useState(null);
  const [widgetFundamentalData, setWidgetFundamentalData] = useState(null);
  const [widgetEventsData, setWidgetEventsData] = useState(null);

  // --- Step 2: Tag Selection ---
  const [tagSearch, setTagSearch] = useState('');
  const [aiTags, setAiTags] = useState([]);
  const [savedThesisTags, setSavedThesisTags] = useState([]);
  const [isLoadingAiTags, setIsLoadingAiTags] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

  // Missing variables for Merged Step 1
  const tagsDropdownRef = useRef(null);
  const [showTagsDropdown, setShowTagsDropdown] = useState(false);

  // Calculate current holdings for display
  const currentHoldings = React.useMemo(() => {
    if (!formData.asset) return 0;
    return transactions
      .filter(t => t.asset === formData.asset && t.status !== 'closed')
      .reduce((acc, t) => {
        if (t.type === 'buy') return acc + parseFloat(t.amount || 0);
        if (t.type === 'sell') return acc - parseFloat(t.amount || 0);
        return acc;
      }, 0);
  }, [formData.asset, transactions]);

  // Default Tag Library (Buy Thesis)
  const defaultTags = [
    "Long Term Hold", "Swing Trade", "Scalp", "Fundamental Undervalued",
    "Technical Breakout", "Trend Following", "News Catalyst", "Macro Hedge",
    "Staking/Yield", "Airdrop Farm", "Arbitrage", "DCA", "FOMO", "Panic Sell",
    "Stop Loss Hit", "Take Profit", "Rebalancing", "Liquidity Mining"
  ];

  // --- Step 3: Exit Tag Selection ---
  const [exitTagSearch, setExitTagSearch] = useState('');
  const [aiExitTags, setAiExitTags] = useState([]);
  const [isLoadingAiExitTags, setIsLoadingAiExitTags] = useState(false);
  const [showAllExitTags, setShowAllExitTags] = useState(false);

  const defaultExitTags = [
    "Fixed Take Profit", "Trailing Stop", "Time Based Exit",
    "Resistance Level", "Support Break", "RSI Overbought",
    "Volume Decline", "Trend Reversal", "Partial Exit",
    "Risk Management", "Portfolio Rebalance", "Stop Loss Hit",
    "Profit Target Reached", "Moving Average Cross", "FOMO Exit",
    "Cut Losses", "Fundamental Change", "News Event"
  ];

  // Auto-tag generation removed (now manual in Step 1)
  /*
  useEffect(() => {
    if (step === 2) {
      // ...
    }
  }, [step, formData.investmentNotes, formData.asset, theses]);
  */


  const toggleTag = (tag) => {
    setFormData(prev => {
      const currentTags = prev.tags || [];
      if (currentTags.includes(tag)) {
        return { ...prev, tags: currentTags.filter(t => t !== tag) };
      } else {
        return { ...prev, tags: [...currentTags, tag] };
      }
    });
  };

  const handleCreateTag = () => {
    if (tagSearch.trim()) {
      toggleTag(tagSearch.trim());
      setTagSearch('');
    }
  };

  // Exit Tag Functions
  const toggleExitTag = (tag) => {
    setFormData(prev => {
      const currentTags = prev.exitTags || [];
      if (currentTags.includes(tag)) {
        return { ...prev, exitTags: currentTags.filter(t => t !== tag) };
      } else {
        return { ...prev, exitTags: [...currentTags, tag] };
      }
    });
  };

  const handleCreateExitTag = () => {
    if (exitTagSearch.trim()) {
      toggleExitTag(exitTagSearch.trim());
      setExitTagSearch('');
    }
  };

  const renderStep2 = () => {
    const filteredDefaultTags = defaultTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()));
    const displayedDefaultTags = showAllTags ? filteredDefaultTags : filteredDefaultTags.slice(0, 10);
    const isCustomTag = tagSearch.trim() && !defaultTags.some(t => t.toLowerCase() === tagSearch.trim().toLowerCase()) && !aiTags.some(t => t.toLowerCase() === tagSearch.trim().toLowerCase());

    return (
      <div className="step-container">
        <div className="step-header">
          <h4>{t('step2_title') || 'Step 2: Tag Selection'}</h4>
          <p>{t('step2_desc') || 'Categorize your transaction with tags.'}</p>
        </div>

        {/* Search Bar */}
        <div className="form-group">
          <div className="search-wrapper" style={{ position: 'relative', display: 'flex', gap: '8px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder={t('searchOrCreateTag') || "Search or create new tag..."}
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              className="form-input"
              style={{ paddingLeft: '36px', flex: 1 }}
            />
            {isCustomTag && (
              <button
                type="button"
                className="btn-secondary"
                onClick={handleCreateTag}
              >
                <Plus size={16} /> {t('add')} "{tagSearch}"
              </button>
            )}
          </div>
        </div>

        {/* Selected Tags Display - Enhanced Pill Style */}
        {formData.tags && formData.tags.length > 0 && (
          <div className="selected-tags-area" style={{ marginBottom: '1.5rem' }}>
            <h5 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>{t('selectedTags') || 'Selected Tags'}</h5>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {formData.tags.map(tag => (
                <span
                  key={tag}
                  className="tag-pill selected"
                  onClick={() => toggleTag(tag)}
                  style={{
                    backgroundColor: 'var(--accent-primary)',
                    color: 'white',
                    padding: '8px 14px',
                    borderRadius: '20px',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    border: '2px solid var(--accent-primary)',
                    boxShadow: '0 2px 4px rgba(99, 102, 241, 0.2)',
                    transition: 'all 0.2s ease'
                  }}
                >

                  {getTagLabel(tag)}
                  <X size={14} style={{ strokeWidth: 2.5 }} />
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Saved Buy Thesis Tags */}
        {savedThesisTags.length > 0 && (
          <div className="tags-section" style={{ marginBottom: '1.5rem' }}>
            <h5 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Target size={14} color="var(--accent)" /> {t('savedBuyThesis') || 'Saved Buy Thesis'}
            </h5>
            <div className="tags-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {savedThesisTags.map(tag => (
                <button
                  key={`thesis-${tag}`}
                  type="button"
                  className={`tag-pill ${formData.tags?.includes(tag) ? 'active' : ''}`}
                  onClick={() => toggleTag(tag)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '18px',
                    border: formData.tags?.includes(tag) ? '2px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                    backgroundColor: formData.tags?.includes(tag) ? 'rgba(99, 102, 241, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                    color: formData.tags?.includes(tag) ? 'var(--accent-primary)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: formData.tags?.includes(tag) ? '500' : '400',
                    transition: 'all 0.2s ease',
                    boxShadow: formData.tags?.includes(tag) ? '0 2px 4px rgba(99, 102, 241, 0.15)' : 'none'
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Suggested Tags */}
        <div className="tags-section" style={{ marginBottom: '1.5rem' }}>
          <h5 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={14} color="var(--accent)" /> {t('aiSuggestedTags') || 'AI Suggested Tags'}
          </h5>

          {isLoadingAiTags ? (
            <div className="loading-tags" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              {t('analyzingNote') || 'Analyzing your note...'}
            </div>
          ) : aiTags.length > 0 ? (
            <div className="tags-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {aiTags.map(tag => (
                <button
                  key={`ai-${tag}`}
                  type="button"
                  className={`tag-pill ${formData.tags?.includes(tag) ? 'active' : ''}`}
                  onClick={() => toggleTag(tag)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '18px',
                    border: formData.tags?.includes(tag) ? '2px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                    backgroundColor: formData.tags?.includes(tag) ? 'rgba(99, 102, 241, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                    color: formData.tags?.includes(tag) ? 'var(--accent-primary)' : 'var(--text-primary)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: formData.tags?.includes(tag) ? '500' : '400',
                    transition: 'all 0.2s ease',
                    boxShadow: formData.tags?.includes(tag) ? '0 2px 4px rgba(99, 102, 241, 0.15)' : 'none'
                  }}
                >
                  {getTagLabel(tag)}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              {t('noAiSuggestions') || 'No AI suggestions available. Try adding a more detailed note in Step 1.'}
            </div>
          )}
        </div>

        {/* Recommended Tags */}
        <div className="tags-section">
          <h5 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            {t('recommendedTags') || 'Recommended Tags'}
          </h5>
          <div className="tags-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {displayedDefaultTags.map(tag => (
              <button
                key={`def-${tag}`}
                type="button"
                className={`tag-pill ${formData.tags?.includes(tag) ? 'active' : ''}`}
                onClick={() => toggleTag(tag)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '18px',
                  border: formData.tags?.includes(tag) ? '2px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                  backgroundColor: formData.tags?.includes(tag) ? 'rgba(99, 102, 241, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                  color: formData.tags?.includes(tag) ? 'var(--accent-primary)' : 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: formData.tags?.includes(tag) ? '500' : '400',
                  transition: 'all 0.2s ease',
                  boxShadow: formData.tags?.includes(tag) ? '0 2px 4px rgba(99, 102, 241, 0.15)' : 'none'
                }}
              >

                {getTagLabel(tag)}
              </button>
            ))}
          </div>

          {!showAllTags && filteredDefaultTags.length > 10 && (
            <button
              type="button"
              onClick={() => setShowAllTags(true)}
              style={{
                marginTop: '10px',
                background: 'none',
                border: 'none',
                color: 'var(--primary)',
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              {t('showMore') || 'Show More'} <ChevronDown size={14} />
            </button>
          )}
        </div>

        <div className="step-actions">
          <button type="button" onClick={() => setStep(1)} className="btn-secondary">
            <ArrowLeft size={18} /> {t('back')}
          </button>
          <button type="button" onClick={() => setStep(3)} className="btn-primary">
            {t('nextSellSignals') || 'Next: Sell Signals'} <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  };

  // ... (state definitions) ...

  const checkAssetExists = (ticker) => {
    const upperTicker = ticker.toUpperCase();
    const holdings = transactions.reduce((acc, tx) => {
      if (tx.asset === upperTicker) {
        return tx.type === 'buy' ? acc + tx.amount : acc - tx.amount;
      }
      return acc;
    }, 0);
    return holdings > 0;
  };

  const generateBuyReasons = async () => {
    setIsAnalyzing(true);
    try {
      // Get real technical analysis, news, and tweets
      const [technicalReasons, newsItems, tweets] = await Promise.all([
        analyzeTechnicals(formData.asset),
        getNewsForAsset(formData.asset),
        searchCryptoTweets(formData.asset, 5)
      ]);

      // Generate tags from Investment Note (Simple Keyword Matcher)
      const note = (formData.investmentNotes && formData.investmentNotes.length > 0) ? formData.investmentNotes[0] : '';
      const generatedTags = [];
      const keywords = {
        'halving': 'Halving Play',
        'etf': 'ETF Inflow',
        'breakout': 'Technical Breakout',
        'support': 'Support Bounce',
        'undervalued': 'Value Play',
        'long term': 'Long Term Hold',
        'short term': 'Scalp',
        'news': 'News Catalyst',
        'upgrade': 'Protocol Upgrade',
        'adoption': 'Adoption',
        'chart': 'Technical Setup'
      };

      Object.keys(keywords).forEach(key => {
        if (note.toLowerCase().includes(key)) {
          generatedTags.push(keywords[key]);
        }
      });

      // Translate content if needed
      const [trTechnical, trNews, trTweets] = await Promise.all([
        translateArray(technicalReasons),
        translateArray(newsItems),
        translateArray(tweets)
      ]);

      const defaultFundamentals = [
        ...generatedTags,
        "Strong network growth",
        "Institutional adoption",
        "Protocol upgrade",
        "Deflationary supply",
        "Undervalued metrics"
      ];

      const trFundamentals = await translateArray(defaultFundamentals);

      // If no keywords match but note exists, add a generic tag
      if (generatedTags.length === 0 && note.length > 10) {
        generatedTags.push('Custom Thesis');
      }

      setGeneratedReasons({
        fundamental: trFundamentals,
        eventDriven: trNews,
        social: trTweets, // Twitter sentiment
        technical: trTechnical // Real TA data
      });
      setIsAnalyzing(false);
    } catch (error) {
      console.error('Error generating buy reasons:', error);
      // Fallback to mock data
      setGeneratedReasons({
        fundamental: [
          "Strong network growth",
          "Institutional adoption",
          "Protocol upgrade",
          "Deflationary supply",
          "Undervalued metrics"
        ],
        eventDriven: [
          "Upcoming halving event.",
          "Major exchange listing announcement.",
          "Regulatory clarity emerging in key markets.",
          "Partnership with major tech company.",
          "Conference or mainnet launch approaching."
        ],
        social: [],
        technical: [
          "RSI indicates oversold conditions.",
          "Breakout above key resistance level.",
          "Golden cross formation on daily chart.",
          "Holding support at 200-day moving average.",
          "Volume spike confirming trend reversal."
        ]
      });
      setIsAnalyzing(false);
    }
  };

  const generateSellReasons = async () => {
    setIsAnalyzing(true);
    try {
      // Get real technical analysis, news, and tweets for selling
      const [technicalReasons, newsItems, tweets] = await Promise.all([
        analyzeSellTechnicals(formData.asset),
        getNewsForAsset(formData.asset),
        searchCryptoTweets(formData.asset, 5)
      ]);

      const [trTechnical, trNews, trTweets] = await Promise.all([
        translateArray(technicalReasons),
        translateArray(newsItems),
        translateArray(tweets)
      ]);

      const defaultSellFundamentals = [
        "Profit target reached.",
        "Fundamentals deteriorating.",
        "Better opportunities elsewhere.",
        "Overvalued relative to metrics.",
        "Risk/reward no longer favorable."
      ];
      const trFundamentals = await translateArray(defaultSellFundamentals);

      setGeneratedReasons({
        fundamental: trFundamentals,
        eventDriven: trNews,
        social: trTweets,
        technical: trTechnical // Real TA data for selling
      });
      setIsAnalyzing(false);
    } catch (error) {
      console.error('Error generating sell reasons:', error);
      // Fallback to mock data
      setGeneratedReasons({
        fundamental: [
          "Profit target reached.",
          "Fundamentals deteriorating.",
          "Better opportunities elsewhere.",
          "Overvalued relative to metrics.",
          "Risk/reward no longer favorable."
        ],
        eventDriven: [
          "Negative regulatory news.",
          "Major partnership ended.",
          "Security breach or exploit.",
          "Tey team members leaving.",
          "Market sentiment shift."
        ],
        technical: [
          "RSI overbought (>70).",
          "Breakdown below key support.",
          "Death cross formation.",
          "Volume declining on rallies.",
          "Stop loss triggered."
        ]
      });
      setIsAnalyzing(false);
    }
  };

  const generateSellSignals = async () => {
    setIsAnalyzing(true);
    try {
      const signals = await generateTASellSignals(formData.asset);
      const trSignals = await translateArray(signals);
      setGeneratedSellSignals(trSignals);
      setIsAnalyzing(false);
      setStep(3);
    } catch (error) {
      console.error('Error generating sell signals:', error);
      // Fallback
      setGeneratedSellSignals([
        "Take profit at +20%.",
        "Stop loss at -10%.",
        "Monitor RSI for overbought conditions."
      ]);
      setIsAnalyzing(false);
      setStep(3);
    }
  };

  const handleTickerSubmit = async (typeOverride = null, shouldAdvance = false) => {
    console.log("handleTickerSubmit called");
    const currentType = typeOverride || formData.type;

    try {
      const exists = checkAssetExists(formData.asset);
      console.log("Asset exists:", exists);
      setAssetExists(exists);

      // Auto-fetch price ONLY if not already set by user
      // (The useEffect handles auto-updating when asset changes, so we only need to catch empty/zero prices here)
      if (!formData.price || formData.price == 0) {
        const currentPrice = getPrice(formData.asset);
        if (currentPrice && currentPrice.price > 0) {
          console.log("Using cached price:", currentPrice.price);
          setFormData(prev => ({ ...prev, price: currentPrice.price, type: currentType }));
        } else {
          try {
            console.log("Fetching price for:", formData.asset);
            const priceData = await fetchPriceForTicker(formData.asset);
            if (priceData && priceData.price > 0) {
              console.log("Fetched price:", priceData.price);
              setFormData(prev => ({ ...prev, price: priceData.price, type: currentType }));
            } else {
              setFormData(prev => ({ ...prev, type: currentType }));
            }
          } catch (error) {
            console.error("Failed to fetch price:", error);
            // Still update type
            setFormData(prev => ({ ...prev, type: currentType }));
          }
        }
      } else {
        // Price is already set, just update type
        setFormData(prev => ({ ...prev, type: currentType }));
      }

      // Trigger analysis based on selected type
      console.log("Triggering analysis for type:", currentType);
      try {
        if (currentType === 'buy') {
          // generateBuyReasons(); // This was for old Step 2, now handled by AI tags
        } else {
          // generateSellReasons(); // This was for old Step 2, now handled by AI tags
        }
      } catch (err) {
        console.error("Error triggering analysis:", err);
      }

      if (shouldAdvance) {
        console.log("Stay on Step 1 (Merged)");
        // setStep(2); // Removed auto-advance
      }
    } catch (error) {
      console.error("Error in handleTickerSubmit:", error);
    }
  };

  const handleTypeSelection = (type) => {
    console.log("Type selected:", type);
    setFormData(prev => ({ ...prev, type }));
  };

  const handleNoteChange = (type, index, value) => {
    const field = type === 'investment' ? 'investmentNotes' : 'exitNotes';
    setFormData(prev => {
      const newNotes = [...prev[field]];
      newNotes[index] = value;
      return { ...prev, [field]: newNotes };
    });
  };

  const addNote = (type) => {
    const field = type === 'investment' ? 'investmentNotes' : 'exitNotes';
    setFormData(prev => ({
      ...prev,
      [field]: [...prev[field], '']
    }));
  };

  const removeNote = (type, index) => {
    const field = type === 'investment' ? 'investmentNotes' : 'exitNotes';
    setFormData(prev => {
      const newNotes = prev[field].filter((_, i) => i !== index);
      return { ...prev, [field]: newNotes.length ? newNotes : [''] };
    });
  };

  // Calculate diagnosis and overview when entering Step 4
  useEffect(() => {
    if (step === 4 && formData.asset) {
      const ov = generatePortfolioOverview(transactions, formData.asset);
      setOverview(ov);

      const diag = getTradeDiagnosis(formData, ov);
      setDiagnosis(diag);

      // Trigger AI Coach Analysis
      if (!preTradeReview && !isAnalyzing && user) {
        setIsAnalyzing(true);
        console.log('[TransactionForm] Triggering AI Coach...');
        runPreTradeReview(user.uid, formData.asset, formData, transactions, language)
          .then(advice => {
            setPreTradeReview(advice);
          })
          .catch(err => console.error("AI Coach Error:", err))
          .finally(() => setIsAnalyzing(false));
      }
    }
  }, [step, formData.asset, transactions, user, language]);

  // Auto-fetch price when asset changes
  useEffect(() => {
    if (formData.asset && step === 1) {
      const currentPrice = getPrice(formData.asset);
      if (currentPrice && currentPrice.price > 0) {
        setFormData(prev => ({ ...prev, price: currentPrice.price }));
      } else {
        fetchPriceForTicker(formData.asset)
          .then(priceData => {
            if (priceData && priceData.price > 0) {
              setFormData(prev => ({ ...prev, price: priceData.price }));
            }
          })
          .catch(err => console.error('Failed to fetch price:', err));
      }
    }
  }, [formData.asset, step]);

  // Check asset existence whenever ticker changes
  useEffect(() => {
    if (formData.asset) {
      const exists = checkAssetExists(formData.asset);
      setAssetExists(exists);
    } else {
      setAssetExists(false);
    }
  }, [formData.asset, transactions]);

  // Search for coins when asset input changes
  useEffect(() => {
    const searchCoinsDebounced = async () => {
      const query = formData.asset;

      if (!query || query.length < 1) {
        setShowDropdown(false);
        setSearchResults([]);
        return;
      }

      setShowDropdown(true);
      setIsSearching(true);

      try {
        const results = await searchCoins(query, 10);
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const timeoutId = setTimeout(searchCoinsDebounced, 300);
    return () => clearTimeout(timeoutId);
  }, [formData.asset]);

  // Update dropdown position when showing
  useEffect(() => {
    if (showDropdown && inputRef.current) {
      const updatePosition = () => {
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 4, // 4px gap
          left: rect.left,
          width: rect.width
        });
      };

      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);

      return () => {
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
      };
    }
  }, [showDropdown, searchResults.length, isSearching]);

  // Handle ticker selection from dropdown
  const handleTickerSelect = async (coin) => {
    setFormData(prev => ({ ...prev, asset: coin.symbol }));
    setShowDropdown(false);
    setSearchResults([]);

    // Auto-fetch price for selected ticker
    try {
      const priceData = await fetchPriceForTicker(coin.symbol);
      if (priceData && priceData.price > 0) {
        setFormData(prev => ({ ...prev, price: priceData.price }));
      }
    } catch (error) {
      console.error('Failed to fetch price:', error);
    }
  };

  // ... (existing handlers) ...

  const renderMergedStep1 = () => {
    // Calculate holdings for display and validation
    const currentHoldings = transactions
      .filter(tx => tx.asset === formData.asset && (tx.status === 'open' || tx.status === 'needs_calculation'))
      .reduce((acc, tx) => {
        return tx.type === 'buy' ? acc + parseFloat(tx.amount || 0) : acc - parseFloat(tx.amount || 0);
      }, 0);

    const inputAmount = parseFloat(formData.amount || 0);
    const isOverSelling = inputAmount > currentHoldings;

    // Tag Logic (from Step 2)
    const filteredDefaultTags = defaultTags.filter(t => t.toLowerCase().includes(tagSearch.toLowerCase()));

    // Web Layout: Always show some recommended tags, filter when searching
    // If search is empty, show all (or top N). If searching, show matches.
    const displayedTags = tagSearch ? filteredDefaultTags : defaultTags;

    // Check if current search is a custom tag (not in known list)
    const isCustomTag = tagSearch.trim() && !defaultTags.some(t => t.toLowerCase() === tagSearch.trim().toLowerCase()) && !aiTags.some(t => t.toLowerCase() === tagSearch.trim().toLowerCase());

    // Define handleAddTag for this scope
    const handleAddTag = (tag) => {
      toggleTag(tag);
      setTagSearch('');
    };

    const handleGenerateTags = () => {
      const firstNote = formData.investmentNotes && formData.investmentNotes.length > 0 ? formData.investmentNotes[0] : '';
      if (firstNote) {
        setIsLoadingAiTags(true);
        generateTagsFromNote(firstNote)
          .then(tags => {
            setAiTags(tags);
          })
          .finally(() => {
            setIsLoadingAiTags(false);
          });
      }
    };

    return (
      <div className="step-container" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '16px' }}>
        <div className="step-header">
          <h4>{t('transaction_details') || 'Transaction Details'}</h4>
          <p>{t('enterDetails') || 'Enter details and categorize your trade.'}</p>
        </div>

        {/* Row 1: Ticker + Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* ... (Existing ticker/date inputs - kept same) ... */}
          <div className="form-group">
            <label className="form-label">{t('assetSymbol') || 'Token Ticker'}</label>
            <div ref={inputRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              {formData.asset && getIcon && getIcon(formData.asset) && (
                <img
                  src={getIcon(formData.asset)}
                  alt={formData.asset}
                  style={{ width: '20px', height: '20px', borderRadius: '50%', position: 'absolute', left: '12px', zIndex: 1 }}
                />
              )}
              <input
                type="text"
                name="asset"
                value={formData.asset}
                onChange={handleChange}
                placeholder={t('enterTicker') || "e.g., BTC"}
                required
                className="form-input"
                autoFocus
                style={{ paddingLeft: formData.asset && getIcon && getIcon(formData.asset) ? '40px' : '16px' }}
              />
              {/* Autocomplete Dropdown - kept same */}
              {showDropdown && (searchResults.length > 0 || isSearching) && createPortal(
                <div className="modal-content" style={{
                  position: 'fixed',
                  top: dropdownPos.top,
                  left: dropdownPos.left,
                  width: dropdownPos.width,
                  maxHeight: '300px',
                  zIndex: 99999,
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  padding: '8px 0',
                  marginTop: '4px'
                }}>
                  {isSearching ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: '#94a3b8' }}>
                      <Loader2 size={16} className="animate-spin" style={{ display: 'inline-block', marginRight: '8px' }} />
                      {t('searching') || 'Searching...'}
                    </div>
                  ) : (
                    searchResults.map((coin) => (
                      <div
                        key={coin.id}
                        onClick={() => handleTickerSelect(coin)}
                        style={{
                          padding: '10px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                      >
                        {coin.thumb && (
                          <img
                            src={coin.thumb}
                            alt={coin.symbol}
                            style={{ width: '24px', height: '24px', borderRadius: '50%' }}
                          />
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', color: '#f8fafc' }}>{coin.symbol}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{coin.name}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>,
                document.body
              )}
              {/* Holdings Display - kept same */}
              {formData.asset && (
                <div style={{
                  position: 'absolute',
                  bottom: '-20px',
                  right: '0',
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  textAlign: 'right'
                }}>
                  {t('action_hold') || 'Holdings'}: <strong style={{ color: '#f8fafc' }}>{currentHoldings.toFixed(4)}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('date') || 'Date'}</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="form-input"
              required
            />
          </div>
        </div>

        {/* Row 2: Amount + Price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '8px' }}>
          <div className="form-group">
            <label className="form-label">{t('amount') || 'Amount'}</label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              placeholder="0.00"
              step="any"
              className="form-input"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">{t('pricePerCoin') || 'Price per Coin ($)'}</label>
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              placeholder="0.00"
              step="any"
              className="form-input"
              required
            />
          </div>
        </div>

        {/* Row 3: Total Cost */}
        <div style={{
          padding: '12px 16px',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          marginTop: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('totalCost') || 'Total Cost'}:</span>
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#818cf8', fontFamily: 'monospace' }}>
            ${((parseFloat(formData.amount || 0) * parseFloat(formData.price || 0)) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Action Toggle */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
          <button
            type="button"
            className={`action-toggle-btn ${formData.type === 'buy' ? 'active buy' : ''}`}
            onClick={() => setFormData(prev => ({ ...prev, type: 'buy' }))}
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: formData.type === 'buy' ? '1px solid #10b981' : '1px solid #334155',
              backgroundColor: formData.type === 'buy' ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
              color: formData.type === 'buy' ? '#10b981' : '#94a3b8',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {t('action_buy') || 'Buy'}
          </button>
          <button
            type="button"
            className={`action-toggle-btn ${formData.type === 'sell' ? 'active sell' : ''}`}
            onClick={() => setFormData(prev => ({ ...prev, type: 'sell' }))}
            style={{
              padding: '12px',
              borderRadius: '8px',
              border: formData.type === 'sell' ? '1px solid #ef4444' : '1px solid #334155',
              backgroundColor: formData.type === 'sell' ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
              color: formData.type === 'sell' ? '#ef4444' : '#94a3b8',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            {t('action_sell') || 'Sell'}
          </button>
        </div>

        {/* Quick Add Toggle */}
        <div
          className="quick-add-toggle"
          onClick={() => setQuickAdd(!quickAdd)}
          style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer',
            border: quickAdd ? '1px solid #6366f1' : '1px solid transparent',
            color: quickAdd ? '#818cf8' : '#64748b',
            fontSize: '0.9rem',
            transition: 'all 0.2s'
          }}
        >
          {quickAdd ? <Zap size={16} fill="currentColor" /> : <Zap size={16} />}
          {quickAdd ? (t('quickAddActive') || 'Quick Add Active') : (t('quickAdd') || 'Quick Add (Skip Analysis)')}
        </div>

        {!quickAdd && (
          <div className="analysis-section" style={{ marginTop: '24px', borderTop: '1px solid #1e293b', paddingTop: '24px' }}>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{t('investmentNote') || 'Investment Note'} <span className="tooltip-icon">?</span></span>
                <button
                  type="button"
                  onClick={handleGenerateTags}
                  disabled={isLoadingAiTags || !formData.investmentNotes?.[0]}
                  style={{
                    fontSize: '0.75rem',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    color: '#818cf8',
                    border: '1px solid rgba(99, 102, 241, 0.2)',
                    cursor: formData.investmentNotes?.[0] ? 'pointer' : 'not-allowed',
                    opacity: formData.investmentNotes?.[0] ? 1 : 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  {isLoadingAiTags ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {t('generateTags') || 'Generate Tags'}
                </button>
              </label>
              <textarea
                value={formData.investmentNotes?.[0] || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData(prev => {
                    const notes = [...(prev.investmentNotes || [])];
                    notes[0] = val;
                    return { ...prev, investmentNotes: notes };
                  });
                }}
                placeholder={t('notePlaceholder') || "Why are you taking this trade? (Click 'Generate Tags' to analyze)"}
                className="form-textarea large-memo"
                rows={3}
              />
            </div>

            {/* Tags Selection - Inline Style */}
            <div className="form-group" style={{ marginTop: '16px' }}>
              <div style={{ position: 'relative' }}>
                <div className="form-input" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px' }}>
                  <Search size={16} color="#64748b" />
                  <input
                    type="text"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder={t('searchOrCreateTag') || "Search or create tag..."}
                    style={{ background: 'transparent', border: 'none', color: 'white', flex: 1, outline: 'none', fontSize: '0.9rem' }}
                  />
                </div>
              </div>

              {/* Selected Tags */}
              {formData.tags && formData.tags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px', marginBottom: '8px' }}>
                  {formData.tags.map(tag => (
                    <span key={tag} className="tag-pill active" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', padding: '4px 10px' }}>
                      {getTagLabel(tag)}
                      <X
                        size={12}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTag(tag);
                        }}
                      />
                    </span>
                  ))}
                </div>
              )}

              {/* Recommended / Search Results Area */}
              <div style={{ marginTop: '12px' }}>
                <div style={{ fontSize: '0.9rem', color: '#f8fafc', fontWeight: 'bold', marginBottom: '8px' }}>
                  {t('recommendedTags') || 'Recommended Tags'}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {/* Create Custom Tag Option */}
                  {isCustomTag && (
                    <button
                      type="button"
                      className="tag-pill custom-tag-create"
                      onClick={() => {
                        handleAddTag(tagSearch.trim());
                        setTagSearch('');
                      }}
                      style={{ borderColor: '#818cf8', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Plus size={14} /> {t('createCustomTag') || 'Create'} "{tagSearch.trim()}"
                    </button>
                  )}

                  {/* AI Tags */}
                  {aiTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      className={`tag-pill ${formData.tags.includes(tag) ? 'active' : ''} ai-tag`}
                      onClick={() => handleAddTag(tag)}
                    >
                      <Sparkles size={10} style={{ marginRight: '4px' }} /> {getTagLabel(tag)}
                    </button>
                  ))}

                  {/* Default/Filtered Tags */}
                  {displayedTags.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      className={`tag-pill ${formData.tags.includes(tag) ? 'active' : ''}`}
                      onClick={() => handleAddTag(tag)}
                    >
                      {getTagLabel(tag)}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Group & Chain Settings - Kept Same */}
        <div style={{ marginTop: '24px' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{ width: '100%', justifyContent: 'space-between', border: 'none', background: 'rgba(255,255,255,0.03)' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>{t('advancedSettings') || 'Advanced Settings (Group & Chain)'}</span>
            {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {showAdvanced && (
            <div style={{
              marginTop: '12px',
              padding: '16px',
              backgroundColor: 'rgba(30, 41, 59, 0.3)',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px dashed #334155',
              color: '#94a3b8',
              fontSize: '0.9rem'
            }}>
              {/* Placeholder for Advanced Settings Content */}
              Feature coming soon...
            </div>
          )}
        </div>

        {/* Next Button */}
        <div className="step-actions">
          <button
            type="button"
            className="btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => setStep(formData.type === 'buy' ? 3 : 2)}
          >
            {formData.type === 'buy' ? (t('nextSellSignals') || 'Next: Sell Signals') : (t('nextOutcome') || 'Next: Outcome & Factors')} <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  };

  // ... (renderStep1_5 removed) ...



  /* Step 2: SELL Outcome & Factors (Replaces old Link Narrative) */
  const renderSellStep2 = () => {
    const outcomeOptions = getOutcomeOptions();
    const exitFactors = getExitFactors();

    const handleAddCustomTag = (type) => {
      if (type === 'outcome' && formData.customOutcome) {
        const customId = formData.customOutcome.toLowerCase().replace(/\s+/g, '_');
        setFormData(prev => ({ ...prev, outcomeStatus: customId, customOutcome: '' }));
      } else if (type === 'factor' && formData.customExitFactor) {
        setFormData(prev => ({
          ...prev,
          exitFactors: [...prev.exitFactors, formData.customExitFactor],
          customExitFactor: ''
        }));
      }
    };

    return (
      <div className="step-container" style={{ padding: '24px' }}>
        <div className="step-header" style={{ marginBottom: '24px' }}>
          <h4 style={{ color: '#818cf8', margin: 0, fontSize: '1.25rem' }}>{t('step2_outcome_title') || 'Step 2: Outcome & Factors'}</h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>{t('step2_outcome_desc') || 'Classify the result and document the cause.'}</p>
        </div>

        {/* 1. Outcome Status (Tags) */}
        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('outcomeStatus') || 'Outcome Status'}</label>
          <div className="tags-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {outcomeOptions.map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`tag-pill ${formData.outcomeStatus === opt.id ? 'active' : ''}`}
                onClick={() => setFormData(prev => ({ ...prev, outcomeStatus: opt.id }))}
                style={{
                  padding: '8px 16px',
                  borderRadius: '20px',
                  border: formData.outcomeStatus === opt.id ? '2px solid var(--accent-primary)' : '1px solid var(--bg-tertiary)',
                  backgroundColor: formData.outcomeStatus === opt.id ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-secondary)',
                  color: formData.outcomeStatus === opt.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: formData.outcomeStatus === opt.id ? '600' : '400',
                  transition: 'all 0.2s'
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 2. Exit Factors (Tags) */}
        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('exitFactors') || 'Exit Factors'}</label>
          <div className="tags-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {Object.values(exitFactors).flat().map(factor => (
              <button
                key={factor}
                type="button"
                className={`tag-pill ${formData.exitFactors && formData.exitFactors.includes(factor) ? 'active' : ''}`}
                onClick={() => {
                  setFormData(prev => {
                    const currentFactors = prev.exitFactors || [];
                    const newFactors = currentFactors.includes(factor)
                      ? currentFactors.filter(f => f !== factor)
                      : [...currentFactors, factor];
                    return { ...prev, exitFactors: newFactors };
                  });
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '16px',
                  border: formData.exitFactors && formData.exitFactors.includes(factor) ? '1px solid var(--accent-primary)' : '1px solid var(--bg-tertiary)',
                  backgroundColor: formData.exitFactors && formData.exitFactors.includes(factor) ? 'rgba(99, 102, 241, 0.1)' : 'var(--bg-secondary)',
                  color: formData.exitFactors && formData.exitFactors.includes(factor) ? 'var(--accent-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: formData.exitFactors && formData.exitFactors.includes(factor) ? '500' : '400',
                  transition: 'all 0.2s'
                }}
              >
                {factor}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Exit Note (Prominent) */}
        <div className="form-group" style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{t('exitNote') || 'Exit Note'}</label>
          <textarea
            value={(formData.exitNotes && formData.exitNotes.length > 0) ? formData.exitNotes[0] : ''}
            onChange={(e) => {
              const val = e.target.value;
              setFormData(prev => {
                const newNotes = [...(prev.exitNotes || [])];
                newNotes[0] = val;
                return { ...prev, exitNotes: newNotes };
              });
            }}
            placeholder={t('exitNotePlaceholder') || "Detailed thoughts on this exit..."}
            className="form-textarea large-memo"
            rows={4}
            style={{ width: '100%', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--bg-tertiary)', color: 'white' }}
          />
        </div>

        <div className="step-actions" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
          <button type="button" onClick={() => setStep(1)} className="btn-secondary">
            <ArrowLeft size={18} /> {t('back')}
          </button>
          <button
            type="button"
            onClick={() => setStep(3)} // Go to Step 3 (Review)
            className="btn-primary"
            disabled={!formData.outcomeStatus}
            style={{ opacity: formData.outcomeStatus ? 1 : 0.5 }}
          >
            {t('nextReview') || 'Next: Review'} <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  };

  const renderAnalysisStep = () => {
    // If Sell, use the new Narrative Linking flow
    if (formData.type === 'sell') {
      return renderSellStep2();
    }

    // Existing Buy Analysis Step is replaced by new renderStep2 (Tag Selection)
    return renderStep2();
  };

  const renderSellStep3 = () => {
    const outcomeOptions = getOutcomeOptions();
    const exitFactors = getExitFactors();

    const handleAddCustomTag = (type) => {
      if (type === 'outcome' && formData.customOutcome) {
        // In a real app, you might want to add this to a persistent list
        // For now, we just select it as the outcomeStatus (assuming ID matches label for custom)
        const customId = formData.customOutcome.toLowerCase().replace(/\s+/g, '_');
        // We can't easily add to the static options list imported, but we can set the ID
        // and handle display logic. For simplicity, we'll just set it.
        setFormData(prev => ({ ...prev, outcomeStatus: customId, customOutcome: '' }));
      } else if (type === 'factor' && formData.customExitFactor) {
        setFormData(prev => ({
          ...prev,
          exitFactors: [...prev.exitFactors, formData.customExitFactor],
          customExitFactor: ''
        }));
      }
    };

    return (
      <div className="step-container">
        <div className="step-header">
          <h4>Step 3: Outcome & Factors</h4>
          <p>Classify the result and document the cause.</p>
        </div>

        {/* 1. Outcome Status (Tags) */}
        <div className="form-group">
          <label>Outcome Status</label>
          <div className="tags-container">
            {outcomeOptions.map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`tag-btn ${formData.outcomeStatus === opt.id ? 'selected' : ''}`}
                onClick={() => setFormData(prev => ({ ...prev, outcomeStatus: opt.id }))}
              >
                {opt.label}
              </button>
            ))}
            {/* Custom Outcome Input (Simplified) */}
            <div className="custom-tag-input">
              <input
                type="text"
                placeholder="+ New Outcome"
                value={formData.customOutcome}
                onChange={e => setFormData(prev => ({ ...prev, customOutcome: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddCustomTag('outcome')}
              />
              {formData.customOutcome && (
                <button type="button" onClick={() => handleAddCustomTag('outcome')}><Plus size={14} /></button>
              )}
            </div>
          </div>
        </div>

        {/* 2. Exit Factors (Tags) */}
        <div className="form-group">
          <label>Exit Factors</label>
          <div className="tags-container">
            {Object.values(exitFactors).flat().map(factor => (
              <button
                key={factor}
                type="button"
                className={`tag-btn ${formData.exitFactors.includes(factor) ? 'selected' : ''}`}
                onClick={() => {
                  setFormData(prev => {
                    const newFactors = prev.exitFactors.includes(factor)
                      ? prev.exitFactors.filter(f => f !== factor)
                      : [...prev.exitFactors, factor];
                    return { ...prev, exitFactors: newFactors };
                  });
                }}
              >
                {factor}
              </button>
            ))}
            <div className="custom-tag-input">
              <input
                type="text"
                placeholder="+ New Factor"
                value={formData.customExitFactor}
                onChange={e => setFormData(prev => ({ ...prev, customExitFactor: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddCustomTag('factor')}
              />
              {formData.customExitFactor && (
                <button type="button" onClick={() => handleAddCustomTag('factor')}><Plus size={14} /></button>
              )}
            </div>
          </div>
        </div>

        {/* 3. Exit Note (Prominent) */}
        <div className="form-group">
          <label>Exit Note</label>
          <textarea
            value={(formData.exitNotes && formData.exitNotes.length > 0) ? formData.exitNotes[0] : ''}
            onChange={(e) => handleNoteChange('exit', 0, e.target.value)}
            placeholder="Detailed thoughts on this exit..."
            className="form-textarea large-memo"
            rows={4}
          />
        </div>

        <div className="step-actions">
          <button type="button" onClick={() => setStep(2)} className="btn-secondary">
            <ArrowLeft size={18} /> Back
          </button>
          <button
            type="button"
            onClick={() => setStep(4)}
            className="btn-primary"
            disabled={!formData.outcomeStatus}
          >
            Next: Details <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    // If Sell, this step 3 is actually the REVIEW step (step=3 maps to Review UI)
    // We handle this by checking type and returning renderStep4() which is typically the review step
    if (formData.type === 'sell') {
      return renderStep4();
    }
    // If specific sell type step logic is needed (e.g. for linking reasons), handle here.
    // For now, mirroring desktop "Exit Strategy" design which seems universal or buy-centric.

    // Filter tags
    const filteredDefaultExitTags = defaultExitTags.filter(t => t.toLowerCase().includes(exitTagSearch.toLowerCase()));
    const displayedDefaultExitTags = showAllExitTags ? filteredDefaultExitTags : filteredDefaultExitTags.slice(0, 10);
    const isCustomExitTag = exitTagSearch.trim() && !defaultExitTags.some(t => t.toLowerCase() === exitTagSearch.trim().toLowerCase()) && !aiExitTags.some(t => t.toLowerCase() === exitTagSearch.trim().toLowerCase());

    return (
      <div className="step-container">
        <div className="step-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h4 style={{ color: '#818cf8', marginBottom: '8px' }}>{t('exitStrategy') || 'Exit Strategy'}</h4>
              <p style={{ color: 'var(--text-secondary)' }}>{t('exitStrategyDesc') || 'Plan your exit. When will you take profit or cut losses?'}</p>
            </div>
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)' }}>
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="reasons-grid">
          {/* Custom Indicator Builder */}
          <div className="custom-indicator-builder" style={{
            display: 'flex',
            gap: '12px',
            marginBottom: '24px',
            padding: '16px',
            backgroundColor: 'var(--bg-secondary)', // #0f172a
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--bg-tertiary)',
            flexWrap: 'wrap' // Allow wrapping on small mobile screens if needed
          }}>
            <div style={{ flex: '1 1 140px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Indicator</label>
              <div style={{ position: 'relative' }}>
                <select
                  value={formData.customIndicatorType}
                  onChange={(e) => setFormData(prev => ({ ...prev, customIndicatorType: e.target.value }))}
                  className="form-select"
                  style={{ width: '100%', appearance: 'none', paddingRight: '30px' }}
                >
                  <option value="Price Target ($)">Price Target ($)</option>
                  <option value="Stop Loss ($)">Stop Loss ($)</option>
                  <option value="RSI (Level)">RSI (Level)</option>
                  <option value="Trailing Stop (%)">Trailing Stop (%)</option>
                  <option value="MA Cross (Days)">MA Cross (Days)</option>
                  <option value="Volume Spike (x)">Volume Spike (x)</option>
                </select>
                <ChevronDown size={14} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
              </div>
            </div>
            <div style={{ flex: '1 1 100px' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Value</label>
              <input
                type="number"
                value={formData.customIndicatorValue}
                onChange={(e) => setFormData(prev => ({ ...prev, customIndicatorValue: e.target.value }))}
                placeholder="0.00"
                className="form-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && formData.customIndicatorValue) {
                    const signal = `${formData.customIndicatorType}: ${formData.customIndicatorValue}`;
                    setFormData(prev => ({
                      ...prev,
                      exitTags: [...(prev.exitTags || []), signal],
                      customIndicatorValue: ''
                    }));
                  }
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '2px' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ height: '42px', width: '42px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none' }}
                onClick={() => {
                  if (formData.customIndicatorValue) {
                    const signal = `${formData.customIndicatorType}: ${formData.customIndicatorValue}`;
                    setFormData(prev => ({
                      ...prev,
                      exitTags: [...(prev.exitTags || []), signal],
                      customIndicatorValue: ''
                    }));
                  }
                }}
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          {/* Exit Tag Selection System */}
          <div className="exit-tag-section" style={{ marginBottom: '24px' }}>
            <h5 style={{ fontSize: '0.95rem', marginBottom: '12px', color: 'white', fontWeight: '600' }}>Exit Strategy Tags</h5>

            {/* Search Bar */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <div className="search-wrapper" style={{ position: 'relative', display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Search or create new exit tag..."
                  value={exitTagSearch}
                  onChange={(e) => setExitTagSearch(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '40px', flex: 1, backgroundColor: 'rgba(30, 41, 59, 0.5)', borderColor: 'var(--bg-tertiary)' }}
                />
                <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', background: 'var(--bg-tertiary)', borderRadius: '50%' }}>
                  <Search size={12} style={{ color: 'var(--text-secondary)' }} />
                </div>

                {isCustomExitTag && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleCreateExitTag}
                  >
                    <Plus size={16} /> Add
                  </button>
                )}
              </div>
            </div>

            {/* Selected Exit Tags Display */}
            {formData.exitTags && formData.exitTags.length > 0 && (
              <div className="selected-tags-area" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {formData.exitTags.map(tag => (
                    <span
                      key={tag}
                      className="tag-pill selected"
                      onClick={() => toggleExitTag(tag)}
                      style={{
                        backgroundColor: 'rgba(99, 102, 241, 0.2)',
                        color: '#a5b4fc',
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                      }}
                    >
                      {getExitTagLabel(tag)}
                      <X size={14} />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Exit Tags */}
            <div className="tags-section">
              <h5 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                Recommended Exit Tags
              </h5>
              <div className="tags-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {displayedDefaultExitTags.map(tag => (
                  <button
                    key={`def-exit-${tag}`}
                    type="button"
                    className={`tag-pill ${formData.exitTags?.includes(tag) ? 'active' : ''}`}
                    onClick={() => toggleExitTag(tag)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '20px',
                      border: '1px solid var(--bg-tertiary)',
                      backgroundColor: 'rgba(15, 23, 42, 0.6)',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {getExitTagLabel(tag)}
                  </button>
                ))}
              </div>
              {filteredDefaultExitTags.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAllExitTags(!showAllExitTags)}
                  className="btn-ghost"
                  style={{ marginTop: '12px', fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '4px 8px' }}
                >
                  {showAllExitTags ? 'Show Less' : `Show More (${filteredDefaultExitTags.length - 10} more)`}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="step-actions" style={{ marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid var(--bg-tertiary)' }}>
          <button type="button" onClick={() => setStep(2)} className="btn-secondary" style={{ minWidth: '100px' }}>
            <ArrowLeft size={18} /> {t('back')}
          </button>
          <button
            type="button"
            onClick={() => setStep(4)}
            className="btn-primary"
            style={{ flex: 1, background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', border: 'none' }}
          >
            {t('nextReview') || 'Next: Review'} <ArrowRight size={18} />
          </button>
        </div>
      </div>
    );
  };



  const [activeTab, setActiveTab] = useState('fundamental'); // 'fundamental', 'feeds', 'technical'
  const [generatedReasons, setGeneratedReasons] = useState(null);
  const [generatedSellSignals, setGeneratedSellSignals] = useState(null);
  const [aiInsights, setAiInsights] = useState(null);

  // Effect to trigger generation if starting at step 2
  useEffect(() => {
    // If we are at step 2 (Analysis) and haven't generated reasons yet, do it now.
    // This covers both "New Transaction from Asset Page" (initialStep=2) and "Edit Transaction" (initialStep=2)
    // The old reason generation is now deprecated for buy transactions in favor of tags.
    // For sell transactions, renderSellStep2 still uses `generatedReasons` for linking narratives.
    if (step === 2 && formData.asset) {
      // Ensure price is fetched if starting from Asset Details
      const currentPrice = getPrice(formData.asset);
      if (currentPrice && currentPrice.price > 0) {
        setFormData(prev => ({ ...prev, price: currentPrice.price }));
      } else {
        fetchPriceForTicker(formData.asset).then(priceData => {
          if (priceData) setFormData(prev => ({ ...prev, price: priceData.price }));
        });
      }

      // Only generate reasons for sell transactions if still using the old flow
      if (formData.type === 'sell' && !generatedReasons) {
        generateSellReasons();
      }
    }
  }, [step, formData.asset, formData.type]); // Depend on step, asset, type

  const formatEngagement = (num) => {
    if (!num) return '0';
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    // Auto-uppercase asset ticker
    const finalValue = name === 'asset' ? value.toUpperCase() : value;
    setFormData(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleCustomReasonChange = (category, value) => {
    setFormData(prev => ({
      ...prev,
      customReasons: { ...prev.customReasons, [category]: value }
    }));
  };

  const handleReasonToggle = (reason) => {
    setFormData(prev => {
      const exists = prev.selectedReasons.includes(reason);
      if (exists) {
        return { ...prev, selectedReasons: prev.selectedReasons.filter(r => r !== reason) };
      } else {
        return { ...prev, selectedReasons: [...prev.selectedReasons, reason] };
      }
    });
  };

  const handleAddCustomReason = (category) => {
    const value = formData.customReasons[category];
    if (value && value.trim()) {
      const newReason = `[${category}] ${value.trim()} `;
      setFormData(prev => ({
        ...prev,
        selectedReasons: [...prev.selectedReasons, newReason],
        customReasons: { ...prev.customReasons, [category]: '' }
      }));
    }
  };

  const handleAddCustomSellSignal = () => {
    if (formData.customSellSignal.trim()) {
      setFormData(prev => ({
        ...prev,
        selectedSellSignals: [...prev.selectedSellSignals, formData.customSellSignal.trim()],
        customSellSignal: ''
      }));
    }
  };

  const handleSellSignalToggle = (signal) => {
    setFormData(prev => {
      const exists = prev.selectedSellSignals.includes(signal);
      if (exists) {
        return { ...prev, selectedSellSignals: prev.selectedSellSignals.filter(s => s !== signal) };
      } else {
        return { ...prev, selectedSellSignals: [...prev.selectedSellSignals, signal] };
      }
    });
  };







  const handleReasonDetailChange = (reason, detail) => {
    setFormData(prev => ({
      ...prev,
      reasonDetails: { ...prev.reasonDetails, [reason]: detail }
    }));
  };

  const handleReasonLinkChange = (reason, link) => {
    setFormData(prev => ({
      ...prev,
      reasonLinks: { ...prev.reasonLinks, [reason]: link }
    }));
  };

  // Special renderer for event-driven news (objects with headline, source, link)
  const renderNewsCategory = (title, categoryKey, newsItems) => (
    <div className="reason-category vertical-list">
      <h5>{title}</h5>
      {newsItems.map((newsItem, idx) => {
        // Use headline as the unique identifier
        const isSelected = formData.selectedReasons.includes(newsItem.headline);
        return (
          <div key={`${categoryKey}-${idx}`} className="reason-item-container">
            <div
              className={`reason-chip ${isSelected ? 'selected' : ''}`}
              onClick={() => handleReasonToggle(newsItem.headline)}
              style={{ width: '100%', whiteSpace: 'normal', height: 'auto' }}
            >
              <div className="chip-content">
                <span className="chip-text">
                  {isSelected ? newsItem.headline : (newsItem.headline.length > 70 ? newsItem.headline.substring(0, 70) + '...' : newsItem.headline)}
                </span>
                {!isSelected && <span className="chip-expand-hint"> (Click to expand)</span>}
              </div>
            </div>
            {isSelected && (
              <div className="reason-details-group news-details">
                <div className="news-meta">
                  <span className="news-source">📰 {newsItem.source}</span>
                  {newsItem.link && (
                    <a
                      href={newsItem.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="news-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      🔗 {t('readArticle') || 'Read Article'}
                    </a>
                  )}
                </div>
                {newsItem.description && (
                  <div className="news-description">
                    {newsItem.description}
                  </div>
                )}
                <textarea
                  placeholder={t('addAnalysisPlaceholder') || "Add your analysis or notes about this news..."}
                  value={formData.reasonDetails[newsItem.headline] || ''}
                  onChange={(e) => handleReasonDetailChange(newsItem.headline, e.target.value)}
                  className="form-textarea"
                  rows={2}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Custom Input for this category */}
      <div className="custom-reason-input">
        <input
          type="text"
          value={formData.customReasons[categoryKey]}
          onChange={(e) => handleCustomReasonChange(categoryKey, e.target.value)}
          placeholder={t('addCustomReasonPlaceholder', { title: title.toLowerCase() }) || `Add custom ${title.toLowerCase()} reason...`}
          className="form-input small-input"
          onKeyDown={(e) => e.key === 'Enter' && handleAddCustomReason(categoryKey)}
        />
        <button type="button" onClick={() => handleAddCustomReason(categoryKey)} className="btn-icon small-btn">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );

  // Special renderer for tweets (objects with text, author, engagement)
  const renderTweetCategory = (title, categoryKey, tweets) => (
    <div className="reason-category vertical-list">
      <h5>{title}</h5>
      {tweets && tweets.length > 0 ? (
        tweets.map((tweet, idx) => {
          // Format tweet as "@username: text" for storage and display
          const tweetText = `@${tweet.author}: ${tweet.text}`;
          const isSelected = formData.selectedReasons.includes(tweetText);
          return (
            <div key={`${categoryKey}-${idx}`} className="reason-item-container">
              <div
                className={`reason-chip tweet-chip ${isSelected ? 'selected' : ''}`}
                onClick={() => handleReasonToggle(tweetText)}
                style={{ width: '100%', whiteSpace: 'normal', height: 'auto' }}
              >
                <div className="tweet-header-compact">
                  <span className="tweet-author">@{tweet.author}</span>
                  <span className="tweet-preview">
                    {tweet.text.length > 60 ? tweet.text.substring(0, 60) + '...' : tweet.text}
                  </span>
                </div>
              </div>
              {isSelected && (
                <div className="reason-details-group tweet-details">
                  <div className="full-tweet-text">{tweet.text}</div>
                  <div className="tweet-meta">
                    <span className="tweet-stat">❤️ {formatEngagement(tweet.likes)}</span>
                    <span className="tweet-stat">🔁 {formatEngagement(tweet.retweets)}</span>
                    <span className="tweet-stat">💬 {formatEngagement(tweet.replies)}</span>
                    {tweet.link && (
                      <a
                        href={tweet.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tweet-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        🔗 {t('viewTweet') || 'View Tweet'}
                      </a>
                    )}
                  </div>
                  <textarea
                    placeholder={t('tweetRelevancePlaceholder') || "Why is this tweet relevant to your decision?"}
                    value={formData.reasonDetails[tweetText] || ''}
                    onChange={(e) => handleReasonDetailChange(tweetText, e.target.value)}
                    className="form-textarea"
                    rows={2}
                  />
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="no-tweets-message">
          {t('noTweetsAvailable') || 'No tweets available. Configure your Twitter API key to see social sentiment.'}
        </div>
      )}

      {/* Custom Input for this category */}
      <div className="custom-reason-input">
        <input
          type="text"
          value={formData.customReasons[categoryKey]}
          onChange={(e) => handleCustomReasonChange(categoryKey, e.target.value)}
          placeholder={t('addCustomTweetPlaceholder', { title: title.toLowerCase() }) || `Add custom ${title.toLowerCase()} tweet...`}
          className="form-input small-input"
          onKeyDown={(e) => e.key === 'Enter' && handleAddCustomReason(categoryKey)}
        />
        <button type="button" onClick={() => handleAddCustomReason(categoryKey)} className="btn-icon small-btn">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );

  const renderCategory = (title, categoryKey, reasons) => (
    <div className="reason-category">
      <h5>{title}</h5>
      {reasons.map((reason, idx) => {
        const isSelected = formData.selectedReasons.includes(reason);
        return (
          <div key={`${categoryKey}-${idx}`} className="reason-item-container">
            <div
              className={`reason-chip ${isSelected ? 'selected' : ''}`}
              onClick={() => handleReasonToggle(reason)}
            >
              {reason}
            </div>
            {isSelected && (
              <div className="reason-details-group">
                <textarea
                  placeholder={t('addDetailsPlaceholder') || "Add specific details or notes..."}
                  value={formData.reasonDetails[reason] || ''}
                  onChange={(e) => handleReasonDetailChange(reason, e.target.value)}
                  className="form-textarea"
                  rows={2}
                />
                <input
                  type="text"
                  placeholder={t('addResourceLinkPlaceholder') || "Add resource link (http://...)"}
                  value={formData.reasonLinks[reason] || ''}
                  onChange={(e) => handleReasonLinkChange(reason, e.target.value)}
                  className="form-input small-text"
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Custom Input for this category */}
      <div className="custom-reason-input">
        <input
          type="text"
          value={formData.customReasons[categoryKey]}
          onChange={(e) => handleCustomReasonChange(categoryKey, e.target.value)}
          placeholder={t('addCustomReasonPlaceholder', { title: title.toLowerCase() }) || `Add custom ${title.toLowerCase()} reason...`}
          className="form-input small-input"
          onKeyDown={(e) => e.key === 'Enter' && handleAddCustomReason(categoryKey)}
        />
        <button type="button" onClick={() => handleAddCustomReason(categoryKey)} className="btn-icon small-btn">
          <Plus size={16} />
        </button>
      </div>
    </div>
  );





  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (isSubmitting) return;

    console.log("Starting transaction submission...");
    setIsSubmitting(true);

    try {
      // Combine notes
      const finalMemo = formData.investmentNotes.filter(n => n.trim()).join('\n\n');
      const finalExitMemo = formData.exitNotes.filter(n => n.trim()).join('\n\n');

      // Resolve Tag Links
      const tagLinks = {};
      if (formData.tags && formData.tags.length > 0) {
        formData.tags.forEach(tag => {
          // Find matching thesis for this tag
          // We look for a thesis where the summaryTag matches the selected tag
          // and the asset matches the current asset (to be safe)
          const matchingThesis = theses.find(t =>
            t.summaryTag === tag &&
            t.asset === formData.asset.toUpperCase()
          );

          if (matchingThesis && matchingThesis.url) {
            tagLinks[tag] = matchingThesis.url;
          }
        });
      }

      // Validation
      const amountVal = parseFloat(formData.amount);
      const priceVal = parseFloat(formData.price);

      if (isNaN(amountVal) || amountVal <= 0) {
        alert("Please enter a valid amount.");
        setIsSubmitting(false);
        return;
      }
      if (isNaN(priceVal) || priceVal < 0) {
        alert("Please enter a valid price.");
        setIsSubmitting(false);
        return;
      }

      const transactionData = {
        ...formData,
        asset: formData.asset.toUpperCase(), // Ensure uppercase for consistency
        amount: amountVal,
        price: priceVal,
        // Add group field for grouping logic
        group: formData.selectedGroup || formData.asset.toUpperCase(),
        // Add holdings_breakdown for manual buy transactions
        ...(formData.type === 'buy' ? {
          holdings_breakdown: [{
            source: 'Manual',
            protocolName: 'Manual',
            amount: parseFloat(formData.amount),
            usdValue: parseFloat(formData.amount) * parseFloat(formData.price),
            chain: formData.selectedChain || null,
            protocol_id: 'manual',
            isLiability: false
          }]
        } : {}),
        date: new Date(formData.date).toISOString(), // Ensure ISO format
        memo: finalMemo,
        exitMemo: finalExitMemo,
        tags: formData.tags || [], // Ensure tags are saved
        exitTags: formData.exitTags || [], // Ensure exit tags are saved
        tagLinks: tagLinks, // Save the links
        timestamp: new Date().toISOString(),
        pnl: 0, // Initial PnL is 0
        status: 'open',

        // Save AI Data if selected
        ai_fundamental: formData.includeFundamental ? widgetFundamentalData : null,
        ai_events: formData.includeEvents ? widgetEventsData : null,
        ai_technical: proTaData || null, // Always save Pro TA if available

        // Unified Market Context Snapshot (Placeholders)
        market_context_snapshot: {
          timestamp: Date.now(),
          price: priceVal,
          // Placeholders to be filled by Context or null
          btcDominance: null,
          fearAndGreedIndex: null,
          globalMarketCapChange: null,
          marketSentiment: null,
          topSector: null,
          fdv_ratio: null,
          tvl_trend_30d: null,
          sector_tags: [],
          price_change_24h: null,
          rsi_1h: null,
          rsi_4h: null,
          rsi_1d: null,
          macd_1h: null,
          macd_4h: null,
          structure_4h: null,
          structure_1d: null,
          near_level: null,
          narratives: [],
          news_sentiment: null,
          social_buzz_level: null
        },

        // AI Analysis Fields
        ai_entry_summary: null,
        ai_exit_plan: null,
        ai_risk_comment: null,

        // AI TA Snapshot (Structured)
        ai_ta_snapshot: proTaData ? {
          short_term: {
            trend: proTaData.verdicts?.short,
            support: proTaData.levels?.shortTerm?.support,
            resistance: proTaData.levels?.shortTerm?.resistance
          },
          long_term: {
            trend: proTaData.verdicts?.long,
            support: proTaData.levels?.longTerm?.support,
            resistance: proTaData.levels?.longTerm?.resistance
          },
          overall_verdict: proTaData.action,
          volatility_comment: proTaData.volatility_comment || null
        } : null,

        // Step 4: Fundamental & Events
        ai_fundamental_insights: (widgetFundamentalData?.analysis && formData.includeFundamental) ? {
          items: [
            { title: 'Verdict', body: widgetFundamentalData.analysis.verdict },
            { title: 'Reasoning', body: widgetFundamentalData.analysis.verdictReasoning },
            { title: 'What it Does', body: widgetFundamentalData.analysis.whatItDoes }
          ],
          user_approved: true,
          generated_at: new Date().toISOString()
        } : null,

        important_events_snapshot: (widgetEventsData && formData.includeEvents) ? {
          discussions: widgetEventsData.discussions || [],
          past_month_events: widgetEventsData.past_month_events || [],
          future_events: widgetEventsData.future_events || [],
          user_approved: true,
          generated_at: new Date().toISOString()
        } : null,

        ai_events_insights: null,

        // Deprecated fields still included for backward compatibility
        reasons: formData.selectedReasons || [], // Map for display in History/Journal
        sellSignals: formData.selectedSellSignals || [], // Map for display in History/Journal
        selectedReasons: formData.selectedReasons || [],
        reasonDetails: formData.reasonDetails || {},
        customReasons: formData.customReasons || {},
        selectedSellSignals: formData.selectedSellSignals || [],
      };

      // Add diagnosis if available
      if (formData.diagnosis) {
        transactionData.diagnosis = formData.diagnosis;
      }

      // Capture context snapshot for Sell transactions and Pre-calculate PnL
      if (formData.type === 'sell') {
        try {
          if (typeof captureContextSnapshot === 'function') {
            const snapshot = await captureContextSnapshot();
            transactionData.contextSnapshot = snapshot;
          }

          // Pre-calculate PnL/ROI from client-side state to ensure data integrity
          // This serves as a robust fallback/primary source for the transaction record
          const relevantTxs = transactions.filter(t => t.asset === formData.asset.toUpperCase() && t.date <= formData.date);
          let currentQty = 0;
          let totalCost = 0;

          relevantTxs.sort((a, b) => new Date(a.date) - new Date(b.date));

          for (const tx of relevantTxs) {
            const tAmount = parseFloat(tx.amount || 0);
            const tPrice = parseFloat(tx.price || 0);
            if (tx.type === 'buy') {
              currentQty += tAmount;
              totalCost += (tAmount * tPrice);
            } else if (tx.type === 'sell') {
              const avgC = currentQty > 0 ? totalCost / currentQty : 0;
              currentQty -= tAmount;
              totalCost -= (tAmount * avgC);
            }
          }

          // Current Avg Entry Price
          const avgEntryPrice = currentQty > 0 ? totalCost / currentQty : 0;

          // Correctly handle small float errors or empty positions
          if (avgEntryPrice > 0) {
            const sellAmt = parseFloat(formData.amount);
            const sellPx = parseFloat(formData.price);
            const tradePnl = (sellPx - avgEntryPrice) * sellAmt;
            const roiVal = ((sellPx - avgEntryPrice) / avgEntryPrice) * 100;

            transactionData.pnl = tradePnl;
            transactionData.roi = roiVal;
            transactionData.avg_entry_at_sale = avgEntryPrice;
          }

          transactionData.status = 'closed'; // Mark as closed
          transactionData.linkedBuyReasons = formData.linkedBuyReasons;
          transactionData.outcomeStatus = formData.outcomeStatus;
          transactionData.exitFactors = formData.exitFactors;
        } catch (e) {
          console.error("Failed to capture context or calculate PnL:", e);
        }
      }

      if (initialData && initialData.id) {
        // Fix: updateTransaction expects a single object with ID
        await updateTransaction({ ...transactionData, id: initialData.id });
      } else {
        await addTransaction(transactionData);
      }
      onClose();
    } catch (error) {
      console.error('Error saving transaction:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep4 = () => {
    // Calculate holdings for sell validation
    const currentHoldings = transactions
      .filter(tx => tx.asset === formData.asset)
      .reduce((acc, tx) => {
        return tx.type === 'buy' ? acc + parseFloat(tx.amount || 0) : acc - parseFloat(tx.amount || 0);
      }, 0);

    // If editing, add back the original amount to available holdings
    const effectiveHoldings = (initialData && initialData.type === 'sell' && initialData.asset === formData.asset)
      ? currentHoldings + parseFloat(initialData.amount || 0)
      : currentHoldings;

    const sellAmount = parseFloat(formData.amount || 0);
    const isOverselling = formData.type === 'sell' && sellAmount > effectiveHoldings;

    // Helper to toggle collapsible sections
    const toggleSection = (section) => {
      // Implementation for collapsible interaction would logically require state, 
      // using a simple local set for expanded items if not already present.
      // For UI purpose, we just render them collapsed as per screenshot.
    };

    return (
      <div className="step-container" style={{ padding: '0' }}> {/* No padding on container to stretch header */}
        <div className="step-header" style={{ padding: '20px 24px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h4 style={{ color: '#818cf8', margin: 0, fontSize: '1.25rem' }}>{t('review_save') || 'Review & Save'}</h4>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '4px' }}>{t('review_desc') || 'Review transaction details and AI insights before saving.'}</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)' }}>
            <X size={24} />
          </button>
        </div>

        <div className="review-content" style={{ padding: '0 24px 24px' }}>

          {/* 1. AI Coach Review Card */}
          <div className="ai-coach-card" style={{
            background: 'linear-gradient(to right, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.8))',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '20px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={18} style={{ color: 'white' }} />
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 'bold', color: 'white', letterSpacing: '0.5px' }}>{t('ai_coach_review') || 'AI COACH REVIEW'}</h4>
              </div>
              <Sparkles size={40} style={{ color: 'rgba(99, 102, 241, 0.3)', position: 'absolute', top: '5px', right: '5px' }} />
            </div>

            <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '16px', maxWidth: '85%' }}>
              {t('check_trade_fit') || 'Check how this trade fits your system rules before saving.'}
            </p>

            <button
              onClick={() => {
                setIsAnalyzing(true);
                runPreTradeReview(user?.uid || 'guest', formData.asset, formData, transactions, language)
                  .then(advice => setPreTradeReview(advice))
                  .catch(err => console.error("AI Coach Error:", err))
                  .finally(() => setIsAnalyzing(false));
              }}
              disabled={isAnalyzing}
              style={{
                background: 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 16px',
                color: 'white',
                fontSize: '0.8rem',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: isAnalyzing ? 'not-allowed' : 'pointer',
                opacity: isAnalyzing ? 0.7 : 1
              }}
            >
              {isAnalyzing ? <Loader2 size={14} className="spin-icon" /> : <Sparkles size={14} />}
              {isAnalyzing ? (t('analyzing') || 'Analyzing...') : (t('review_trade_setup') || 'Review This Trade Setup')}
            </button>
          </div>

          {/* AI Coach Result Display */}
          {preTradeReview && (
            <div className="ai-coach-result" style={{
              marginTop: '16px',
              padding: '16px',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '8px',
              animation: 'fadeIn 0.5s ease-out'
            }}>
              <h5 style={{ margin: '0 0 12px', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}>
                <Brain size={16} /> {t('coach_diagnosis') || "Coach's Diagnosis"}
              </h5>

              {/* Behavior Summary */}
              <div style={{ marginBottom: '16px', fontSize: '0.9rem', lineHeight: '1.5', color: '#e2e8f0' }}>
                {preTradeReview.behavior_summary}
              </div>

              {/* Playbook Rules */}
              {preTradeReview.recommended_playbook && preTradeReview.recommended_playbook.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {preTradeReview.recommended_playbook.map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      gap: '10px',
                      backgroundColor: 'rgba(15, 23, 42, 0.6)',
                      padding: '10px',
                      borderRadius: '6px',
                      fontSize: '0.85rem'
                    }}>
                      <div style={{ color: '#818cf8', fontWeight: 'bold', minWidth: '20px' }}>{idx + 1}.</div>
                      <div>
                        <div style={{ color: 'white', fontWeight: '600', marginBottom: '2px' }}>{item.rule}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{item.reasoning}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2. Transaction Details Card */}
          {/* 2. Transaction Details Card */}
          <div className="details-card" style={{ marginBottom: '20px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #1e293b' }}>
            <div style={{ backgroundColor: '#020617', padding: '12px 16px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h5 style={{ margin: 0, color: 'white', fontWeight: 'bold', fontSize: '0.95rem' }}>{t('transaction_details') || 'Transaction Details'}</h5>
              <span style={{
                color: formData.type === 'buy' ? '#22c55e' : '#ef4444',
                fontWeight: 'bold',
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                backgroundColor: formData.type === 'buy' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                padding: '2px 8px',
                borderRadius: '4px'
              }}>
                {formData.type}
              </span>
            </div>

            <div style={{ backgroundColor: '#0f172a', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Asset */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                <span style={{ color: '#94a3b8' }}>{t('asset') || 'Asset'}</span>
                <span style={{ color: 'white', fontWeight: '500' }}>{formData.asset}</span>
              </div>

              {/* Amount */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                <span style={{ color: '#94a3b8' }}>{t('amount') || 'Amount'}</span>
                <span style={{ color: 'white', fontWeight: '500' }}>{parseFloat(formData.amount).toLocaleString()}</span>
              </div>

              {/* Price */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                <span style={{ color: '#94a3b8' }}>{t('price') || 'Price'}</span>
                <span style={{ color: 'white', fontWeight: '500' }}>${parseFloat(formData.price).toLocaleString()}</span>
              </div>

              {/* Date */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.9rem' }}>
                <span style={{ color: '#94a3b8' }}>{t('date') || 'Date'}</span>
                <span style={{ color: 'white', fontWeight: '500' }}>{formData.date}</span>
              </div>
            </div>
          </div>

          {/* Review Sections */}

          {/* 3. Pro Technical Analysis */}
          <div className="review-section-collapsible" style={{ marginBottom: '16px', background: '#020617', borderRadius: '8px', border: '1px solid #1e293b', overflow: 'hidden' }}>
            <details onToggle={(e) => {
              // Logic to ensure we don't accidentally close when clicking checkbox is handled by stopPropagation on checkbox
            }}>
              <summary style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', listStyle: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ChevronRight size={16} className="summary-arrow" style={{ transition: 'transform 0.2s' }} />
                  <span style={{ fontWeight: '500', color: 'white' }}>{t('pro_technical_analysis') || 'Pro Technical Analysis'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={formData.includeTechnicalAnalysis || false}
                    onChange={(e) => setFormData(prev => ({ ...prev, includeTechnicalAnalysis: e.target.checked }))}
                    style={{ width: '18px', height: '18px', accentColor: '#6366f1', cursor: 'pointer' }}
                  />
                </div>
              </summary>
              <div style={{ padding: '0 16px 16px', borderTop: '1px solid #1e293b' }}>
                <div style={{ marginTop: '12px' }}>
                  <TechnicalAnalysisWidget
                    symbol={formData.asset}
                    onAnalysisComplete={setProTaData}
                  />
                </div>
              </div>
            </details>
          </div>

          {/* 4. Fundamental Intelligence */}
          <div className="review-section-collapsible" style={{ marginBottom: '16px', background: '#020617', borderRadius: '8px', border: '1px solid #1e293b', overflow: 'hidden' }}>
            <details>
              <summary style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', listStyle: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ChevronRight size={16} className="summary-arrow" style={{ transition: 'transform 0.2s' }} />
                  <span style={{ fontWeight: '500', color: 'white' }}>{t('fundamentalIntelligence') || 'Fundamental Intelligence'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={formData.includeFundamental || false}
                    onChange={(e) => setFormData(prev => ({ ...prev, includeFundamental: e.target.checked }))}
                    style={{ width: '18px', height: '18px', accentColor: '#6366f1', cursor: 'pointer' }}
                  />
                </div>
              </summary>
              <div style={{ padding: '4px', borderTop: '1px solid #1e293b' }}>
                <FundamentalWidget
                  symbol={formData.asset}
                  onDataLoaded={data => setWidgetFundamentalData(prev => ({ ...prev, ...data }))}
                  onAnalysisComplete={analysis => setWidgetFundamentalData(prev => ({ ...prev, analysis }))}
                />
              </div>
            </details>
          </div>

          {/* 5. Important Events & Insights */}
          <div className="review-section-collapsible" style={{ marginBottom: '16px', background: '#020617', borderRadius: '8px', border: '1px solid #1e293b', overflow: 'hidden' }}>
            <details>
              <summary style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', listStyle: 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <ChevronRight size={16} className="summary-arrow" style={{ transition: 'transform 0.2s' }} />
                  <span style={{ fontWeight: '500', color: 'white' }}>{t('importantEvents') || 'Important Events & Insights'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={formData.includeEvents || false}
                    onChange={(e) => setFormData(prev => ({ ...prev, includeEvents: e.target.checked }))}
                    style={{ width: '18px', height: '18px', accentColor: '#6366f1', cursor: 'pointer' }}
                  />
                </div>
              </summary>
              <div style={{ padding: '4px', borderTop: '1px solid #1e293b' }}>
                {/* Using ImportantEvents for distinct event data */}
                <ImportantEvents
                  symbol={formData.asset}
                  onDataLoaded={setWidgetEventsData}
                />
              </div>
            </details>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid #1e293b', fontSize: '0.95rem' }}>
            <span style={{ color: '#94a3b8' }}>{t('total_value') || 'Total Value'}</span>
            <span style={{ color: 'white', fontWeight: 'bold' }}>
              ${((parseFloat(formData.amount || 0) * parseFloat(formData.price || 0)) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* 3. Thesis & Notes Card */}
        <div className="thesis-card" style={{ backgroundColor: '#0f172a', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h5 style={{ margin: '0 0 16px', color: 'white', fontSize: '0.95rem', fontWeight: 'bold' }}>{t('thesis_notes') || 'Thesis & Notes'}</h5>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8', marginBottom: '8px' }}>
              <Target size={12} /> {formData.type === 'buy' ? (t('buy_thesis') || 'BUY THESIS') : (t('sell_outcome') || 'SELL OUTCOME')}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {formData.tags && formData.tags.length > 0 ? (
                formData.tags.map(tag => (
                  <span key={tag} style={{ color: '#94a3b8', fontSize: '0.85rem', fontStyle: 'italic' }}>#{tag}</span>
                ))
              ) : <span style={{ color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic' }}>{t('no_thesis_tags') || 'No thesis tags selected'}</span>}
            </div>
          </div>
        </div>



        {/* Sell Amount Validation Error */}
        {
          isOverselling && (
            <div className="validation-error" style={{
              padding: 'var(--spacing-md)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--accent-danger)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--accent-danger)',
              marginTop: 'var(--spacing-md)',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)'
            }}>
              <AlertTriangle size={20} />
              <div>
                <strong>{t('insufficientHoldings') || 'Insufficient Holdings'}:</strong> {t('insufficient_holdings_desc', { sellAmount: sellAmount.toFixed(4), asset: formData.asset, currentHoldings: currentHoldings.toFixed(4) }) || `You are trying to sell ${sellAmount.toFixed(4)} ${formData.asset}, but you only hold ${currentHoldings.toFixed(4)} ${formData.asset}.`}
              </div>
            </div>
          )
        }


        <div className="step-actions" style={{
          marginTop: 'auto',
          borderTop: '1px solid #1e293b',
          backgroundColor: '#020617',
          padding: '16px 24px',
          position: 'sticky',
          bottom: 0,
          zIndex: 10
        }}>
          <button type="button" onClick={() => formData.type === 'sell' ? setStep(2) : setStep(3)} className="btn-secondary" style={{ backgroundColor: 'transparent', border: '1px solid #334155', color: '#cbd5e1' }}>
            <ArrowLeft size={18} /> {t('back')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn-primary"
            disabled={isOverselling || isSubmitting}
            style={{
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              border: 'none',
              opacity: (isOverselling || isSubmitting) ? 0.5 : 1,
              cursor: (isOverselling || isSubmitting) ? 'not-allowed' : 'pointer'
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="spin" /> {t('saving') || 'Saving...'}
              </>
            ) : (
              <>
                <Check size={18} /> {t('save_transaction') || 'Save Transaction'}
              </>
            )}
          </button>
        </div>
      </div >
    );
  };



  return (
    <div className="wizard-container">
      <div className="progress-bar">
        <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>1</div>
        <div className="progress-line"></div>
        <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>2</div>
        <div className="progress-line"></div>
        <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>3</div>
      </div>

      {step === 1 && renderMergedStep1()}
      {step === 2 && renderAnalysisStep()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}

      <style>{`
        .analysis-step {
          max-width: 800px;
          margin: 0 auto;
        }

        .large-memo {
          min-height: 120px;
          font-size: 1rem;
          line-height: 1.5;
          padding: var(--spacing-md);
          border: 1px solid var(--bg-tertiary);
          background-color: var(--bg-secondary);
          color: var(--text-primary);
          border-radius: var(--radius-md);
          resize: vertical;
        }

        .large-memo:focus {
          outline: none;
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 2px rgba(var(--accent-primary-rgb), 0.1);
        }

        .analysis-tabs {
          display: flex;
          gap: var(--spacing-sm);
          border-bottom: 1px solid var(--bg-tertiary);
          margin-bottom: var(--spacing-md);
        }

        .tab-btn {
          padding: var(--spacing-sm) var(--spacing-md);
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: var(--text-secondary);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab-btn:hover {
          color: var(--text-primary);
        }

        .tab-btn.active {
          color: var(--accent-primary);
          border-bottom-color: var(--accent-primary);
        }

        .tab-content {
          min-height: 300px;
          margin-bottom: var(--spacing-lg);
        }

        .feeds-container {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-lg);
        }

        /* Existing styles below */
        .review-card {
          background-color: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary);
          border-radius: var(--radius-lg);
          padding: var(--spacing-lg);
          margin-bottom: var(--spacing-lg);
        }

        .review-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-lg);
          padding-bottom: var(--spacing-md);
          border-bottom: 1px solid var(--bg-tertiary);
        }

        .review-type {
          font-size: 0.875rem;
          font-weight: 700;
          padding: 4px 12px;
          border-radius: 20px;
          text-transform: uppercase;
        }

        .review-type.buy {
          background-color: rgba(var(--accent-success-rgb), 0.1);
          color: var(--accent-success);
        }

        .review-type.sell {
          background-color: rgba(var(--accent-danger-rgb), 0.1);
          color: var(--accent-danger);
        }

        .review-asset {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-primary);
        }

        .review-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--spacing-lg);
          margin-bottom: var(--spacing-xl);
        }

        .review-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .review-item .label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .review-item .value {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .review-section {
          margin-bottom: var(--spacing-lg);
        }

        .review-section h5 {
          font-size: 0.875rem;
          color: var(--text-secondary);
          margin-bottom: var(--spacing-sm);
          font-weight: 600;
        }

        .review-tag {
          display: inline-block;
          padding: 4px 12px;
          background-color: var(--bg-tertiary);
          border-radius: 16px;
          font-size: 0.875rem;
          color: var(--text-primary);
          margin-right: 8px;
          margin-bottom: 8px;
        }

        .review-note {
          font-style: italic;
          color: var(--text-secondary);
          line-height: 1.5;
          padding-left: var(--spacing-md);
          border-left: 2px solid var(--bg-tertiary);
        }

        .wizard-container {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-lg);
          min-height: 500px;
        }

        .progress-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: var(--spacing-md);
        }

        .progress-step {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background-color: var(--bg-tertiary);
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.875rem;
          transition: all 0.3s;
        }

        .progress-step.active {
          background-color: var(--accent-primary);
          color: white;
        }

        .progress-line {
          width: 30px;
          height: 2px;
          background-color: var(--bg-tertiary);
          margin: 0 var(--spacing-xs);
        }

        .step-container {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
          animation: fadeIn 0.3s ease-out;
          flex: 1;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .step-header h4 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: var(--spacing-xs);
        }

        .step-header p {
          color: var(--text-secondary);
          font-size: 0.875rem;
        }

        .large-input {
          font-size: 1.5rem;
          padding: var(--spacing-md);
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .reasons-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--spacing-lg);
          max-height: 400px;
          overflow-y: auto;
          padding-right: var(--spacing-sm);
        }

        .custom-reason-input {
          display: flex;
          gap: var(--spacing-sm);
          margin-top: var(--spacing-xs);
          margin-bottom: var(--spacing-sm);
        }

        .custom-reason-input .form-input {
          flex: 1;
          font-size: 0.875rem;
        }
        
        .small-input {
          padding: 6px 10px;
        }

        .btn-icon {
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
          border: none;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .small-btn {
          width: 36px;
        }

        .btn-icon:hover {
          background-color: var(--accent-primary);
          color: white;
        }

        .reason-category h5 {
          color: var(--text-accent);
          font-size: 0.875rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: var(--spacing-sm);
          font-weight: 600;
        }

        .reason-chip {
          background-color: var(--bg-primary);
          border: 1px solid var(--bg-tertiary);
          padding: var(--spacing-sm) var(--spacing-md);
          border-radius: var(--radius-md);
          margin-bottom: var(--spacing-xs);
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.875rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
          overflow: hidden;
          overflow-x: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          word-break: break-word;
        }

        .reason-chip:hover {
          border-color: var(--accent-primary);
        }

        .reason-chip.selected {
          background-color: rgba(99, 102, 241, 0.1);
          border-color: var(--accent-primary);
          color: var(--accent-primary);
        }

        .summary-section {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--spacing-md);
        }

        .selected-reasons-summary {
          background-color: var(--bg-primary);
          padding: var(--spacing-md);
          border-radius: var(--radius-md);
          border: 1px solid var(--bg-tertiary);
        }

        .reason-item-container {
            margin-bottom: var(--spacing-xs);
        }

        .reason-details-group {
            margin-top: -4px;
            margin-bottom: var(--spacing-sm);
            padding-left: var(--spacing-md);
            border-left: 2px solid var(--accent-primary);
            animation: fadeIn 0.2s ease-out;
            display: flex;
            flex-direction: column;
            gap: var(--spacing-xs);
        }

        .small-text {
            font-size: 0.8rem;
            padding: 6px 10px;
        }

        .news-meta {
            display: flex;
            align-items: center;
            gap: var(--spacing-sm);
            margin-bottom: var(--spacing-xs);
            flex-wrap: wrap;
        }

        .news-source {
            font-size: 0.75rem;
            color: var(--text-secondary);
            font-weight: 500;
        }

        .news-link {
            font-size: 0.75rem;
            color: var(--accent-primary);
            text-decoration: none;
            font-weight: 500;
            transition: opacity 0.2s;
        }

        .news-link:hover {
            opacity: 0.8;
            text-decoration: underline;
        }

        .news-description {
          font-size: 0.8rem;
          color: var(--text-secondary);
          line-height: 1.4;
          margin-top: var(--spacing-xs);
          padding: var(--spacing-xs);
          background-color: var(--bg-secondary);
          border-radius: var(--radius-sm);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          overflow-x: hidden;
          text-overflow: ellipsis;
          word-break: break-word;
        }

        .tweet-chip {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-xs);
          white-space: normal; /* Override reason-chip nowrap */
          height: auto; /* Allow height to grow */
        }

        .tweet-author {
            font-size: 0.75rem;
            color: var(--accent-primary);
            font-weight: 600;
        }

        .tweet-text {
          font-size: 0.875rem;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          overflow-x: hidden;
          text-overflow: ellipsis;
          word-break: break-word;
        }

        .tweet-stat {
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin-right: var(--spacing-sm);
        }

        .tweet-link {
            font-size: 0.75rem;
            color: var(--accent-primary);
            text-decoration: none;
            font-weight: 500;
            transition: opacity 0.2s;
        }

        .tweet-link:hover {
            opacity: 0.8;
            text-decoration: underline;
        }

        .no-tweets-message {
            font-size: 0.875rem;
            color: var(--text-secondary);
            font-style: italic;
            padding: var(--spacing-md);
            text-align: center;
        }

        .form-textarea {
            width: 100%;
            padding: 8px;
            border-radius: var(--radius-sm);
            border: 1px solid var(--bg-tertiary);
            background-color: var(--bg-secondary);
            color: var(--text-primary);
            font-family: inherit;
            resize: vertical;
            font-size: 0.875rem;
        }

        .form-textarea:focus {
            outline: none;
            border-color: var(--accent-primary);
        }

        .summary-reason-detail {
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: 2px;
        }
        
        /* New Styles for Narrative Linking */
        .buy-tx-card {
          background-color: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary);
          padding: var(--spacing-md);
          border-radius: var(--radius-md);
          margin-bottom: var(--spacing-sm);
          cursor: pointer;
          transition: all 0.2s;
        }

        .buy-tx-card:hover {
          border-color: var(--accent-primary);
        }

        .buy-tx-card.selected {
          border-color: var(--accent-primary);
          background-color: rgba(99, 102, 241, 0.05);
        }

        .buy-tx-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-xs);
          font-weight: 600;
        }

        .buy-reasons {
          font-size: 0.85rem;
          color: var(--text-secondary);
        }
        
        .buy-reasons ul {
          margin-top: 4px;
          padding-left: 20px;
        }

        .outcome-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: var(--spacing-md);
        }

        .outcome-card {
          background-color: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary);
          padding: var(--spacing-md);
          border-radius: var(--radius-md);
          cursor: pointer;
          position: relative;
        }

        .outcome-card.selected {
          border-color: var(--accent-primary);
          background-color: rgba(99, 102, 241, 0.05);
        }

        .outcome-label {
          font-weight: 600;
          margin-bottom: 4px;
        }


        /* Dark Premium Theme Variables & Overrides */
        :root {
          --bg-primary: #020617;   /* Slate 950 */
        --bg-secondary: #0f172a; /* Slate 900 */
        --bg-tertiary: #1e293b;  /* Slate 800 */

        --text-primary: #f8fafc; /* Slate 50 */
        --text-secondary: #94a3b8; /* Slate 400 */
        --text-tertiary: #64748b; /* Slate 500 */

        --accent-primary: #6366f1; /* Indigo 500 */
        --accent-secondary: #4f46e5; /* Indigo 600 */
        --accent-success: #10b981; /* Emerald 500 */
        --accent-warning: #f59e0b; /* Amber 500 */
        --accent-danger: #ef4444; /* Red 500 */

        --border-color: rgba(255, 255, 255, 0.1);
        --radius-sm: 8px;
        --radius-md: 12px;
        --radius-lg: 16px;

        --spacing-xs: 4px;
        --spacing-sm: 8px;
        --spacing-md: 16px;
        --spacing-lg: 24px;
        --spacing-xl: 32px;
        }

        .modal-overlay {
          position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background-color: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(8px);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: fadeIn 0.2s ease-out;
        }

        .modal-content {
          background-color: #0f172a;
        width: 100%;
        max-width: 600px;
        max-height: 90vh;
        border-radius: var(--radius-lg);
        border: 1px solid rgba(255,255,255,0.1);
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .modal-header {
          padding: 20px 24px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(15, 23, 42, 0.95);
        }

        .modal-header h2 {
          margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #f8fafc;
        display: flex;
        align-items: center;
        gap: 10px;
        }

        .close-btn {
          background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        padding: 4px;
        border-radius: 50%;
        transition: all 0.2s;
        }
        .close-btn:hover {
          color: #f8fafc;
        background: rgba(255,255,255,0.1);
        }

        .modal-body {
          padding: 24px;
        overflow-y: auto;
        flex: 1;
        scrollbar-width: thin;
        scrollbar-color: #334155 transparent;
        }

        .steps-indicator {
          display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
        position: relative;
        padding: 0 12px;
        }

        .steps-indicator::before {
          content: '';
        position: absolute;
        top: 50%; left: 0; right: 0;
        height: 2px;
        background: #1e293b;
        z-index: 0;
        transform: translateY(-50%);
        }

        .step-bubble {
          width: 32px; height: 32px;
        border-radius: 50%;
        background: #1e293b;
        color: #64748b;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.85rem;
        font-weight: 600;
        position: relative;
        z-index: 1;
        border: 4px solid #0f172a;
        transition: all 0.3s ease;
        }
        .step-bubble.active {
          background: #6366f1;
        color: white;
        box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.3);
        }
        .step-bubble.completed {
          background: #10b981;
        color: white;
        }

        .form-group {
          margin-bottom: 20px;
        }

        .form-label {
          display: block;
        font-size: 0.85rem;
        font-weight: 500;
        color: #94a3b8;
        margin-bottom: 8px;
        }

        .form-input {
          width: 100%;
        padding: 12px 16px;
        background: rgba(30, 41, 59, 0.5);
        border: 1px solid rgba(148, 163, 184, 0.1);
        border-radius: 12px;
        color: #f8fafc;
        font-size: 1rem;
        transition: all 0.2s;
        }
        .form-input:focus {
          outline: none;
        border-color: #6366f1;
        background: rgba(30, 41, 59, 0.8);
        box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
        }

        .type-selector-row {
          display: flex;
        gap: 12px;
        margin-bottom: 24px;
        }
        .type-option {
          flex: 1;
        padding: 12px;
        border-radius: 12px;
        border: 1px solid rgba(255,255,255,0.05);
        background: rgba(255,255,255,0.02);
        font-weight: 600;
        color: #64748b;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        }
        .type-option.buy.selected {
          background: rgba(16, 185, 129, 0.15);
        border-color: #10b981;
        color: #10b981;
        }
        .type-option.sell.selected {
          background: rgba(239, 68, 68, 0.15);
        border-color: #ef4444;
        color: #ef4444;
        }

        .step-actions {
          display: flex;
        justify-content: space-between;
        margin-top: 32px;
        padding-top: 20px;
        border-top: 1px solid rgba(255,255,255,0.05);
        }

        .btn-secondary {
          background: transparent;
        color: #94a3b8;
        padding: 10px 20px;
        border-radius: 99px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        border: 1px solid rgba(255,255,255,0.1);
        transition: all 0.2s;
        }
        .btn-secondary:hover {
          color: white;
        border-color: rgba(255,255,255,0.3);
        }

        .btn-primary {
          background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
        color: white;
        padding: 10px 24px;
        border-radius: 99px;
        font-weight: 600;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        transition: all 0.2s;
        }
        .btn-primary:active {transform: translateY(1px); }
        .btn-primary:disabled {opacity: 0.5; cursor: not-allowed; }

        @keyframes fadeIn {from {opacity: 0; } to {opacity: 1; } }
        @keyframes slideUp {from {opacity: 0; transform: translateY(20px); } to {opacity: 1; transform: translateY(0); } }

        .tag-pill {
          display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s;
        border: 1px solid rgba(255,255,255,0.1);
        background: rgba(255,255,255,0.03);
        color: #94a3b8;
        }
        .tag-pill:hover {
          background: rgba(255,255,255,0.1);
        color: #f8fafc;
        }
        .tag-pill.selected, .tag-pill.active {
          background: rgba(99, 102, 241, 0.15);
        border-color: #6366f1;
        color: #818cf8;
        }

        @media (max-width: 600px) {
            .modal-content {
          height: 100%;
        max-height: 100%;
        border-radius: 0;
            }
        .modal-header {
          padding-top: max(20px, env(safe-area-inset-top));
            }
        .step-actions {
          padding-bottom: max(20px, env(safe-area-inset-bottom));
            }
        }
      `}</style>
    </div >
  );
};

export default TransactionForm;
