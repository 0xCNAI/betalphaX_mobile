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
  HelpCircle
} from 'lucide-react';
import { useBuyThesis } from '../context/BuyThesisContext';

import { useTransactions } from '../context/TransactionContext';
import { usePrices } from '../context/PriceContext';
import { searchCoins } from '../services/coinGeckoApi';
import { analyzeTechnicals, generateSellSignals, analyzeSellTechnicals } from '../services/technicalAnalysis';
import { searchCryptoTweets } from '../services/twitterService';
import { getNewsForAsset } from '../services/newsService';
import { generateTagsFromNote } from '../services/geminiService';
import { generatePortfolioOverview, getTradeDiagnosis, getCachedOverview } from '../services/analysisService';
import { captureContextSnapshot, getOutcomeOptions, getExitFactors } from '../services/contextService';
import { getCoachAdvice } from '../services/aiCoachService'; // Import AI Coach

// ...

const TransactionForm = ({ onClose, initialData = null, initialStep = 1, initialType = null }) => {
  const { addTransaction, updateTransaction, transactions } = useTransactions();
  const { getPrice, getIcon, fetchPriceForTicker } = usePrices();
  const { theses } = useBuyThesis(); // Get saved theses
  const [step, setStep] = useState(initialStep);
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
  const [aiCoachDiagnosis, setAiCoachDiagnosis] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // --- Step 2: Tag Selection ---
  const [tagSearch, setTagSearch] = useState('');
  const [aiTags, setAiTags] = useState([]);
  const [savedThesisTags, setSavedThesisTags] = useState([]);
  const [isLoadingAiTags, setIsLoadingAiTags] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);

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

  // Default Exit Tag Library
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
          <h4>Step 2: Tag Selection</h4>
          <p>Categorize your transaction with tags.</p>
        </div>

        {/* Search Bar */}
        <div className="form-group">
          <div className="search-wrapper" style={{ position: 'relative', display: 'flex', gap: '8px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              placeholder="Search or create new tag..."
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
                <Plus size={16} /> Add "{tagSearch}"
              </button>
            )}
          </div>
        </div>

        {/* Selected Tags Display - Enhanced Pill Style */}
        {formData.tags && formData.tags.length > 0 && (
          <div className="selected-tags-area" style={{ marginBottom: '1.5rem' }}>
            <h5 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Selected Tags</h5>
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
                  {tag}
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
              <Target size={14} color="var(--accent)" /> Saved Buy Thesis
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
            <Sparkles size={14} color="var(--accent)" /> AI Suggested Tags
          </h5>

          {isLoadingAiTags ? (
            <div className="loading-tags" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              Analyzing your note...
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
                  {tag}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              No AI suggestions available. Try adding a more detailed note in Step 1.
            </div>
          )}
        </div>

        {/* Recommended Tags */}
        <div className="tags-section">
          <h5 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Recommended Tags
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
                {tag}
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
              Show More <ChevronDown size={14} />
            </button>
          )}
        </div>

        <div className="step-actions">
          <button type="button" onClick={() => setStep(1)} className="btn-secondary">
            <ArrowLeft size={18} /> Back
          </button>
          <button type="button" onClick={() => setStep(3)} className="btn-primary">
            Next: Sell Signals <ArrowRight size={18} />
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

      // If no keywords match but note exists, add a generic tag
      if (generatedTags.length === 0 && note.length > 10) {
        generatedTags.push('Custom Thesis');
      }

      setGeneratedReasons({
        fundamental: [
          ...generatedTags,
          "Strong network growth",
          "Institutional adoption",
          "Protocol upgrade",
          "Deflationary supply",
          "Undervalued metrics"
        ],
        eventDriven: newsItems,
        social: tweets, // Twitter sentiment
        technical: technicalReasons // Real TA data
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

      setGeneratedReasons({
        fundamental: [
          "Profit target reached.",
          "Fundamentals deteriorating.",
          "Better opportunities elsewhere.",
          "Overvalued relative to metrics.",
          "Risk/reward no longer favorable."
        ],
        eventDriven: newsItems,
        social: tweets,
        technical: technicalReasons // Real TA data for selling
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
      setGeneratedSellSignals(signals);
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
      if (!aiCoachDiagnosis && !isAnalyzing) {
        setIsAnalyzing(true);
        getCoachAdvice(formData.asset, formData.type)
          .then(advice => {
            setAiCoachDiagnosis(advice);
          })
          .catch(err => console.error("AI Coach Error:", err))
          .finally(() => setIsAnalyzing(false));
      }
    }
  }, [step, formData.asset, transactions]);

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
    const displayedDefaultTags = showAllTags ? filteredDefaultTags : filteredDefaultTags.slice(0, 10);
    const isCustomTag = tagSearch.trim() && !defaultTags.some(t => t.toLowerCase() === tagSearch.trim().toLowerCase()) && !aiTags.some(t => t.toLowerCase() === tagSearch.trim().toLowerCase());

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
      <div className="step-container" style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 'var(--spacing-sm)',
        paddingBottom: 'var(--spacing-sm)'
      }}>
        <div className="step-header" style={{ marginBottom: 0 }}>
          <h4>Transaction Details</h4>
          <p>Enter details and categorize your trade.</p>
        </div>

        {/* Row 1: Ticker + Date */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
          <div className="form-group" style={{ position: 'relative', marginBottom: 0 }}>
            <label className="block text-sm font-medium text-slate-400 mb-1">Token Ticker</label>
            <div ref={inputRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {formData.asset && getIcon && getIcon(formData.asset) && (
                <img
                  src={getIcon(formData.asset)}
                  alt={formData.asset}
                  style={{ width: '20px', height: '20px', borderRadius: '50%', position: 'absolute', left: '10px', zIndex: 1 }}
                />
              )}
              <input
                type="text"
                name="asset"
                value={formData.asset}
                onChange={handleChange}
                placeholder="e.g., BTC"
                required
                className="form-input large-input"
                autoFocus
                style={{ width: '100%', paddingLeft: formData.asset && getIcon && getIcon(formData.asset) ? '40px' : '12px' }}
              />
              {/* Autocomplete Dropdown */}
              {showDropdown && (searchResults.length > 0 || isSearching) && createPortal(
                <div className="autocomplete-dropdown" style={{
                  position: 'fixed',
                  top: dropdownPos.top,
                  left: dropdownPos.left,
                  width: dropdownPos.width,
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--bg-tertiary)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                  maxHeight: '300px',
                  overflowY: 'auto',
                  zIndex: 99999
                }}>
                  {isSearching ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <Loader2 size={16} className="spin" style={{ display: 'inline-block' }} />
                      <span style={{ marginLeft: '8px' }}>Searching...</span>
                    </div>
                  ) : (
                    searchResults.map((coin) => (
                      <div
                        key={coin.id}
                        onClick={() => handleTickerSelect(coin)}
                        style={{
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          cursor: 'pointer',
                          transition: 'background-color 0.2s',
                          borderBottom: '1px solid var(--bg-tertiary)'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
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
                          <div style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                            {coin.symbol}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {coin.name}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>,
                document.body
              )}
              {/* Holdings Display */}
              {formData.asset && (
                <div style={{
                  position: 'absolute',
                  bottom: '-18px',
                  right: '0',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                  textAlign: 'right',
                  whiteSpace: 'nowrap'
                }}>
                  Holdings: <strong>{currentHoldings.toFixed(4)}</strong>
                </div>
              )}
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="block text-sm font-medium text-slate-400 mb-1">Date</label>
            <input
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              className="form-input"
              required
              style={{ width: '100%', padding: 'var(--spacing-md)' }}
            />
          </div>
        </div>

        {/* Row 2: Amount + Price */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-xs)' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="block text-sm font-medium text-slate-400 mb-1">Amount</label>
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              placeholder="0.00"
              step="any"
              className="form-input"
              required
              style={{ width: '100%' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="block text-sm font-medium text-slate-400 mb-1">Price per Coin ($)</label>
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              placeholder="0.00"
              step="any"
              className="form-input"
              required
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Row 3: Total Cost */}
        <div className="total-cost-display" style={{
          padding: '0.75rem',
          backgroundColor: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          border: '1px solid var(--bg-tertiary)',
          margin: 0
        }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total Cost:</span>
          <span style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)' }}>
            ${((parseFloat(formData.amount || 0) * parseFloat(formData.price || 0)) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Row 4: Type Toggles & Quick Add */}
        <div className="flex flex-col gap-3 mt-2">
          {/* Type Toggles */}
          <div className="flex gap-3">
            <button
              type="button"
              className={`flex-1 py-4 rounded-xl font-bold transition-all border text-lg ${formData.type === 'buy'
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
              onClick={() => setFormData(prev => ({ ...prev, type: 'buy' }))}
            >
              Buy
            </button>
            <button
              type="button"
              className={`flex-1 py-4 rounded-xl font-bold transition-all border text-lg ${formData.type === 'sell'
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-800'}`}
              disabled={isOverSelling}
              onClick={() => !isOverSelling && setFormData(prev => ({ ...prev, type: 'sell' }))}
            >
              {isOverSelling ? 'Insufficient Holdings' : 'Sell'}
            </button>
          </div>

          {/* Quick Add Button (Large) */}
          <button
            type="button"
            disabled={!assetExists}
            className={`w-full py-4 rounded-xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all transform text-lg mt-2
              ${assetExists
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-900/20 hover:scale-[1.02]'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'}`}
            onClick={() => {
              if (!assetExists) return;

              const assetTransactions = transactions
                .filter(t => t.asset === formData.asset && t.type === formData.type)
                .sort((a, b) => new Date(b.date) - new Date(a.date));

              if (assetTransactions.length > 0) {
                const lastTx = assetTransactions[0];
                setFormData(prev => ({
                  ...prev,
                  tags: lastTx.tags || [],
                  exitTags: lastTx.exitTags || [],
                  investmentNotes: lastTx.memo ? [lastTx.memo] : [''],
                  exitNotes: lastTx.exitMemo ? [lastTx.exitMemo] : [''],
                  selectedReasons: lastTx.selectedReasons || [],
                  reasonDetails: lastTx.reasonDetails || {},
                  customReasons: lastTx.customReasons || { fundamental: '', eventDriven: '', technical: '', social: '' },
                  selectedSellSignals: lastTx.selectedSellSignals || [],
                }));
              }
              setStep(4);
            }}
          >
            <FastForward size={20} /> Quick Add (Skip Analysis)
          </button>
        </div>

        {/* Row 5: Investment Note & Generate Tags */}
        <div className="form-group" style={{ marginBottom: 0, marginTop: 'var(--spacing-lg)' }}>
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center gap-2">
              <label className="mb-0 text-lg font-bold text-white">Investment Note</label>
              <div className="group relative flex items-center">
                <HelpCircle size={16} className="text-slate-400 cursor-help hover:text-white transition-colors" />
                <div className="absolute left-full ml-2 w-64 p-3 bg-slate-800 border border-slate-700 rounded-lg shadow-xl text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  The Investment Note is your space to capture the rationale behind this trade. Use it for self-reflection or to enable AI to generate personalized trading insights.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleGenerateTags}
              disabled={isLoadingAiTags || !formData.investmentNotes[0]}
              className="px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingAiTags ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Generate Tags
            </button>
          </div>
          <textarea
            name="investmentNotes"
            value={formData.investmentNotes[0] || ''}
            onChange={(e) => handleNoteChange('investment', 0, e.target.value)}
            placeholder="Why are you taking this trade? (Click 'Generate Tags' to analyze)"
            className="form-input large-memo"
            style={{
              height: '80px',
              minHeight: '80px',
              padding: '0.75rem',
              resize: 'none',
              width: '100%'
            }}
          />
        </div>

        {/* Row 6: Tags Section (Merged from Step 2) - Only for BUY */}
        {formData.type === 'buy' && (
          <div className="tags-section-merged mt-4">
            {/* Search Bar */}
            <div className="search-wrapper mb-3" style={{ position: 'relative', display: 'flex', gap: '8px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Search or create tag..."
                value={tagSearch}
                onChange={(e) => setTagSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: '34px', flex: 1, fontSize: '0.9rem' }}
              />
              {isCustomTag && (
                <button type="button" className="btn-secondary small" onClick={handleCreateTag}>
                  <Plus size={14} /> Add
                </button>
              )}
            </div>

            {/* Selected Tags */}
            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {formData.tags.map(tag => (
                  <span
                    key={tag}
                    className="tag-pill selected"
                    onClick={() => toggleTag(tag)}
                    style={{
                      backgroundColor: 'var(--accent-primary)',
                      color: 'white',
                      padding: '6px 12px',
                      borderRadius: '16px',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    {tag} <X size={12} />
                  </span>
                ))}
              </div>
            )}

            {/* AI Tags */}
            {aiTags.length > 0 && (
              <div className="mb-3">
                <h5 className="text-xs text-indigo-400 mb-2 flex items-center gap-1"><Sparkles size={12} /> AI Suggested</h5>
                <div className="flex flex-wrap gap-2">
                  {aiTags.map(tag => (
                    <button
                      key={`ai-${tag}`}
                      type="button"
                      className={`tag-pill ${formData.tags?.includes(tag) ? 'active' : ''}`}
                      onClick={() => toggleTag(tag)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '14px',
                        border: formData.tags?.includes(tag) ? '1px solid var(--accent-primary)' : '1px solid var(--bg-tertiary)',
                        backgroundColor: formData.tags?.includes(tag) ? 'rgba(99, 102, 241, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                        color: formData.tags?.includes(tag) ? 'var(--accent-primary)' : 'var(--text-secondary)',
                        fontSize: '0.8rem'
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Tags */}
            <div className="mt-10 mb-6">
              <div className="mb-2">
                <h5 className="text-lg font-bold text-white mb-0">Recommended Tags</h5>
              </div>
              <div className="flex flex-wrap gap-2">
                {displayedDefaultTags.map(tag => (
                  <button
                    key={`def-${tag}`}
                    type="button"
                    className={`tag-pill ${formData.tags?.includes(tag) ? 'active' : ''}`}
                    onClick={() => toggleTag(tag)}
                    style={{
                      padding: '5px 10px',
                      borderRadius: '14px',
                      border: formData.tags?.includes(tag) ? '1px solid var(--accent-primary)' : '1px solid var(--bg-tertiary)',
                      backgroundColor: formData.tags?.includes(tag) ? 'rgba(99, 102, 241, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                      color: formData.tags?.includes(tag) ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontSize: '0.8rem'
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Advanced Settings */}
        <div className="advanced-settings-section mt-4">
          <button
            type="button"
            className="btn-text"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-secondary)',
              fontSize: '0.85rem',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '0'
            }}
          >
            {showAdvanced ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Advanced Settings (Group & Chain)
          </button>

          {showAdvanced && (
            <div className="advanced-options" style={{
              marginTop: 'var(--spacing-sm)',
              padding: 'var(--spacing-md)',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-md)'
            }}>
              {/* Group Selection */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.85rem' }}>Asset Group</label>
                {!isAddingGroup ? (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <select
                      value={formData.selectedGroup}
                      onChange={(e) => {
                        if (e.target.value === 'new') {
                          setIsAddingGroup(true);
                        } else {
                          setFormData(prev => ({ ...prev, selectedGroup: e.target.value }));
                        }
                      }}
                      className="form-select"
                      style={{ flex: 1 }}
                    >
                      <option value="">Default (Manual Entry)</option>
                      {[...new Set(transactions
                        .map(tx => tx.group || tx.asset)
                        .filter(name => name && name !== 'Manual Entry')
                      )].sort().map(group => (
                        <option key={group} value={group}>{group}</option>
                      ))}
                      <option value="new">+ Add New Group...</option>
                    </select>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Enter group name..."
                      className="form-input"
                      style={{ flex: 1 }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn-primary small"
                      onClick={() => {
                        if (newGroupName.trim()) {
                          setFormData(prev => ({ ...prev, selectedGroup: newGroupName.trim() }));
                          setIsAddingGroup(false);
                          setNewGroupName('');
                        }
                      }}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      className="btn-secondary small"
                      onClick={() => {
                        setIsAddingGroup(false);
                        setNewGroupName('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {/* Chain Selection */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label style={{ fontSize: '0.85rem' }}>Chain</label>
                {!isAddingChain ? (
                  <select
                    value={formData.selectedChain}
                    onChange={(e) => {
                      if (e.target.value === 'new') {
                        setIsAddingChain(true);
                      } else {
                        setFormData(prev => ({ ...prev, selectedChain: e.target.value }));
                      }
                    }}
                    className="form-select"
                  >
                    <option value="">N/A</option>
                    <option value="Ethereum">Ethereum</option>
                    <option value="Solana">Solana</option>
                    <option value="Bitcoin">Bitcoin</option>
                    <option value="Arbitrum">Arbitrum</option>
                    <option value="Optimism">Optimism</option>
                    <option value="Polygon">Polygon</option>
                    <option value="Base">Base</option>
                    <option value="Avalanche">Avalanche</option>
                    <option value="BSC">BSC</option>
                    <option value="new">+ Add Custom Chain...</option>
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text"
                      value={newChainName}
                      onChange={(e) => setNewChainName(e.target.value)}
                      placeholder="Enter chain name..."
                      className="form-input"
                      style={{ flex: 1 }}
                      autoFocus
                    />
                    <button
                      type="button"
                      className="btn-primary small"
                      onClick={() => {
                        if (newChainName.trim()) {
                          setFormData(prev => ({ ...prev, selectedChain: newChainName.trim() }));
                          setIsAddingChain(false);
                          setNewChainName('');
                        }
                      }}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      className="btn-secondary small"
                      onClick={() => {
                        setIsAddingChain(false);
                        setNewChainName('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Next Button */}
        <div className="step-actions-bottom mt-4">
          <button
            type="button"
            className="btn-primary full-width"
            onClick={() => setStep(formData.type === 'buy' ? 3 : 2)}
          >
            Next: {formData.type === 'buy' ? 'Sell Signals' : 'Link Narrative'} <ArrowRight size={18} />
          </button>
        </div>
      </div >
    );
  };

  // ... (renderStep1_5 removed) ...



  const renderSellStep2 = () => {
    // Aggregate Buy Reasons from open positions
    const openBuys = transactions.filter(
      tx => tx.asset === formData.asset && tx.type === 'buy' && tx.status === 'open'
    );

    // Extract unique reasons and sort by date (newest first)
    const uniqueReasons = openBuys
      .flatMap(tx => (tx.reasons || []).map(r => ({ reason: r, date: tx.date })))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .reduce((acc, curr) => {
        if (!acc.find(item => item.reason === curr.reason)) {
          acc.push(curr);
        }
        return acc;
      }, []);

    return (
      <div className="step-container">
        <div className="step-header">
          <h4>Step 2: Link Narrative</h4>
          <p>What original thesis are you closing? (Sorted by recent)</p>
        </div>

        {uniqueReasons.length > 0 ? (
          <div className="reasons-list">
            {uniqueReasons.map(({ reason, date }) => {
              const isSelected = formData.linkedBuyReasons.includes(reason);
              return (
                <div
                  key={reason}
                  className={`reason-card-link ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setFormData(prev => {
                      const newReasons = isSelected
                        ? prev.linkedBuyReasons.filter(r => r !== reason)
                        : [...prev.linkedBuyReasons, reason];
                      return { ...prev, linkedBuyReasons: newReasons };
                    });
                  }}
                >
                  <div className="reason-text">{reason}</div>
                  <div className="reason-date">First active: {date}</div>
                  {isSelected && <Check size={16} className="selected-icon" />}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="no-positions-warning">
            <AlertTriangle size={24} />
            <p>No active buy narratives found for {formData.asset}.</p>
          </div>
        )}

        <div className="step-actions">
          <button type="button" onClick={() => setStep(1)} className="btn-secondary">
            <ArrowLeft size={18} /> Back
          </button>
          <button
            type="button"
            onClick={() => setStep(3)}
            className="btn-primary"
          >
            Next: Outcome <ArrowRight size={18} />
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
    if (formData.type === 'sell') {
      return renderSellStep3();
    }

    // Exit Tag UI Setup
    const filteredDefaultExitTags = defaultExitTags.filter(t => t.toLowerCase().includes(exitTagSearch.toLowerCase()));
    const displayedDefaultExitTags = showAllExitTags ? filteredDefaultExitTags : filteredDefaultExitTags.slice(0, 10);
    const isCustomExitTag = exitTagSearch.trim() && !defaultExitTags.some(t => t.toLowerCase() === exitTagSearch.trim().toLowerCase()) && !aiExitTags.some(t => t.toLowerCase() === exitTagSearch.trim().toLowerCase());

    // Existing Buy Step 3 (Exit Strategy)
    return (
      <div className="step-container">
        <div className="step-header">
          <h4>Step 3: Exit Strategy</h4>
          <p>Plan your exit. When will you take profit or cut losses?</p>
        </div>

        <div className="reasons-grid">

          {/* Custom Indicator Builder - PRESERVED */}
          <div className="custom-indicator-builder" style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '1.5rem',
            padding: '1rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--bg-tertiary)'
          }}>
            <div style={{ flex: 2 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Indicator</label>
              <select
                value={formData.customIndicatorType}
                onChange={(e) => setFormData(prev => ({ ...prev, customIndicatorType: e.target.value }))}
                className="form-select"
                style={{ width: '100%' }}
              >
                <option value="Price Target">Price Target ($)</option>
                <option value="Stop Loss">Stop Loss ($)</option>
                <option value="RSI">RSI (Level)</option>
                <option value="Trailing Stop">Trailing Stop (%)</option>
                <option value="MA Cross">MA Cross (Days)</option>
                <option value="Volume Spike">Volume Spike (x)</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Value</label>
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
                      selectedSellSignals: [...prev.selectedSellSignals, signal],
                      exitTags: [...(prev.exitTags || []), signal], // Add to exitTags for display
                      customIndicatorValue: ''
                    }));
                  }
                }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button
                type="button"
                className="btn-primary small-btn"
                onClick={() => {
                  if (formData.customIndicatorValue) {
                    const signal = `${formData.customIndicatorType}: ${formData.customIndicatorValue}`;
                    setFormData(prev => ({
                      ...prev,
                      selectedSellSignals: [...prev.selectedSellSignals, signal],
                      exitTags: [...(prev.exitTags || []), signal], // Add to exitTags for display
                      customIndicatorValue: ''
                    }));
                  }
                }}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* NEW: Exit Tag Selection System */}
          <div className="exit-tag-section" style={{ marginBottom: '1.5rem' }}>
            <h5 style={{ fontSize: '0.95rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Exit Strategy Tags</h5>

            {/* Search Bar */}
            <div className="form-group">
              <div className="search-wrapper" style={{ position: 'relative', display: 'flex', gap: '8px' }}>
                <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Search or create new exit tag..."
                  value={exitTagSearch}
                  onChange={(e) => setExitTagSearch(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: '36px', flex: 1 }}
                />
                {isCustomExitTag && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleCreateExitTag}
                  >
                    <Plus size={16} /> Add "{exitTagSearch}"
                  </button>
                )}
              </div>
            </div>

            {/* Selected Exit Tags Display */}
            {formData.exitTags && formData.exitTags.length > 0 && (
              <div className="selected-tags-area" style={{ marginBottom: '1.5rem' }}>
                <h5 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Selected Exit Tags</h5>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {formData.exitTags.map(tag => (
                    <span
                      key={tag}
                      className="tag-pill selected"
                      onClick={() => toggleExitTag(tag)}
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
                      {tag}
                      <X size={14} style={{ strokeWidth: 2.5 }} />
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* AI Suggested Exit Tags */}
            {aiExitTags.length > 0 && (
              <div className="tags-section" style={{ marginBottom: '1.5rem' }}>
                <h5 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={14} color="var(--accent)" /> AI Suggested Exit Tags
                </h5>
                <div className="tags-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {aiExitTags.map(tag => (
                    <button
                      key={`ai-exit-${tag}`}
                      type="button"
                      className={`tag-pill ${formData.exitTags?.includes(tag) ? 'active' : ''}`}
                      onClick={() => toggleExitTag(tag)}
                      style={{
                        padding: '7px 14px',
                        borderRadius: '18px',
                        border: formData.exitTags?.includes(tag) ? '2px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                        backgroundColor: formData.exitTags?.includes(tag) ? 'rgba(99, 102, 241, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                        color: formData.exitTags?.includes(tag) ? 'var(--accent-primary)' : 'var(--text-primary)',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        fontWeight: formData.exitTags?.includes(tag) ? '500' : '400',
                        transition: 'all 0.2s ease',
                        boxShadow: formData.exitTags?.includes(tag) ? '0 2px 4px rgba(99, 102, 241, 0.15)' : 'none'
                      }}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Recommended Exit Tags */}
            <div className="tags-section">
              <h5 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
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
                      padding: '7px 14px',
                      borderRadius: '18px',
                      border: formData.exitTags?.includes(tag) ? '2px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                      backgroundColor: formData.exitTags?.includes(tag) ? 'rgba(99, 102, 241, 0.1)' : 'rgba(30, 41, 59, 0.5)',
                      color: formData.exitTags?.includes(tag) ? 'var(--accent-primary)' : 'var(--text-primary)',
                      cursor: 'pointer',
                      fontSize: '0.875rem',
                      fontWeight: formData.exitTags?.includes(tag) ? '500' : '400',
                      transition: 'all 0.2s ease',
                      boxShadow: formData.exitTags?.includes(tag) ? '0 2px 4px rgba(99, 102, 241, 0.15)' : 'none'
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              {filteredDefaultExitTags.length > 10 && (
                <button
                  type="button"
                  onClick={() => setShowAllExitTags(!showAllExitTags)}
                  className="btn-secondary"
                  style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}
                >
                  {showAllExitTags ? 'Show Less' : `Show More (${filteredDefaultExitTags.length - 10} more)`}
                </button>
              )}
            </div>
          </div>

          {/* Price Target Signals Display */}


          {generatedSellSignals && generatedSellSignals.length > 0 && (
            <div className="reason-category">
              <h5>AI Suggested Exit Signals</h5>
              {generatedSellSignals.map((signal, idx) => (
                <div
                  key={`sig-${idx}`}
                  className={`reason-chip ${formData.selectedSellSignals.includes(signal) ? 'selected' : ''}`}
                  onClick={() => handleSellSignalToggle(signal)}
                >
                  {signal}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="step-actions">
          <button type="button" onClick={() => setStep(formData.type === 'buy' ? 1 : 2)} className="btn-secondary">
            <ArrowLeft size={18} /> Back
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                // generateAIInsights(); // This function is not defined in the provided code
                setStep(4);
              } catch (err) {
                console.error("Error proceeding to step 4:", err);
                setStep(4); // Force proceed
              }
            }}
            className="btn-primary"
          >
            Next: Transaction Details <ArrowRight size={18} />
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
                      🔗 Read Article
                    </a>
                  )}
                </div>
                {newsItem.description && (
                  <div className="news-description">
                    {newsItem.description}
                  </div>
                )}
                <textarea
                  placeholder="Add your analysis or notes about this news..."
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
          placeholder={`Add custom ${title.toLowerCase()} reason...`}
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
                        🔗 View Tweet
                      </a>
                    )}
                  </div>
                  <textarea
                    placeholder="Why is this tweet relevant to your decision?"
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
          No tweets available. Configure your Twitter API key to see social sentiment.
        </div>
      )}

      {/* Custom Input for this category */}
      <div className="custom-reason-input">
        <input
          type="text"
          value={formData.customReasons[categoryKey]}
          onChange={(e) => handleCustomReasonChange(categoryKey, e.target.value)}
          placeholder={`Add custom ${title.toLowerCase()} tweet...`}
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
                  placeholder="Add specific details or notes..."
                  value={formData.reasonDetails[reason] || ''}
                  onChange={(e) => handleReasonDetailChange(reason, e.target.value)}
                  className="form-textarea"
                  rows={2}
                />
                <input
                  type="text"
                  placeholder="Add resource link (http://...)"
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
          placeholder={`Add custom ${title.toLowerCase()} reason...`}
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

      // Capture context snapshot for Sell transactions
      if (formData.type === 'sell') {
        try {
          // Note: captureContextSnapshot needs to be defined or imported if used.
          // Assuming it's a helper function available in scope or imports.
          // If not, we should probably remove it or ensure it's safe.
          // Checking previous code, it wasn't imported. It might be another missing function.
          // For now, let's wrap it safely.
          if (typeof captureContextSnapshot === 'function') {
            const snapshot = await captureContextSnapshot();
            transactionData.contextSnapshot = snapshot;
          }
          transactionData.status = 'closed'; // Mark as closed if it's a sell (simplified logic)
          transactionData.linkedBuyReasons = formData.linkedBuyReasons; // V2: Link to reasons
          transactionData.outcomeStatus = formData.outcomeStatus;
          transactionData.exitFactors = formData.exitFactors;
        } catch (e) {
          console.error("Failed to capture context:", e);
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

    return (
      <div className="step-container">
        <div className="step-header">
          <h4>Step 4: Review & Save</h4>
          <p>Review details and save your transaction.</p>
        </div>

        {/* AI Coach Diagnosis */}
        <div className="diagnosis-card" style={{
          marginBottom: '1.5rem',
          padding: '1rem',
          backgroundColor: 'rgba(30, 41, 59, 0.5)',
          borderRadius: '12px',
          border: '1px solid rgba(148, 163, 184, 0.2)'
        }}>
          <h5 style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem', color: 'var(--accent-primary)' }}>
            <Sparkles size={18} /> AI Trade Coach
          </h5>

          {isAnalyzing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              <Loader2 className="animate-spin" size={16} /> Analyzing historical patterns...
            </div>
          ) : aiCoachDiagnosis ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div style={{
                  padding: '4px 12px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  backgroundColor: aiCoachDiagnosis.final_verdict === 'BUY' ? 'rgba(34, 197, 94, 0.2)' : aiCoachDiagnosis.final_verdict === 'SELL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(234, 179, 8, 0.2)',
                  color: aiCoachDiagnosis.final_verdict === 'BUY' ? '#4ade80' : aiCoachDiagnosis.final_verdict === 'SELL' ? '#f87171' : '#facc15',
                  border: `1px solid ${aiCoachDiagnosis.final_verdict === 'BUY' ? '#4ade80' : aiCoachDiagnosis.final_verdict === 'SELL' ? '#f87171' : '#facc15'}`
                }}>
                  VERDICT: {aiCoachDiagnosis.final_verdict}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Confidence: {(aiCoachDiagnosis.confidence_score * 100).toFixed(0)}%
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                {/* Conditional Win Rate Display */}
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {formData.type === 'buy' ? 'Buy Win Rate' : 'Sell Win Rate'}
                    </div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: formData.type === 'buy' ? '#4ade80' : '#f87171' }}>
                      {formData.type === 'buy'
                        ? (aiCoachDiagnosis.buy_success_rate * 100).toFixed(0)
                        : (aiCoachDiagnosis.sell_success_rate * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div style={{ height: '8px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${formData.type === 'buy' ? aiCoachDiagnosis.buy_success_rate * 100 : aiCoachDiagnosis.sell_success_rate * 100}%`,
                      height: '100%',
                      backgroundColor: formData.type === 'buy' ? '#4ade80' : '#f87171',
                      transition: 'width 0.5s ease-out'
                    }}></div>
                  </div>
                </div>

                {/* Expected Holding Time */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}>
                  <Activity size={16} color="var(--text-secondary)" />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Expected Holding Time:</span>
                  <span style={{ fontSize: '0.9rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                    {aiCoachDiagnosis.successful_holding_median > 0
                      ? `${aiCoachDiagnosis.successful_holding_median} hours`
                      : 'N/A'}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: '0.9rem', lineHeight: '1.5', color: 'var(--text-primary)', padding: '10px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                {aiCoachDiagnosis.reasoning_summary}
              </div>
            </div>
          ) : (
            <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              Unable to generate diagnosis.
            </div>
          )}
        </div>


        <div className="review-card">
          <div className="review-header">
            <span className={`review-type ${formData.type}`}>{formData.type.toUpperCase()}</span>
            <span className="review-asset">{formData.asset}</span>
          </div>

          <div className="summary-section">
            {formData.type === 'buy' && (
              <div className="financial-summary" style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--bg-tertiary)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>Amount</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: '600' }}>{formData.amount}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>Price</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: '600' }}>${formData.price}</span>
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block' }}>Total Cost</span>
                    <span style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--accent-primary)' }}>
                      ${((parseFloat(formData.amount || 0) * parseFloat(formData.price || 0)) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div className="selected-reasons-summary">
              <span className="summary-label">{formData.type === 'buy' ? 'Buy Thesis:' : 'Sell Thesis:'}</span>
              {formData.type === 'sell' && formData.outcomeStatus ? (
                <div className="sell-summary">
                  <div className="summary-item"><strong>Amount:</strong> {formData.amount} @ {formData.price}</div>
                  <div className="summary-item"><strong>Outcome:</strong> {getOutcomeOptions().find(o => o.id === formData.outcomeStatus)?.label || formData.outcomeStatus}</div>
                  <div className="summary-item"><strong>Factors:</strong> {formData.exitFactors.join(', ')}</div>
                  <div className="summary-item"><strong>Linked Narratives:</strong> {formData.linkedBuyReasons.length}</div>
                </div>
              ) : (
                formData.tags && formData.tags.length > 0 ? (
                  <div className="tags-display" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '0.5rem' }}>
                    {formData.tags.map((tag, i) => (
                      <span
                        key={i}
                        className="tag-pill"
                        style={{
                          backgroundColor: 'rgba(99, 102, 241, 0.1)',
                          color: 'var(--accent-primary)',
                          padding: '6px 12px',
                          borderRadius: '16px',
                          fontSize: '0.85rem',
                          fontWeight: '500',
                          border: '1px solid rgba(99, 102, 241, 0.3)'
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-secondary italic">No buy reasons selected.</span>
                )
              )}
            </div>

            {/* Exit Strategy Section */}
            {formData.type === 'buy' && (formData.exitTags && formData.exitTags.length > 0) && (
              <div className="selected-reasons-summary">
                <span className="summary-label">Exit Strategy:</span>
                <div className="tags-display" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '0.5rem' }}>
                  {formData.exitTags.map((tag, i) => (
                    <span
                      key={i}
                      className="tag-pill"
                      style={{
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        color: 'var(--accent-primary)',
                        padding: '6px 12px',
                        borderRadius: '16px',
                        fontSize: '0.85rem',
                        fontWeight: '500',
                        border: '1px solid rgba(99, 102, 241, 0.3)'
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {
            formData.investmentNotes.some(n => n) && (
              <div className="review-section">
                <h5>Notes</h5>
                {formData.investmentNotes.filter(n => n).map((note, i) => (
                  <p key={i} className="review-note">"{note}"</p>
                ))}
              </div>
            )
          }
        </div >

        {/* Sell Amount Validation Error */}
        {isOverselling && (
          <div className="validation-error" style={{
            padding: 'var(--spacing-md)',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--accent-danger)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--accent-danger)',
            marginTop: 'var(--spacing-md)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)'
          }}>
            <AlertTriangle size={20} />
            <div>
              <strong>Insufficient Holdings:</strong> You are trying to sell {sellAmount.toFixed(4)} {formData.asset}, but you only hold {currentHoldings.toFixed(4)} {formData.asset}.
            </div>
          </div>
        )}

        {
          overview && !diagnosis && (
            <div className="diagnosis-result overview">
              <div className="diagnosis-header">
                <h5>Portfolio Health</h5>
                <span className={`health-score ${overview.healthIndex?.overallScore >= 70 ? 'good' : 'warning'}`}>
                  {overview.healthIndex?.overallScore ? overview.healthIndex.overallScore.toFixed(0) : 0}/100
                </span>
              </div>
              <div className="diagnosis-metrics">
                <div className="metric">
                  <span>Win Rate</span>
                  <strong>{overview.winRate ? overview.winRate.toFixed(1) : 0}%</strong>
                </div>
                <div className="metric">
                  <span>Avg R/R</span>
                  <strong>{overview.avgRR ? overview.avgRR.toFixed(2) : 0}</strong>
                </div>
              </div>
            </div>
          )
        }

        {
          diagnosis && (
            <div className={`diagnosis-result ${diagnosis.riskLevel}`}>
              <div className="diagnosis-header">
                <h5>Trade Diagnosis</h5>
                <span className={`risk-badge ${diagnosis.riskLevel}`}>
                  {diagnosis.riskLevel ? diagnosis.riskLevel.toUpperCase() : 'UNKNOWN'} RISK
                </span>
              </div>
              <ul className="diagnosis-list">
                {diagnosis.advice && diagnosis.advice.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
              <div className="diagnosis-footer">
                AI Analysis based on your history
              </div>
            </div>
          )
        }

        <div className="step-actions">
          <button type="button" onClick={() => setStep(3)} className="btn-secondary">
            <ArrowLeft size={18} /> Back
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="btn-primary"
            disabled={isOverselling || isSubmitting}
            style={{ opacity: (isOverselling || isSubmitting) ? 0.5 : 1, cursor: (isOverselling || isSubmitting) ? 'not-allowed' : 'pointer' }}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="spin" /> Saving...
              </>
            ) : (
              <>
                <Check size={18} /> Save Transaction
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
        {formData.type === 'sell' && (
          <>
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>2</div>
            <div className="progress-line"></div>
          </>
        )}
        <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>{formData.type === 'sell' ? 3 : 2}</div>
        <div className="progress-line"></div>
        <div className={`progress-step ${step >= 4 ? 'active' : ''}`}>{formData.type === 'sell' ? 4 : 3}</div>
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

        .outcome-desc {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .selected-icon {
          position: absolute;
          top: 10px;
          right: 10px;
          color: var(--accent-primary);
        }
        
        .factors-container {
           display: flex;
           flex-direction: column;
           gap: var(--spacing-md);
        }
        
        .factor-category h5 {
           font-size: 0.85rem;
           color: var(--text-secondary);
           margin-bottom: var(--spacing-xs);
           text-transform: uppercase;
           letter-spacing: 0.5px;
        }
          font-size: 0.8rem;
          color: var(--text-secondary);
          margin-top: 2px;
          margin-left: var(--spacing-sm);
          font-style: italic;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .summary-reason-text {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }
          border-radius: var(--radius-md);
          border: 1px solid var(--bg-tertiary);
          height: 100%;
        }

        .summary-label {
          font-weight: 600;
          font-size: 0.875rem;
          display: block;
          margin-bottom: var(--spacing-xs);
          color: var(--text-accent);
        }

        .summary-list {
          list-style-type: disc;
          padding-left: var(--spacing-lg);
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .step-actions {
          display: flex;
          justify-content: space-between;
          gap: var(--spacing-md);
          margin-top: auto;
          padding-top: var(--spacing-md);
        }

        .full-width {
          width: 100%;
          justify-content: center;
        }

        .btn-primary, .btn-secondary {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: var(--radius-md);
          font-weight: 500;
          transition: all 0.2s;
        }

        .btn-primary {
          background-color: var(--accent-primary);
          color: white;
        }

        .btn-primary:hover {
          background-color: var(--accent-secondary);
        }

        .btn-primary:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .btn-secondary {
          background-color: transparent;
          color: var(--text-secondary);
          border: 1px solid var(--bg-tertiary);
        }

        .btn-secondary:hover {
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
        }


        .spin {
          animation: spin 1s linear infinite;
        }

        .type-selection {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--spacing-lg);
          margin: var(--spacing-xl) 0;
        }

        .type-btn {
          position: relative;
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--spacing-sm);
          padding: var(--spacing-xl);
          border-radius: var(--radius-lg);
          border: 2px solid var(--bg-tertiary);
          background-color: var(--bg-secondary);
          cursor: pointer;
          transition: all 0.3s;
          font-size: 2rem;
        }

        .type-btn:hover {
          border-color: var(--accent-primary);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .type-btn.active {
          border-color: var(--accent-primary);
          background-color: rgba(var(--accent-primary-rgb), 0.05);
        }

        .type-btn.buy.active {
          border-color: #10b981; /* Green */
          background-color: rgba(16, 185, 129, 0.1);
        }

        .type-btn.sell.active {
          border-color: #ef4444; /* Red */
          background-color: rgba(239, 68, 68, 0.1);
        }

        .type-btn span {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary);
        }

        .type-btn small {
          font-size: 0.875rem;
          color: var(--text-secondary);
        }

        .type-btn:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
        }

        .type-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .buy-btn:hover:not(:disabled) {
          border-color: var(--accent-success);
          background-color: rgba(16, 185, 129, 0.05);
        }

        .sell-btn:hover:not(:disabled) {
          border-color: var(--accent-danger);
          background-color: rgba(239, 68, 68, 0.05);
        }

        .ai-insights-section {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(168, 85, 247, 0.1));
          border: 1px solid var(--accent-primary);
          border-radius: var(--radius-lg);
          padding: var(--spacing-lg);
          margin-bottom: var(--spacing-lg);
        }

        .insights-header {
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
          margin-bottom: var(--spacing-md);
        }

        .insights-header h4 {
          font-size: 1rem;
          font-weight: 600;
          color: var(--accent-primary);
        }

        .sparkle-icon {
          color: var(--accent-primary);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        .insights-content {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .insight-item {
          background-color: var(--bg-secondary);
          padding: var(--spacing-sm) var(--spacing-md);
          border-radius: var(--radius-md);
          font-size: 0.9rem;
          line-height: 1.5;
        }

        .current-price-display {
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(5, 150, 105, 0.05));
          border: 1px solid var(--accent-success);
          border-radius: var(--radius-lg);
          padding: var(--spacing-md) var(--spacing-lg);
          margin-bottom: var(--spacing-lg);
          text-align: center;
        }

        .price-label {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: var(--spacing-xs);
        }

        .price-value {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--accent-success);
          font-family: 'Courier New', monospace;
        }

        .italic {
          font-style: italic;
        }

        .price-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          gap: var(--spacing-sm);
        }

        .price-input-with-market {
          flex: 1;
        }

        .market-price-indicator {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 0.75rem;
          color: var(--text-secondary);
          background-color: var(--bg-tertiary);
          padding: 4px 8px;
          border-radius: var(--radius-sm);
          white-space: nowrap;
          pointer-events: none;
          font-weight: 500;
        }

        .price-input-with-market {
          padding-right: 140px; /* Make room for the market price indicator */
        }
        .diagnosis-actions {
          display: flex;
          gap: var(--spacing-md);
          margin-bottom: var(--spacing-md);
        }

        .btn-diagnosis {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          border-radius: var(--radius-md);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-diagnosis.secondary {
          background-color: var(--bg-tertiary);
          color: var(--text-primary);
          border: 1px solid var(--bg-tertiary);
        }

        .btn-diagnosis.primary {
          background-color: rgba(99, 102, 241, 0.1);
          color: var(--accent-primary);
          border: 1px solid var(--accent-primary);
        }

        .btn-diagnosis:hover {
          transform: translateY(-1px);
        }

        .diagnosis-result {
          background-color: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary);
          border-radius: var(--radius-md);
          padding: var(--spacing-md);
          animation: fadeIn 0.3s ease-out;
        }

        .diagnosis-result.overview {
          border-color: var(--accent-primary);
        }

        .diagnosis-result.high {
          border-color: var(--accent-danger);
          background-color: rgba(239, 68, 68, 0.05);
        }

        .diagnosis-result.medium {
          border-color: var(--accent-warning);
          background-color: rgba(245, 158, 11, 0.05);
        }

        .diagnosis-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: var(--spacing-md);
        }

        .diagnosis-header h5 {
          font-weight: 600;
          color: var(--text-primary);
        }

        .health-score {
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 4px;
        }
        .health-score.good { color: var(--accent-success); background: rgba(16, 185, 129, 0.1); }
        .health-score.warning { color: var(--accent-warning); background: rgba(245, 158, 11, 0.1); }

        .risk-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 2px 8px;
          border-radius: 4px;
          text-transform: uppercase;
        }
        .risk-badge.high { color: var(--accent-danger); background: rgba(239, 68, 68, 0.1); }
        .risk-badge.medium { color: var(--accent-warning); background: rgba(245, 158, 11, 0.1); }

        .diagnosis-metrics {
          display: flex;
          justify-content: space-around;
        }

        .metric {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .metric span {
          font-size: 0.75rem;
          color: var(--text-secondary);
        }

        .metric strong {
          font-size: 1.1rem;
          color: var(--text-primary);
        }

        .diagnosis-list {
          list-style-type: none;
          padding: 0;
          margin-bottom: var(--spacing-sm);
        }

        .diagnosis-list li {
          position: relative;
          padding-left: 20px;
          margin-bottom: 6px;
          font-size: 0.9rem;
          color: var(--text-secondary);
        }

        .diagnosis-list li::before {
          content: "•";
          position: absolute;
          left: 0;
          color: var(--accent-primary);
        }

        .diagnosis-footer {
          font-size: 0.75rem;
          color: var(--text-secondary);
          text-align: right;
          font-style: italic;
        }
        /* New Styles for Refactored UI */
        .type-selector.parallel {
          display: flex;
          flex-direction: row;
          gap: var(--spacing-md);
        }

        .type-btn.simple {
          flex: 1;
          padding: var(--spacing-lg);
          font-size: 1.2rem;
          font-weight: 600;
          border-radius: var(--radius-md);
          border: 2px solid transparent;
          background-color: var(--bg-tertiary);
          color: var(--text-secondary);
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .type-btn.simple.buy {
          border-color: rgba(16, 185, 129, 0.3);
          background-color: rgba(16, 185, 129, 0.05);
          color: #10b981;
        }

        .type-btn.simple.buy.active {
          background-color: #10b981;
          color: white;
          border-color: #10b981;
        }

        .type-btn.simple.sell {
          border-color: rgba(239, 68, 68, 0.3);
          background-color: rgba(239, 68, 68, 0.05);
          color: #ef4444;
        }

        .type-btn.simple.sell.active {
          background-color: #ef4444;
          color: white;
          border-color: #ef4444;
        }

        .notes-container {
          display: flex;
          flex-direction: column;
          gap: var(--spacing-sm);
        }

        .note-input-group {
          position: relative;
        }

        .remove-note {
          position: absolute;
          top: 8px;
          right: 8px;
          color: var(--text-tertiary);
          background: rgba(0,0,0,0.2);
          border-radius: 50%;
          padding: 4px;
          cursor: pointer;
          z-index: 5;
        }
        
        .remove-note:hover {
          color: var(--accent-danger);
          background: rgba(255,255,255,0.1);
        }

        .add-note-btn {
          align-self: flex-start;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .add-note-btn.full-width {
          width: 100%;
          justify-content: center;
          margin-top: 4px;
          padding: 8px;
          border: 1px dashed var(--bg-tertiary);
          background: transparent;
          color: var(--text-secondary);
        }
        
        .add-note-btn.full-width:hover {
          border-color: var(--accent-primary);
          background: var(--bg-secondary);
          color: var(--text-primary);
        }

        .reason-chip {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
          display: block;
          padding: 6px 12px;
        }

        .chip-content {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .reason-card-link {
          background-color: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary);
          padding: var(--spacing-md);
          border-radius: var(--radius-md);
          margin-bottom: var(--spacing-sm);
          cursor: pointer;
          transition: all 0.2s;
          position: relative;
        }

        .reason-card-link:hover {
          border-color: var(--accent-primary);
        }

        .reason-card-link.selected {
          border-color: var(--accent-primary);
          background-color: rgba(99, 102, 241, 0.05);
        }

        .reason-text {
          font-weight: 600;
          font-size: 0.95rem;
          margin-bottom: 4px;
        }

        .reason-date {
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .tags-container {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .tag-btn {
          padding: 8px 16px;
          border-radius: 20px;
          border: 1px solid var(--bg-tertiary);
          background-color: var(--bg-secondary);
          color: var(--text-secondary);
          font-size: 0.9rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }

        .tag-btn:hover {
          border-color: var(--accent-primary);
          color: var(--text-primary);
          background-color: var(--bg-tertiary);
        }

        .tag-btn.selected {
          background-color: var(--accent-primary);
          color: white;
          border-color: var(--accent-primary);
          box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
          transform: translateY(-1px);
        }

        .custom-tag-input {
          display: flex;
          align-items: center;
          border: 1px solid var(--bg-tertiary);
          border-radius: 20px;
          padding: 2px 8px;
          background-color: var(--bg-secondary);
        }

        .custom-tag-input input {
          border: none;
          background: transparent;
          color: var(--text-primary);
          font-size: 0.85rem;
          width: 100px;
          outline: none;
        }

        .custom-tag-input button {
          background: none;
          border: none;
          color: var(--accent-primary);
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        .holdings-info {
          margin-bottom: var(--spacing-md);
          padding: var(--spacing-sm);
          background-color: var(--bg-secondary);
          border-radius: var(--radius-sm);
          font-size: 0.9rem;
        }

        .holdings-display {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .percent-badge {
          font-size: 0.8rem;
          padding: 2px 6px;
          border-radius: 4px;
          background-color: rgba(16, 185, 129, 0.1);
          color: #10b981;
        }

        .percent-badge.error {
          background-color: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }

        .form-row {
          display: flex;
          gap: var(--spacing-md);
        }

        .half-width {
          flex: 1;
        }
        
        .fade-in {
          animation: fadeIn 0.3s ease-out;
        }

        /* Remote Styles for Step 1 */
        .step-actions-bottom {
          display: flex;
          gap: var(--spacing-md);
          margin-top: var(--spacing-xl);
        }

        .type-btn-large {
          flex: 1;
          padding: var(--spacing-lg);
          font-size: 1.25rem;
          font-weight: 600;
          border-radius: var(--radius-lg);
          border: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          background-color: var(--bg-tertiary);
          color: var(--text-secondary);
        }

        .type-btn-large:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .type-btn-large.buy {
          border-color: rgba(16, 185, 129, 0.3);
          color: var(--accent-success);
        }

        .type-btn-large.buy:hover, .type-btn-large.buy.active {
          background-color: rgba(16, 185, 129, 0.1);
          border-color: var(--accent-success);
        }

        .type-btn-large.sell {
          border-color: rgba(239, 68, 68, 0.3);
          color: var(--accent-danger);
        }

        .type-btn-large.sell:hover, .type-btn-large.sell.active {
          background-color: rgba(239, 68, 68, 0.1);
          border-color: var(--accent-danger);
        }

        /* Mobile Layout Fixes */
        .step-container {
          display: flex;
          flex-direction: column;
          min-height: 100%;
          position: relative;
        }

        .step-actions {
          position: sticky;
          bottom: 0;
          left: 0;
          right: 0;
          background-color: var(--bg-secondary);
          padding: var(--spacing-md) 0;
          border-top: 1px solid var(--bg-tertiary);
          margin-top: auto;
          z-index: 20;
          display: flex;
          justify-content: space-between;
          gap: var(--spacing-md);
        }
        
        /* Ensure content isn't hidden behind sticky footer */
        .step-container > *:last-child {
           /* This targets the actions div itself, so we might need padding on the container instead */
        }
        
        /* Add padding to the bottom of the container to ensure scrolling clears the sticky footer */
        .step-container {
            padding-bottom: var(--spacing-sm); 
        }

        /* Adjust modal content for mobile */
        @media (max-width: 600px) {
          .modal-content {
            height: 100vh;
            max-height: 100vh;
            border-radius: 0;
          }
          
          .step-actions {
            padding: var(--spacing-md);
            margin: 0 -1rem -1rem -1rem; /* Negative margin to stretch full width */
            width: calc(100% + 2rem);
          }
        }
      `}</style>
    </div>
  );
};

export default TransactionForm;
