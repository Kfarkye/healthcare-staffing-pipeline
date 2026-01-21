import React from 'react';
import { cn } from '../../lib/utils';

interface StatCardProps {
    label: string;
    value: string | number;
    isActive?: boolean;
    onClick?: () => void;
    color?: 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';
    icon?: React.ReactNode;
    subtitle?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
    label,
    value,
    isActive,
    onClick,
    color = 'slate',
    icon,
    subtitle
}) => {
    const colorStyles = {
        blue: 'text-blue-600 bg-blue-50/50 border-blue-100',
        emerald: 'text-emerald-600 bg-emerald-50/50 border-emerald-100',
        amber: 'text-amber-600 bg-amber-50/50 border-amber-100',
        rose: 'text-rose-600 bg-rose-50/50 border-rose-100',
        slate: 'text-slate-600 bg-slate-50/50 border-slate-100',
    };

    const activeStyles = {
        blue: 'bg-blue-600 border-blue-600 text-white shadow-lift shadow-blue-500/20',
        emerald: 'bg-emerald-600 border-emerald-600 text-white shadow-lift shadow-emerald-500/20',
        amber: 'bg-amber-600 border-amber-600 text-white shadow-lift shadow-amber-500/20',
        rose: 'bg-rose-600 border-rose-600 text-white shadow-lift shadow-rose-500/20',
        slate: 'bg-slate-900 border-slate-900 text-white shadow-lift shadow-slate-900/20',
    };

    return (
        <button
            onClick={onClick}
            className={cn(
                'group relative flex flex-col items-start p-6 rounded-[24px] border transition-all duration-300 text-left w-full active:scale-[0.97]',
                isActive
                    ? activeStyles[color]
                    : 'bg-white border-slate-200/60 hover:border-slate-300 hover:bg-slate-50/50 shadow-sm'
            )}
        >
            <div className="flex items-center justify-between w-full mb-2">
                <span className={cn(
                    'text-[11px] font-bold uppercase tracking-[0.15em]',
                    isActive ? 'text-white/70' : 'text-slate-400'
                )}>
                    {label}
                </span>
                {icon && (
                    <div className={cn(
                        'w-8 h-8 rounded-xl flex items-center justify-center transition-colors',
                        isActive ? 'bg-white/20 text-white' : cn(colorStyles[color], 'bg-opacity-100 border-none')
                    )}>
                        {icon}
                    </div>
                )}
            </div>

            <div className="flex flex-col">
                <span className={cn(
                    'text-[24px] font-bold tracking-tight leading-tight',
                    isActive ? 'text-white' : 'text-slate-900'
                )}>
                    {value}
                </span>
                {subtitle && (
                    <span className={cn(
                        'text-[12px] font-medium mt-1',
                        isActive ? 'text-white/60' : 'text-slate-500'
                    )}>
                        {subtitle}
                    </span>
                )}
            </div>

            {/* Subtle selection indicator */}
            {isActive && (
                <div className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            )}
        </button>
    );
};
