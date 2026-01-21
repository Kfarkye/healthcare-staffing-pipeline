// src/components/layout/RootLayout.tsx
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
import { CommandCenter } from '../CommandCenter';
import { useLayout } from '../../context/LayoutContext';
import { motion, AnimatePresence } from 'framer-motion';

export default function RootLayout() {
  const { workspaceMode } = useLayout();
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      <Sidebar />

      <motion.main
        layout
        animate={{
          width: workspaceMode === 'full' ? '0%' : workspaceMode === 'split' ? '50%' : '100%',
          opacity: workspaceMode === 'full' ? 0 : 1,
          pointerEvents: workspaceMode === 'full' ? 'none' : 'auto',
          // Jony Ive Depth: Push content back in Z-space when split
          scale: workspaceMode === 'split' ? 0.98 : 1,
          filter: workspaceMode === 'split' ? 'brightness(0.96) saturate(0.9)' : 'brightness(1) saturate(1)',
          borderRadius: workspaceMode === 'split' ? '24px' : '0px',
        }}
        // Jony Ive Physics: Confident Click (Stiffness 280, Damping 28)
        transition={{ type: 'spring', damping: 28, stiffness: 280, mass: 0.8 }}
        className="flex-1 overflow-auto bg-[#F9F9FB] relative z-10 origin-center"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="h-full"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </motion.main>

      <CommandCenter />
    </div>
  );
}