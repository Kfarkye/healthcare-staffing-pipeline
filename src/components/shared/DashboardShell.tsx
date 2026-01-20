import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import { ChevronRight } from 'lucide-react';

interface DashboardShellProps {
    children: React.ReactNode;
    title: string;
    subtitle?: string;
    eyebrow?: string;
    actions?: React.ReactNode;
    stats?: React.ReactNode;
    className?: string;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
    children,
    title,
    subtitle,
    eyebrow,
    actions,
    stats,
    className
}) => {
    return (
        <div className={cn("flex flex-col h-full bg-[#F9F9FB] overflow-hidden", className)}>
            {/* Header Area */}
            <header className="shrink-0 bg-white/70 backdrop-blur-xl border-b border-slate-200/60 sticky top-0 z-30 px-8 py-6">
                <div className="max-w-[1600px] mx-auto flex justify-between items-end">
                    <div className="space-y-1">
                        {eyebrow && (
                            <div className="text-[11px] font-bold uppercase tracking-[0.1em] text-blue-600 mb-1">
                                {eyebrow}
                            </div>
                        )}
                        <h1 className="text-[28px] font-bold tracking-tight text-slate-900 leading-none">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="text-[14px] text-slate-500 font-medium">
                                {subtitle}
                            </p>
                        )}
                    </div>

                    {actions && (
                        <div className="flex items-center gap-3 pb-1">
                            {actions}
                        </div>
                    )}
                </div>

                {stats && (
                    <div className="max-w-[1600px] mx-auto mt-8 flex items-center gap-4">
                        {stats}
                    </div>
                )}
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 page-transition-container">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="max-w-[1600px] mx-auto px-8 py-8"
                >
                    {children}
                </motion.div>
            </main>
        </div>
    );
};
