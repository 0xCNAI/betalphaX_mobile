import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePrices } from '../context/PriceContext';
import { getNotes, updateNote, deleteNote } from '../services/noteService';
import { BookOpen, Search, Sparkles, Tag, FileText } from 'lucide-react';
import RowShell from '../components/ui/RowShell';
import NotebookExpanded from '../components/NotebookExpanded';

const Notebook = () => {
    const { user } = useAuth();
    const { getIcon } = usePrices();
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterAsset, setFilterAsset] = useState('all');
    const [filterCategory, setFilterCategory] = useState('all');
    const [filterTraining, setFilterTraining] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [availableAssets, setAvailableAssets] = useState([]);
    const [expandedIds, setExpandedIds] = useState([]);

    useEffect(() => {
        if (user) fetchNotes();
    }, [user]);

    const fetchNotes = async () => {
        setLoading(true);
        try {
            const allNotes = await getNotes(user.uid);
            setNotes(allNotes);
            const assets = [...new Set(allNotes.map(n => n.asset).filter(Boolean))].sort();
            setAvailableAssets(assets);
        } catch (err) {
            console.error("Failed to load notebook:", err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateNote = async (noteId, updates) => {
        setNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...updates } : n));
        try {
            await updateNote(user.uid, noteId, updates);
        } catch (err) {
            console.error("Failed to update note:", err);
            fetchNotes();
        }
    };

    const handleDeleteNote = async (noteId) => {
        if (!window.confirm("Are you sure you want to delete this note?")) return;
        try {
            await deleteNote(user.uid, noteId);
            setNotes(prev => prev.filter(n => n.id !== noteId));
        } catch (err) {
            console.error("Failed to delete note:", err);
        }
    };

    const toggleExpand = (id) => {
        setExpandedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const filteredNotes = notes.filter(note => {
        if (filterAsset !== 'all' && note.asset !== filterAsset) return false;
        if (filterCategory !== 'all' && (note.noteCategory || 'manual') !== filterCategory) return false;
        if (filterTraining && !note.forTraining) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (note.content || '').toLowerCase().includes(q) ||
                (note.title || '').toLowerCase().includes(q) ||
                (note.tags || []).join(' ').toLowerCase().includes(q) ||
                (note.asset || '').toLowerCase().includes(q);
        }
        return true;
    });

    const handleExport = () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(filteredNotes, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "notebook_export.json");
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    };

    // Helpers
    const getCategoryLabel = (note) => {
        if (note.noteCategory === 'highlight') {
            if (note.sourceType === 'asset_important_event') return 'Event';
            if (note.sourceType === 'asset_social_tweet') return 'Social';
            if (note.sourceType?.includes('feed')) return 'Feed';
            return 'Highlight';
        }
        return 'Note';
    };

    const getSourceUrl = (note) => {
        let sourceUrl = null;
        try {
            if (note.sourceRef && note.sourceRef.meta) {
                const meta = JSON.parse(note.sourceRef.meta);
                sourceUrl = meta.url || meta.source_url;
            }
        } catch { }
        if (!sourceUrl && note.content) {
            const urlMatch = note.content.match(/(https?:\/\/[^\s]+)/);
            if (urlMatch) sourceUrl = urlMatch[0];
        }
        return sourceUrl;
    };

    const formatDate = (note) => note.date || (note.createdAt?.toDate?.().toISOString().slice(0, 10)) || '';

    return (
        <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-6 font-sans">
            {/* Header */}
            <header className="flex items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <BookOpen className="h-6 w-6 text-indigo-400" />
                        <h1 className="text-2xl font-semibold text-slate-50">Notebook</h1>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">
                        Manage your research notes and highlights.
                    </p>
                </div>
                <button
                    onClick={handleExport}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-800"
                >
                    Export JSON
                </button>
            </header>

            {/* Controls Row */}
            <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex-1">
                    <div className="relative">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search notes..."
                            className="w-full rounded-xl border border-slate-700 bg-slate-900/60 px-9 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
                        />
                    </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <select
                        value={filterAsset}
                        onChange={(e) => setFilterAsset(e.target.value)}
                        className="bg-slate-900/60 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none min-w-[120px]"
                    >
                        <option value="all">All Assets</option>
                        {availableAssets.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="bg-slate-900/60 border border-slate-700 text-slate-300 rounded-lg px-3 py-2 text-xs focus:outline-none min-w-[130px]"
                    >
                        <option value="all">All Types</option>
                        <option value="manual">Notes</option>
                        <option value="highlight">Highlights</option>
                    </select>
                    <button
                        onClick={() => setFilterTraining(!filterTraining)}
                        data-active={filterTraining}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1 text-xs font-medium text-slate-300 data-[active=true]:border-indigo-500 data-[active=true]:bg-indigo-500/10 data-[active=true]:text-indigo-300"
                    >
                        <Sparkles className="h-3 w-3" />
                        AI Only
                    </button>
                </div>
            </section>

            {/* Notes List */}
            <section className="flex flex-col gap-2">
                {loading ? (
                    <div className="py-12 text-center text-sm text-slate-500">Loading...</div>
                ) : filteredNotes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center text-sm text-slate-400">
                        No notes yet.
                    </div>
                ) : (
                    filteredNotes.map(note => {
                        const isExpanded = expandedIds.includes(note.id);
                        const sourceUrl = getSourceUrl(note);
                        const dateText = formatDate(note);
                        const categoryLabel = getCategoryLabel(note);

                        return (
                            <RowShell
                                key={note.id}
                                isExpanded={isExpanded}
                                onToggle={() => toggleExpand(note.id)}
                                leftContent={
                                    <>
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800">
                                            {note.asset && getIcon(note.asset) ? (
                                                <img
                                                    src={getIcon(note.asset)}
                                                    alt={note.asset}
                                                    className="h-8 w-8 rounded-full"
                                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                />
                                            ) : (
                                                <FileText className="h-5 w-5 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="min-w-0 overflow-hidden">
                                            <div className="text-sm font-semibold text-white truncate">
                                                {note.asset || 'Global'}
                                            </div>
                                            <div className="text-[10px] text-slate-500 uppercase truncate">
                                                {categoryLabel}
                                            </div>
                                        </div>
                                    </>
                                }
                                centerContent={
                                    <>
                                        <div className="text-sm font-medium text-slate-100 truncate line-clamp-1">
                                            {note.title || '(No title)'}
                                        </div>
                                        <div className="text-xs text-slate-400 truncate line-clamp-1">
                                            {note.content?.substring(0, 80) || ''}
                                        </div>
                                    </>
                                }
                                rightContent={
                                    <>
                                        {/* Tags (max 2) */}
                                        {note.tags && note.tags.length > 0 && (
                                            <div className="hidden md:flex items-center gap-1">
                                                {note.tags.slice(0, 2).map((tag, i) => (
                                                    <span key={i} className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                                                        <Tag className="h-2.5 w-2.5" />
                                                        <span className="max-w-[50px] truncate">{tag}</span>
                                                    </span>
                                                ))}
                                                {note.tags.length > 2 && (
                                                    <span className="text-[10px] text-slate-500">+{note.tags.length - 2}</span>
                                                )}
                                            </div>
                                        )}
                                        {/* AI Train */}
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleUpdateNote(note.id, { forTraining: !note.forTraining }); }}
                                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] ${note.forTraining
                                                ? 'border border-emerald-400/60 bg-emerald-500/10 text-emerald-300'
                                                : 'border border-slate-700 text-slate-500 hover:border-slate-500'
                                                }`}
                                        >
                                            <Sparkles className="h-3 w-3" />
                                            AI
                                        </button>
                                        {/* Priority dots */}
                                        <div className="hidden sm:flex items-center gap-0.5">
                                            {Array.from({ length: 5 }).map((_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={(e) => { e.stopPropagation(); handleUpdateNote(note.id, { importance: i + 1 }); }}
                                                    className={`h-1.5 w-1.5 rounded-full ${i < (note.importance || 3) ? 'bg-indigo-500' : 'bg-slate-700'}`}
                                                />
                                            ))}
                                        </div>
                                        {/* Date */}
                                        {dateText && (
                                            <span className="text-[10px] text-slate-500 shrink-0">{dateText}</span>
                                        )}
                                    </>
                                }
                            >
                                {/* Expanded Content - NotebookExpanded */}
                                <NotebookExpanded
                                    title={note.title}
                                    content={note.content}
                                    sourceUrl={sourceUrl}
                                    tags={note.tags || []}
                                    meta={`${categoryLabel} • ${dateText}`}
                                    onDelete={() => handleDeleteNote(note.id)}
                                />
                            </RowShell>
                        );
                    })
                )}
            </section>
        </main>
    );
};

export default Notebook;
