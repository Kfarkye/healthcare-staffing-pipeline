import React from 'react';
import { MessageSquare, Calendar, Phone } from 'lucide-react';
import { ACTION_ITEMS } from '../../config/constants';

const ACTION_ICONS: Record<string, React.ElementType> = {
  'T': MessageSquare,
  'O': Calendar,
  'R': Phone,
};

export default function ActionBar(): JSX.Element {
  return (
    <div className="px-4 py-4 border-b border-slate-200/70">
      <div className="grid grid-cols-3 gap-2">
        {ACTION_ITEMS.map((action) => {
          const Icon = ACTION_ICONS[action.id];
          const baseClasses =
            'flex items-center justify-center h-10 w-full rounded-lg transition-all duration-200 active:scale-95 shadow-sm';

          if (action.isLink) {
            return (
              <a
                key={action.id}
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                title={action.title}
                aria-label={action.title}
                className={`${baseClasses} bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900`}
              >
                {Icon && <Icon size={18} />}
              </a>
            );
          }

          return (
            <button
              key={action.id}
              onClick={action.action}
              title={action.title}
              aria-label={action.title}
              className={`${baseClasses} bg-slate-900 text-white hover:bg-slate-800`}
            >
              {Icon && <Icon size={18} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
