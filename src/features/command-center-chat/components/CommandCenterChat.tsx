import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, RefreshCw, Trash2, Shield, Mail } from 'lucide-react';
import { useCommandCenterChat } from '../hooks/useCommandCenterChat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../../lib/utils';
import { parseEmailFromResponse, buildMailtoLink } from '../utils/emailParser';

export const CommandCenterChat: React.FC = () => {
    const { messages, isLoading, error, sendMessage, clearChat, status } = useCommandCenterChat();
    const [inputValue, setInputValue] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isLoading]);

    const handleSend = () => {
        if (!inputValue.trim() || isLoading) return;
        sendMessage(inputValue);
        setInputValue('');
    };

    return (
        <div className="flex flex-col h-full bg-black/20 rounded-[24px] border border-white/5 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-white/5">
                <div className="flex items-center gap-2">
                    <Shield size={14} className="text-indigo-400" />
                    <span className="text-[11px] font-bold text-white uppercase tracking-widest opacity-70">Secured AI Lane</span>
                </div>
                <button
                    onClick={clearChat}
                    className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                    title="Clear History"
                >
                    <Trash2 size={14} />
                </button>
            </div>

            {/* Message List */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center opacity-30 text-center px-6">
                        <p className="text-[12px] text-slate-400 italic">This is an isolated high-precision chat lane. Commands here do not affect your models or database state.</p>
                    </div>
                )}
                {messages.map((msg: any, i) => (
                    <div key={msg.id || i} className={cn("flex flex-col gap-1.5", msg.role === 'user' ? "items-end" : "items-start")}>
                        <div className={cn(
                            "max-w-[85%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed shadow-sm",
                            msg.role === 'user'
                                ? "bg-indigo-600/20 border border-indigo-500/30 text-indigo-50"
                                : "bg-white/5 border border-white/10 text-slate-200"
                        )}>
                            {/* AI SDK parts-based rendering */}
                            {msg.parts ? (
                                msg.parts.map((part: any, idx: number) => {
                                    if (part.type === 'text') {
                                        return (
                                            <div key={idx} className="prose prose-invert prose-sm">
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {part.text}
                                                </ReactMarkdown>
                                            </div>
                                        );
                                    }
                                    return null;
                                })
                            ) : (
                                // Fallback for legacy content format
                                <div className="prose prose-invert prose-sm">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {msg.content}
                                    </ReactMarkdown>
                                </div>
                            )}
                        </div>
                        {/* Quick Actions for AI messages with email content */}
                        {msg.role === 'assistant' && (() => {
                            const msgText = msg.parts?.find((p: any) => p.type === 'text')?.text || msg.content || '';
                            const parsed = parseEmailFromResponse(msgText);
                            if (parsed.hasEmail && parsed.subject && parsed.body) {
                                const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(parsed.subject)}&body=${encodeURIComponent(parsed.body)}`;
                                return (
                                    <div className="flex gap-2 mt-2 flex-wrap">
                                        <a
                                            href={buildMailtoLink('', parsed.subject, parsed.body)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-[11px] font-medium hover:bg-blue-600/30 transition-colors"
                                        >
                                            <Mail size={12} />
                                            Open in Outlook
                                        </a>
                                        <a
                                            href={gmailUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/20 border border-rose-500/30 text-rose-300 text-[11px] font-medium hover:bg-rose-600/30 transition-colors"
                                        >
                                            <Mail size={12} />
                                            Open in Gmail
                                        </a>
                                    </div>
                                );
                            }
                            return null;
                        })()}
                    </div>
                ))}
                {isLoading && (
                    <div className="flex justify-start">
                        <div className="bg-white/5 border border-white/10 px-4 py-3 rounded-2xl flex items-center gap-3">
                            <Loader2 size={14} className="animate-spin text-indigo-400" />
                            <span className="text-xs text-slate-400 italic">
                                {status === 'streaming' ? 'Streaming response...' : 'Routing request...'}
                            </span>
                        </div>
                    </div>
                )}
                {error && (
                    <div className="flex justify-center px-4">
                        <div className="w-full bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1">
                            <span className="text-[11px] text-rose-400 font-medium">{error}</span>
                            <button
                                onClick={() => {
                                    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                                    const textPart = lastUserMsg?.parts?.find((p: any) => p.type === 'text');
                                    if (textPart && 'text' in textPart) sendMessage(textPart.text);
                                }}
                                className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-rose-400 hover:text-rose-300 transition-colors"
                            >
                                <RefreshCw size={10} />
                                Retry
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white/5 border-t border-white/5">
                <div className="relative">
                    <textarea
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Type your message..."
                        className="w-full bg-black/20 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-[13px] text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/40 transition-all resize-none h-12 no-scrollbar"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!inputValue.trim() || isLoading}
                        className={cn(
                            "absolute right-2 top-1.5 p-2 rounded-lg transition-all",
                            inputValue.trim() && !isLoading ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:scale-105" : "text-slate-500 cursor-not-allowed"
                        )}
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
};
