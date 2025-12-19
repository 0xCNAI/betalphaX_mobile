import React from 'react';
import { ExternalLink, Tag, Trash2 } from 'lucide-react';

/**
 * NotebookExpanded - Expanded content for Notebook rows
 * Domain-specific: shows note content, sources, tags, delete action
 */
const NotebookExpanded = ({
    title,
    content,
    sourceUrl,
    tags = [],
    meta,
    onDelete,
}) => {
    return (
        <div className="px-5 py-4 space-y-4">
            {/* Title */}
            {title && (
                <h3 className="text-base font-semibold text-slate-100">{title}</h3>
            )}

            {/* Content */}
            {content && (
                <div className="text-sm leading-relaxed text-slate-300 whitespace-pre-line">
                    {content}
                </div>
            )}

            {/* Meta */}
            {meta && (
                <div className="text-[11px] text-slate-500">{meta}</div>
            )}

            {/* Source Link */}
            {sourceUrl && (
                <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Source
                </a>
            )}

            {/* Tags */}
            {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-800">
                    {tags.map((tag, i) => (
                        <span
                            key={i}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300"
                        >
                            <Tag className="h-3 w-3 opacity-60" />
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            {/* Delete Action */}
            {onDelete && (
                <div className="flex justify-end pt-2 border-t border-slate-800">
                    <button
                        onClick={(e) => { e.stopPropagation(); onDelete(); }}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                    </button>
                </div>
            )}
        </div>
    );
};

export default NotebookExpanded;
