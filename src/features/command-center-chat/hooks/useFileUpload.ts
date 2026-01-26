/* ============================================================================
   useFileUpload.ts
   Elite File Upload Hook for Command Center
   
   Features:
   ├─ Click, Drag & Drop, Paste support
   ├─ Client-side validation (size, type)
   ├─ Deduplication (name + size check)
   ├─ Supabase Storage upload with progress
   ├─ Blob URL previews (memory efficient)
   └─ Cleanup on unmount
   
   Usage:
   const { attachments, addFiles, removeFile, isDragActive, ... } = useFileUpload();
============================================================================ */

import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../../../shared/services/supabase';

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
    /** Base64 encoded file data for vision/multimodal AI (images only) */
    base64Data: string | null;
}

export interface UseFileUploadOptions {
    maxFileSize?: number;           // Default: 10MB
    maxFiles?: number;              // Default: 5
    allowedTypes?: string[];        // Default: images, PDFs, docs
    bucketName?: string;            // Default: 'command-center-attachments'
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
    // Event handlers to spread on container
    dragHandlers: {
        onDragEnter: (e: React.DragEvent) => void;
        onDragOver: (e: React.DragEvent) => void;
        onDragLeave: (e: React.DragEvent) => void;
        onDrop: (e: React.DragEvent) => void;
    };
    // Paste handler for textarea
    handlePaste: (e: React.ClipboardEvent) => void;
    // Ref for hidden file input
    fileInputRef: React.RefObject<HTMLInputElement>;
    triggerFileSelect: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_MAX_FILES = 5;
const DEFAULT_ALLOWED_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
];

const BUCKET_NAME = 'command-center-attachments';

// ============================================================================
// UTILITIES
// ============================================================================

function generateId(): string {
    return typeof crypto !== 'undefined'
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15);
}

function isAllowedType(file: File, allowedTypes: string[]): boolean {
    // Check exact MIME match
    if (allowedTypes.includes(file.type)) return true;

    // Check wildcard (e.g., "image/*")
    for (const type of allowedTypes) {
        if (type.endsWith('/*')) {
            const category = type.replace('/*', '');
            if (file.type.startsWith(category)) return true;
        }
    }

    // Check by extension for edge cases
    const ext = file.name.split('.').pop()?.toLowerCase();
    const extensionMap: Record<string, string[]> = {
        'pdf': ['application/pdf'],
        'doc': ['application/msword'],
        'docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    };

    if (ext && extensionMap[ext]) {
        return true;
    }

    return false;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============================================================================
// COMPRESSION UTILITIES (Weissach Payload Guard)
// ============================================================================

/** Payload limits to prevent Vercel 413 errors */
const COMPRESSION_CONFIG = {
    maxDimension: 1920,           // Max longest edge
    compressAboveBytes: 500 * 1024, // Compress images > 500KB
    targetImageBytes: 650 * 1024,   // Target output size
    maxTotalPayloadBytes: 2_800 * 1024, // ~2.8MB (keeps JSON+base64 < 4.5MB)
    maxNonImageBytes: 900 * 1024,   // Cap for PDFs (base64 explodes size)
    qualitySteps: [0.82, 0.75, 0.68, 0.6], // Multi-pass quality reduction
};

/** Estimate raw bytes from base64 string (exported for payload budget checks) */
export function approxBase64Bytes(base64: string): number {
    const len = base64.length;
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((len * 3) / 4) - padding);
}

/** Compute resize dimensions maintaining aspect ratio */
function computeResize(w: number, h: number, maxDim: number): { w: number; h: number } {
    if (w <= 0 || h <= 0) return { w, h };
    const longest = Math.max(w, h);
    if (longest <= maxDim) return { w, h };
    const scale = maxDim / longest;
    return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Decode image to bitmap for processing */
async function decodeImage(file: File): Promise<{ bitmap: ImageBitmap; w: number; h: number }> {
    try {
        const bitmap = await createImageBitmap(file);
        return { bitmap, w: bitmap.width, h: bitmap.height };
    } catch {
        // Fallback for Safari edge cases
        const url = URL.createObjectURL(file);
        try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image();
                el.onload = () => resolve(el);
                el.onerror = () => reject(new Error('Image decode failed'));
                el.src = url;
            });
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('No canvas context');
            ctx.drawImage(img, 0, 0);
            const bitmap = await createImageBitmap(canvas);
            return { bitmap, w: bitmap.width, h: bitmap.height };
        } finally {
            URL.revokeObjectURL(url);
        }
    }
}

