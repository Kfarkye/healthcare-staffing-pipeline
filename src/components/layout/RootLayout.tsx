// src/components/layout/RootLayout.tsx
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
import { CommandCenter } from '../CommandCenter';
import { useLayout } from '../../context/LayoutContext';
import { motion } from 'framer-motion';

export default function RootLayout() {
  const { workspaceMode } = useLayout();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-900">
      <Sidebar />

      <motion.main
        layout
        animate={{
          width: workspaceMode === 'full' ? '0%' : workspaceMode === 'split' ? '50%' : '100%',
          opacity: workspaceMode === 'full' ? 0 : 1,
          pointerEvents: workspaceMode === 'full' ? 'none' : 'auto'
          // In split/full mode we might want to hide the sidebar too?
          // For now let's just scale the main content.
        }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="flex-1 overflow-auto bg-slate-50 relative z-10"
      >
        <Outlet />
      </motion.main>

      <CommandCenter />
    </div>
  );
}