import React from 'react';
import { Users } from 'lucide-react';

export const EmptyState: React.FC<{ message?: string, description?: string }> = ({ message = "No Items Found", description = "There's nothing here yet." }) => (
    <div className="flex flex-col items-center justify-center text-center p-20 bg-gray-50 rounded-lg">
        <Users className="w-12 h-12 text-gray-300" />
        <p className="mt-4 font-semibold text-gray-700">{message}</p>
        <p className="mt-2 text-sm text-gray-500">{description}</p>
    </div>
);