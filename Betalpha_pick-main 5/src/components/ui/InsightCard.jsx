import clsx from 'clsx';

/**
 * Shared Card Component - Pure Visual Styling Only
 * 
 * This component ONLY handles visual styling (border, bg, shadow, rounded).
 * All layout (flex, grid, h-*, min-h-*) must be defined in the page components.
 */
export const InsightCard = ({ children, className = "", noPadding = false, ...props }) => (
    <div
        {...props}
        className={clsx(
            "rounded-xl border border-slate-800 bg-slate-900/60 shadow-sm transition-colors",
            !noPadding && "p-4",
            className
        )}
    >
        {children}
    </div>
);

export const InsightCardHeader = ({ children, className = '' }) => (
    <div className={clsx("flex items-center justify-between gap-3", className)}>
        {children}
    </div>
);

export const InsightCardBody = ({ children, className = '' }) => (
    <div className={clsx("space-y-3 text-slate-200", className)}>
        {children}
    </div>
);
