// src/components/layout/RootLayout.tsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
import { TailoredReplyChat } from '../TailoredReplyChat';

export default function RootLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <main className="flex-1 overflow-auto bg-slate-50">
        <Outlet />
      </main>
      <TailoredReplyChat />
    </div>
  );
}