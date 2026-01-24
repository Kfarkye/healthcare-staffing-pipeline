/**
 * Command Center V2 - Elite Chat Interface
 * 
 * Architecture Notes:
 * - NO ICONS - Text labels and typography do the work
 * - Design tokens from chat-tokens.css
 * - Uses useCommandCenterChat hook for AI SDK integration
 * - Auto-scroll with "stick to bottom" behavior
 * - Keyboard accessible (Cmd+Enter, Escape)
 * 
 * @see Design Research: Apple HIG, Vercel Geist, AI SDK Chatbot docs
 * @version 2.0.0
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { motion, AnimatePresence } from 'framer-motion';
import { useCommandCenterChat } from '../features/command-center-chat/hooks/useCommandCenterChat';
import { useLayout } from '../context/LayoutContext';
import { cn } from '../lib/utils';

// Note: Design tokens imported globally in index.css

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const containerVariants = {
    hidden: { opacity: 0, y: 40, scale: 0.95 },
    visible: {
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: 'spring' as const, mass: 1, stiffness: 200, damping: 30 }
    },
    exit: {
        opacity: 0,
        y: 40,
        scale: 0.95,
        transition: { duration: 0.2, ease: [0.4, 0, 1, 1] as const }
    },
};

const messageVariants = {
    hidden: { opacity: 0, y: 8 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.3, ease: [0, 0, 0.2, 1] as const }
    },
};

// ============================================================================
// LOADING DOTS COMPONENT (CSS-only, no icons)
// ============================================================================

const LoadingDots: React.FC<{ label?: string }> = ({ label = 'Thinking' }) => (
    <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--chat-text-secondary)]">{label}</span>
        <span className="chat-loading-dots">
            <span />
            <span />
            <span />
        </span>
    </div>
);

// ============================================================================
// MESSAGE COMPONENT
// ============================================================================

interface MessageProps {
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    onCopy?: () => void;
    onRegenerate?: () => void;
    showActions?: boolean;
}

const Message: React.FC<MessageProps> = ({
    role,
    content,
    isStreaming,
    onCopy,
    onRegenerate,
    showActions = false,
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        onCopy?.();
    };

    if (role === 'user') {
        return (
            <motion.div
                variants={messageVariants}
                initial="hidden"
                animate="visible"
                className="flex justify-end"
            >
                <div
                    className="max-w-[85%] px-4 py-3 rounded-2xl"
                    style={{
                        background: 'var(--chat-user-bg)',
                        border: '1px solid var(--chat-user-border)',
                    }}
                >
                    <p
                        className="text-sm leading-relaxed"
                        style={{ color: 'var(--chat-user-text)' }}
                    >
                        {content}
                    </p>
                </div>
            </motion.div>
        );
    }

    // Assistant message
    return (
        <motion.div
            variants={messageVariants}
            initial="hidden"
            animate="visible"
            className="flex justify-start group"
        >
            <div className="max-w-[100%] space-y-3">
                {/* Message Content */}
                <div className="chat-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {content}
                    </ReactMarkdown>
                </div>

                {/* Streaming indicator */}
                {isStreaming && (
                    <div className="pt-1">
                        <LoadingDots label="Writing" />
                    </div>
                )}

                {/* Action Strip - Text only, NO ICONS */}
                {showActions && content && !isStreaming && (
                    <div
                        className="flex items-center gap-2 pt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        style={{ borderTop: '1px solid var(--chat-border-default)' }}
                    >
                        <button
                            onClick={handleCopy}
                            className="chat-btn chat-btn-ghost text-xs"
                        >
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                        {onRegenerate && (
                            <button
                                onClick={onRegenerate}
                                className="chat-btn chat-btn-ghost text-xs"
                            >
                                Regenerate
                            </button>
                        )}
                    </div>
                )}
            </div>
        </motion.div>
    );
};

// ============================================================================
// TOOL RESULT COMPONENT (Collapsible, text-only header)
// ============================================================================

interface ToolResultProps {
    toolName: string;
    result: any;
    state: 'calling' | 'complete' | 'error';
}

