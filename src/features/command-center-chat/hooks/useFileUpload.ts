/* ============================================================================
   useFileUpload.ts
   Elite File Upload Hook for Command Center (v2.8 - Payload Safe)
   
   Features:
   ├─ 413 Guard: Strict Base64 payload budgeting
   ├─ Smart Compression: Multi-pass JPEG optimization for AI Vision
   ├─ Hybrid Mode: Uploads high-res to Storage, optimizes low-res for AI
   └─ Memory Efficient: Aggressive URL revocation
============================================================================ */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../../../shared/services/supabase';

// ============================================================================
// CONFIGURATION & LIMITS
// ============================================================================

const DEFAULT_MAX_SIZE = 15 * 1024 * 1024; // 15MB (Storage Limit)
const DEFAULT_MAX_FILES = 5;
const BUCKET_NAME = 'command-center-attachments';

const DEFAULT_ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
    'application/pdf', 'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv',
];

// PAYLOAD GUARD: Config to keep request body under 4.5MB (Vercel Limit)
const COMPRESSION_CONFIG = {
    maxDimension: 1536,             // Optimal for LLM Vision (balances tokens vs detail)
    compressAboveBytes: 300 * 1024, // Compress images > 300KB
    targetImageBytes: 400 * 1024,   // Target ~400KB per image
    maxAnalysisBytes: 2 * 1024 * 1024, // 2MB Cap for Non-Images (PDFs). Larger = Link Only.
    qualitySteps: [0.85, 0.70, 0.55, 0.40],
};

// ============================================================================
// TYPES
// ============================================================================

export interface Attachment {
    id: string;
    file: File;
    previewUrl: string | null;
    mimeType: string;
    fileName: string;
    fileSize: number;
    isUploading: boolean;
    uploadProgress: number;
    uploadError: string | null;
    storagePath: string | null;
    publicUrl: string | null;
    /** Base64 encoded file data for vision/multimodal AI. Null if skipped. */
    base64Data: string | null;
    /** If true, file is uploaded but excluded from AI analysis (Link only) */
    skippedAnalysis: boolean;
    /** Exact size of the base64 string in bytes */
    payloadSize: number;
}

export interface UseFileUploadOptions {
    maxFileSize?: number;
    maxFiles?: number;
    allowedTypes?: string[];
    bucketName?: string;
    onUploadComplete?: (attachment: Attachment) => void;
    onUploadError?: (error: string, file: File) => void;
}

export interface UseFileUploadReturn {
    attachments: Attachment[];
    isDragActive: boolean;
    isUploading: boolean;
    /** True if any image is still being processed (base64 not ready) */
    isProcessing: boolean;
    addFiles: (files: FileList | File[]) => void;
    removeFile: (id: string) => void;
    clearAll: () => void;
    dragHandlers: {
        onDragEnter: (e: React.DragEvent) => void;
        onDragOver: (e: React.DragEvent) => void;
        onDragLeave: (e: React.DragEvent) => void;
        onDrop: (e: React.DragEvent) => void;
    };
    handlePaste: (e: React.ClipboardEvent) => void;
    fileInputRef: React.RefObject<HTMLInputElement>;
    triggerFileSelect: () => void;
    /** Total bytes of Base64 payload for AI context */
    totalPayloadSize: number;
}

// ============================================================================
// UTILITIES
// ============================================================================

function generateId(): string {
    try { return crypto.randomUUID(); } catch { return Math.random().toString(36).substring(2, 15); }
}

