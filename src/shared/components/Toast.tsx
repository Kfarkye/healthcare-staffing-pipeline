import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface ToastProps {
    show: boolean;
    message: string;
    type?: 'success' | 'error' | 'info';
    onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ 
    show, 
    message, 
    type = 'success',
    onClose 
}) => {
    useEffect(() => {
        if (show) {
            const timer = setTimeout(onClose, 3000);
            return () => clearTimeout(timer);
        }
    }, [show, onClose]);
    
    if (!show) return null;
    
    const styles = {
        success: 'bg-green-50 border-green-200 text-green-900',
        error: 'bg-red-50 border-red-200 text-red-900',
        info: 'bg-blue-50 border-blue-200 text-blue-900',
    };
    
    const icons = {
        success: <CheckCircle size={20} />,
        error: <AlertCircle size={20} />,
        info: <Info size={20} />
    };
    
    return (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5">
            <div className={`${styles[type]} px-4 py-3 rounded-lg shadow-lg border flex items-center gap-3 max-w-md`}>
                {icons[type]}
                <span className="text-sm font-medium">{message}</span>
                <button
                    onClick={onClose}
                    className="ml-auto hover:opacity-70 transition-opacity"
                >
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};