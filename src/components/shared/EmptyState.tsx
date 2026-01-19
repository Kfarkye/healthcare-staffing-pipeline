import React from 'react';
import { FolderOpen, CheckCircle, TrendingUp } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  message?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  variant?: 'default' | 'success' | 'info';
}

const cn = (...classes: (string | boolean | null | undefined)[]) =>
  classes.filter(Boolean).join(' ');

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'All clear',
  message = 'No candidates in this stage yet',
  icon,
  action,
  variant = 'default'
}) => {
  const variantStyles = {
    default: 'from-slate-100 to-slate-50',
    success: 'from-emerald-100 to-green-50',
    info: 'from-blue-100 to-sky-50',
  };

  const defaultIcon = variant === 'success' ? (
    <CheckCircle size={32} strokeWidth={1.5} className="text-emerald-400" />
  ) : (
    <FolderOpen size={32} strokeWidth={1.5} className="text-slate-300" />
  );

  return (
    <div
      className="flex items-center justify-center py-32 animate-fadeInUp"
      style={{ animationDelay: '150ms', opacity: 0 }}
    >
      <div className="text-center max-w-sm">
        <div className={cn(
          "inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br mb-4",
          variantStyles[variant]
        )}>
          {icon || defaultIcon}
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 leading-relaxed mb-4">
          {message}
        </p>
        {action && (
          <button
            onClick={action.onClick}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-900 bg-slate-100 rounded-lg hover:bg-slate-200 transition-all duration-200 active:scale-[0.99]"
          >
            {action.label}
            <TrendingUp size={16} />
          </button>
        )}
      </div>
    </div>
  );
};