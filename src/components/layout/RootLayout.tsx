// src/components/layout/RootLayout.tsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
import { CommandCenter } from '../CommandCenter';

export default function RootLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-auto bg-slate-50 relative">
        <Outlet />
      </main>
      <CommandCenter />
    </div>
  );
}