import React from 'react';

/**
 * ListRowShell - Shared row container matching Journal's .list-item-header pattern
 * 
 * Layout contract:
 * - Fixed padding: px-4 py-3
 * - Left/Right flex columns with proper truncation
 * - Hover state included
 * - Optional onClick for expand/collapse
 */
export const ListRowShell = ({
    children,
    onClick,
    isExpanded = false,
    className = ''
}) => (
    <div
        className={`
      rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden
      transition-all duration-200
      ${isExpanded ? 'border-indigo-500/40 ring-1 ring-indigo-500/20' : 'hover:border-slate-700'}
      ${className}
    `}
    >
        {children}
    </div>
);

/**
 * Row Header - The fixed-height clickable header
 * Matches Journal's 12px 16px padding pattern
 */
export const RowHeader = ({
    children,
    onClick,
    className = ''
}) => (
    <div
        onClick={onClick}
        className={`
      flex items-center justify-between
      px-4 py-3
      cursor-pointer
      bg-slate-900/40
      hover:bg-slate-800/60
      transition-colors
      ${className}
    `}
    >
        {children}
    </div>
);

/**
 * Row Left - Left side content with truncation support
 */
export const RowLeft = ({ children, className = '' }) => (
    <div className={`flex items-center gap-3 min-w-0 flex-1 ${className}`}>
        {children}
    </div>
);

/**
 * Row Right - Right side badges/actions, never wraps
 */
export const RowRight = ({ children, className = '' }) => (
    <div className={`flex items-center gap-2 shrink-0 whitespace-nowrap ${className}`}>
        {children}
    </div>
);

/**
 * Row Body - Expandable content area
 */
export const RowBody = ({ children, className = '' }) => (
    <div className={`px-5 py-4 space-y-4 text-sm leading-6 border-t border-slate-800/60 ${className}`}>
        {children}
    </div>
);

export default ListRowShell;
