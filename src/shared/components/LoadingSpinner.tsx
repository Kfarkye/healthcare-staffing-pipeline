import React from 'react';

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    message?: string;
    fullScreen?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
    size = 'md',
    message,
    fullScreen = false
}) => {
    const sizes = {
        sm: 'w-4 h-4 border',
        md: 'w-8 h-8 border-2',
        lg: 'w-12 h-12 border-2'
    };
    
    const content = (
        <div className="text-center">
            <div className={`
                ${sizes[size]} border-gray-200 border-t-gray-900 
                rounded-full animate-spin mx-auto
            `} />
            {message && (
                <p className="text-sm text-gray-500 mt-3">{message}</p>
            )}
        </div>
    );
    
    if (fullScreen) {
        return (
            <div className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50">
                {content}
            </div>
        );
    }
    
    return content;
};