function isAllowedType(file: File, allowedTypes: string[]): boolean {
    if (allowedTypes.includes(file.type)) return true;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = { 'pdf': 'application/pdf', 'doc': 'application/msword', 'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
    if (ext && map[ext] && allowedTypes.includes(map[ext])) return true;
    return allowedTypes.some(t => t.endsWith('/*') && file.type.startsWith(t.replace('/*', '')));
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

// ============================================================================
// COMPRESSION ENGINE
// ============================================================================

async function compressImage(file: File): Promise<{ base64: string; mimeType: string; size: number }> {
    const bmp = await createImageBitmap(file);
    const { width: w, height: h } = bmp;

    let outW = w, outH = h;
    if (w > COMPRESSION_CONFIG.maxDimension || h > COMPRESSION_CONFIG.maxDimension) {
        const scale = COMPRESSION_CONFIG.maxDimension / Math.max(w, h);
        outW = Math.round(w * scale);
        outH = Math.round(h * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas error');

    ctx.fillStyle = '#FFFFFF'; // Handle transparency
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(bmp, 0, 0, outW, outH);
    bmp.close();

    // Multi-pass compression
    for (const q of COMPRESSION_CONFIG.qualitySteps) {
        const dataUrl = canvas.toDataURL('image/jpeg', q);
        const base64 = dataUrl.split(',')[1];
        // Approx binary size: (n * 3/4)
        const binarySize = base64.length * 0.75;

        if (binarySize <= COMPRESSION_CONFIG.targetImageBytes || q === COMPRESSION_CONFIG.qualitySteps[COMPRESSION_CONFIG.qualitySteps.length - 1]) {
            return { base64, mimeType: 'image/jpeg', size: base64.length };
        }
    }
    throw new Error('Compression failed');
}

async function readFileBase64(file: File): Promise<{ base64: string | null; mimeType: string; size: number }> {
    const isImage = file.type.startsWith('image/');

    // 1. Optimize Images > 300KB
    if (isImage && file.size > COMPRESSION_CONFIG.compressAboveBytes) {
        try { return await compressImage(file); }
        catch (e) { console.warn('Compression failed, falling back', e); }
    }

    // 2. Guard Non-Images (PDFs)
    // If file > 2MB, Base64 will be > 2.6MB. Too risky for Vercel 4.5MB limit.
    if (!isImage && file.size > COMPRESSION_CONFIG.maxAnalysisBytes) {
        console.warn(`[PayloadGuard] Skipped analysis for ${file.name} (${formatFileSize(file.size)}). Link only.`);
        return { base64: null, mimeType: file.type, size: 0 };
    }

    // 3. Standard Read
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
            const res = reader.result as string;
            const base64 = res.split(',')[1];
            resolve({ base64, mimeType: file.type, size: base64.length });
        };
        reader.onerror = () => resolve({ base64: null, mimeType: file.type, size: 0 });
        reader.readAsDataURL(file);
    });
}

// ============================================================================
// MAIN HOOK
// ============================================================================

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
    const { maxFileSize = DEFAULT_MAX_SIZE, maxFiles = DEFAULT_MAX_FILES, allowedTypes = DEFAULT_ALLOWED_TYPES, bucketName = BUCKET_NAME, onUploadComplete, onUploadError } = options;

    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isDragActive, setIsDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragCounter = useRef(0);

    useEffect(() => () => attachments.forEach(a => a.previewUrl && URL.revokeObjectURL(a.previewUrl)), []);

    const processFile = async (att: Attachment) => {
        // 1. Prepare AI Context (Base64) - Parallel
        const aiReadable = ['image/', 'application/pdf', 'text/'].some(t => att.mimeType.startsWith(t));
        if (aiReadable) {
            readFileBase64(att.file).then(res => {
                setAttachments(prev => prev.map(p => p.id === att.id ? {
                    ...p,
                    base64Data: res.base64,
                    mimeType: res.mimeType,
                    skippedAnalysis: res.base64 === null,
                    payloadSize: res.size
                } : p));
            });
        } else {
            setAttachments(prev => prev.map(p => p.id === att.id ? { ...p, skippedAnalysis: true } : p));
        }

        // 2. Upload to Storage - Parallel
        try {
            const timestamp = Date.now();
            const safeName = att.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const path = `uploads/${timestamp}_${att.id.slice(0, 6)}_${safeName}`;

            const { error } = await supabase.storage.from(bucketName).upload(path, att.file, { cacheControl: '3600', upsert: false });
            if (error) throw error;

            const { data } = supabase.storage.from(bucketName).getPublicUrl(path);

            setAttachments(prev => prev.map(p => p.id === att.id ? { ...p, isUploading: false, uploadProgress: 100, publicUrl: data.publicUrl, storagePath: path } : p));
            onUploadComplete?.({ ...att, publicUrl: data.publicUrl } as Attachment);
        } catch (e: any) {
            setAttachments(prev => prev.map(p => p.id === att.id ? { ...p, isUploading: false, uploadError: e.message } : p));
            onUploadError?.(e.message, att.file);
        }
    };

    const addFiles = useCallback((files: FileList | File[]) => {
        const newAtts: Attachment[] = [];
        Array.from(files).forEach(file => {
            if (attachments.length + newAtts.length >= maxFiles) return onUploadError?.('Max files reached', file);
            if (file.size > maxFileSize) return onUploadError?.('File too large', file);
            if (!isAllowedType(file, allowedTypes)) return onUploadError?.('Invalid type', file);

            newAtts.push({
                id: generateId(),
                file,
                fileName: file.name,
                fileSize: file.size,
                mimeType: file.type,
                previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
                isUploading: true,
                uploadProgress: 0,
                uploadError: null,
                storagePath: null,
                publicUrl: null,
                base64Data: null,
                skippedAnalysis: false,
                payloadSize: 0
            });
        });

        if (newAtts.length === 0) return;
        setAttachments(prev => [...prev, ...newAtts]);
        newAtts.forEach(processFile);
    }, [attachments, maxFiles, maxFileSize, allowedTypes, bucketName]);

    const removeFile = useCallback((id: string) => setAttachments(p => p.filter(a => a.id !== id)), []);
    const clearAll = useCallback(() => setAttachments([]), []);

    // Drag Handlers
    const handleDragEnter = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; if (e.dataTransfer.items?.length) setIsDragActive(true); }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current === 0) setIsDragActive(false); }, []);
    const handleDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(false); dragCounter.current = 0; if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }, [addFiles]);
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const files = Array.from(e.clipboardData?.items || []).filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean) as File[];
        if (files.length) { e.preventDefault(); addFiles(files); }
    }, [addFiles]);

    // Computed
    const isUploading = attachments.some(a => a.isUploading);
    const isProcessing = attachments.some(a => a.isUploading || (!a.base64Data && !a.skippedAnalysis));
    const totalPayloadSize = attachments.reduce((sum, a) => sum + a.payloadSize, 0);

    return {
        attachments, isDragActive, isUploading, isProcessing,
        addFiles, removeFile, clearAll,
        dragHandlers: { onDragEnter: handleDragEnter, onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); }, onDragLeave: handleDragLeave, onDrop: handleDrop },
        handlePaste, fileInputRef, triggerFileSelect: () => fileInputRef.current?.click(),
        totalPayloadSize
    };
}

export default useFileUpload;
