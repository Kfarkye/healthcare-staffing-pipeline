// ============================================================================
// src/services/extractionService.ts
// Production Ready - Direct Base64 Processing (No Storage)
// Design: Apple × Stripe × Vercel
// Updated: Aligned with latest prospects schema
// ============================================================================

import { supabase } from '../lib/supabase';

// ============================================================================
// TYPES - Aligned with Database Schema
// ============================================================================

export interface ExtractedProspectData {
  candidate_id: number | null;
  nova_url: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  profession: string | null;
  specialty: string | null;
  home_state: string | null;
  state: string | null; // Job state fallback
  years_experience: number | null;
  certifications: string | null;
  preferred_units: string | null;
  shift_preference: string | null;
  notes: string | null;
}

export interface ExtractedOfferData {
  name: string;
  email: string;
  facility: string;
  city: string;
  state: string;
  shiftType: string;
  weeklyHours: number;
  startDate: string | null;
  endDate: string | null;
  taxableRate: number;
  weeklyStipend: number;
  grossWeeklyPay: number;
  specialty: string;
  jobId: string | null;
  candidateId: string | null;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const EDGE_FUNCTION_TIMEOUT = 45000; // 45s for Gemini processing
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

// ============================================================================
// UTILS
// ============================================================================

export const generateNovaUrl = (candidateId: number): string =>
  `https://nova.ayahealthcare.com/#/recruiting/candidates/${candidateId}/new-profile/about`;

const validateFile = (file: File): void => {
  if (!file) throw new Error('No file provided');
  if (file.size === 0) throw new Error('File is empty');

  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    throw new Error(`File too large: ${sizeMB}MB (max 10MB)`);
  }

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Unsupported file type. Please upload a PNG, JPG, or WebP image.');
  }
};

const likelyNovaId = (n: number | null | undefined): boolean =>
  typeof n === 'number' && n > 100_000 && n < 99_999_999;

// ============================================================================
// REQUEST DEDUPLICATION
// ============================================================================

const pendingRequests = new Map<string, Promise<any>>();

const deduplicate = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  if (pendingRequests.has(key)) {
    console.log('[ExtractionService] Returning cached request for:', key);
    return pendingRequests.get(key) as Promise<T>;
  }

  const promise = fn().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
};

// ============================================================================
// SERVICE
// ============================================================================

