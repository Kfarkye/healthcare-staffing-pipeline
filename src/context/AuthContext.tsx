import React, { createContext, useContext, useState } from 'react';

// ============================================================================
// AUTH TYPES
// ============================================================================

export type User = { 
  name: string; 
  email: string; 
  initials: string; 
  isAuthenticated: boolean;
};

export type AuthShape = { 
  user: User; 
  setUser: React.Dispatch<React.SetStateAction<User>>;
};

// ============================================================================
// AUTH CONTEXT
// ============================================================================

export const AuthContext = createContext<AuthShape | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User>({
    name: "Kofi Farkye",
    email: "kofi.farkye@example.com",
    initials: "KF",
    isAuthenticated: true
  });
  
  const value: AuthShape = { user, setUser };
  
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};