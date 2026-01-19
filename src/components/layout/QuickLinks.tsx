import React from 'react';
import { QUICK_LINKS } from '../../config/constants';

const ChevronRightIcon: React.FC = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export default function QuickLinks(): JSX.Element {
  return (
    <div className="px-2">
      <h3 className="px-3 mb-2 text-[11px] font-semibold text-slate-400 tracking-wider uppercase">
        Quick Links
      </h3>
      <nav className="space-y-1" aria-label="Quick navigation links">
        {QUICK_LINKS.map((link) => {
          const isExternal = link.href.startsWith('http');

          return (
            <a
              key={link.label}
              href={link.href}
              target={isExternal ? '_blank' : '_self'}
              rel={isExternal ? 'noopener noreferrer' : undefined}
              className="group relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:scale-[0.98] transition-all duration-200"
            >
              <span className="text-[13px] font-medium">{link.label}</span>
              <div className="opacity-0 -translate-x-2 group-hover:opacity-50 group-hover:translate-x-0 transition-all duration-200">
                <ChevronRightIcon />
              </div>
            </a>
          );
        })}
      </nav>
    </div>
  );
}
