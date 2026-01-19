import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectOption {
    value: string;
    label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    error?: string;
    options: SelectOption[];
    placeholder?: string;
    helperText?: string;
}

export const Select: React.FC<SelectProps> = ({
    label,
    error,
    options,
    placeholder,
    helperText,
    className = '',
    ...props
}) => {
    const baseStyles = `
        w-full px-3 py-2 border rounded-lg text-sm transition-all appearance-none
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
        disabled:bg-gray-50 disabled:text-gray-500
    `;
    
    const selectStyles = error 
        ? `${baseStyles} border-red-300 bg-red-50`
        : `${baseStyles} border-gray-200 bg-white hover:border-gray-300`;
    
    return (
        <div className={className}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                </label>
            )}
            <div className="relative">
                <select
                    className={selectStyles}
                    {...props}
                >
                    {placeholder && (
                        <option value="" disabled>
                            {placeholder}
                        </option>
                    )}
                    {options.map(option => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <ChevronDown 
                    size={16} 
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" 
                />
            </div>
            {error && (
                <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
            {helperText && !error && (
                <p className="mt-1 text-sm text-gray-500">{helperText}</p>
            )}
        </div>
    );
};