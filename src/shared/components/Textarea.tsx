import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    label?: string;
    error?: string;
    helperText?: string;
}

export const Textarea: React.FC<TextareaProps> = ({
    label,
    error,
    helperText,
    className = '',
    ...props
}) => {
    const baseStyles = `
        w-full px-3 py-2 border rounded-lg text-sm transition-all resize-none
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
        disabled:bg-gray-50 disabled:text-gray-500
    `;
    
    const textareaStyles = error 
        ? `${baseStyles} border-red-300 bg-red-50`
        : `${baseStyles} border-gray-200 bg-white hover:border-gray-300`;
    
    return (
        <div className={className}>
            {label && (
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    {label}
                </label>
            )}
            <textarea
                className={textareaStyles}
                {...props}
            />
            {error && (
                <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
            {helperText && !error && (
                <p className="mt-1 text-sm text-gray-500">{helperText}</p>
            )}
        </div>
    );
};