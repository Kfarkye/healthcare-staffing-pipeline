// Toast component for notifications
import React from 'react';

export interface Toast {
    message: string;
    type: 'success' | 'error' | 'info';
}

export const ToastContainer: React.FC<{
    toast: Toast | null;
    onDismiss: () => void;
}> = ({ toast, onDismiss }) => {
    if (!toast) return null;

    const bgColors = {
        success: 'bg-emerald-600',
        error: 'bg-red-600',
        info: 'bg-slate-900',
    };

    return (
        <div
            className={`fixed bottom-8 right-8 px-6 py-4 rounded-[20px] z-[100] flex items-center gap-3 text-white shadow-lg ${bgColors[toast.type]}`}
            role="alert"
        >
            <span className="text-[14px] font-bold">{toast.message}</span>
            <button onClick={onDismiss} className="ml-2 text-white/80 hover:text-white">×</button>
        </div>
    );
};