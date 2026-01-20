import React, { useState, useRef, useEffect } from 'react';
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
    Monitor,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { AIService, ChatMessage } from '../services/aiService';
import { buildOutlookLink, extractEmailFields, stripMarkdown, isLikelyEmail } from '../utils/outlookUtils';
import { PrecisionCard } from './shared/PrecisionCard';
import { useLayout } from '../context/LayoutContext';
import { cn } from '../lib/utils';

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

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export interface UIState {
    filter_specialty?: string;
    filter_status?: string;
    search_term?: string;
    view_mode?: 'kanban' | 'ranking' | 'list';
}

interface DashboardContext {
    viewMode: string;
    search: string;
    stats: Record<string, number>;
    filteredCount: number;
}

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
    const dashboardContextRef = useRef<DashboardContext | null>(null);

    // --- AMBIENT AI SYNC ---
    useEffect(() => {
        const handleContextUpdate = (event: CustomEvent<DashboardContext>) => {
            dashboardContextRef.current = event.detail;
        };
        window.addEventListener('dashboard_context_update' as any, handleContextUpdate as any);
        return () => window.removeEventListener('dashboard_context_update' as any, handleContextUpdate as any);
    }, []);

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
            const response = await AIService.sendCommand(
                userMessage,
                history,
                currentAttachment ? {
                    base64: currentAttachment.base64,
                    mimeType: currentAttachment.mimeType
                } : undefined,
                dashboardContextRef.current
            );

            // Check for UI State Commands
            const modelText = response.parts[0]?.text || '';
            if (modelText.includes('UI_STATE_UPDATE')) {
                try {
                    // Extract JSON if embedded in text or if it IS the text
                    const jsonMatch = modelText.match(/\{"action":\s*"UI_STATE_UPDATE".*\}/s);
                    const actionData = JSON.parse(jsonMatch ? jsonMatch[0] : modelText);

                    if (actionData.action === 'UI_STATE_UPDATE') {
                        window.dispatchEvent(new CustomEvent('set_dashboard_ui_state', { detail: actionData.state }));
                    }
                } catch {
                    console.warn('Failed to parse UI state action');
                }
            }

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
                className={`fixed bottom-6 right-6 w-14 h-14 ${DESIGN.radius.base} bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 ${DESIGN.shadow.glow} text-white flex items-center justify-center group active:scale-90 transition-all z-50`}
            >
                <Command className="w-6 h-6" />
            </button>
        );
    }

    // --- Open State ---
    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: 40, scale: 0.95, filter: 'blur(10px)' }}
                    animate={{
                        opacity: 1,
                        y: workspaceMode === 'floating' ? 0 : 0,
                        x: workspaceMode === 'floating' ? 0 : 0,
                        scale: 1,
                        filter: 'blur(0px)',
                        height: isMinimized ? 64 : workspaceMode === 'floating' ? 640 : '100vh',
                        width: workspaceMode === 'full' ? '100%' : workspaceMode === 'split' ? '50%' : 440,
                        bottom: workspaceMode === 'floating' ? 32 : 0,
                        right: workspaceMode === 'floating' ? 32 : 0,
                        borderRadius: workspaceMode === 'floating' ? 32 : 0,
                    }}
                    exit={{ opacity: 0, y: 40, scale: 0.95, filter: 'blur(10px)' }}
                    transition={DESIGN.animation.layout}
                    className={`fixed z-50 ${DESIGN.glass.obsidian} ${DESIGN.shadow.obsidian} flex flex-col overflow-hidden ${isGenerating ? 'ambient-glow-indigo' : 'ambient-glow-emerald'}`}
                >
                    {/* Header */}
                    <header className="h-16 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-3">
                            <motion.div
                                animate={isGenerating ? { rotate: 360 } : {}}
                                transition={isGenerating ? { duration: 2, repeat: Infinity, ease: "linear" } : {}}
                                className={`w-8 h-8 ${DESIGN.radius.inner} bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center`}
                            >
                                <Zap size={16} fill="white" className="text-white" />
                            </motion.div>
                            <div className="flex flex-col">
                                <span className={DESIGN.text.title}>Ambient AI</span>
                                <span className={DESIGN.text.system}>{isGenerating ? 'Thinking...' : 'Connected • Gemini 3'}</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {isOpen && !isMinimized && (
                                <>
                                    <button
                                        onClick={() => setWorkspaceMode(workspaceMode === 'floating' ? 'split' : 'floating')}
                                        className={cn("p-2 rounded-xl transition-colors", workspaceMode === 'split' ? "bg-white/20 text-white" : "hover:bg-white/10 text-slate-400 hover:text-white")}
                                        title="Split View"
                                    >
                                        <LayoutIcon size={16} />
                                    </button>
                                    <button
                                        onClick={() => setWorkspaceMode(workspaceMode === 'full' ? 'floating' : 'full')}
                                        className={cn("p-2 rounded-xl transition-colors", workspaceMode === 'full' ? "bg-white/20 text-white" : "hover:bg-white/10 text-slate-400 hover:text-white")}
                                        title="Full Workspace"
                                    >
                                        <Monitor size={16} />
                                    </button>
                                </>
                            )}
                            <button onClick={() => setIsMinimized(!isMinimized)} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white">
                                {isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                            </button>
                            <button onClick={() => { setIsOpen(false); setWorkspaceMode('floating'); }} className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white">
                                <X size={16} />
                            </button>
                        </div>
                    </header>

                    {!isMinimized && (
                        <>
                            {/* Message Thread */}
                            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                                <AnimatePresence mode="popLayout">
                                    {history.length === 0 && (
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="h-full flex flex-col items-center justify-center text-center pt-24"
                                        >
                                            <p className="editorial-title text-white/40 text-[18px]">Speak to the Pipeline.</p>
                                            <p className="text-slate-500 text-[12px] mt-2 max-w-[240px] leading-relaxed">
                                                Analyze documents, calculate precision pay packages, or automate outreach.
                                            </p>
                                        </motion.div>
                                    )}

                                    {history.map((msg, i) => (
                                        <motion.div
                                            key={i}
                                            initial={{ opacity: 0, y: 10, scale: 0.98 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                        >
                                            {msg.role === 'model' ? (
                                                <PrecisionCard
                                                    variant="obsidian"
                                                    padding="md"
                                                    className="max-w-[90%] border-white/5"
                                                >
                                                    <div className="space-y-4">
                                                        {(() => {
                                                            const text = msg.parts[0]?.text || '';

                                                            // Action processing logic... (same as before but with updated UI bits)
                                                            if (text.includes('PIPELINE_BRIEF')) {
                                                                try {
                                                                    const jsonMatch = text.match(/\{"action":\s*"PIPELINE_BRIEF".*\}/s);
                                                                    const actionData = JSON.parse(jsonMatch ? jsonMatch[0] : text);
                                                                    const counts = actionData.data?.counts || actionData.data?.statusCounts || {};
                                                                    return (
                                                                        <div className="space-y-4">
                                                                            <div className="editorial-caption">Pipeline Briefing</div>
                                                                            <div className="grid grid-cols-2 gap-4">
                                                                                {Object.entries(counts).map(([status, count]) => (
                                                                                    <div key={status} className="bg-white/5 p-3 rounded-2xl border border-white/5">
                                                                                        <div className="editorial-caption text-[9px] mb-1">{status}</div>
                                                                                        <div className="text-[18px] font-bold text-white tabular-nums">{count as number}</div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                } catch { return <span>Error rendering brief.</span>; }
                                                            }

                                                            if (text.includes('PAY_BREAKDOWN')) {
                                                                try {
                                                                    const jsonMatch = text.match(/\{"action":\s*"PAY_BREAKDOWN".*\}/s);
                                                                    const p = JSON.parse(jsonMatch ? jsonMatch[0] : text).data;
                                                                    return (
                                                                        <div className="space-y-4">
                                                                            <div className="flex items-center justify-between">
                                                                                <div className="editorial-caption">Precise Pay Package</div>
                                                                                <span className="text-[16px] font-bold text-emerald-400 tabular-nums">{p.weekly_gross}</span>
                                                                            </div>
                                                                            <div className="space-y-3">
                                                                                <div className="flex justify-between editorial-caption text-[10px]"><span className="opacity-50">Taxable Hourly</span> <span className="text-white/80">${p.hourly_rate}</span></div>
                                                                                <div className="flex justify-between editorial-caption text-[10px]"><span className="opacity-50">Stipends</span> <span className="text-white/80">${p.meals + p.housing}/wk</span></div>
                                                                                <div className="pt-3 border-t border-white/10 flex justify-between">
                                                                                    <span className="editorial-title text-white text-[12px]">EST. TAKE HOME</span>
                                                                                    <span className="text-emerald-400 font-bold">${p.weekly_take_home}</span>
                                                                                </div>
                                                                            </div>
                                                                            <motion.button
                                                                                whileHover={{ scale: 1.02 }}
                                                                                whileTap={{ scale: 0.98 }}
                                                                                className="w-full py-3 bg-indigo-600 text-white text-[11px] font-bold rounded-2xl shadow-lg ring-1 ring-white/20"
                                                                            >
                                                                                DRAFT OUTREACH
                                                                            </motion.button>
                                                                        </div>
                                                                    );
                                                                } catch { return <span>Error rendering pay.</span>; }
                                                            }

                                                            if (isLikelyEmail(text)) {
                                                                const { subject, body } = extractEmailFields(text);
                                                                const cardIndex = i;
                                                                const isExpanded = expandedCards.has(cardIndex);
                                                                return (
                                                                    <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                                                                        <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
                                                                            <span className="editorial-caption text-[9px]">EDITORIAL DRAFT</span>
                                                                            <div className="flex items-center gap-3">
                                                                                <button onClick={() => { navigator.clipboard.writeText(stripMarkdown(text)); }} className="text-slate-400 hover:text-white transition-colors"><Copy size={12} /></button>
                                                                                <button onClick={() => {
                                                                                    const fields = extractEmailFields(text);
                                                                                    window.open(buildOutlookLink(fields.to, undefined, fields.subject, fields.body), '_blank');
                                                                                }} className="text-slate-400 hover:text-white transition-colors"><Mail size={12} /></button>
                                                                            </div>
                                                                        </div>
                                                                        <div className="p-4 space-y-3">
                                                                            <div className="text-[13px] font-bold text-white leading-tight">{subject}</div>
                                                                            <div className={cn(
                                                                                "prose prose-invert prose-sm opacity-80 overflow-hidden transition-all",
                                                                                !isExpanded && "line-clamp-6"
                                                                            )}>
                                                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                                                                            </div>
                                                                            <button
                                                                                onClick={() => {
                                                                                    setExpandedCards(prev => {
                                                                                        const next = new Set(prev);
                                                                                        if (next.has(cardIndex)) next.delete(cardIndex);
                                                                                        else next.add(cardIndex);
                                                                                        return next;
                                                                                    });
                                                                                }}
                                                                                className="flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                                                                            >
                                                                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                                                {isExpanded ? 'Show less' : 'Show more'}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            }

                                                            // UI_STATE_UPDATE just shows the text if there's any, or nothing
                                                            if (text.includes('UI_STATE_UPDATE')) {
                                                                const jsonMatch = text.match(/\{"action":\s*"UI_STATE_UPDATE".*\}/s);
                                                                const cleanText = text.replace(jsonMatch ? jsonMatch[0] : text, '').trim();
                                                                if (!cleanText) return <span className="text-[11px] text-slate-500 italic">Dashboard updated.</span>;
                                                                return (
                                                                    <div className="prose prose-invert prose-sm max-w-none p-0.5">
                                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanText}</ReactMarkdown>
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <div className="prose prose-invert prose-sm max-w-none pointer-events-auto selection:bg-indigo-500/30">
                                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                </PrecisionCard>
                                            ) : (
                                                <div className="max-w-[80%] px-5 py-3.5 bg-indigo-600 text-white rounded-[24px] rounded-br-[4px] shadow-lg shadow-indigo-600/10 text-[13px] leading-relaxed">
                                                    {msg.parts[0].text}
                                                </div>
                                            )}
                                        </motion.div>
                                    ))}

                                    {isGenerating && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="flex justify-start"
                                        >
                                            <div className="px-5 py-4 bg-white/5 border border-white/10 rounded-[24px] rounded-bl-[4px]">
                                                <div className="flex gap-1">
                                                    <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                                                    <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                                    <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Input Area */}
                            <footer className="p-6 pt-2 border-t border-white/10">
                                {attachment && (
                                    <div className="mb-4 flex items-center gap-3 px-4 py-2 bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                                        <Paperclip size={14} className="text-blue-400" />
                                        <span className="editorial-caption text-[10px] text-slate-300 truncate flex-1">{attachment.file.name}</span>
                                        <button onClick={() => setAttachment(null)} className="p-1 hover:bg-white/10 rounded-lg text-slate-500 hover:text-white"><X size={14} /></button>
                                    </div>
                                )}
                                <div className="precision-glass pl-4 pr-2 py-2 rounded-[24px] flex items-center shadow-inner group-focus-within:ring-2 ring-indigo-500/50 transition-all">
                                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".pdf,.eml,image/*" />
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="p-2 text-slate-400 hover:text-slate-600 rounded-xl transition-all"
                                    >
                                        <Paperclip size={20} />
                                    </button>
                                    <textarea
                                        rows={1}
                                        placeholder="Speak to your pipeline..."
                                        className="flex-1 bg-transparent border-none outline-none text-[14px] text-slate-800 placeholder:text-slate-400 p-2 resize-none"
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                    />
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={handleSend}
                                        disabled={(!inputValue.trim() && !attachment) || isGenerating}
                                        className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-600/30 disabled:opacity-20 transition-all"
                                    >
                                        <Zap size={18} fill="white" />
                                    </motion.button>
                                </div>
                            </footer>
                        </>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};
