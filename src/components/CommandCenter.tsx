import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
    X,
    Minimize2,
    Maximize2,
    Command,
    Zap,
    Paperclip,
    Copy,
    Mail,
    Layout as LayoutIcon,
    ChevronDown,
    ChevronUp,
    Send,
    Loader2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { AIService, ChatMessage } from '../services/aiService';
import { buildOutlookLink, extractEmailFields, stripMarkdown, isLikelyEmail } from '../utils/outlookUtils';
import { PrecisionCard } from './shared/PrecisionCard';
import { useLayout } from '../context/LayoutContext';
import { cn } from '../lib/utils';
import ToolResultRenderer from './ToolResultRenderer';

// ============================================================================
// DESIGN SYSTEM - JONY IVE PRECISION (v2026)
// ============================================================================
const DESIGN = {
    radius: {
        base: 'rounded-[32px]',
        inner: 'rounded-[16px]',
        button: 'rounded-full',
    },
    shadow: {
        obsidian: 'shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)]',
        glow: 'shadow-[0_0_40px_-10px_rgba(79,70,229,0.4)]',
    },
    glass: {
        obsidian: 'bg-black/40 backdrop-blur-2xl backdrop-saturate-200 border border-white/10',
        precision: 'bg-white/5 backdrop-blur-xl backdrop-saturate-150 border border-white/10',
    },
    accent: {
        primary: 'bg-gradient-to-br from-blue-500 to-purple-600',
    },
    text: {
        title: 'text-[14px] font-bold text-white tracking-tight',
        body: 'text-[13px] text-slate-300 leading-[1.6]',
        system: 'editorial-caption text-blue-400 opacity-80',
    },
    animation: {
        spring: { type: 'spring', damping: 25, stiffness: 400 },
        layout: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as any },
    },
};

