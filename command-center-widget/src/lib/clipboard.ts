export type Attachment = {
    dataUrl: string;
    base64: string;
    mimeType: string;
};

export function extractBase64FromDataUrl(dataUrl: string): { base64: string; mimeType: string } {
    const m = dataUrl.match(/^data:(.*?);base64,(.*)$/);
    if (!m) return { base64: '', mimeType: 'image/png' };
    return { mimeType: m[1], base64: m[2] };
}

export async function readElectronClipboardImage(): Promise<Attachment | null> {
    const dataUrl = await window.electronAPI?.readClipboardImageDataUrl?.();
    if (!dataUrl) return null;
    const { base64, mimeType } = extractBase64FromDataUrl(dataUrl);
    if (!base64) return null;
    return { dataUrl, base64, mimeType };
}

export async function fileToAttachment(file: File): Promise<Attachment> {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const base64 = btoa(binary);
    const dataUrl = `data:${file.type};base64,${base64}`;
    return { dataUrl, base64, mimeType: file.type };
}

export async function writeClipboardText(text: string): Promise<boolean> {
    const t = (text ?? '').trim();
    if (!t) return false;
    if (window.electronAPI?.writeClipboardText) return window.electronAPI.writeClipboardText(t);
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(t);
        return true;
    }
    return false;
}

export async function playDraftReadyCue(): Promise<void> {
    try {
        const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.14, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
    } catch {
        // silent
    }
}
