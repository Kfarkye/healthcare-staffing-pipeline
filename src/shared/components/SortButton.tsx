import React from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface SortButtonProps {
    label: string;
    sortKey: string;
    currentKey: string;
    currentDirection: 'ascending' | 'descending';
    onSort: (key: string) => void;
    className?: string;
}

export const SortButton: React.FC<SortButtonProps> = ({ 
    label, 
    sortKey, 
    currentKey,
    currentDirection,
    onSort,
    className = "" 
}) => {
    const isActive = currentKey === sortKey;
    const Icon = currentDirection === 'ascending' ? ArrowUp : ArrowDown;
    
    return (
        <button
            onClick={() => onSort(sortKey)}
            className={`
                flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium 
                transition-all duration-200 ${className}
                ${isActive 
                    ? 'bg-gray-900 text-white shadow-sm' 
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }
            `}
        >
            {label}
            {isActive && <Icon size={12} className="animate-in fade-in" />}
        </button>
    );
};