class ExtractionServiceClass {
  /**
   * Extract prospect data from Nova screenshot
   * Uses direct base64 transfer to bypass storage timeouts
   * Returns data aligned with prospects schema
   */
  async extractDataFromImage(file: File): Promise<ExtractedProspectData> {
    // Validate file first
    validateFile(file);

    // Create unique key for deduplication
    const fileKey = `${file.name}-${file.size}-${file.lastModified}-${file.type}`;

    return deduplicate(fileKey, async () => {
      const traceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      try {
        console.log(`[ExtractionService] Starting extraction - TraceId: ${traceId}`);
        console.log(`[ExtractionService] File: ${file.name} (${(file.size / 1024).toFixed(1)}KB)`);

        // Convert file directly to base64 (skip storage entirely)
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ''
          )
        );

        console.log(`[ExtractionService] Converted to base64: ${(base64.length / 1024).toFixed(1)}KB`);

        // Get session token
        const { data: sessionRes, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) {
          console.warn('[ExtractionService] getSession warning:', sessErr?.message);
        }
        const accessToken = sessionRes?.session?.access_token ?? '';

        // Set up timeout controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT);

        try {
          console.log('[ExtractionService] Calling edge function...');

          const { data, error: fnErr } = await supabase.functions.invoke('process-screenshot', {
            headers: {
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: {
              base64Data: base64,
              mimeType: file.type,
              traceId,
            },
            signal: controller.signal,
          } as any);

          if (fnErr) {
            console.error('[ExtractionService] Edge function error:', fnErr);

            if (fnErr.message?.includes('FunctionsHttpError')) {
              throw new Error('Processing service temporarily unavailable. Try again shortly.');
            }
            if (fnErr.message?.includes('timeout') || fnErr.message?.includes('AbortError')) {
              throw new Error('Processing took too long. Try with a smaller/clearer image.');
            }
            throw new Error(fnErr.message || 'Failed to process screenshot. Please try again.');
          }

          if (!data) {
            throw new Error('No data extracted. Ensure screenshot shows candidate details clearly.');
          }

          console.log('[ExtractionService] Raw response:', data);

          // Normalize and validate response
          return this.normalizeProspectData(data);

        } finally {
          clearTimeout(timeoutId);
        }

      } catch (err: any) {
        if (err?.name === 'AbortError') {
          throw new Error('Processing took too long. Please try again with a clearer screenshot.');
        }

        console.error('[ExtractionService] Error:', err);
        throw new Error(err?.message || 'Failed to extract data from screenshot');
      }
    });
  }

  /**
   * Normalize raw extraction response to match schema exactly
   */
  private normalizeProspectData(raw: any): ExtractedProspectData {
    // Validate candidate ID
    const candidateId = raw.candidate_id && likelyNovaId(raw.candidate_id)
      ? Number(raw.candidate_id)
      : null;

    // Generate Nova URL if we have a valid candidate ID
    const nova_url = candidateId ? generateNovaUrl(candidateId) : null;

    // Validate email format if present
    let email = raw.email ? String(raw.email).toLowerCase().trim() : null;
    if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      console.warn('[ExtractionService] Invalid email format:', email);
      email = null;
    }

    // Validate home_state format (should be 2-letter code)
    let home_state = raw.home_state ? String(raw.home_state).toUpperCase().trim() : null;
    if (home_state && home_state.length !== 2) {
      console.warn('[ExtractionService] Invalid state format:', home_state);
      home_state = null;
    }

    // Safely extract years_experience
    const years_experience = Number.isFinite(Number(raw.years_experience))
      ? Number(raw.years_experience)
      : null;

    const cleaned: ExtractedProspectData = {
      candidate_id: candidateId,
      nova_url,
      name: raw.name?.trim() || null,
      email,
      phone: raw.phone?.trim() || null,
      profession: raw.profession?.trim() || null,
      specialty: raw.specialty?.trim() || null,
      home_state,
      state: raw.state?.trim() || null,
      years_experience,
      certifications: raw.certifications?.trim() || null,
      preferred_units: raw.preferred_units?.trim() || null,
      shift_preference: raw.shift_preference?.trim() || null,
      notes: raw.notes?.trim() || null,
    };

    console.log('[ExtractionService] Normalized data:', cleaned);

    return cleaned;
  }

  /**
   * Extract offer data from assignment documents
   * Note: Still uses storage for larger files to avoid payload size limits
   */
  async extractDataFromAssignmentFile(file: File): Promise<ExtractedOfferData> {
    validateFile(file);

    const fileKey = `offer-${file.name}-${file.size}-${file.lastModified}`;

    return deduplicate(fileKey, async () => {
      // For offer files, we keep storage upload since these can be larger/PDFs
      const ts = Date.now();
      const cleanFileName = file.name.replace(/[^\w.\-]+/g, '_').toLowerCase();
      const filePath = `temp/offers/${ts}-${cleanFileName}`;

      try {
        console.log('[ExtractionService] Uploading offer file to storage:', filePath);

        const { error: uploadError } = await supabase.storage
          .from('screenshots')
          .upload(filePath, file, { upsert: false, cacheControl: '3600' });

        if (uploadError) {
          throw new Error('Failed to upload file. Please check your connection.');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT);

        try {
          const { data: sessionRes } = await supabase.auth.getSession();
          const accessToken = sessionRes?.session?.access_token ?? '';

          console.log('[ExtractionService] Calling extract-offer-data edge function...');

          const { data, error: fnErr } = await supabase.functions.invoke('extract-offer-data', {
            headers: {
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: {
              filePath,
              fields: [
                'facility', 'city', 'state', 'shiftType',
                'weeklyHours', 'startDate', 'endDate',
                'taxableRate', 'weeklyStipend', 'grossWeeklyPay',
                'specialty', 'jobId', 'candidateId',
              ],
            },
            signal: controller.signal,
          } as any);

          if (fnErr) {
            throw new Error('Failed to process assignment file. Please try again.');
          }

          if (!data || !data.success) {
            throw new Error(data?.error || 'Failed to extract offer data from document.');
          }

          return this.normalizeOfferData(data.data);

        } finally {
          clearTimeout(timeoutId);

          // Cleanup uploaded file
          supabase.storage.from('screenshots')
            .remove([filePath])
            .catch(e => console.warn('[ExtractionService] Cleanup failed:', e));
        }

      } catch (err: any) {
        if (err?.name === 'AbortError') {
          throw new Error('Processing timeout. Please try with a smaller file.');
        }
        throw new Error(err?.message || 'Failed to extract assignment data');
      }
    });
  }

  /**
   * Normalize raw offer data into typed structure
   */
  private normalizeOfferData(raw: any): ExtractedOfferData {
    return {
      name: '',
      email: '',
      facility: raw?.facility?.trim() || '',
      city: raw?.city?.trim() || '',
      state: raw?.state ? String(raw.state).toUpperCase().trim() : '',
      shiftType: raw?.shiftType?.trim() || '',
      weeklyHours: typeof raw?.weeklyHours === 'number' ? raw.weeklyHours : 40,
      startDate: raw?.startDate || null,
      endDate: raw?.endDate || null,
      taxableRate: typeof raw?.taxableRate === 'number' ? raw.taxableRate : 0,
      weeklyStipend: typeof raw?.weeklyStipend === 'number' ? raw.weeklyStipend : 0,
      grossWeeklyPay: typeof raw?.grossWeeklyPay === 'number' ? raw.grossWeeklyPay : 0,
      specialty: raw?.specialty?.trim() || '',
      jobId: raw?.jobId?.trim() || null,
      candidateId: raw?.candidateId?.trim() || null,
    };
  }
}

// ============================================================================
// EXPORT SINGLETON
// ============================================================================

export const ExtractionService = new ExtractionServiceClass();