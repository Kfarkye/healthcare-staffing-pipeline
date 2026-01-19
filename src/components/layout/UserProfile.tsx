import React from 'react';
import { useAuth } from '../../context/AuthContext';

export default function UserProfile(): JSX.Element {
  const auth = useAuth();
  const user = auth?.user;

  if (!user) return null;

  return (
    <div className="px-3">
      <div className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-100 transition-all duration-200 cursor-pointer group active:scale-[0.98]">
        <div
          className="relative w-9 h-9 rounded-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center text-white font-bold text-sm shrink-0"
          style={{
            boxShadow:
              '0 1px 1px rgba(0, 0, 0, 0.11), 0 2px 4px rgba(0, 0, 0, 0.09), inset 0 1px 2px rgba(255, 255, 255, 0.12), inset 0 -1px 2px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-white/12 via-transparent to-transparent opacity-70" />
          <span
            className="relative z-10"
            style={{ textShadow: '0 1px 2px rgba(0, 0, 0, 0.35)' }}
          >
            {user.initials}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">
            {user.name}
          </p>
          <p className="text-xs text-slate-500 truncate">{user.email}</p>
        </div>
      </div>
    </div>
  );
}