const ToolResult: React.FC<ToolResultProps> = ({ toolName, result, state }) => {
    const [expanded, setExpanded] = useState(false);

    const formatToolName = (name: string) => {
        return name
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .trim()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl overflow-hidden my-2"
            style={{
                background: 'var(--chat-bg-elevated)',
                border: '1px solid var(--chat-border-default)',
            }}
        >
            {/* Header - Text only, NO ICONS */}
            <button
                onClick={() => state === 'complete' && setExpanded(!expanded)}
                disabled={state === 'calling'}
                className={cn(
                    "w-full px-4 py-3 flex items-center justify-between text-left",
                    "transition-colors duration-150",
                    state === 'complete' && "hover:bg-[var(--chat-bg-hover)] cursor-pointer"
                )}
            >
                <div className="flex items-center gap-3">
                    <span
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{
                            color: state === 'error'
                                ? 'var(--chat-accent-red)'
                                : 'var(--chat-text-secondary)'
                        }}
                    >
                        {state === 'calling' ? 'Running' : state === 'error' ? 'Error' : 'Result'}
                    </span>
                    <span
                        className="text-sm font-medium"
                        style={{ color: 'var(--chat-text-primary)' }}
                    >
                        {formatToolName(toolName)}
                    </span>
                </div>

                {/* State indicator - Text only */}
                {state === 'calling' ? (
                    <LoadingDots label="" />
                ) : state === 'complete' && (
                    <span
                        className="text-xs font-medium"
                        style={{ color: 'var(--chat-text-tertiary)' }}
                    >
                        {expanded ? 'Hide' : 'Show'}
                    </span>
                )}
            </button>

            {/* Expandable content */}
            <AnimatePresence>
                {expanded && state === 'complete' && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                        className="overflow-hidden"
                    >
                        <div
                            className="px-4 pb-4"
                            style={{ borderTop: '1px solid var(--chat-border-default)' }}
                        >
                            <pre
                                className="text-xs overflow-x-auto pt-3"
                                style={{
                                    fontFamily: 'var(--chat-font-mono)',
                                    color: 'var(--chat-text-secondary)',
                                }}
                            >
                                {JSON.stringify(result, null, 2)}
                            </pre>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const CommandCenterV2: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isMinimized, setIsMinimized] = useState(false);
    const { workspaceMode, setWorkspaceMode } = useLayout();
    const [inputValue, setInputValue] = useState('');
    const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // AI SDK Chat Hook
    const {
        messages,
        isLoading,
        isStreaming,
        error,
        sendMessage,
        clearChat,
        stop,
        status,
    } = useCommandCenterChat({
        onToolCall: (toolName, args) => {
            if (toolName === 'set_ui_state') {
                window.dispatchEvent(new CustomEvent('set_dashboard_ui_state', { detail: args }));
            }
            if (['add_prospect', 'update_negotiation', 'create_follow_up'].includes(toolName)) {
                window.dispatchEvent(new CustomEvent('refresh_dashboard'));
            }
        },
    });

    // Convert messages to display format
    const history = useMemo(() => {
        return messages.map(msg => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content || '',
            toolInvocations: msg.toolInvocations,
        }));
    }, [messages]);

    // ========================================================================
    // AUTO-SCROLL LOGIC
    // ========================================================================

    const handleScroll = useCallback(() => {
        if (!scrollRef.current) return;

        const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
        setShouldAutoScroll(isAtBottom);
    }, []);

    useEffect(() => {
        if (shouldAutoScroll && scrollRef.current) {
            scrollRef.current.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: isStreaming ? 'auto' : 'smooth',
            });
        }
    }, [history, isStreaming, shouldAutoScroll]);

    // ========================================================================
    // INPUT HANDLERS
    // ========================================================================

    const handleSend = useCallback(async () => {
        if (!inputValue.trim() || isLoading) return;

        const message = inputValue.trim();
        setInputValue('');
        setShouldAutoScroll(true);

        await sendMessage(message);
    }, [inputValue, isLoading, sendMessage]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Cmd/Ctrl + Enter to send
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleSend();
            return;
        }

        // Enter without shift to send
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
            return;
        }

        // Escape to stop generation
        if (e.key === 'Escape' && isStreaming) {
            e.preventDefault();
            stop();
            return;
        }
    }, [handleSend, isStreaming, stop]);

    // Auto-resize textarea
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInputValue(e.target.value);

        // Auto-resize
        const textarea = e.target;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    };

    // ========================================================================
    // SIZE CALCULATIONS
    // ========================================================================

    const containerStyle = useMemo(() => {
        if (isMinimized) {
            return {
                height: 48,
                width: 200,
                bottom: 32,
                right: 32,
                borderRadius: 9999,
            };
        }

        if (workspaceMode === 'full') {
            return {
                height: '100vh',
                width: '100%',
                bottom: 0,
                right: 0,
                borderRadius: '40px 0 0 40px',
            };
        }

        if (workspaceMode === 'split') {
            return {
                height: '100vh',
                width: '50%',
                bottom: 0,
                right: 0,
                borderRadius: '40px 0 0 40px',
            };
        }

        // Floating (default)
        return {
            height: 640,
            width: 460,
            bottom: 32,
            right: 32,
            borderRadius: 32,
        };
    }, [isMinimized, workspaceMode]);

    // ========================================================================
    // RENDER: Closed state (FAB)
    // ========================================================================

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-6 right-6 z-50 px-5 py-3 rounded-full font-semibold text-white text-sm shadow-lg transition-all duration-300 hover:scale-105"
                style={{
                    background: 'linear-gradient(135deg, var(--chat-accent-blue), var(--chat-accent-purple))',
                    boxShadow: 'var(--chat-shadow-glow)',
                }}
            >
                Command Center
            </button>
        );
    }

    // ========================================================================
    // RENDER: Minimized state
    // ========================================================================

    if (isMinimized) {
        return (
            <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => setIsMinimized(false)}
                className="fixed z-50 h-12 px-5 flex items-center gap-3 rounded-full cursor-pointer transition-all duration-150 hover:scale-105"
                style={{
                    ...containerStyle,
                    background: 'var(--chat-bg-card)',
                    border: '1px solid var(--chat-border-default)',
                    boxShadow: 'var(--chat-shadow-lg)',
                }}
            >
                {isLoading && <LoadingDots label="" />}
                <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--chat-text-primary)' }}
                >
                    {isLoading ? 'Thinking' : 'Command Center'}
                </span>
            </motion.button>
        );
    }

    // ========================================================================
    // RENDER: Full chat interface
    // ========================================================================

    return (
        <AnimatePresence>
            <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="fixed z-50 flex flex-col overflow-hidden"
                style={{
                    ...containerStyle,
                    background: 'var(--chat-bg-primary)',
                    border: '1px solid var(--chat-border-default)',
                    boxShadow: 'var(--chat-shadow-lg)',
                }}
            >
                {/* ============================================================
                    HEADER - Text only, NO ICONS
                    ============================================================ */}
                <header
                    className="shrink-0 h-16 px-6 flex items-center justify-between"
                    style={{ borderBottom: '1px solid var(--chat-border-default)' }}
                >
                    <div className="flex items-center gap-3">
                        <h1
                            className="text-base font-semibold"
                            style={{ color: 'var(--chat-text-primary)' }}
                        >
                            Command Center
                        </h1>
                        {/* Status text - NO ICONS */}
                        <span
                            className="text-xs font-medium"
                            style={{
                                color: status === 'error'
                                    ? 'var(--chat-accent-red)'
                                    : status === 'streaming'
                                        ? 'var(--chat-accent-blue)'
                                        : 'var(--chat-text-tertiary)'
                            }}
                        >
                            {status === 'error' ? 'Error' : status === 'streaming' ? 'Streaming' : status === 'loading' ? 'Loading' : 'Ready'}
                        </span>
                    </div>

                    {/* Header Actions - Text buttons, NO ICONS */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={clearChat}
                            className="chat-btn chat-btn-danger"
                        >
                            Clear
                        </button>
                        <button
                            onClick={() => setWorkspaceMode(
                                workspaceMode === 'floating' ? 'split' : 'floating'
                            )}
                            className="chat-btn chat-btn-ghost"
                        >
                            {workspaceMode === 'floating' ? 'Expand' : 'Float'}
                        </button>
                        <button
                            onClick={() => setIsMinimized(true)}
                            className="chat-btn chat-btn-ghost"
                        >
                            Min
                        </button>
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                setWorkspaceMode('floating');
                            }}
                            className="chat-btn chat-btn-ghost"
                        >
                            Close
                        </button>
                    </div>
                </header>

                {/* ============================================================
                    MESSAGE AREA
                    ============================================================ */}
                <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="flex-1 overflow-y-auto px-6 py-4 space-y-4 chat-scroll"
                >
                    {/* Empty State - Text only */}
                    {history.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center pt-24">
                            <p
                                className="text-lg font-medium italic"
                                style={{ color: 'var(--chat-text-tertiary)' }}
                            >
                                Speak to the Pipeline.
                            </p>
                            <p
                                className="text-sm mt-2"
                                style={{ color: 'var(--chat-text-tertiary)' }}
                            >
                                Search candidates, draft emails, calculate pay packages.
                            </p>
                        </div>
                    )}

                    {/* Messages */}
                    {history.map((msg, i) => {
                        const isLastAssistant = msg.role === 'assistant' &&
                            i === history.length - 1 ||
                            (i < history.length - 1 && history[i + 1].role === 'user');

                        return (
                            <React.Fragment key={i}>
                                {/* Tool Results */}
                                {msg.toolInvocations?.map((tool: any, idx: number) => (
                                    <ToolResult
                                        key={`${i}-tool-${idx}`}
                                        toolName={tool.toolName}
                                        result={tool.result}
                                        state={tool.state === 'result' ? 'complete' : 'calling'}
                                    />
                                ))}

                                {/* Message */}
                                <Message
                                    role={msg.role}
                                    content={msg.content}
                                    isStreaming={isStreaming && i === history.length - 1 && msg.role === 'assistant'}
                                    showActions={msg.role === 'assistant' && !!msg.content}
                                    onRegenerate={isLastAssistant ? undefined : undefined}
                                />
                            </React.Fragment>
                        );
                    })}

                    {/* Loading indicator when waiting for response */}
                    {isLoading && !isStreaming && history.length > 0 && history[history.length - 1].role === 'user' && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex justify-start"
                        >
                            <div
                                className="px-4 py-3 rounded-2xl"
                                style={{
                                    background: 'var(--chat-bg-elevated)',
                                    border: '1px solid var(--chat-border-default)',
                                }}
                            >
                                <LoadingDots />
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* ============================================================
                    INPUT AREA
                    ============================================================ */}
                <footer
                    className="shrink-0 px-6 py-4"
                    style={{ borderTop: '1px solid var(--chat-border-default)' }}
                >
                    {/* Error display */}
                    {error && (
                        <div
                            className="mb-3 px-4 py-2 rounded-lg text-sm"
                            style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                color: 'var(--chat-accent-red)',
                            }}
                        >
                            Error: {error}
                        </div>
                    )}

                    {/* Input row */}
                    <div className="flex items-end gap-3">
                        <textarea
                            ref={inputRef}
                            value={inputValue}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask anything..."
                            disabled={isLoading}
                            className="chat-textarea flex-1"
                            rows={1}
                        />

                        {/* Action buttons - Text only, NO ICONS */}
                        <div className="flex items-center gap-2 pb-1">
                            {isStreaming ? (
                                <button
                                    onClick={stop}
                                    className="chat-btn chat-btn-danger"
                                >
                                    Stop
                                </button>
                            ) : (
                                <button
                                    onClick={handleSend}
                                    disabled={!inputValue.trim() || isLoading}
                                    className="chat-btn chat-btn-primary"
                                >
                                    Send
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Keyboard hint - Text only */}
                    <p
                        className="text-xs mt-2"
                        style={{ color: 'var(--chat-text-tertiary)' }}
                    >
                        Enter to send · Shift+Enter for new line · Esc to stop
                    </p>
                </footer>
            </motion.div>
        </AnimatePresence>
    );
};

export default CommandCenterV2;
