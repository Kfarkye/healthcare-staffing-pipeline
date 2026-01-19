import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ 
    value, 
    onChange, 
    placeholder = "Search...",
    className = ""
}) => {
    return (
        <div className={`relative ${className}`}>
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-sm 
                         placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 
                         focus:border-transparent transition-all"
            />
            {value && (
                <button
                    onClick={() => onChange('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 
                             hover:text-gray-600 transition-colors"
                >
                    <X size={16} />
                </button>
            )}
        </div>
    );
};