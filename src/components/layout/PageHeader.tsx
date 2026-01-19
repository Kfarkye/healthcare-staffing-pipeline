// ============================================================================
// PageHeader Layout Component
// Consistent header structure for all dashboard pages
// ============================================================================

import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, className = '' }) => (
  <header className={`px-6 py-4 bg-white/80 backdrop-blur-sm border-b border-slate-200 ${className}`}>
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900 tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  </header>
);

export default PageHeader;
