import React from 'react';
import {
  CheckCircle, TrendingUp, Calendar, FileText,
  Sparkles, Target, Clock
} from 'lucide-react';
import type { TabId } from '../../types/submittals';

interface ContextualEmptyStateProps {
  tab: TabId;
  onNavigate?: (tab: TabId) => void;
}

const cn = (...classes: (string | boolean | null | undefined)[]) =>
  classes.filter(Boolean).join(' ');

export const ContextualEmptyState: React.FC<ContextualEmptyStateProps> = ({
  tab,
  onNavigate,
}) => {
  const configs = {
    READY: {
      icon: <Sparkles size={32} strokeWidth={1.5} className="text-blue-500" />,
      title: 'No candidates ready',
      message: 'Review priority candidates to build your submission pipeline.',
      variant: 'info' as const,
      action: onNavigate ? {
        label: 'View Priority Candidates →',
        onClick: () => onNavigate('READY'),
        secondary: true,
      } : undefined,
    },
    SUBMITTED: {
      icon: <CheckCircle size={32} strokeWidth={1.5} className="text-emerald-500" />,
      title: 'All clear!',
      message: 'No pending submissions. Great work! Ready to submit more candidates from your pipeline.',
      variant: 'success' as const,
      action: onNavigate ? {
        label: 'Go to Ready →',
        onClick: () => onNavigate('READY'),
      } : undefined,
    },
    OFFER: {
      icon: <Target size={32} strokeWidth={1.5} className="text-emerald-500" />,
      title: 'No pending offers',
      message: 'Excellent! All offers have been processed. Keep up the momentum.',
      variant: 'success' as const,
      action: onNavigate ? {
        label: 'View Active Assignments',
        onClick: () => window.open('/assignments', '_blank'),
        secondary: true,
      } : undefined,
    },
    PRESTART: {
      icon: <Calendar size={32} strokeWidth={1.5} className="text-blue-500" />,
      title: 'No upcoming starts',
      message: 'No candidates scheduled for onboarding this week. Check future assignments for planning.',
      variant: 'info' as const,
      action: {
        label: 'View Future Assignments →',
        onClick: () => window.open('/assignments?filter=future', '_blank'),
        secondary: true,
      },
    },
  };

  const config = configs[tab];

  const variantStyles = {
    default: 'from-slate-100 to-slate-50',
    success: 'from-emerald-100 to-green-50',
    info: 'from-blue-100 to-indigo-50',
  };

  return (
    <div
      className="flex items-center justify-center py-32 animate-fadeInUp"
      style={{ animationDelay: '150ms', opacity: 0 }}
    >
      <div className="text-center max-w-md px-4">
        <div className={cn(
          "inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br mb-5 shadow-sm",
          variantStyles[config.variant]
        )}>
          {config.icon}
        </div>

        <h3 className="text-xl font-semibold text-slate-900 mb-3 tracking-tight">
          {config.title}
        </h3>

        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          {config.message}
        </p>

        {config.action && (
          <button
            onClick={config.action.onClick}
            className={cn(
              "inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all duration-200 active:scale-[0.99] shadow-sm",
              config.action.secondary
                ? 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                : 'text-white bg-slate-900 hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-900/25'
            )}
          >
            {config.action.label}
          </button>
        )}
      </div>
    </div>
  );
};
