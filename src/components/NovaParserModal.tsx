import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Loader2, Zap } from 'lucide-react';

interface NovaParserModalProps {
    isOpen: boolean;
    onClose: () => void;
    onComplete: () => void; // Simple callback to trigger a refresh
}

const NovaParserModal: React.FC<NovaParserModalProps> = ({ isOpen, onClose, onComplete }) => {
    const [text, setText] = useState('');
    const [isParsing, setIsParsing] = useState(false);
    const [error, setError] = useState('');

    const handleParse = async () => {
        if (!text.trim()) {
            setError('Please paste text to parse.');
            return;
        }
        setIsParsing(true);
        setError('');
        try {
            const { data, error: funcError } = await supabase.functions.invoke('parse-nova-text', {
                body: { text }
            });

            if (funcError) throw funcError;

            // The edge function is expected to handle the database inserts/updates
            // and return a success message.
            console.log('Parse result:', data);

            onComplete(); // Refresh the main dashboard
            onClose();
        } catch (err: any) {
            setError(err.message || 'An unknown error occurred.');
        } finally {
            setIsParsing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl">
                <header className="px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-slate-900">Parse from Nova</h2>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg"><X size={20} className="text-slate-500" /></button>
                </header>
                <main className="p-6 space-y-4">
                    <p className="text-sm text-slate-600">
                        Paste the content copied from Nova's contract list to automatically create or update assignments.
                    </p>
                    <textarea 
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        rows={12}
                        placeholder="Paste copied text here..."
                        className="w-full bg-slate-50 p-3 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-slate-400"
                    />
                    {error && <p className="text-sm text-red-600">{error}</p>}
                </main>
                <footer className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
                    <button onClick={handleParse} disabled={isParsing} className="px-5 py-2.5 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:bg-slate-400 flex items-center gap-2">
                        {isParsing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                        {isParsing ? 'Parsing...' : 'Parse & Save'}
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default NovaParserModal;