export const CommandCenter: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const { workspaceMode, setWorkspaceMode } = useLayout();
    const [inputValue, setInputValue] = useState('');
    const [history, setHistory] = useState<ChatMessage[]>([]);
    const [isGenerating, setIsGenerating] = useState(false);
    const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
    const [attachment, setAttachment] = useState<{ file: File; base64: string; mimeType: string } | null>(null);
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
        reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setAttachment({ file, base64: base64.split(',')[1], mimeType: file.type });
        };
        reader.readAsDataURL(file);
    };

    const handleSend = async () => {
        if (!inputValue.trim() && !attachment) return;
        const userMessage = inputValue.trim();
        const currentAttachment = attachment;

        setInputValue('');
        setAttachment(null);
        setIsGenerating(true);

        const newHistory: ChatMessage[] = [...history, { role: 'user', parts: [{ text: userMessage }] }];
        setHistory(newHistory);

        try {
            let fileUrl = '';
            let metadata = {};

            // 1. If there's an attachment, upload it to Supabase Storage
            if (currentAttachment) {
                const { data: sessionRes } = await supabase.auth.getSession();
                const userId = sessionRes?.session?.user?.id;

                if (userId) {
                    const fileExt = currentAttachment.file.name.split('.').pop();
                    const fileName = `${userId}/${Date.now()}.${fileExt}`;

                    const { error: uploadError } = await supabase.storage
                        .from('command-center-attachments')
                        .upload(fileName, currentAttachment.file);

                    if (!uploadError) {
                        const { data: { publicUrl } } = supabase.storage
                            .from('command-center-attachments')
                            .getPublicUrl(fileName);
                        fileUrl = publicUrl;
                        metadata = { attachment_url: fileUrl, file_name: currentAttachment.file.name };
                    } else {
                        console.error('Upload error:', uploadError);
                    }
                }
            }

            // 2. Send command with metadata
            const userMsgWithMeta: ChatMessage = { role: 'user', parts: [{ text: userMessage }], metadata };
            const newHistory: ChatMessage[] = [...history, userMsgWithMeta];
            setHistory(newHistory);

            const response = await AIService.sendCommand(
                userMessage,
                history,
                currentAttachment ? {
                    base64: currentAttachment.base64,
                    mimeType: currentAttachment.mimeType
                } : undefined,
                undefined, // context
                metadata
            );

            const text = response?.text || '';
            const updatedHistory = response?.history || [...newHistory, { role: 'model' as const, parts: [{ text }] }];

            // Handle UI State updates from tool responses (with null-safety)
            updatedHistory?.forEach(msg => {
                if (msg.role === 'function') {
                    msg.parts?.forEach(part => {
                        if (part.functionResponse?.name === 'set_ui_state') {
                            const state = part.functionResponse.response?.content;
                            if (state) window.dispatchEvent(new CustomEvent('set_dashboard_ui_state', { detail: state }));
                        }
                    });
                }
            });

            setHistory(updatedHistory);
        } catch (error) {
            console.error('Command center error:', error);
            setHistory([...newHistory, { role: 'model', parts: [{ text: "Connection failed. Please try again." }] }]);
        } finally {
            setIsGenerating(false);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 w-14 h-14 ${DESIGN.radius.base} bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 ${DESIGN.shadow.glow} text-white flex items-center justify-center z-50`}
            >
                <Command className="w-6 h-6" />
            </button>
        );
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 40, scale: 0.95 }}
                    animate={{
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        height: isMinimized ? 64 : workspaceMode === 'floating' ? 640 : '100vh',
                        width: workspaceMode === 'full' ? '100%' : workspaceMode === 'split' ? '50%' : 440,
                        bottom: workspaceMode === 'floating' ? 32 : 0,
                        right: workspaceMode === 'floating' ? 32 : 0,
                        borderRadius: workspaceMode === 'floating' ? 32 : 0,
                    }}
                    exit={{ opacity: 0, y: 40, scale: 0.95 }}
                    transition={DESIGN.animation.layout}
                    className={`fixed z-50 ${DESIGN.glass.obsidian} ${DESIGN.shadow.obsidian} flex flex-col overflow-hidden`}
                >
                    <header className="h-16 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                                <Zap size={16} fill="white" className="text-white" />
                            </div>
                            <div className="flex flex-col">
                                <span className={DESIGN.text.title}>Ambient AI</span>
                                <span className={DESIGN.text.system}>{isGenerating ? 'Thinking...' : 'Connected'}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400">
                            <button onClick={() => setWorkspaceMode(workspaceMode === 'floating' ? 'split' : 'floating')} className="p-2 hover:bg-white/10 rounded-xl"><LayoutIcon size={16} /></button>
                            <button onClick={() => setIsMinimized(!isMinimized)} className="p-2 hover:bg-white/10 rounded-xl">{isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}</button>
                            <button onClick={() => { setIsOpen(false); setWorkspaceMode('floating'); }} className="p-2 hover:bg-white/10 rounded-xl"><X size={16} /></button>
                        </div>
                    </header>

                    {!isMinimized && (
                        <>
                            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
                                {history.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-center pt-24 opacity-40">
                                        <p className="text-white text-lg font-medium italic">Speak to the Pipeline.</p>
                                    </div>
                                )}
                                {history.map((msg, i) => (
                                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        {msg.role === 'model' ? (
                                            <PrecisionCard variant="obsidian" className="max-w-[90%] border-white/5 p-4">
                                                <div className="space-y-4">
                                                    {/* Attachments from metadata */}
                                                    {msg.metadata?.attachment_url && (
                                                        <div className="rounded-2xl overflow-hidden border border-white/10 bg-black/20">
                                                            <img
                                                                src={msg.metadata.attachment_url}
                                                                alt="Attachment"
                                                                className="w-full h-auto max-h-[300px] object-cover"
                                                                onError={(e) => (e.currentTarget.style.display = 'none')}
                                                            />
                                                        </div>
                                                    )}
                                                    {(() => {
                                                        const text = msg.parts[0]?.text || '';
                                                        if (isLikelyEmail(text)) {
                                                            const { subject, body } = extractEmailFields(text);
                                                            const isExpanded = expandedCards.has(i);
                                                            return (
                                                                <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                                                                    <div className="px-4 py-2 bg-white/5 border-b border-white/5 flex items-center justify-between">
                                                                        <span className="text-[9px] font-bold opacity-50 uppercase tracking-widest">Draft</span>
                                                                        <div className="flex gap-2">
                                                                            <a href={buildOutlookLink('', undefined, subject, stripMarkdown(body))} target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors" title="Open in Outlook"><Mail size={12} /></a>
                                                                            <button onClick={() => navigator.clipboard.writeText(stripMarkdown(text))} className="hover:text-white transition-colors" title="Copy to clipboard"><Copy size={12} /></button>
                                                                        </div>
                                                                    </div>
                                                                    <div className="p-4 space-y-2">
                                                                        <div className="text-sm font-bold text-white leading-tight">{subject}</div>
                                                                        <div className={cn("prose prose-invert prose-sm opacity-80", !isExpanded && "line-clamp-6")}>
                                                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                                                                        </div>
                                                                        <button onClick={() => setExpandedCards(prev => {
                                                                            const next = new Set(prev);
                                                                            if (next.has(i)) next.delete(i); else next.add(i);
                                                                            return next;
                                                                        })} className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mt-2">
                                                                            {isExpanded ? 'Collapse' : 'Expand Draft'}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            );
                                                        }
                                                        return (
                                                            <div className="prose prose-invert prose-sm opacity-90 leading-relaxed">
                                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </PrecisionCard>
                                        ) : msg.role === 'user' ? (
                                            <div className="max-w-[85%] bg-indigo-500/10 border border-indigo-500/20 px-4 py-2.5 rounded-2xl">
                                                <span className="text-[13px] text-indigo-50 leading-relaxed font-medium">{msg.parts[0]?.text}</span>
                                            </div>
                                        ) : (
                                            <div className="w-full">
                                                {msg.parts.map((p, idx) => p.functionResponse && (
                                                    <ToolResultRenderer
                                                        key={idx}
                                                        toolName={p.functionResponse.name}
                                                        data={p.functionResponse.response.content}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {isGenerating && (
                                    <div className="flex items-center gap-2 text-slate-500 italic text-xs px-2">
                                        <Loader2 size={12} className="animate-spin" /> Thinking...
                                    </div>
                                )}
                            </div>

                            <footer className="p-6 border-t border-white/10 space-y-4">
                                <div className="relative group">
                                    <textarea
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                        placeholder="Execute command..."
                                        className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-5 pr-12 focus:ring-1 focus:ring-indigo-500/50 focus:bg-white/10 transition-all resize-none text-[13px] text-white h-24 no-scrollbar"
                                    />
                                    <div className="absolute right-3 bottom-3 flex items-center gap-2">
                                        <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-400 hover:text-white transition-colors"><Paperclip size={18} /></button>
                                        <button onClick={handleSend} className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20 hover:scale-105 transition-all"><Send size={18} /></button>
                                    </div>
                                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
                                </div>
                                {attachment && (
                                    <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 p-2 rounded-xl text-[10px] text-indigo-200">
                                        <Paperclip size={12} /> {attachment.file.name}
                                        <button onClick={() => setAttachment(null)} className="ml-auto opacity-50 hover:opacity-100">×</button>
                                    </div>
                                )}
                            </footer>
                        </>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};
