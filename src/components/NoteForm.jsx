import React, { useState, useEffect } from 'react';
import { FileText, Check, Loader2, Calendar } from 'lucide-react';
import { addNote, updateNote } from '../services/notebookService';
import { searchCoins } from '../services/coinGeckoApi';
import { useAuth } from '../context/AuthContext';

const NoteForm = ({ onClose, initialNote = null, initialAsset = null, onSave }) => {
    const { user } = useAuth();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form State
    const [type, setType] = useState(initialNote?.type === 'token' ? 'token' : 'general');
    const [asset, setAsset] = useState(initialNote?.asset || initialAsset || '');
    const [date, setDate] = useState(initialNote?.date ? new Date(initialNote.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]);
    const [content, setContent] = useState(initialNote?.content || '');

    // Search State
    const [searchResults, setSearchResults] = useState([]);
    const [showDropdown, setShowDropdown] = useState(false);

    // Effect: Handle asset search
    useEffect(() => {
        const searchTimer = setTimeout(async () => {
            if (type === 'token' && asset && asset.length > 1 && !assetExists(asset)) {
                try {
                    const results = await searchCoins(asset);
                    setSearchResults(results.slice(0, 5));
                    setShowDropdown(true);
                } catch (error) {
                    console.error("Search error:", error);
                }
            } else {
                setSearchResults([]);
                setShowDropdown(false);
            }
        }, 500);

        return () => clearTimeout(searchTimer);
    }, [asset, type]);

    const assetExists = (input) => {
        // Simple check if the input matches a known coin symbol exactly in the dropdown logic context
        // This is just to prevent search triggering if we just clicked a result
        return false;
    };

    const handleTickerSelect = (coin) => {
        setAsset(coin.symbol.toUpperCase());
        setShowDropdown(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!content.trim()) return;

        setIsSubmitting(true);
        try {
            const noteData = {
                content,
                type: type, // 'general' or 'token'
                asset: type === 'token' ? asset.toUpperCase() : 'Global',
                noteCategory: type, // Desktop uses this mapping
                date: new Date(date),
                tags: [] // Can add tagging input later if needed
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
        <div className="flex flex-col h-full">
            {/* Tabs */}
            {!initialAsset && !initialNote && (
                <div className="mb-4">
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

            {/* Form Fields */}
            <div className="flex-1 space-y-4">
                {/* Asset Selection (Only for Token type) */}
                {type === 'token' && (
                    <div className="relative">
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Asset</label>
                        <input
                            type="text"
                            value={asset}
                            onChange={(e) => setAsset(e.target.value)}
                            disabled={!!initialAsset || (initialNote && !!initialNote.asset)}
                            placeholder="Search ticker (e.g. BTC)"
                            className="w-full bg-slate-800/50 border border-slate-700/60 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
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
                <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Date</label>
                    <div className="relative">
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full bg-slate-800/50 border border-slate-700/60 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500/50 transition-colors appearance-none"
                        />
                        <Calendar className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                    </div>
                </div>

                {/* Content */}
                <div className="flex flex-col flex-1 min-h-[150px]">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Note Content</label>
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="What's on your mind?"
                        className="w-full flex-1 bg-slate-800/50 border border-slate-700/60 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-indigo-500/50 transition-colors resize-none leading-relaxed"
                        style={{ minHeight: '150px' }}
                    />
                </div>
            </div>

            {/* Footer Action */}
            <div className="pt-4 mt-auto">
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting || !content.trim()}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                    {isSubmitting ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                    {initialNote ? 'Update Note' : 'Save Note'}
                </button>
            </div>
        </div>
    );
};

export default NoteForm;
