import React, { useState, useRef, useEffect } from 'react';
import { Send, Copy, Sparkles, MessageSquare, X, Minimize2, Maximize2, Loader2 } from 'lucide-react';
import { AIService, TailoredReplyResponse } from '../services/aiService';

// ============================================================================
// DESIGN SYSTEM (JONY IVE QUALITY)
// ============================================================================
const DESIGN = {
    radius: 'rounded-[20px]',
    glass: 'bg-white/80 backdrop-blur-xl border border-white/40 shadow-[0_8px_32px_rgba(0,0,0,0.12)]',
    accent: 'bg-gradient-to-br from-blue-600 to-indigo-600',
    text: {
        title: 'text-[15px] font-semibold text-slate-900 tracking-tight',
        body: 'text-[13px] text-slate-700 leading-relaxed',
        label: 'text-[11px] font-bold uppercase tracking-wider text-slate-400',
    }
};

export const TailoredReplyChat: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [inputText, setInputText] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [result, setResult] = useState<TailoredReplyResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [result, isGenerating]);

    const handleGenerate = async () => {
        if (!inputText.trim()) return;

        setIsGenerating(true);
        setError(null);
        setIsMinimized(false);

        try {
            const response = await AIService.generateTailoredReply(inputText);
            setResult(response);
        } catch (err: any) {
            setError(err.message || 'Something went wrong');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopy = () => {
        if (result?.reply) {
            navigator.clipboard.writeText(result.reply);
            // Optional: Add a toast notification here
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 w-14 h-14 ${DESIGN.radius} ${DESIGN.accent} text-white flex items-center justify-center shadow-lg hover:scale-110 active:scale-95 transition-all duration-300 z-50 group`}
            >
                <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
            </button>
        );
    }

    return (
        <div className={`fixed bottom-6 right-6 w-[380px] ${isMinimized ? 'h-14' : 'h-[520px]'} ${DESIGN.glass} ${DESIGN.radius} flex flex-col overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] z-50`}>
            {/* Header */}
            <header className="h-14 flex items-center justify-between px-5 border-b border-slate-200/50">
                <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 ${DESIGN.radius} ${DESIGN.accent} flex items-center justify-center text-white`}>
                        <MessageSquare size={16} />
                    </div>
                    <span className={DESIGN.text.title}>Tailored Reply</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
                    >
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
                    >
                        <X size={16} />
                    </button>
                </div>
            </header>

            {!isMinimized && (
                <>
                    {/* Content Area */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                        {/* Input Section */}
                        <div className="space-y-2">
                            <label className={DESIGN.text.label}>Incoming Message</label>
                            <textarea
                                placeholder="Paste the candidate's reply here..."
                                className="w-full h-24 p-3 text-[13px] bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none resize-none"
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                            />
                            <button
                                onClick={handleGenerate}
                                disabled={isGenerating || !inputText.trim()}
                                className={`w-full h-10 ${DESIGN.accent} text-white rounded-xl flex items-center justify-center gap-2 font-medium text-[13px] disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg active:scale-[0.98] transition-all`}
                            >
                                {isGenerating ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Sparkles size={14} />
                                        Generate Kofi Tone
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Error State */}
                        {error && (
                            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-[12px]">
                                {error}
                            </div>
                        )}

                        {/* Output Section */}
                        {(result || isGenerating) && (
                            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className={DESIGN.text.label}>Kofi's Draft</label>
                                        {result && (
                                            <button
                                                onClick={handleCopy}
                                                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
                                                title="Copy to clipboard"
                                            >
                                                <Copy size={14} />
                                            </button>
                                        )}
                                    </div>

                                    {isGenerating ? (
                                        <div className="space-y-2 animate-pulse">
                                            <div className="h-4 bg-slate-200 rounded w-full" />
                                            <div className="h-4 bg-slate-200 rounded w-5/6" />
                                            <div className="h-4 bg-slate-200 rounded w-4/6" />
                                        </div>
                                    ) : (
                                        <div className={`p-4 bg-white border border-slate-200 rounded-2xl ${DESIGN.text.body} whitespace-pre-wrap shadow-sm`}>
                                            {result?.reply}
                                        </div>
                                    )}
                                </div>

                                {result && !isGenerating && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-3 bg-blue-50 border border-blue-100/50 rounded-xl">
                                            <div className={DESIGN.text.label}>Energy</div>
                                            <div className="text-[12px] font-semibold text-blue-700 mt-0.5">{result.analysis}</div>
                                        </div>
                                        <div className="p-3 bg-indigo-50 border border-indigo-100/50 rounded-xl">
                                            <div className={DESIGN.text.label}>Next Step</div>
                                            <div className="text-[12px] font-semibold text-indigo-700 mt-0.5">{result.suggested_action}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer Branding */}
                    <footer className="h-10 px-5 flex items-center justify-center border-t border-slate-200/50 bg-slate-50/50">
                        <span className="text-[10px] text-slate-400 font-medium">Powered by Gemini 3 • Kofi Persona v1.0</span>
                    </footer>
                </>
            )}
        </div>
    );
};
