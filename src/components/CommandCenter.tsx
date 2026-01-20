import React, { useState, useRef, useEffect } from 'react';
import {
    X,
    Minimize2,
    Maximize2,
    Loader2,
    Command,
    Zap,
    Paperclip,
    Copy,
    Check,
    Mail
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AIService, ChatMessage } from '../services/aiService';
import { buildOutlookLink, extractEmailFields, stripMarkdown, isLikelyEmail } from '../utils/outlookUtils';

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
        system: 'text-[11px] font-medium text-blue-400',
    },
    animation: 'transition-all duration-500 cubic-bezier(0.16, 1, 0.3, 1)',
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const CommandCenter: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [history, setHistory] = useState<ChatMessage[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [attachment, setAttachment] = useState<{ file: File; base64: string; mimeType: string } | null>(null);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [history, isGenerating]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const base64 = (event.target?.result as string).split(',')[1];
            setAttachment({ file, base64, mimeType: file.type || 'application/octet-stream' });
        };
        reader.readAsDataURL(file);
    };

    const handleSend = async () => {
        if ((!inputValue.trim() && !attachment) || isGenerating) return;

        const userMessage = inputValue.trim() || (attachment ? `Sent: ${attachment.file.name}` : '');
        const currentAttachment = attachment;
        setInputValue('');
        setAttachment(null);
        setIsGenerating(true);

        const newHistory: ChatMessage[] = [...history, { role: 'user', parts: [{ text: userMessage }] }];
        setHistory(newHistory);

        try {
            const response = await AIService.sendCommand(userMessage, history, currentAttachment ? {
                base64: currentAttachment.base64,
                mimeType: currentAttachment.mimeType
            } : undefined);
            setHistory([...newHistory, response]);
        } catch (error) {
            console.error('Command center error:', error);
            setHistory([...newHistory, { role: 'model', parts: [{ text: "Connection failed. Please try again." }] }]);
        } finally {
            setIsGenerating(false);
        }
    };

    // --- Closed State (FAB) ---
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 w-14 h-14 ${DESIGN.radius.base} ${DESIGN.accent.primary} ${DESIGN.accent.glow} text-white flex items-center justify-center group active:scale-90 ${DESIGN.animation} z-50`}
            >
                <Command className="w-6 h-6" />
            </button>
        );
    }

    // --- Open State ---
    return (
        <div className={`fixed bottom-6 right-6 w-[400px] ${isMinimized ? 'h-14' : 'h-[560px]'} ${DESIGN.glass.obsidian} ${DESIGN.radius.base} flex flex-col overflow-hidden ${DESIGN.animation} z-50`}>
            {/* Header */}
            <header className="h-14 flex items-center justify-between px-5 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className={`w-7 h-7 ${DESIGN.radius.inner} ${DESIGN.accent.primary} flex items-center justify-center`}>
                        <Zap size={14} fill="white" className="text-white" />
                    </div>
                    <div className="flex flex-col">
                        <span className={DESIGN.text.title}>Command Center</span>
                        <span className={DESIGN.text.system}>Gemini 3 • RAG</span>
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setIsMinimized(!isMinimized)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white">
                        {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
                    </button>
                    <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white">
                        <X size={14} />
                    </button>
                </div>
            </header>

            {!isMinimized && (
                <>
                    {/* Message Thread */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
                        {history.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center pt-16 opacity-40">
                                <p className="text-white text-[14px] font-medium">Ask anything.</p>
                                <p className="text-slate-400 text-[11px] mt-1 max-w-[200px]">Search candidates, calculate pay, or draft an email.</p>
                            </div>
                        )}

                        {history.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`group relative max-w-[85%] px-4 py-3 ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-2xl rounded-br-sm' : 'bg-slate-800/50 text-slate-200 border border-white/10 rounded-2xl rounded-bl-sm'}`}>
                                    {msg.role === 'model' ? (
                                        <div className="space-y-3 font-normal">
                                            {isLikelyEmail(msg.parts[0]?.text || '') ? (
                                                <div className="bg-slate-950/40 rounded-xl border border-white/10 overflow-hidden shadow-inner">
                                                    {/* Email Frame Header */}
                                                    <div className="flex items-center justify-between px-4 py-2.5 bg-white/5 border-b border-white/5">
                                                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Email</span>
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                onClick={() => {
                                                                    const text = msg.parts[0]?.text || '';
                                                                    navigator.clipboard.writeText(stripMarkdown(text));
                                                                    setCopiedIndex(i);
                                                                    setTimeout(() => setCopiedIndex(null), 2000);
                                                                }}
                                                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                                                                title="Copy to clipboard"
                                                                aria-label="Copy email to clipboard"
                                                            >
                                                                {copiedIndex === i ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                                <span className="text-[10px]">{copiedIndex === i ? 'Copied' : 'Copy'}</span>
                                                            </button>
                                                            <div className="w-px h-3 bg-white/10" />
                                                            <button
                                                                onClick={() => {
                                                                    const text = msg.parts[0]?.text || '';
                                                                    const { to, subject, body } = extractEmailFields(text);
                                                                    const url = buildOutlookLink(to, undefined, subject, body);
                                                                    window.open(url, '_blank');
                                                                }}
                                                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                                                                title="Open in Outlook"
                                                                aria-label="Open in Outlook"
                                                            >
                                                                <Mail size={12} />
                                                                <span className="text-[10px]">Open in email</span>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Email Content Area */}
                                                    <div className="p-4 space-y-4">
                                                        {(() => {
                                                            const { subject, body } = extractEmailFields(msg.parts[0]?.text || '');
                                                            return (
                                                                <>
                                                                    {subject && (
                                                                        <div className="flex items-baseline gap-3 text-[13px] border-b border-white/5 pb-3">
                                                                            <span className="text-slate-500 font-medium shrink-0">Subject</span>
                                                                            <span className="text-slate-100 font-semibold leading-tight">{subject}</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="prose prose-invert prose-sm max-w-none pointer-events-auto selection:bg-blue-500/30 leading-relaxed">
                                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                                            {body}
                                                                        </ReactMarkdown>
                                                                    </div>
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="prose prose-invert prose-sm max-w-none p-0.5 pointer-events-auto selection:bg-blue-500/30">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                            {msg.parts[0]?.text || ''}
                                                        </ReactMarkdown>
                                                    </div>

                                                    {/* Standard Action Bar */}
                                                    <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => {
                                                                const text = msg.parts[0]?.text || '';
                                                                navigator.clipboard.writeText(stripMarkdown(text));
                                                                setCopiedIndex(i);
                                                                setTimeout(() => setCopiedIndex(null), 2000);
                                                            }}
                                                            className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
                                                            title="Copy all"
                                                        >
                                                            {copiedIndex === i ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                            <span className="text-[10px]">{copiedIndex === i ? 'Copied' : 'Copy'}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.parts[0].text}</p>
                                    )}
                                </div>
                            </div>
                        ))}

                        {isGenerating && (
                            <div className="flex justify-start">
                                <div className="px-4 py-3 bg-white/5 border border-white/10 rounded-2xl rounded-bl-sm">
                                    <Loader2 size={16} className="text-blue-400 animate-spin" />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Input Area */}
                    <div className={`p-4 border-t border-white/10 ${attachment ? 'space-y-2' : ''}`}>
                        {attachment && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl border border-white/10">
                                <Paperclip size={12} className="text-blue-400" />
                                <span className="text-[11px] text-slate-300 truncate flex-1">{attachment.file.name}</span>
                                <button onClick={() => setAttachment(null)} className="p-1 hover:bg-white/10 rounded-md text-slate-500 hover:text-white"><X size={12} /></button>
                            </div>
                        )}
                        <div className={`flex items-center ${DESIGN.glass.light} px-3 py-2.5 rounded-2xl`}>
                            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.eml,image/*" />
                            <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-all">
                                <Paperclip size={18} />
                            </button>
                            <textarea
                                rows={1}
                                placeholder="Ask anything..."
                                className="flex-1 bg-transparent border-none outline-none text-[13px] text-slate-800 placeholder:text-slate-400 resize-none mx-2"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={(!inputValue.trim() && !attachment) || isGenerating}
                                className={`p-2 ${DESIGN.accent.primary} text-white rounded-full disabled:opacity-30 transition-all hover:scale-105 active:scale-95`}
                            >
                                <Zap size={16} fill="white" />
                            </button>
                        </div>
                    </div>

                    {/* Footer */}
                    <footer className="h-6 flex items-center justify-center px-5 bg-black/30 text-[8px] uppercase tracking-widest text-slate-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-2" /> Connected
                    </footer>
                </>
            )}
        </div>
    );
};

