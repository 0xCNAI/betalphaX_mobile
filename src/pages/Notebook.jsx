import React, { useState, useEffect } from 'react';
import { Search, Plus, StickyNote, ArrowRight, FileText, Tag, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { getNotes, addNote } from '../services/notebookService';

const Notebook = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedIds, setExpandedIds] = useState([]);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newNote, setNewNote] = useState({ title: '', content: '', tags: '' });

  // Auth
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  // Notes State
  const [notes, setNotes] = useState([]);

  // Fetch Notes on Mount
  useEffect(() => {
    if (user) {
      loadNotes();
    } else {
      setNotes([]); // Clear notes if no user
      setLoading(false);
    }
  }, [user]);

  const loadNotes = async () => {
    setLoading(true);
    try {
      console.log("[Notebook] Fetching notes for user:", user.uid);
      const fetchedNotes = await getNotes(user.uid);
      console.log("[Notebook] Fetched notes count:", fetchedNotes.length);
      if (fetchedNotes.length > 0) {
        console.log("[Notebook] Sample note:", fetchedNotes[0]);
      }
      setNotes(fetchedNotes);
    } catch (err) {
      console.error("Failed to load notes", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveNote = async () => {
    if (!newNote.title || !newNote.content || !user) return;

    try {
      const noteToAdd = {
        title: newNote.title,
        content: newNote.content,
        tags: newNote.tags.split(',').map(t => t.trim()).filter(t => t),
        asset: 'Global', // Default for manual notes
        type: 'note',
        noteCategory: 'general',
        color: "var(--accent-primary)"
      };

      await addNote(user.uid, noteToAdd);

      // Reload to get fresh list order from server or update locally
      await loadNotes();

      setNewNote({ title: '', content: '', tags: '' });
      setIsModalOpen(false);
    } catch (e) {
      alert("Failed to save note");
    }
  };

  const toggleExpand = (id) => {
    setExpandedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const filteredNotes = notes.filter(note =>
    (note.title?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (note.tags || []).some(tag => tag?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="notebook-container">
      {/* Header */}
      <div className="notebook-header">
        <div className="header-title">
          <StickyNote size={24} className="header-icon" />
          <h1>Research Notebook</h1>
        </div>
        <button className="add-note-btn" onClick={() => setIsModalOpen(true)}>
          <Plus size={20} />
          <span className="btn-text">New Note</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="search-container">
        <Search size={18} className="search-icon" />
        <input
          type="text"
          placeholder="Search research, tags..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      {/* List Layout */}
      <div className="notebook-list-section">
        <div className="list-header-row">
          <span>Title</span>
          <span>Tags</span>
          <span>Date</span>
          <span></span>
        </div>

        <div className="notes-list">
          {filteredNotes.length > 0 ? (
            filteredNotes.map(note => {
              const isExpanded = expandedIds.includes(note.id);
              return (
                <div key={note.id} className={`notebook-list-item ${isExpanded ? 'expanded' : ''}`}>
                  <div className="list-item-header" onClick={() => toggleExpand(note.id)}>
                    {/* Column 1: Title */}
                    <div className="note-title-col">
                      <div className="note-color-indicator" style={{ backgroundColor: note.color }}></div>
                      <span className="note-title-text">
                        {note.title || note.Title || (note.asset ? `${note.asset} Note` : 'Untitled Note')}
                      </span>
                    </div>

                    {/* Column 2: Tags (Collapsed View) */}
                    <div className="note-tags-col">
                      {(note.tags || []).slice(0, 1).map((tag, i) => ( // Show only 1 tag on mobile/collapsed
                        <span key={i} className="mini-tag">#{tag}</span>
                      ))}
                      {(note.tags || []).length > 1 && <span className="mini-tag-more">+{note.tags.length - 1}</span>}
                    </div>

                    {/* Column 3: Date */}
                    <span className="note-date-col">
                      {formatDistanceToNow(note.date)} ago
                    </span>

                    {/* Column 4: Chevron */}
                    <div className="chevron-col">
                      <ArrowRight size={16} className={`chevron ${isExpanded ? 'rotated' : ''}`} />
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="list-item-body">
                      <div className="note-content-section">
                        <h4><FileText size={14} /> Note Content</h4>
                        <p className="note-text">{note.content || note.Content || 'No Content'}</p>
                      </div>


                      <div className="note-meta-section">
                        <h4><Tag size={14} /> Tags</h4>
                        <div className="tags-display">
                          {(Array.isArray(note.tags) ? note.tags : []).map((tag, i) => (
                            <span key={i} className="full-tag">{tag}</span>
                          ))}
                        </div>
                      </div>

                      <div className="note-meta-section">
                        <h4><Calendar size={14} /> Created</h4>
                        <p className="meta-text">
                          {note.date?.toLocaleDateString ? note.date.toLocaleDateString() : 'Unknown Date'} {note.date?.toLocaleTimeString ? note.date.toLocaleTimeString() : ''}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="empty-state">
              <p>No notes found matching "{searchQuery}"</p>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="New Research Note">
        <div className="note-form" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>Title</label>
            <input
              type="text"
              value={newNote.title}
              onChange={e => setNewNote({ ...newNote, title: e.target.value })}
              placeholder="e.g., BTC Halving Analysis"
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--bg-tertiary)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '1rem'
              }}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>Content</label>
            <textarea
              value={newNote.content}
              onChange={e => setNewNote({ ...newNote, content: e.target.value })}
              placeholder="Write your research here..."
              rows={8}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--bg-tertiary)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '1rem',
                resize: 'vertical'
              }}
            />
          </div>

          <div className="form-group">
            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.9rem' }}>Tags (comma separated)</label>
            <input
              type="text"
              value={newNote.tags}
              onChange={e => setNewNote({ ...newNote, tags: e.target.value })}
              placeholder="e.g., Macro, Cycle, Risk"
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--bg-tertiary)',
                borderRadius: '8px',
                color: 'var(--text-primary)',
                fontSize: '1rem'
              }}
            />
          </div>

          <button
            onClick={handleSaveNote}
            style={{
              marginTop: '12px',
              padding: '14px',
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%)',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontWeight: '600',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            Save Note
          </button>
        </div>
      </Modal>

      <style>{`
        .notebook-container {
          padding: 20px 20px 100px 20px;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 24px;
          background-color: var(--bg-primary);
        }

        .notebook-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .header-title {
          display: flex;
          align-items: center;
          gap: 12px;
          color: var(--text-primary);
        }

        .header-icon {
          color: var(--accent-primary);
        }

        .header-title h1 {
          font-size: 1.5rem;
          font-weight: 700;
          letter-spacing: -0.5px;
          margin: 0;
        }

        .add-note-btn {
          background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
          border: none;
          border-radius: 12px;
          color: white;
          padding: 10px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
          transition: all 0.2s;
        }

        .add-note-btn:active {
          transform: scale(0.96);
        }

        .search-container {
          position: relative;
          width: 100%;
        }

        .search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-secondary);
        }

        .search-input {
          width: 100%;
          background-color: var(--bg-secondary);
          border: 1px solid var(--bg-tertiary);
          border-radius: 12px;
          padding: 12px 12px 12px 42px;
          color: var(--text-primary);
          font-size: 0.95rem;
          transition: border-color 0.2s;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--accent-primary);
        }

        /* List Layout Styles */
        .notebook-list-section {
            width: 100%;
        }

        .list-header-row {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 30px; /* Title | Tags | Date | Chevron */
            padding: 0 16px 8px 16px;
            color: var(--text-secondary);
            font-size: 0.75rem;
            text-transform: uppercase;
            font-weight: 600;
            letter-spacing: 0.5px;
        }

        .notes-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .notebook-list-item {
            background-color: var(--bg-secondary);
            border: 1px solid var(--bg-tertiary);
            border-radius: 12px;
            overflow: hidden;
            transition: all 0.2s;
        }

        .notebook-list-item:hover {
            border-color: var(--accent-primary);
        }

        .notebook-list-item.expanded {
            border-color: var(--accent-primary);
            background-color: var(--bg-secondary);
        }

        .list-item-header {
            display: grid;
            grid-template-columns: 2fr 1fr 1fr 30px; /* Match header */
            align-items: center;
            padding: 16px;
            cursor: pointer;
            background-color: rgba(255,255,255,0.02);
            gap: 12px;
        }

        .list-item-header:hover {
            background-color: rgba(255,255,255,0.04);
        }

        .note-title-col {
            display: flex;
            align-items: center;
            gap: 12px;
            overflow: hidden;
        }

        .note-color-indicator {
            width: 4px;
            height: 24px;
            border-radius: 2px;
            flex-shrink: 0;
        }

        .note-title-text {
            font-weight: 600;
            font-size: 1rem;
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .note-tags-col {
            display: flex;
            gap: 4px;
            overflow: hidden;
        }

        .mini-tag {
            font-size: 0.7rem;
            background-color: rgba(255,255,255,0.05);
            color: var(--text-secondary);
            padding: 2px 6px;
            border-radius: 4px;
            white-space: nowrap;
        }

        .mini-tag-more {
             font-size: 0.7rem;
             color: var(--text-secondary);
        }

        .note-date-col {
            font-size: 0.85rem;
            color: var(--text-secondary);
            white-space: nowrap;
        }

        .chevron-col {
            display: flex;
            justify-content: flex-end;
        }

        .chevron {
            color: var(--text-secondary);
            transition: transform 0.2s;
        }

        .chevron.rotated {
            transform: rotate(90deg);
        }

        /* Expanded Body */
        .list-item-body {
            padding: 20px;
            border-top: 1px solid var(--bg-tertiary);
            background-color: var(--bg-primary);
            display: flex;
            flex-direction: column;
            gap: 16px;
        }

        .note-content-section h4, .note-meta-section h4 {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 0.8rem;
            color: var(--text-secondary); /* Subtler header */
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .note-text {
            font-size: 0.95rem;
            line-height: 1.6;
            color: var(--text-primary);
            white-space: pre-wrap;
        }

        .tags-display {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .full-tag {
            background-color: rgba(99, 102, 241, 0.1);
            color: var(--accent-primary);
            padding: 4px 10px;
            border-radius: 14px;
            font-size: 0.8rem;
            font-weight: 500;
            border: 1px solid rgba(99, 102, 241, 0.3);
        }

        .meta-text {
            font-size: 0.9rem;
            color: var(--text-secondary);
        }

        .empty-state {
          text-align: center;
          padding: 40px;
          color: var(--text-secondary);
          font-style: italic;
        }

        @media (max-width: 600px) {
             .list-header-row, .list-item-header {
                grid-template-columns: 1fr auto 30px; /* Title | Date | Chevron */
             }
             .note-tags-col {
                 display: none; /* Hide tags in collapsed row on small mobile */
             }
             .btn-text { display: none; }
        }
      `}</style>
    </div>
  );
};

export default Notebook;
