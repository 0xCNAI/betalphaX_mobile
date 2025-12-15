import React, { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus, Sparkles, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { analyzeTechnicals } from '../services/technicalService';

const TechnicalAnalysisWidget = ({ symbol, onAnalysisComplete }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isExpanded, setIsExpanded] = useState(true);

    useEffect(() => {
        let mounted = true;

        const fetchData = async () => {
            if (!symbol) return;
            setLoading(true);
            try {
                const result = await analyzeTechnicals(symbol);
                if (mounted) {
                    setData(result);
                    if (onAnalysisComplete) onAnalysisComplete(result);
                }
            } catch (err) {
                console.error("Failed to load technicals:", err);
                if (mounted) setError(err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchData();

        return () => { mounted = false; };
    }, [symbol]);

    if (loading) {
        return (
            <div style={{ padding: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#94a3b8' }}>
                <Loader2 className="spin" size={24} />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div style={{ padding: '16px', color: '#ef4444', fontSize: '0.9rem', textAlign: 'center' }}>
                <AlertCircle size={16} style={{ display: 'inline', marginRight: '6px' }} />
                Analysis unavailable
            </div>
        );
    }

    // Helper to determine color based on score/action
    const getScoreColor = (score) => {
        if (score >= 75) return '#10b981'; // Green
        if (score >= 60) return '#34d399'; // Light Green
        if (score <= 25) return '#ef4444'; // Red
        if (score <= 40) return '#f87171'; // Light Red
        return '#fbbf24'; // Yellow/Neutral
    };

    const scoreColor = getScoreColor(data.score);
    const { levels, proAnalysis, score, action } = data;

    // Gauge Calculation (Semi-circle)
    const radius = 40;
    const circumference = Math.PI * radius;
    const progress = (score / 100) * circumference;

    // Format Price
    const fmt = (n) => n ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';

    return (
        <div className="technical-widget">
            {/* 1. Header is handled by parent container summary, this is the CONTENT */}

            {/* 2. Gauge & Action */}
            <div style={{
                background: 'rgba(15, 23, 42, 0.6)',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid rgba(51, 65, 85, 0.5)'
            }}>
                <div style={{ position: 'relative', width: '84px', height: '50px', display: 'flex', justifyContent: 'center' }}>
                    {/* SVG Gauge */}
                    <svg width="84" height="50" viewBox="0 0 100 60" style={{ transform: 'rotate(0deg)' }}>
                        {/* Background Arc */}
                        <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#1e293b" strokeWidth="8" strokeLinecap="round" />
                        {/* Progress Arc */}
                        <path
                            d="M 10 50 A 40 40 0 0 1 90 50"
                            fill="none"
                            stroke={scoreColor}
                            strokeWidth="8"
                            strokeLinecap="round"
                            strokeDasharray={`${progress} ${circumference}`}
                            strokeDashoffset="0"
                            style={{ transition: 'stroke-dasharray 1s ease' }}
                        />
                    </svg>
                    <div style={{ position: 'absolute', bottom: '5px', textAlign: 'center', width: '100%' }}>
                        <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white' }}>{Math.round(score)}</span>
                    </div>
                </div>

                <div style={{ flex: 1, paddingLeft: '16px', textAlign: 'right' }}>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: 'white', letterSpacing: '0.5px' }}>
                        {action}
                    </div>
                </div>
            </div>

            {/* 3. Support & Resistance Table */}
            <div style={{
                background: '#020617',
                borderRadius: '8px',
                overflow: 'hidden',
                marginBottom: '12px',
                border: '1px solid #1e293b',
                fontSize: '0.85rem'
            }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #1e293b' }}>
                    <div style={{ padding: '8px 12px', borderRight: '1px solid #1e293b' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6' }}></div>
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 'bold' }}>SHORT (1H)</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ color: '#10b981' }}>Support</span>
                            <span style={{ color: '#10b981', fontFamily: 'monospace' }}>{fmt(levels.shortTerm.support)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#f43f5e' }}>Resistance</span>
                            <span style={{ color: '#f43f5e', fontFamily: 'monospace' }}>{fmt(levels.shortTerm.resistance)}</span>
                        </div>
                    </div>

                    <div style={{ padding: '8px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#8b5cf6' }}></div>
                            <span style={{ color: '#94a3b8', fontSize: '0.75rem', fontWeight: 'bold' }}>LONG (1D)</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ color: '#10b981' }}>Support</span>
                            <span style={{ color: '#10b981', fontFamily: 'monospace' }}>{fmt(levels.longTerm.support)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#f43f5e' }}>Resistance</span>
                            <span style={{ color: '#f43f5e', fontFamily: 'monospace' }}>{fmt(levels.longTerm.resistance)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 4. AI Insights */}
            <div style={{
                background: 'rgba(99, 102, 241, 0.05)',
                borderRadius: '8px',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                overflow: 'hidden'
            }}>
                <div
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        padding: '8px 12px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer',
                        borderBottom: isExpanded ? '1px solid rgba(99, 102, 241, 0.1)' : 'none'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Sparkles size={14} style={{ color: 'white' }} />
                        <h5 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 'bold', color: 'white' }}>AI INSIGHTS</h5>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#818cf8' }}>
                        {isExpanded ? 'Collapse' : 'Expand'}
                    </span>
                </div>

                {isExpanded && (
                    <div style={{ padding: '12px' }}>
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {proAnalysis.insights.slice(0, 3).map((insight, idx) => (
                                <li key={idx} style={{ position: 'relative', paddingLeft: '12px', fontSize: '0.85rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                                    <div style={{ position: 'absolute', left: 0, top: '6px', width: '4px', height: '4px', borderRadius: '50%', background: '#818cf8' }}></div>
                                    {insight}
                                </li>
                            ))}
                        </ul>

                        {/* Conclusion Quote */}
                        <div style={{ marginTop: '12px', fontStyle: 'italic', color: '#e2e8f0', fontSize: '0.85rem', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', borderLeft: '3px solid #6366f1' }}>
                            "{proAnalysis.insights[proAnalysis.insights.length - 1]}"
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TechnicalAnalysisWidget;
