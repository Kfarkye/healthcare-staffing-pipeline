import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CopyButtonProps {
    text: string;
    onCopy?: () => void;
    size?: 'sm' | 'md' | 'lg';
    showText?: boolean;
    className?: string;
}

export const CopyButton: React.FC<CopyButtonProps> = ({ 
    text, 
    onCopy,
    size = 'md',
    showText = false,
    className = ""
}) => {
    const [copied, setCopied] = useState(false);
    
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            onCopy?.();
            setTimeout(() => setCopied(false), 2000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    };
    
    const sizes = {
        sm: 'p-1',
        md: 'p-2',
        lg: 'p-3'
    };
    
    const iconSizes = {
        sm: 12,
        md: 16,
        lg: 20
    };
    
    return (
        <button
            onClick={handleCopy}
            className={`
                ${sizes[size]} rounded-md transition-all duration-200
                ${copied 
                    ? 'bg-green-50 text-green-600' 
                    : 'hover:bg-gray-100 text-gray-500 hover:text-gray-700'
                }
                ${className}
            `}
            title={copied ? "Copied!" : "Copy to clipboard"}
        >
            <div className="flex items-center gap-2">
                {copied ? (
                    <Check size={iconSizes[size]} />
                ) : (
                    <Copy size={iconSizes[size]} />
                )}
                {showText && (
                    <span className="text-sm font-medium">
                        {copied ? 'Copied' : 'Copy'}
                    </span>
                )}
            </div>
        </button>
    );
};