import React, { useEffect, useMemo, useRef, useState } from 'react';
import { configOk } from './lib/config';
import { supabase, parseOAuthCallback } from './lib/auth';
import {
    playDraftReadyCue,
    readElectronClipboardImage,
    writeClipboardText,
    fileToAttachment,
    type Attachment
} from './lib/clipboard';
import { callCommandCenter, buildAttachment } from './lib/api';
import { POST_DRAFT_MODIFIERS, PRE_DRAFT_MODES, type ModeSpec } from './lib/modifiers';

function normalizeBodyForMailto(body: string): string {
    return body.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

export default function App() {
    const sb = supabase();

    // DEV BYPASS: Set to true to skip auth for UI testing
    const DEV_BYPASS = import.meta.env.DEV;

    const [sessionReady, setSessionReady] = useState(DEV_BYPASS);
    const [signedIn, setSignedIn] = useState(DEV_BYPASS);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [mode, setMode] = useState<ModeSpec | null>(null);
    const [context, setContext] = useState('');
    const [attachment, setAttachment] = useState<Attachment | null>(null);

    const [isGenerating, setIsGenerating] = useState(false);
    const [draft, setDraft] = useState('');
    const [error, setError] = useState('');
    const [copiedPill, setCopiedPill] = useState(false);

    const ctxRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') window.electronAPI?.hideWindow?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    useEffect(() => {
        const unsub = window.electronAPI?.onDeepLink?.(async (url) => {
            const parsed = parseOAuthCallback(url);
            if (!parsed) return;
            await sb.auth.setSession({
                access_token: parsed.access_token,
                refresh_token: parsed.refresh_token
            });
        });
        return () => { unsub?.(); };
    }, [sb]);

    useEffect(() => {
        (async () => {
            const { data } = await sb.auth.getSession();
            setSignedIn(!!data.session);
            setSessionReady(true);
        })();

        const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
            setSignedIn(!!session);
            setTimeout(() => ctxRef.current?.focus(), 50);
        });

        return () => sub.subscription.unsubscribe();
    }, [sb]);

    async function ingestScreenshotFromClipboardOrEvent(e?: ClipboardEvent): Promise<boolean> {
        setError('');

        // 1) Prefer image from paste event clipboardData
        const items = e?.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
        const imageItem = items.find((it) => it.type.startsWith('image/'));

        if (imageItem) {
            const file = imageItem.getAsFile();
            if (file) {
                try {
                    const att = await fileToAttachment(file);
                    setAttachment(att);
                    setDraft('');
                    setTimeout(() => ctxRef.current?.focus(), 50);
                    return true;
                } catch {
                    setError("Couldn't read screenshot. Try Cmd+V again.");
                    return false;
                }
            }
            setError("Couldn't read screenshot. Try Cmd+V again.");
            return false;
        }

        // 2) Fallback: Electron native clipboard
        const att = await readElectronClipboardImage();
        if (att) {
            setAttachment(att);
            setDraft('');
            setTimeout(() => ctxRef.current?.focus(), 50);
            return true;
        }

        return false;
    }

    // Single paste target: window-level paste handler (no multiple onPaste zones)
    useEffect(() => {
        const onPaste = async (e: ClipboardEvent) => {
            const ok = await ingestScreenshotFromClipboardOrEvent(e);
            if (ok) e.preventDefault();
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, []);

    async function onDropFiles(e: React.DragEvent) {
        e.preventDefault();
        setError('');

        const file = e.dataTransfer.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError("Couldn't read that file. Drop an image screenshot.");
            return;
        }

        try {
            const att = await fileToAttachment(file);
            setAttachment(att);
            setDraft('');
            setTimeout(() => ctxRef.current?.focus(), 50);
        } catch {
            setError("Couldn't read that image. Try a clearer screenshot.");
        }
    }

    async function generateDraft(messageOverride?: string) {
        if (isGenerating) return;
        setIsGenerating(true);
        setError('');
        setDraft('');

        try {
            const parts = [
                (messageOverride ?? '').trim(),
                (mode?.instruction ?? '').trim(),
                context.trim()
            ].filter(Boolean);

            // Default: screenshot-only draft reply
            const finalMsg = parts.length
                ? parts.join('\n')
                : 'Draft a reply to the candidate based on the screenshot.';

            const { text } = await callCommandCenter({
                message: finalMsg,
                attachment: buildAttachment(attachment)
            });

            setDraft(text);

            const ok = await writeClipboardText(text);
            if (ok) {
                await playDraftReadyCue();
                setCopiedPill(true);
                window.setTimeout(() => setCopiedPill(false), 2500);
            }
        } catch (err) {
            const code = (err as any)?.message ?? '';
            if (code === 'NO_AUTH') setError("You're signed out. Sign in again.");
            else if (code === 'CONFIG') setError('App misconfigured. Missing Supabase settings.');
            else setError("Couldn't generate draft. Check your connection and try again.");
        } finally {
            setIsGenerating(false);
        }
    }

    async function applyModifier(instruction: string) {
        if (!draft.trim()) return;
        const msg =
            `Modify the draft below.\n` +
            `Rules: keep it human, recruiter-written, concise.\n\n` +
            `Draft:\n${draft.trim()}\n\n` +
            `Change:\n${instruction}`;

        await generateDraft(msg);
    }

    function resetForNext() {
        setMode(null);
        setContext('');
        setAttachment(null);
        setDraft('');
        setError('');
        setTimeout(() => ctxRef.current?.focus(), 50);
    }

    const canSubmit = useMemo(() => {
        return !!attachment || !!context.trim();
    }, [attachment, context]);

    async function openOutlook() {
        if (!draft.trim()) return;
        const body = encodeURIComponent(normalizeBodyForMailto(draft.trim()));
        const url = `mailto:?subject=&body=${body}`;
        await window.electronAPI?.openExternal?.(url);
    }

    async function openGmail() {
        if (!draft.trim()) return;
        const url =
            `https://mail.google.com/mail/?view=cm&fs=1` +
            `&su=` +
            `&body=${encodeURIComponent(draft.trim())}`;
        await window.electronAPI?.openExternal?.(url);
    }

    if (!sessionReady) {
        return (
            <div className="shell">
                <div className="header">
                    <div className="brand"><span className="dot" /><div>Command Center</div></div>
                </div>
                <div className="content">
                    <div className="card"><div className="small">Loading…</div></div>
                </div>
            </div>
        );
    }

    if (!configOk()) {
        return (
            <div className="shell">
                <div className="header">
                    <div className="brand"><span className="dot" /><div>Command Center</div></div>
                </div>
                <div className="content">
                    <div className="card">
                        <div className="error">⚠ Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</div>
                    </div>
                </div>
            </div>
        );
    }

    if (!signedIn) {
        return (
            <div className="shell">
                <div className="header">
                    <div className="brand">
                        <span className="dot" />
                        <div>
                            <div>Command Center</div>
                            <div className="small">Sign in once. Then it stays out of your way.</div>
                        </div>
                    </div>
                </div>

                <div className="content">
                    <div className="card">
                        <div className="field">
                            <div className="label">Email</div>
                            <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
                        </div>

                        <div className="field">
                            <div className="label">Password</div>
                            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
                        </div>

                        <div className="actions">
                            <button
                                className="btn btnPrimary"
                                onClick={async () => {
                                    setError('');
                                    const { error: e } = await sb.auth.signInWithPassword({
                                        email: email.trim(),
                                        password
                                    });
                                    if (e) setError("Couldn't sign in. Check email and password.");
                                }}
                            >
                                Sign in
                            </button>
                        </div>

                        <div className="divider" />

                        <div className="small">Or sign in with Google (if enabled)</div>

                        <div className="actions">
                            <button
                                className="btn"
                                onClick={async () => {
                                    setError('');
                                    const { data, error: e } = await sb.auth.signInWithOAuth({
                                        provider: 'google',
                                        options: { redirectTo: 'commandcenter://auth' }
                                    });

                                    if (e) {
                                        setError("Google sign-in not enabled. Use email/password.");
                                        return;
                                    }

                                    const url = data?.url ?? '';
                                    if (url) await window.electronAPI?.openExternal?.(url);
                                }}
                            >
                                Sign in with Google
                            </button>
                        </div>

                        {error && <div className="error">⚠ {error}</div>}

                        <div className="small" style={{ marginTop: 10 }}>
                            Hotkey: Cmd+Shift+D • Escape hides window
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="shell" onDragOver={(e) => e.preventDefault()} onDrop={onDropFiles}>
            <div className="header">
                <div className="brand">
                    <span className="dot" />
                    <div>
                        <div>Command Center</div>
                        <div className="small">Paste screenshot → draft → copied</div>
                    </div>
                </div>

                <div className="actions" style={{ marginTop: 0 }}>
                    <button
                        className="btn"
                        onClick={async () => {
                            await sb.auth.signOut();
                            resetForNext();
                        }}
                        title="Sign out"
                    >
                        Sign out
                    </button>
                </div>
            </div>

            <div className="content">
                <div className="card">
                    {/* Pre-draft modes: set hidden context flag (no visible junk text) */}
                    <div className="chips">
                        {PRE_DRAFT_MODES.map((m) => (
                            <button
                                key={m.id}
                                className="chip"
                                onClick={() => {
                                    setMode(m);
                                    setTimeout(() => ctxRef.current?.focus(), 30);
                                }}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>

                    {/* Mode pill */}
                    {mode && (
                        <div className="modeRow">
                            <div className="modePill">
                                <span>Mode: {mode.label}</span>
                                <span
                                    className="modeX"
                                    onClick={() => setMode(null)}
                                    role="button"
                                    aria-label="Clear mode"
                                    title="Clear mode"
                                >
                                    ×
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Hint UI (not a separate paste target) */}
                    {!attachment && (
                        <div className="hintBox">
                            <div className="hintTitle">Paste a screenshot</div>
                            <div className="hintSub">Cmd+V • or drag an image here</div>
                        </div>
                    )}

                    {attachment && (
                        <div className="preview">
                            <img src={attachment.dataUrl} alt="Screenshot preview" />
                        </div>
                    )}

                    {/* Context input */}
                    <div className="inputBox">
                        <textarea
                            ref={ctxRef}
                            className="textarea"
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder={attachment ? "Context (optional). Enter drafts." : "Context (optional). Paste screenshot first."}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (canSubmit) generateDraft();
                                }
                            }}
                        />
                        <div className="small" style={{ marginTop: 6 }}>
                            Enter drafts • Escape hides • Auto-copy on completion
                        </div>
                    </div>

                    {isGenerating && <div className="draft" style={{ opacity: 0.85 }}>Writing…</div>}

                    {draft && !isGenerating && (
                        <>
                            <div className="draft">{draft}</div>

                            <div className="chips" style={{ marginTop: 12 }}>
                                {POST_DRAFT_MODIFIERS.map((m) => (
                                    <button key={m.label} className="chip" onClick={() => applyModifier(m.instruction)}>
                                        {m.label}
                                    </button>
                                ))}
                            </div>

                            <div className="actions">
                                <button className="btn btnPrimary" onClick={openOutlook}>Outlook</button>
                                <button className="btn" onClick={openGmail}>Gmail</button>
                                <button
                                    className="btn"
                                    onClick={async () => {
                                        await writeClipboardText(draft);
                                        setCopiedPill(true);
                                        window.setTimeout(() => setCopiedPill(false), 2500);
                                    }}
                                >
                                    Copy
                                </button>
                                <button className="btn btnDanger" onClick={resetForNext}>Paste another</button>
                            </div>
                        </>
                    )}

                    {error && <div className="error">⚠ {error}</div>}
                </div>
            </div>

            {copiedPill && (
                <div className="pill">
                    <span>✓</span>
                    <span>Copied</span>
                </div>
            )}
        </div>
    );
}
