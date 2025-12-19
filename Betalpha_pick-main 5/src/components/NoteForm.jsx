import React, { useState, useEffect } from 'react';
import { X, Loader2, Check, FileText } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { addNote, updateNote } from '../services/noteService';
import { searchCoins } from '../services/coinGeckoApi';

const NoteForm = ({ initialAsset = null, initialNote = null, onClose, onSave }) => {
    const { user } = useAuth();
    const [type, setType] = useState(initialNote ? initialNote.type : (initialAsset ? 'token' : 'general'));
    const [asset, setAsset] = useState(initialNote ? (initialNote.asset || '') : (initialAsset || ''));
    const [coinId, setCoinId] = useState(initialNote ? initialNote.coinId : null);
    const [date, setDate] = useState(initialNote ? (initialNote.date || initialNote.createdAt.split('T')[0]) : new Date().toISOString().split('T')[0]);
    const [content, setContent] = useState(initialNote ? initialNote.content : '');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Search State
    const [showDropdown, setShowDropdown] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    // Debounced Search
    useEffect(() => {
        if (type !== 'token' || !asset || asset === initialAsset || (initialNote && asset === initialNote.asset)) return;

        const searchCoinsDebounced = async () => {
            setIsSearching(true);
            try {
                const results = await searchCoins(asset, 5);
                setSearchResults(results);
                setShowDropdown(true);
            } catch (error) {
                console.error('Search error:', error);
            } finally {
                setIsSearching(false);
            }
        };

        const timeoutId = setTimeout(searchCoinsDebounced, 300);
        return () => clearTimeout(timeoutId);
    }, [asset, type, initialAsset, initialNote]);

    const handleTickerSelect = (coin) => {
        setAsset(coin.symbol.toUpperCase());
        setCoinId(coin.id);
        setShowDropdown(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!content.trim()) return;
        if (type === 'token' && !asset) {
            alert('Please select an asset for token notes.');
            return;
        }

        setIsSubmitting(true);
        try {
            const noteData = {
                type,
                content,
                date,
                asset: type === 'token' ? asset.toUpperCase() : null,
                coinId: type === 'token' ? coinId : null
            };

            if (initialNote) {
                await updateNote(user.uid, initialNote.id, noteData);
            } else {
                await addNote(user.uid, noteData);
            }

            if (onSave) onSave();
            onClose();
        } catch (error) {
            console.error("Failed to save note:", error);
            alert("Failed to save note. Please try again.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 w-full max-w-[560px] max-h-[80vh] rounded-2xl border border-slate-700/60 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-5 zoom-in-95 duration-200">

                {/* Sticky Header Section */}
                <div className="flex-shrink-0 bg-slate-900/95 z-10 border-b border-slate-700/60 backdrop-blur-sm">
                    <div className="px-6 py-4 flex items-center justify-between">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <FileText size={20} className="text-indigo-400" />
                            {initialNote ? 'Edit Note' : 'Add New Note'}
                        </h3>
                        <button onClick={onClose} className="p-2 bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-700 rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    {/* Tabs (Sticky below header) */}
                    {!initialAsset && !initialNote && (
                        <div className="px-6 pb-4">
                            <div className="grid grid-cols-2 gap-2 bg-slate-800/50 p-1 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => setType('general')}
                                    className={`py-2 px-4 rounded-md text-sm font-medium transition-all ${type === 'general'
                                        ? 'bg-indigo-600 text-white shadow-lg'
                                        : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    General
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setType('token')}
                                    className={`py-2 px-4 rounded-md text-sm font-medium transition-all ${type === 'token'
                                        ? 'bg-indigo-600 text-white shadow-lg'
                                        : 'text-slate-400 hover:text-white'
                                        }`}
                                >
                                    Token Related
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 flex flex-col custom-scrollbar bg-slate-900/50">

                    {/* Asset Selection (Only for Token type) */}
                    {type === 'token' && (
                        <div className="relative flex-shrink-0">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Asset</label>
                            <input
                                type="text"
                                value={asset}
                                onChange={(e) => setAsset(e.target.value)}
                                disabled={!!initialAsset || (initialNote && !!initialNote.asset)}
                                placeholder="Search ticker (e.g. BTC)"
                                className="w-full bg-slate-800/50 border border-slate-700/60 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            />

                            {/* Dropdown */}
                            {showDropdown && searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                                    {searchResults.map(coin => (
                                        <button
                                            key={coin.id}
                                            type="button"
                                            onClick={() => handleTickerSelect(coin)}
                                            className="w-full text-left px-4 py-3 hover:bg-white/5 flex items-center gap-3 border-b border-white/5 last:border-0"
                                        >
                                            <img src={coin.thumb} alt={coin.symbol} className="w-5 h-5 rounded-full" />
                                            <div>
                                                <span className="text-white font-medium">{coin.symbol.toUpperCase()}</span>
                                                <span className="text-slate-400 text-xs ml-2">{coin.name}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Date */}
                    <div className="flex-shrink-0">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Date</label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700/60 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                    </div>

                    {/* Content (Fills remaining space) */}
                    <div className="flex-1 flex flex-col min-h-[200px]">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Note Content</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="What's on your mind?"
                            className="w-full flex-1 bg-slate-800/50 border border-slate-700/60 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-indigo-500/50 transition-colors resize-none leading-relaxed custom-scrollbar"
                            style={{ minHeight: '200px' }}
                        />
                    </div>
                </div>

                {/* Sticky Footer */}
                <div className="flex-shrink-0 p-6 border-t border-slate-700/60 bg-slate-900/95 backdrop-blur-sm z-10">
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !content.trim()}
                        className="w-full btn-primary flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-indigo-500/20"
                    >
                        {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                        {initialNote ? 'Update Note' : 'Save Note'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NoteForm;
