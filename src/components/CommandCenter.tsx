import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
    Send,
    RefreshCw,
    Bookmark,
    Trash2,
    Search,
    FileText,
    DollarSign,
    Users,
    CheckCircle,
    Phone,
    MessageSquare,
    ExternalLink
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { useCommandCenterChat } from '../features/command-center-chat/hooks/useCommandCenterChat';
import { buildOutlookLink, buildGmailLink, extractEmailFields, stripMarkdown, isLikelyEmail } from '../utils/outlookUtils';
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
    const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [attachments, setAttachments] = useState<{ file: File; base64: string; mimeType: string }[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // UX Enhancement State
    const [pinnedMessages, setPinnedMessages] = useState<Set<number>>(new Set());
    const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
    const [showPinnedOnly, setShowPinnedOnly] = useState(false);
    const [showQuickActions, setShowQuickActions] = useState(true);

    // AI SDK Chat Hook - Production Grade
    const {
        messages,
        isLoading: isGenerating,
        isStreaming: _isStreaming,
        error: _error,
        sendMessage: sendAIMessage,
        clearChat,
        stop: _stop,
        reload: _reload,
    } = useCommandCenterChat({
        onToolCall: (toolName, args) => {
            // Handle UI state updates from tools
            if (toolName === 'set_ui_state') {
                window.dispatchEvent(new CustomEvent('set_dashboard_ui_state', { detail: args }));
            }
            if (['add_prospect', 'update_negotiation', 'create_follow_up'].includes(toolName)) {
                window.dispatchEvent(new CustomEvent('refresh_dashboard'));
            }
        },
    });

    // Convert AI SDK messages to display format
    const history = useMemo(() => {
        return messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' as const : msg.role as 'user',
            parts: [{ text: msg.content || '' }],
            toolInvocations: msg.toolInvocations,
            metadata: (msg as any).metadata,
        }));
    }, [messages]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [history, isGenerating]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target?.result as string;
                setAttachments(prev => [...prev, { file, base64: base64.split(',')[1], mimeType: file.type }]);
            };
            reader.readAsDataURL(file);
        });
        // Reset input to allow re-selecting same files
        e.target.value = '';
    };

    const handleSend = useCallback(async () => {
        if (!inputValue.trim() && attachments.length === 0) return;
        const userMessage = inputValue.trim();
        const currentAttachments = [...attachments];

        setInputValue('');
        setAttachments([]);

        try {
            // Handle attachments upload if present
            if (currentAttachments.length > 0) {
                const { data: sessionRes } = await supabase.auth.getSession();
                const userId = sessionRes?.session?.user?.id;

                if (userId) {
                    for (const att of currentAttachments) {
                        const fileExt = att.file.name.split('.').pop();
                        const fileName = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

                        await supabase.storage
                            .from('command-center-attachments')
                            .upload(fileName, att.file);
                    }
                }
            }

            // Send via AI SDK hook
            await sendAIMessage(userMessage);

        } catch (err) {
            console.error('[CommandCenter] Send error:', err);
        }
    }, [inputValue, attachments, sendAIMessage]);

    const handlePaste = async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                if (file) {
                    e.preventDefault();
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        const base64 = event.target?.result as string;
                        setAttachments(prev => [...prev, { file, base64: base64.split(',')[1], mimeType: file.type }]);
                    };
                    reader.readAsDataURL(file);
                    return;
                }
            }
        }
    };

    // ============================================================================
    // UX ENHANCEMENT - Helper Functions
    // ============================================================================
    const handleRegenerate = async (messageIndex: number) => {
        // Find the last user message before this model response
        const userMsgIndex = history.slice(0, messageIndex).reverse().findIndex(m => m.role === 'user');
        if (userMsgIndex === -1) return;
        const actualUserIndex = messageIndex - 1 - userMsgIndex;
        const userMessage = history[actualUserIndex]?.parts?.[0]?.text || '';

        // Use reload from hook
        if (userMessage) {
            await sendAIMessage(userMessage);
        }
    };

    const handleCopyMessage = (text: string, index: number) => {
        navigator.clipboard.writeText(stripMarkdown(text));
        setCopiedMessageId(index);
        setTimeout(() => setCopiedMessageId(null), 2000);
    };

    const handlePinMessage = (index: number) => {
        setPinnedMessages(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    const handleClearChat = () => {
        clearChat();
        setPinnedMessages(new Set());
        setShowPinnedOnly(false);
    };

    // ============================================================================
    // RingCentral Workflow Helpers
    // ============================================================================

    // Extract phone numbers from text
    const extractPhoneNumbers = (text: string): string[] => {
        const phonePattern = /(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
        const matches = text.match(phonePattern) || [];
        // Normalize to digits only for tel: links
        return [...new Set(matches.map(p => p.replace(/\D/g, '')))];
    };

    // Format phone for display
    const formatPhoneDisplay = (phone: string): string => {
        if (phone.length === 10) return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
        if (phone.length === 11) return `+${phone[0]} (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7)}`;
        return phone;
    };

    // Build SMS deep link
    const buildSmsLink = (phone: string, body: string): string => {
        const cleanBody = stripMarkdown(body).slice(0, 300); // SMS limit safety
        return `sms:+1${phone.replace(/\D/g, '')}?body=${encodeURIComponent(cleanBody)}`;
    };

    // Shrink text to SMS (160 chars)
    const shrinkForSms = async (text: string): Promise<string> => {
        // Quick local shrink - take first sentence + key info
        const clean = stripMarkdown(text);
        if (clean.length <= 160) return clean;

        // Extract key elements
        const firstSentence = clean.split(/[.!?]/)[0] + '.';
        if (firstSentence.length <= 160) return firstSentence;
        return clean.slice(0, 157) + '...';
    };

    // Format for Call Ledger (bulleted summary)
    const formatForCallLog = (text: string): string => {
        const clean = stripMarkdown(text);
        const lines = clean.split('\n').filter(l => l.trim());

        // Try to extract key fields
        const nameMatch = clean.match(/(?:Name|Candidate|Traveler)[:\s]+([^\n,]+)/i);
        const facilityMatch = clean.match(/(?:Facility|Hospital|Location)[:\s]+([^\n,]+)/i);
        const payMatch = clean.match(/(?:\$[\d,]+(?:\/\w+)?|\$[\d,]+)/);
        const specialtyMatch = clean.match(/(?:Specialty|Role|Position)[:\s]+([^\n,]+)/i);

        let log = '📋 CALL LOG\n';
        log += '─'.repeat(20) + '\n';
        if (nameMatch) log += `• Name: ${nameMatch[1].trim()}\n`;
        if (specialtyMatch) log += `• Role: ${specialtyMatch[1].trim()}\n`;
        if (facilityMatch) log += `• Facility: ${facilityMatch[1].trim()}\n`;
        if (payMatch) log += `• Pay: ${payMatch[0]}\n`;
        log += '─'.repeat(20) + '\n';
        log += `• Notes: ${lines[0]?.slice(0, 100) || 'Follow up scheduled'}`;

        return log;
    };

    // Quick Actions Configuration
    const QUICK_ACTIONS = [
        { label: 'Draft Outreach', icon: FileText, command: 'Draft outreach for ', isTemplate: true },
        { label: 'Pipeline Brief', icon: Users, command: 'Give me a pipeline brief', isTemplate: false },
        { label: 'Search Prospects', icon: Search, command: 'Search prospects ', isTemplate: true },
        { label: 'Pay Analysis', icon: DollarSign, command: 'Calculate pay for ', isTemplate: true },
    ];

    // Filter messages based on pin filter
    const displayedHistory = showPinnedOnly
        ? history.filter((_, i) => pinnedMessages.has(i))
        : history;

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
                        height: isMinimized ? 48 : workspaceMode === 'floating' ? 640 : '100vh',
                        width: isMinimized ? 180 : workspaceMode === 'full' ? '100%' : workspaceMode === 'split' ? '50%' : 440,
                        bottom: workspaceMode === 'floating' ? 32 : 0,
                        right: workspaceMode === 'floating' ? 32 : 0,
                        borderRadius: isMinimized ? 999 : workspaceMode === 'floating' ? 32 : '40px 0 0 40px',
                    }}
                    exit={{ opacity: 0, y: 40, scale: 0.95 }}
                    // Jony Ive Physics: Inertial Snap (Mass 1.2, Damping 35)
                    transition={{ type: 'spring', mass: 1.2, stiffness: 200, damping: 35 }}
                    className={`fixed z-50 ${DESIGN.glass.obsidian} shadow-[0_0_80px_-20px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden outline outline-1 outline-white/10`}
                    style={{
                        // Specular Highlight: Inner glow on left edge to catch light
                        boxShadow: 'inset 1px 0 0 0 rgba(255,255,255,0.15), -20px 0 60px -10px rgba(0,0,0,0.5)'
                    }}
                >
                    {isMinimized ? (
                        /* Minimized Pill View */
                        <button
                            onClick={() => setIsMinimized(false)}
                            className="h-full w-full flex items-center justify-center gap-2 px-4 hover:bg-white/5 transition-all cursor-pointer"
                        >
                            <motion.div
                                animate={isGenerating ? { scale: [1, 1.15, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
                                transition={{ repeat: isGenerating ? Infinity : 0, duration: 1.5, ease: "easeInOut" }}
                                className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20"
                            >
                                <Zap size={12} fill="white" className="text-white" />
                            </motion.div>
                            <span className="text-[11px] font-semibold text-white/80">
                                {isGenerating ? 'Thinking...' : 'Ambient AI'}
                            </span>
                        </button>
                    ) : (
                        <header className="h-16 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
                            <div className="flex items-center gap-3">
                                <motion.div
                                    animate={isGenerating ? { scale: [1, 1.15, 1], opacity: [1, 0.7, 1] } : { scale: 1, opacity: 1 }}
                                    transition={{ repeat: isGenerating ? Infinity : 0, duration: 1.5, ease: "easeInOut" }}
                                    className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20"
                                >
                                    <Zap size={16} fill="white" className="text-white" />
                                </motion.div>
                                <div className="flex flex-col">
                                    <span className={DESIGN.text.title}>Ambient AI</span>
                                    <span className={DESIGN.text.system}>{isGenerating ? 'Thinking...' : 'Connected'}</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 text-slate-400">
                                {/* Pin Filter Toggle */}
                                <button
                                    onClick={() => setShowPinnedOnly(!showPinnedOnly)}
                                    className={cn("p-2 rounded-xl transition-all", showPinnedOnly ? "bg-amber-500/20 text-amber-400" : "hover:bg-white/10")}
                                    title={showPinnedOnly ? "Show all messages" : "Show pinned only"}
                                >
                                    <Bookmark size={16} />
                                </button>
                                {/* Clear Chat */}
                                <button
                                    onClick={handleClearChat}
                                    className="p-2 hover:bg-white/10 rounded-xl hover:text-rose-400 transition-all"
                                    title="Clear conversation"
                                >
                                    <Trash2 size={16} />
                                </button>
                                <button onClick={() => setWorkspaceMode(workspaceMode === 'floating' ? 'split' : 'floating')} className="p-2 hover:bg-white/10 rounded-xl"><LayoutIcon size={16} /></button>
                                <button onClick={() => setIsMinimized(!isMinimized)} className="p-2 hover:bg-white/10 rounded-xl">{isMinimized ? <Maximize2 size={16} /> : <Minimize2 size={16} />}</button>
                                <button onClick={() => { setIsOpen(false); setWorkspaceMode('floating'); }} className="p-2 hover:bg-white/10 rounded-xl"><X size={16} /></button>
                            </div>
                        </header>
                    )}

                    {!isMinimized && (
                        <>
                            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
                                {displayedHistory.length === 0 && (
                                    <div className="h-full flex flex-col items-center justify-center text-center pt-24 opacity-40">
                                        <p className="text-white text-lg font-medium italic">{showPinnedOnly ? 'No pinned messages' : 'Speak to the Pipeline.'}</p>
                                    </div>
                                )}
                                {displayedHistory.map((msg, i) => {
                                    const originalIndex = showPinnedOnly ? history.indexOf(msg) : i;
                                    const isPinned = pinnedMessages.has(originalIndex);
                                    const isCopied = copiedMessageId === originalIndex;
                                    const isLastModelMsg = msg.role === 'model' && i === displayedHistory.filter(m => m.role === 'model').length - 1;

                                    return (
                                        <div key={originalIndex} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} group/msg`}>
                                            {msg.role === 'model' ? (
                                                <PrecisionCard variant="obsidian" className="max-w-[90%] border-white/5 p-4">
                                                    <div className="space-y-4">
                                                        {/* Attachments from metadata - Clickable to open in new tab */}
                                                        {msg.metadata?.attachment_url && (
                                                            <a
                                                                href={msg.metadata.attachment_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="block rounded-2xl overflow-hidden border border-white/10 bg-black/20 hover:border-white/20 transition-all group cursor-pointer"
                                                            >
                                                                <div className="relative">
                                                                    <img
                                                                        src={msg.metadata.attachment_url}
                                                                        alt="Attachment"
                                                                        className="w-full h-auto max-h-[300px] object-cover group-hover:opacity-90 transition-opacity"
                                                                        onError={(e) => (e.currentTarget.style.display = 'none')}
                                                                    />
                                                                    <div className="absolute top-2 right-2 p-1.5 bg-black/60 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
                                                                        <ExternalLink size={12} className="text-white" />
                                                                    </div>
                                                                </div>
                                                            </a>
                                                        )}
                                                        {(() => {
                                                            const text = msg.parts[0]?.text || '';
                                                            if (isLikelyEmail(text) || msg.metadata?.recipient_email) {
                                                                const { to: extractedTo, subject, body } = extractEmailFields(text);
                                                                // Try metadata first (from prospect context), then extracted 'To:'  
                                                                const recipientEmail = msg.metadata?.recipient_email || msg.metadata?.email || extractedTo || '';
                                                                const isExpanded = expandedCards.has(i);
                                                                return (
                                                                    <div className="bg-black/20 rounded-2xl border border-white/5 overflow-hidden">
                                                                        {/* Header with actions */}
                                                                        <div className="px-4 py-3 bg-white/5 border-b border-white/5 flex items-center justify-between">
                                                                            <span className="text-[10px] font-bold opacity-60 uppercase tracking-widest">Email Draft</span>
                                                                            <div className="flex items-center gap-2">
                                                                                {/* Copy Button */}
                                                                                <button
                                                                                    onClick={() => {
                                                                                        navigator.clipboard.writeText(stripMarkdown(text));
                                                                                        // Visual feedback
                                                                                        const btn = document.activeElement as HTMLButtonElement;
                                                                                        if (btn) {
                                                                                            btn.classList.add('!bg-emerald-500/20', '!text-emerald-400');
                                                                                            setTimeout(() => btn.classList.remove('!bg-emerald-500/20', '!text-emerald-400'), 1500);
                                                                                        }
                                                                                    }}
                                                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all text-[11px] font-semibold"
                                                                                    title="Copy to clipboard"
                                                                                >
                                                                                    <Copy size={12} />
                                                                                    <span>Copy</span>
                                                                                </button>
                                                                                {/* Open in Outlook Button */}
                                                                                <a
                                                                                    href={buildOutlookLink(recipientEmail, undefined, subject, stripMarkdown(body))}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 hover:text-blue-200 transition-all text-[11px] font-semibold"
                                                                                    title="Open in Outlook"
                                                                                >
                                                                                    <Mail size={12} />
                                                                                    <span>Outlook</span>
                                                                                </a>
                                                                                {/* Open in Gmail Button */}
                                                                                <a
                                                                                    href={buildGmailLink(recipientEmail, undefined, subject, stripMarkdown(body))}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-300 hover:text-rose-200 transition-all text-[11px] font-semibold"
                                                                                    title="Open in Gmail"
                                                                                >
                                                                                    <Mail size={12} />
                                                                                    <span>Gmail</span>
                                                                                </a>
                                                                            </div>
                                                                        </div>
                                                                        {/* Email Content */}
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
                                                            // Check if message contains an email address
                                                            const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
                                                            const foundEmails = text.match(emailPattern);
                                                            const foundPhones = extractPhoneNumbers(text);

                                                            return (
                                                                <div className="space-y-3">
                                                                    <div className="prose prose-invert prose-sm opacity-90 leading-relaxed">
                                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                                                                    </div>
                                                                    {/* Action buttons row */}
                                                                    {((foundEmails?.length ?? 0) > 0 || foundPhones.length > 0) && (
                                                                        <div className="flex flex-wrap items-center gap-2 pt-2">
                                                                            {/* Copy Email buttons */}
                                                                            {foundEmails?.map((email, idx) => (
                                                                                <button
                                                                                    key={`email-${idx}`}
                                                                                    onClick={() => {
                                                                                        navigator.clipboard.writeText(email);
                                                                                        setCopiedMessageId(originalIndex * 1000 + idx);
                                                                                        setTimeout(() => setCopiedMessageId(null), 2000);
                                                                                    }}
                                                                                    className={cn(
                                                                                        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
                                                                                        copiedMessageId === originalIndex * 1000 + idx
                                                                                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                                                            : "bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 hover:text-blue-200"
                                                                                    )}
                                                                                >
                                                                                    {copiedMessageId === originalIndex * 1000 + idx ? (
                                                                                        <><CheckCircle size={12} /> Copied!</>
                                                                                    ) : (
                                                                                        <><Mail size={12} /> Copy Email</>
                                                                                    )}
                                                                                </button>
                                                                            ))}
                                                                            {/* Stealth Dial - Call buttons */}
                                                                            {foundPhones.map((phone, idx) => (
                                                                                <a
                                                                                    key={`call-${idx}`}
                                                                                    href={`tel:+1${phone}`}
                                                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-300 hover:text-green-200 text-[11px] font-semibold transition-all"
                                                                                >
                                                                                    <Phone size={12} />
                                                                                    Call {formatPhoneDisplay(phone)}
                                                                                </a>
                                                                            ))}
                                                                            {/* Open in SMS button */}
                                                                            {foundPhones.length > 0 && (
                                                                                <a
                                                                                    href={buildSmsLink(foundPhones[0], text)}
                                                                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 hover:text-purple-200 text-[11px] font-semibold transition-all"
                                                                                >
                                                                                    <MessageSquare size={12} />
                                                                                    Open in SMS
                                                                                </a>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                    {/* Message Action Strip */}
                                                    <div className="flex items-center gap-1 pt-3 border-t border-white/5 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                                                        <button
                                                            onClick={() => handleCopyMessage(msg.parts[0]?.text || '', originalIndex)}
                                                            className={cn(
                                                                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all",
                                                                isCopied ? "bg-emerald-500/20 text-emerald-400" : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                                                            )}
                                                        >
                                                            {isCopied ? <CheckCircle size={10} /> : <Copy size={10} />}
                                                            {isCopied ? 'Copied' : 'Copy'}
                                                        </button>
                                                        {isLastModelMsg && (
                                                            <button
                                                                onClick={() => handleRegenerate(originalIndex)}
                                                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[10px] font-semibold transition-all"
                                                            >
                                                                <RefreshCw size={10} />
                                                                Regenerate
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handlePinMessage(originalIndex)}
                                                            className={cn(
                                                                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all",
                                                                isPinned ? "bg-amber-500/20 text-amber-400" : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                                                            )}
                                                        >
                                                            <Bookmark size={10} />
                                                            {isPinned ? 'Pinned' : 'Pin'}
                                                        </button>
                                                        {/* Quick Reference - Email (extracted from response) */}
                                                        {(() => {
                                                            const text = msg.parts[0]?.text || '';
                                                            const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
                                                            const candidateIdMatch = text.match(/(?:candidate[_\s]?id|ID)[:\s]*(\d{5,})/i) || text.match(/\/candidates\/(\d+)/);
                                                            const extractedEmail = emailMatch?.[1];
                                                            const extractedCandidateId = candidateIdMatch?.[1];

                                                            return (
                                                                <>
                                                                    {extractedEmail && (
                                                                        <button
                                                                            onClick={() => {
                                                                                navigator.clipboard.writeText(extractedEmail);
                                                                                setCopiedMessageId(originalIndex * 10000 + 1);
                                                                                setTimeout(() => setCopiedMessageId(null), 2000);
                                                                            }}
                                                                            className={cn(
                                                                                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all",
                                                                                copiedMessageId === originalIndex * 10000 + 1
                                                                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                                                                    : "bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-300 hover:text-blue-200"
                                                                            )}
                                                                            title={`Copy: ${extractedEmail}`}
                                                                        >
                                                                            <Mail size={10} />
                                                                            {copiedMessageId === originalIndex * 10000 + 1 ? 'Copied!' : extractedEmail.length > 25 ? extractedEmail.slice(0, 22) + '...' : extractedEmail}
                                                                        </button>
                                                                    )}
                                                                    {extractedCandidateId && (
                                                                        <a
                                                                            href={`https://nova.ayahealthcare.com/#/recruiting/candidates/${extractedCandidateId}/new-profile/about`}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-300 hover:text-purple-200 text-[10px] font-semibold transition-all"
                                                                            title="Open in Nova"
                                                                        >
                                                                            <ExternalLink size={10} />
                                                                            Nova
                                                                        </a>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                        {/* Shrink for SMS */}
                                                        <button
                                                            onClick={async () => {
                                                                const sms = await shrinkForSms(msg.parts[0]?.text || '');
                                                                navigator.clipboard.writeText(sms);
                                                                setCopiedMessageId(originalIndex * 10000 + 2);
                                                                setTimeout(() => setCopiedMessageId(null), 2000);
                                                            }}
                                                            className={cn(
                                                                "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all",
                                                                copiedMessageId === originalIndex * 10000 + 2
                                                                    ? "bg-emerald-500/20 text-emerald-400"
                                                                    : "bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white"
                                                            )}
                                                            title="Shrink to 160 chars for SMS"
                                                        >
                                                            <MessageSquare size={10} />
                                                            {copiedMessageId === originalIndex * 10000 + 2 ? 'Copied!' : 'SMS Text'}
                                                        </button>
                                                    </div>
                                                </PrecisionCard>
                                            ) : msg.role === 'user' ? (
                                                <div className="max-w-[85%] bg-indigo-500/10 border border-indigo-500/20 px-4 py-2.5 rounded-2xl">
                                                    <span className="text-[13px] text-indigo-50 leading-relaxed font-medium">{msg.parts[0]?.text}</span>
                                                </div>
                                            ) : (
                                                <div className="w-full">
                                                    {msg.toolInvocations?.map((tool: any, idx: number) => (
                                                        <ToolResultRenderer
                                                            key={idx}
                                                            toolName={tool.toolName}
                                                            data={tool.result}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                {/* Dynamic Island - Premium Thinking Indicator */}
                                <AnimatePresence>
                                    {isGenerating && (
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.8, width: 48 }}
                                            animate={{
                                                opacity: 1,
                                                scale: 1,
                                                width: 180,
                                                transition: { type: 'spring', damping: 20, stiffness: 300 }
                                            }}
                                            exit={{
                                                opacity: 0,
                                                scale: 0.8,
                                                width: 48,
                                                transition: { duration: 0.2 }
                                            }}
                                            className="mx-auto mb-4 flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)_inset]"
                                        >
                                            {/* Pulse Ring */}
                                            <motion.div
                                                className="relative"
                                                animate={{ scale: [1, 1.2, 1] }}
                                                transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                                            >
                                                <div className="w-2 h-2 rounded-full bg-gradient-to-br from-blue-400 to-purple-500" />
                                                <motion.div
                                                    className="absolute inset-0 rounded-full bg-blue-400/50"
                                                    animate={{ scale: [1, 2], opacity: [0.5, 0] }}
                                                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
                                                />
                                            </motion.div>
                                            <span className="text-[11px] font-medium text-white/80 whitespace-nowrap">
                                                Thinking...
                                            </span>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <footer className="p-6 border-t border-white/10 space-y-4">
                                {/* Quick Actions Rail - visible when input is empty */}
                                <AnimatePresence>
                                    {showQuickActions && !inputValue && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 10 }}
                                            className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none"
                                        >
                                            {QUICK_ACTIONS.map(action => (
                                                <button
                                                    key={action.label}
                                                    onClick={() => {
                                                        if (action.isTemplate) {
                                                            setInputValue(action.command);
                                                        } else {
                                                            setInputValue(action.command);
                                                            setTimeout(() => handleSend(), 100);
                                                        }
                                                    }}
                                                    className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white text-[11px] font-semibold transition-all"
                                                >
                                                    <action.icon size={12} />
                                                    {action.label}
                                                </button>
                                            ))}
                                            {/* Collapse button */}
                                            <button
                                                onClick={() => setShowQuickActions(false)}
                                                className="flex-shrink-0 p-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white transition-all"
                                                title="Hide quick actions"
                                            >
                                                <X size={10} />
                                            </button>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                {/* Show button when collapsed */}
                                {!showQuickActions && !inputValue && (
                                    <button
                                        onClick={() => setShowQuickActions(true)}
                                        className="mb-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white text-[10px] font-semibold transition-all"
                                    >
                                        ✨ Show Quick Actions
                                    </button>
                                )}
                                <div
                                    className={`relative group transition-all duration-300 ${isDraggingOver ? 'scale-[1.02]' : ''}`}
                                    onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                                    onDragLeave={() => setIsDraggingOver(false)}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        setIsDraggingOver(false);

                                        // Try various data types
                                        const jsonData = e.dataTransfer.getData('application/json');
                                        const plainData = e.dataTransfer.getData('text/plain');

                                        let candidateId: string | null = null;
                                        let candidateName: string | null = null;

                                        if (jsonData) {
                                            try {
                                                const data = JSON.parse(jsonData);
                                                // Handle various formats from different dashboards
                                                candidateId = data.id || data.prospectId || data.candidateId;
                                                candidateName = data.name || data.candidateName;
                                            } catch (e) { /* ignore */ }
                                        }

                                        if (!candidateId && plainData) {
                                            // Check if it's a number (ID only) or JSON
                                            if (/^\d+$/.test(plainData.trim())) {
                                                candidateId = plainData.trim();
                                            } else {
                                                try {
                                                    const data = JSON.parse(plainData);
                                                    candidateId = data.id || data.prospectId;
                                                    candidateName = data.name || data.candidateName;
                                                } catch (e) {
                                                    // Might be a name?
                                                    candidateName = plainData.trim();
                                                }
                                            }
                                        }

                                        if (candidateId || candidateName) {
                                            const contextMsg = candidateId
                                                ? `Help me with candidate ID ${candidateId}${candidateName ? ` (${candidateName})` : ''}`
                                                : `Help me with candidate ${candidateName}`;

                                            setInputValue(contextMsg);
                                            // Auto-trigger if we have an ID
                                            if (candidateId) {
                                                setTimeout(() => handleSend(), 100);
                                            }
                                        }

                                    }}
                                >
                                    <textarea
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                        onPaste={handlePaste}
                                        placeholder={isDraggingOver ? "Drop candidate here to set context..." : "Ask anything..."}
                                        className={`w-full bg-black/40 backdrop-blur-xl border rounded-2xl py-4 pl-5 pr-14 
                                            focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/40 focus:bg-black/50
                                            shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),inset_0_-1px_0_0_rgba(0,0,0,0.2)]
                                            transition-all resize-none text-[13px] text-white/90 h-24 no-scrollbar placeholder:text-white/30
                                            ${isDraggingOver ? 'border-indigo-500 ring-2 ring-indigo-500/40 bg-indigo-500/10' : 'border-white/10'}`}
                                    />
                                    <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
                                        <button
                                            onClick={() => fileInputRef.current?.click()}
                                            className="p-2.5 text-white/40 hover:text-white/80 hover:bg-white/5 rounded-xl transition-all"
                                        >
                                            <Paperclip size={16} />
                                        </button>
                                        <button
                                            onClick={handleSend}
                                            disabled={!inputValue.trim() && attachments.length === 0}
                                            className={cn(
                                                "p-2.5 rounded-xl transition-all",
                                                inputValue.trim() || attachments.length > 0
                                                    ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 hover:scale-105"
                                                    : "bg-white/5 text-white/30 cursor-not-allowed"
                                            )}
                                        >
                                            <Send size={16} />
                                        </button>
                                    </div>
                                    <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" multiple accept="image/*,.pdf,.doc,.docx,.txt" />
                                </div>
                                {/* Attachment Preview - Multiple Files */}
                                {attachments.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {attachments.map((att, idx) => (
                                            <div key={idx} className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 rounded-xl text-[10px] text-indigo-200">
                                                <Paperclip size={12} />
                                                <span className="max-w-[120px] truncate">{att.file.name}</span>
                                                <button
                                                    onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                                                    className="opacity-50 hover:opacity-100 hover:text-red-400 transition-all"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        ))}
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
