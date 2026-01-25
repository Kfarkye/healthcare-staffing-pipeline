import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SYSTEM, cn } from '../../design-system/obsidian';

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
            {/* Radiant Header - Unified with Command Center */}
            <header className="shrink-0 precision-glass sticky top-0 z-30 px-10 py-10 transition-all duration-500">
                <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
                    <div className="flex justify-between items-start">
                        <div className="space-y-1.5">
                            {eyebrow && (
                                <div className="editorial-caption text-blue-600 mb-2">
                                    {eyebrow}
                                </div>
                            )}
                            <h1 className="editorial-title">
                                {title}
                            </h1>
                            {subtitle && (
                                <p className="text-[15px] text-slate-500/80 font-medium tracking-tight mt-1">
                                    {subtitle}
                                </p>
                            )}
                        </div>

                        {actions && (
                            <div className="flex items-center gap-2.5">
                                {actions}
                            </div>
                        )}
                    </div>

                    <AnimatePresence>
                        {stats && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={SYSTEM.anim.fluid}
                                className="flex items-center gap-6 pt-2"
                            >
                                {stats}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 no-scrollbar">
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={SYSTEM.anim.page}
                    className="max-w-[1600px] mx-auto px-10 py-10"
                >
                    {children}
                </motion.div>
            </main>
        </div>
    );
};
