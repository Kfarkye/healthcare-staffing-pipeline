import React from 'react';

interface FilterOption {
    value: string;
    label: string;
    count?: number;
}

interface FilterDropdownProps {
    label: string;
    value: string;
    options: FilterOption[];
    onChange: (value: string) => void;
    showCount?: boolean;
    className?: string;
}

export const FilterDropdown: React.FC<FilterDropdownProps> = ({ 
    label, 
    value, 
    options, 
    onChange,
    showCount = false,
    className = ""
}) => {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`
                px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm 
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                cursor-pointer hover:border-gray-300 transition-colors ${className}
            `}
        >
            <option value="all">{label}</option>
            {options.map(opt => (
                <option key={opt.value} value={opt.value}>
                    {opt.label}
                    {showCount && opt.count !== undefined && ` (${opt.count})`}
                </option>
            ))}
        </select>
    );
};