/** Convert bitmap to JPEG blob */
async function bitmapToJpegBlob(
    bitmap: ImageBitmap,
    outW: number,
    outH: number,
    quality: number
): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No canvas context');
    ctx.drawImage(bitmap, 0, 0, outW, outH);

    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
            'image/jpeg',
            quality
        );
    });
}

/** Convert blob to base64 (without data: prefix) */
async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.onload = () => {
            const result = String(reader.result || '');
            const comma = result.indexOf(',');
            resolve(comma === -1 ? '' : result.slice(comma + 1));
        };
        reader.readAsDataURL(blob);
    });
}

/**
 * Compress image with multi-pass quality reduction.
 * Returns base64 AND the correct mimeType (always image/jpeg after compression).
 */
async function compressImageToJpeg(
    file: File
): Promise<{ base64: string; mimeType: string; sizeBytes: number }> {
    const { bitmap, w, h } = await decodeImage(file);
    const resized = computeResize(w, h, COMPRESSION_CONFIG.maxDimension);

    // Multi-pass: try each quality level until target size is met
    for (const quality of COMPRESSION_CONFIG.qualitySteps) {
        const blob = await bitmapToJpegBlob(bitmap, resized.w, resized.h, quality);

        if (blob.size <= COMPRESSION_CONFIG.targetImageBytes || quality === COMPRESSION_CONFIG.qualitySteps[COMPRESSION_CONFIG.qualitySteps.length - 1]) {
            const base64 = await blobToBase64(blob);
            console.log(`[FileUpload] Compressed ${file.name}: ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB (q=${quality})`);

            // CRITICAL: mimeType MUST match the actual bytes (JPEG)
            return { base64, mimeType: 'image/jpeg', sizeBytes: blob.size };
        }
    }

    // Fallback (shouldn't reach here)
    const blob = await bitmapToJpegBlob(bitmap, resized.w, resized.h, 0.6);
    const base64 = await blobToBase64(blob);
    return { base64, mimeType: 'image/jpeg', sizeBytes: blob.size };
}

/**
 * Read a file as base64 string.
 * For images > 500KB, compresses to JPEG and returns correct mimeType.
 * Used for multimodal AI vision input.
 */
async function readFileAsBase64(
    file: File
): Promise<{ base64: string; mimeType: string; sizeBytes: number }> {
    const isImage = file.type.startsWith('image/');
    const needsCompression = isImage && file.size > COMPRESSION_CONFIG.compressAboveBytes;

    if (needsCompression) {
        try {
            return await compressImageToJpeg(file);
        } catch (err) {
            console.warn('[FileUpload] Compression failed, using original:', err);
        }
    }

    // No compression path
    const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const comma = result.indexOf(',');
            resolve(comma === -1 ? '' : result.slice(comma + 1));
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });

    return {
        base64,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
    };
}

// ============================================================================
// HOOK
// ============================================================================

