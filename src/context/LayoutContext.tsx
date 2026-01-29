'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type WorkspaceMode = 'floating' | 'split' | 'full';

interface LayoutContextType {
    workspaceMode: WorkspaceMode;
    setWorkspaceMode: (mode: WorkspaceMode) => void;
}

const LayoutContext = createContext<LayoutContextType | undefined>(undefined);

export const LayoutProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('floating');

    return (
        <LayoutContext.Provider value={{ workspaceMode, setWorkspaceMode }}>
            {children}
        </LayoutContext.Provider>
    );
};

export const useLayout = () => {
    const context = useContext(LayoutContext);
    if (context === undefined) {
        throw new Error('useLayout must be used within a LayoutProvider');
    }
    return context;
};
