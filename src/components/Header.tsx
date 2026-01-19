import React from 'react';
import { ViewConfig } from '../types/views';

interface HeaderProps {
  view: ViewConfig;
}

export const Header: React.FC<HeaderProps> = ({ view }) => (
  <header className="bg-white/90 backdrop-blur-xl border-b border-gray-200/70 sticky top-0 z-20 animate-fadeIn"
          style={{
            boxShadow: '0 1px 0 rgba(0, 0, 0, 0.03), 0 1px 3px rgba(0, 0, 0, 0.03)'
          }}>
    <div className="px-8 py-5">
      <h1 className="text-2xl font-semibold text-gray-900 tracking-tight transition-all duration-300 hover:text-gray-950">
        {view.label}
      </h1>
      <p className="text-sm text-gray-500 mt-1 transition-colors duration-300">
        {view.description}
      </p>
    </div>
  </header>
);