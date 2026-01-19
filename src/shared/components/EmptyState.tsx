import React from 'react';

interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ 
    icon,
    title, 
    description,
    action 
}) => {
    return (
        <div className="text-center py-12">
            {icon && (
                <div className="text-gray-400 mb-4 flex justify-center">
                    {icon}
                </div>
            )}
            <h3 className="text-sm font-medium text-gray-900 mb-1">
                {title}
            </h3>
            {description && (
                <p className="text-sm text-gray-500 mb-4">
                    {description}
                </p>
            )}
            {action && (
                <button
                    onClick={action.onClick}
                    className="px-4 py-2 bg-gray-900 text-white text-sm font-medium 
                             rounded-lg hover:bg-gray-800 transition-colors"
                >
                    {action.label}
                </button>
            )}
        </div>
    );
};