export function useFileUpload(options: UseFileUploadOptions = {}): UseFileUploadReturn {
    const {
        maxFileSize = DEFAULT_MAX_SIZE,
        maxFiles = DEFAULT_MAX_FILES,
        allowedTypes = DEFAULT_ALLOWED_TYPES,
        bucketName = BUCKET_NAME,
        onUploadComplete,
        onUploadError,
    } = options;

    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [isDragActive, setIsDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragCounterRef = useRef(0);

    // Cleanup blob URLs on unmount
    useEffect(() => {
        return () => {
            attachments.forEach((att) => {
                if (att.previewUrl) {
                    URL.revokeObjectURL(att.previewUrl);
                }
            });
        };
    }, []);

    // ============================================================================
    // UPLOAD TO SUPABASE
    // ============================================================================

    const uploadToStorage = useCallback(async (attachment: Attachment): Promise<Attachment> => {
        try {
            // Generate unique path: timestamp_randomid_filename
            const timestamp = Date.now();
            const safeFileName = attachment.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
            const storagePath = `uploads/${timestamp}_${attachment.id.slice(0, 8)}_${safeFileName}`;

            // Upload to Supabase Storage
            const { error: uploadError } = await supabase.storage
                .from(bucketName)
                .upload(storagePath, attachment.file, {
                    cacheControl: '3600',
                    upsert: false,
                });

            if (uploadError) {
                throw uploadError;
            }

            // Get public URL
            const { data: urlData } = supabase.storage
                .from(bucketName)
                .getPublicUrl(storagePath);

            return {
                ...attachment,
                isUploading: false,
                uploadProgress: 100,
                storagePath,
                publicUrl: urlData.publicUrl,
            };
        } catch (error: any) {
            console.error('[useFileUpload] Upload error:', error);
            return {
                ...attachment,
                isUploading: false,
                uploadError: error.message || 'Upload failed',
            };
        }
    }, [bucketName]);

    // ============================================================================
    // ADD FILES
    // ============================================================================

    const addFiles = useCallback((files: FileList | File[]) => {
        const fileArray = Array.from(files);
        const currentCount = attachments.length;

        // Validate and process each file
        const newAttachments: Attachment[] = [];

        for (const file of fileArray) {
            // Check max files limit
            if (currentCount + newAttachments.length >= maxFiles) {
                console.warn(`[useFileUpload] Max files limit (${maxFiles}) reached`);
                break;
            }

            // Check file size
            if (file.size > maxFileSize) {
                console.warn(`[useFileUpload] File too large: ${file.name} (${formatFileSize(file.size)})`);
                onUploadError?.(`File too large: ${formatFileSize(file.size)}. Max: ${formatFileSize(maxFileSize)}`, file);
                continue;
            }

            // Check file type
            if (!isAllowedType(file, allowedTypes)) {
                console.warn(`[useFileUpload] Unsupported file type: ${file.type}`);
                onUploadError?.(`Unsupported file type: ${file.type || file.name.split('.').pop()}`, file);
                continue;
            }

            // Deduplicate by name + size
            const isDuplicate = attachments.some(
                (att) => att.fileName === file.name && att.fileSize === file.size
            ) || newAttachments.some(
                (att) => att.fileName === file.name && att.fileSize === file.size
            );

            if (isDuplicate) {
                console.warn(`[useFileUpload] Duplicate file ignored: ${file.name}`);
                continue;
            }

            // Create preview URL for images
            const previewUrl = file.type.startsWith('image/')
                ? URL.createObjectURL(file)
                : null;

            const attachment: Attachment = {
                id: generateId(),
                file,
                previewUrl,
                mimeType: file.type,
                fileName: file.name,
                fileSize: file.size,
                isUploading: true,
                uploadProgress: 0,
                uploadError: null,
                storagePath: null,
                publicUrl: null,
                base64Data: null, // Will be populated async for images
            };

            newAttachments.push(attachment);
        }

        if (newAttachments.length === 0) return;

        // Add to state immediately (optimistic)
        setAttachments((prev) => [...prev, ...newAttachments]);

        // Supported mimeTypes for AI document understanding
        const AI_READABLE_TYPES = [
            'image/',           // All image types
            'application/pdf',  // PDFs
            'text/plain',       // Plain text
            'text/csv',         // CSV files
        ];

        const isAIReadable = (mimeType: string): boolean => {
            return AI_READABLE_TYPES.some(type =>
                type.endsWith('/') ? mimeType.startsWith(type) : mimeType === type
            );
        };

        // Process each file: upload + read base64 for AI-readable files
        for (const attachment of newAttachments) {
            // Read base64 for AI-readable files (parallel with upload)
            if (isAIReadable(attachment.mimeType)) {
                readFileAsBase64(attachment.file).then((result) => {
                    setAttachments((prev) =>
                        prev.map((att) => (att.id === attachment.id
                            ? {
                                ...att,
                                base64Data: result.base64,
                                // Update mimeType if compression changed it (e.g., PNG → JPEG)
                                mimeType: result.mimeType
                            }
                            : att))
                    );
                }).catch((err) => {
                    console.warn('[useFileUpload] Failed to read base64:', err);
                });
            }

            // Upload to storage
            uploadToStorage(attachment).then((updated) => {
                setAttachments((prev) =>
                    prev.map((att) => (att.id === updated.id ? { ...updated, base64Data: att.base64Data } : att))
                );

                if (updated.uploadError) {
                    onUploadError?.(updated.uploadError, attachment.file);
                } else {
                    onUploadComplete?.(updated);
                }
            });
        }
    }, [attachments, maxFiles, maxFileSize, allowedTypes, uploadToStorage, onUploadComplete, onUploadError]);

    // ============================================================================
    // REMOVE FILE
    // ============================================================================

    const removeFile = useCallback((id: string) => {
        setAttachments((prev) => {
            const attachment = prev.find((att) => att.id === id);
            if (attachment?.previewUrl) {
                URL.revokeObjectURL(attachment.previewUrl);
            }
            return prev.filter((att) => att.id !== id);
        });
    }, []);

    // ============================================================================
    // CLEAR ALL
    // ============================================================================

    const clearAll = useCallback(() => {
        attachments.forEach((att) => {
            if (att.previewUrl) {
                URL.revokeObjectURL(att.previewUrl);
            }
        });
        setAttachments([]);
    }, [attachments]);

    // ============================================================================
    // DRAG & DROP HANDLERS
    // ============================================================================

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragActive(true);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        dragCounterRef.current = 0;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            addFiles(e.dataTransfer.files);
        }
    }, [addFiles]);

    // ============================================================================
    // PASTE HANDLER
    // ============================================================================

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const files: File[] = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) {
                    files.push(file);
                }
            }
        }

        if (files.length > 0) {
            e.preventDefault();
            addFiles(files);
        }
    }, [addFiles]);

    // ============================================================================
    // FILE INPUT TRIGGER
    // ============================================================================

    const triggerFileSelect = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    // ============================================================================
    // COMPUTED VALUES
    // ============================================================================

    const isUploading = attachments.some((att) => att.isUploading);

    // AI-readable mimeTypes that require base64 processing
    const AI_READABLE_PREFIXES = ['image/', 'application/pdf', 'text/plain', 'text/csv'];

    const isAIReadableMime = (mimeType: string): boolean => {
        return AI_READABLE_PREFIXES.some(prefix =>
            prefix.endsWith('/') ? mimeType.startsWith(prefix) : mimeType === prefix
        );
    };

    // Check if any AI-readable files are missing base64 (still processing)
    const isProcessing = attachments.some(
        (att) => isAIReadableMime(att.mimeType) && !att.base64Data
    );

    // ============================================================================
    // RETURN
    // ============================================================================

    return {
        attachments,
        isDragActive,
        isUploading,
        isProcessing,
        addFiles,
        removeFile,
        clearAll,
        dragHandlers: {
            onDragEnter: handleDragEnter,
            onDragOver: handleDragOver,
            onDragLeave: handleDragLeave,
            onDrop: handleDrop,
        },
        handlePaste,
        fileInputRef,
        triggerFileSelect,
    };
}

export default useFileUpload;
