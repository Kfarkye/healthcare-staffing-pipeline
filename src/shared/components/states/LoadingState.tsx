import React from 'react';
import { Loader2 } from 'lucide-react';

export const LoadingState: React.FC<{ message?: string }> = ({ message = "Loading..." }) => (
    <div className="flex flex-col items-center justify-center text-center p-20">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
        <p className="mt-4 font-medium text-gray-600">{message}</p>
    </div>
);