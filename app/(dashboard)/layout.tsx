'use client';

import { ReactNode, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '../../src/components/Sidebar';
import { WeissachV2 } from '../../src/components/CommandCenterV2';
import { useLayout } from '../../src/context/LayoutContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function DashboardLayout({ children }: { children: ReactNode }) {
    const { workspaceMode } = useLayout();
    const pathname = usePathname();

    return (
        <div className="flex h-screen overflow-hidden bg-slate-950">
            <Sidebar />

            <motion.main
                layout
                animate={{
                    width: workspaceMode === 'full' ? '0%' : '100%',
                    opacity: workspaceMode === 'full' ? 0 : 1,
                    pointerEvents: workspaceMode === 'full' ? 'none' : 'auto',
                    scale: workspaceMode === 'split' ? 0.98 : 1,
                    filter: workspaceMode === 'split' ? 'brightness(0.96) saturate(0.9)' : 'brightness(1) saturate(1)',
                    borderRadius: workspaceMode === 'split' ? '24px' : '0px',
                }}
                transition={{ type: 'spring', damping: 28, stiffness: 280, mass: 0.8 }}
                className="flex-1 overflow-auto bg-[#F9F9FB] relative z-10 origin-center"
            >
                <AnimatePresence mode="wait">
                    <motion.div
                        key={pathname}
                        initial={{ opacity: 0, y: 12, scale: 0.995 }}
                        animate={{
                            opacity: 1,
                            y: 0,
                            scale: 1,
                            paddingRight: workspaceMode === 'split' ? '50%' : '0px'
                        }}
                        exit={{ opacity: 0, y: -12, scale: 0.995 }}
                        transition={{
                            type: 'spring',
                            stiffness: 260,
                            damping: 30,
                            mass: 1
                        }}
                        className="h-full"
                    >
                        {children}
                    </motion.div>
                </AnimatePresence>
            </motion.main>

            <Suspense>
                <WeissachV2 />
            </Suspense>
        </div>
    );
}
