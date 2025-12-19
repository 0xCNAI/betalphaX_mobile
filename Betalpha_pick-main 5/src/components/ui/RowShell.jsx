import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * RowShell - Generic layout shell for list rows
 * 
 * ONLY handles layout contract:
 * - 72px fixed collapsed height
 * - 3-column layout (left/center/right)
 * - Chevron toggle
 * - Expanded container (content injected via children)
 * 
 * Does NOT handle domain-specific content - that's the page's job.
 */
const RowShell = ({
    // Left column content (icon + labels)
    leftContent,
    // Center column content (title + preview, should be truncated)
    centerContent,
    // Right column content (badges, actions)
    rightContent,
    // Expanded content (page-specific, rendered as children)
    children,
    // State
    isExpanded = false,
    onToggle,
    // Optional styling
    className = '',
}) => {
    return (
        <div
            className={`
        rounded-lg border overflow-hidden transition-all duration-200
        ${isExpanded
                    ? 'border-indigo-500/40 ring-1 ring-indigo-500/20 bg-slate-900/80'
                    : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                }
        ${className}
      `}
        >
            {/* COLLAPSED ROW - Fixed 72px height */}
            <div
                onClick={onToggle}
                className="flex items-center h-[72px] px-4 cursor-pointer"
            >
                {/* LEFT COLUMN: w-[180px] */}
                <div className="w-[180px] shrink-0 flex items-center gap-3 min-w-0 overflow-hidden">
                    {leftContent}
                </div>

                {/* CENTER COLUMN: flex-1, must clamp */}
                <div className="flex-1 min-w-0 px-4 overflow-hidden">
                    {centerContent}
                </div>

                {/* RIGHT COLUMN: w-[220px] */}
                <div className="w-[220px] shrink-0 flex items-center justify-end gap-2">
                    {rightContent}
                    {/* Chevron */}
                    {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
                    ) : (
                        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 ml-2" />
                    )}
                </div>
            </div>

            {/* EXPANDED CONTENT - Injected by page */}
            {isExpanded && children && (
                <div className="border-t border-slate-800">
                    {children}
                </div>
            )}
        </div>
    );
};

export default RowShell;
