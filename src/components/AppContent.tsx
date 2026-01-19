import React from 'react';
import { Header } from './Header';
import { ViewConfig } from '../types/views';

interface AppContentProps {
  view: ViewConfig;
}

export const AppContent: React.FC<AppContentProps> = ({ view }) => {
  const ActiveComponent = view.component;
  const isFullPageView = view.id === 'prospect';
  
  if (isFullPageView) {
    return (
      <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-50 via-gray-50/50 to-white overflow-hidden">
        <main key={view.id} className="flex-1 overflow-y-auto custom-scrollbar">
          <ActiveComponent />
        </main>
      </div>
    );
  }
  
  return (
    <div className="flex-1 flex flex-col bg-gradient-to-br from-gray-50 via-gray-50/50 to-white">
      <Header view={view} />
      <main key={view.id} className="flex-1 overflow-y-auto custom-scrollbar">
        <ActiveComponent />
      </main>
    </div>
  );
};