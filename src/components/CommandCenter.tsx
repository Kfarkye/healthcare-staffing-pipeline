import React, { useState, useRef, useEffect } from 'react';
import {
    Send,
    Copy,
    Sparkles,
    MessageSquare,
    X,
    Minimize2,
    Maximize2,
    Loader2,
    Search,
    User,
    Briefcase,
    Mail,
    Command,
    ChevronRight,
    Zap
} from 'lucide-react';
import { AIService, ChatMessage } from '../services/aiService';

// ============================================================================
// DESIGN SYSTEM - APPLE × GEMINI INTERNAL (v2026)
// ============================================================================
const DESIGN = {
    radius: {
        base: 'rounded-[24px]',
        inner: 'rounded-[18px]',
        button: 'rounded-[14px]',
    },
    glass: {
        obsidian: 'bg-slate-900/90 backdrop-blur-3xl border border-white/10 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.5)]',
        light: 'bg-white/70 backdrop-blur-3xl border border-white/40 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.1)]',
    },
    accent: {
        primary: 'bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600',
        glow: 'shadow-[0_0_20px_rgba(79,70,229,0.4)]',
    },
    text: {
        title: 'text-[15px] font-semibold text-white tracking-tight',
        body: 'text-[13px] text-slate-300 leading-relaxed',
        label: 'text-[10px] font-bold uppercase tracking-[0.05em] text-slate-500',
        system: 'text-[11px] font-medium text-blue-400',
    },
    animation: 'transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)',
};

// ============================================================================
// RICH CARD COMPONENTS
// ============================================================================

const ProspectCard: React.FC<{ data: any }> = ({ data }) => (
    <div className={`p-4 ${DESIGN.glass.light} ${DESIGN.radius.inner} animate-in fade-in slide-in-from-bottom-2`}>
        <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <User size={18} />
            </div>
            <div>
                <div className="text-[14px] font-bold text-slate-900">{data.name}</div>
                <div className="text-[11px] text-slate-500 font-medium">{data.specialty} • {data.home_state}</div>
            </div>
            <div className="ml-auto px-2 py-0.5 rounded-full bg-slate-100 text-[10px] font-bold uppercase text-slate-600">
                {data.status}
            </div>
        </div>
        <div className="flex gap-2">
            <button className={`flex-1 h-8 ${DESIGN.radius.button} bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.97] transition-all`}>
                Open Profile <ChevronRight size={12} />
            </button>
            <button className={`w-8 h-8 ${DESIGN.radius.button} border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50 active:scale-[0.97] transition-all`}>
                <Mail size={14} />
            </button>
        </div>
    </div>
);

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const CommandCenter: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [history, setHistory] = useState<ChatMessage[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [history, isGenerating]);

    const handleSend = async () => {
        if (!inputValue.trim() || isGenerating) return;

        const userMessage = inputValue.trim();
        setInputValue('');
        setIsGenerating(true);

        const newHistory: ChatMessage[] = [
            ...history,
            { role: 'user', parts: [{ text: userMessage }] }
        ];
        setHistory(newHistory);

        try {
            const response = await AIService.sendCommand(userMessage, history);
            setHistory([...newHistory, response]);
        } catch (error) {
            console.error('Command center error:', error);
            setHistory([...newHistory, {
                role: 'model',
                parts: [{ text: "I encountered an error connecting to the Command Center. Please verify your connection or try again." }]
            }]);
        } finally {
            setIsGenerating(false);
        }
    };



    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 w-16 h-16 ${DESIGN.radius.base} ${DESIGN.accent.primary} ${DESIGN.accent.glow} text-white flex items-center justify-center group active:scale-90 ${DESIGN.animation} z-50 overflow-hidden`}
            >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <Command className="w-7 h-7 group-hover:rotate-12 transition-transform duration-500" />
            </button>
        );
    }

    return (
        <div className={`fixed bottom-6 right-6 w-[400px] ${isMinimized ? 'h-16' : 'h-[600px]'} ${DESIGN.glass.obsidian} ${DESIGN.radius.base} flex flex-col overflow-hidden ${DESIGN.animation} z-50`}>
            {/* Header */}
            <header className="h-16 flex items-center justify-between px-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 ${DESIGN.radius.inner} ${DESIGN.accent.primary} flex items-center justify-center text-white`}>
                        <Zap size={16} fill="white" />
                    </div>
                    <div className="flex flex-col">
                        <span className={DESIGN.text.title}>Command Center</span>
                        <span className={DESIGN.text.system}>System v4.2 • RAG Active</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsMinimized(!isMinimized)}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white"
                    >
                        {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white"
                    >
                        <X size={16} />
                    </button>
                </div>
            </header>

            {!isMinimized && (
                <>
                    {/* Message Thread */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
                        {history.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                    <Sparkles size={24} className="text-blue-400" />
                                </div>
                                <div className="max-w-[240px]">
                                    <div className="text-white font-semibold text-[15px] mb-1">Grounded Intelligence</div>
                                    <div className="text-slate-400 text-[12px]">Search prospects, draft emails, or query the database with natural language.</div>
                                </div>
                            </div>
                        )}

                        {history.map((msg, i) => (
                            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-2`}>
                                <div className={`max-w-[85%] p-4 ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-[20px] rounded-br-[4px]' : 'bg-white/5 text-slate-200 border border-white/10 rounded-[20px] rounded-bl-[4px]'}`}>
                                    <div className="text-[13px] leading-relaxed whitespace-pre-wrap">
                                        {msg.parts[0].text}
                                    </div>
                                    {/* Tool Call Indicators would go here */}
                                </div>
                            </div>
                        ))}

                        {isGenerating && (
                            <div className="flex items-start gap-3 animate-pulse">
                                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                                    <Loader2 size={14} className="text-blue-400 animate-spin" />
                                </div>
                                <div className="h-10 bg-white/5 rounded-[20px] w-2/3 border border-white/10" />
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className="p-4 border-t border-white/10 bg-black/20">
                        <div className={`relative flex items-center ${DESIGN.glass.light} px-4 py-3 rounded-[20px] focus-within:ring-2 focus-within:ring-blue-500/50 transition-all`}>
                            <textarea
                                rows={1}
                                placeholder="How can I help you today, Kofi?"
                                className="flex-1 bg-transparent border-none outline-none text-[13px] text-slate-800 placeholder:text-slate-500 resize-none max-h-32"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!inputValue.trim() || isGenerating}
                                className={`ml-2 p-2 ${DESIGN.accent.primary} text-white rounded-full disabled:opacity-30 disabled:grayscale transition-all hover:scale-105 active:scale-95`}
                            >
                                <Send size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Footer Branding */}
                    <footer className="h-8 flex items-center justify-between px-6 bg-black/40 text-[9px] uppercase tracking-widest text-slate-500 font-bold">
                        <span>Precision RAG • v4.2.0</span>
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Gemini 3 Connected
                        </div>
                    </footer>
                </>
            )}
        </div>
    );
};
