// ============================================================================
// Extension Extraction Service - Production Version with Direct Base64
// FIXED: Now passes all extracted fields through to component
// ============================================================================

import { supabase } from '../lib/supabase';

export interface ExtensionRequestData {
  candidateName: string;
  facility: string;
  specialty: string;
  currentShift: string;
  currentBillRate: string;
  contractEndDate: string;
  proposedStartDate: string;
  proposedEndDate: string;
  proposedDates: string;
  timeOffDates?: string[];
  localStatus?: string;
  accountManager?: string;
  accountCoordinator?: string;
  // Alias fields for compatibility
  billRate?: string;
  shift?: string;
  rate?: string;
  extensionDates?: string;
  rto?: string;
  timeOff?: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const EDGE_FUNCTION_TIMEOUT = 45000;

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

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

const pendingRequests = new Map<string, Promise<any>>();

const deduplicate = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
  if (pendingRequests.has(key)) {
    return pendingRequests.get(key) as Promise<T>;
  }

  const promise = fn().finally(() => {
    pendingRequests.delete(key);
  });

  pendingRequests.set(key, promise);
  return promise;
};

class ExtensionExtractionServiceClass {
  async extractFromImage(file: File): Promise<ExtensionRequestData> {
    validateFile(file);

    const fileKey = `extension-${file.name}-${file.size}-${file.lastModified}`;
    return deduplicate(fileKey, async () => {
      const traceId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      try {
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );

        console.log(`[ExtensionExtractionService] File size: ${(arrayBuffer.byteLength / 1024).toFixed(1)}KB`);

        const { data: sessionRes, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) {
          console.warn('[ExtensionExtractionService] getSession warning:', sessErr?.message);
        }
        const accessToken = sessionRes?.session?.access_token ?? '';

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT);

        try {
          const { data, error: fnErr } = await supabase.functions.invoke('extension-request-extraction', {
            headers: {
              ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
            body: {
              base64Data,
              mimeType: file.type,
              traceId,
            },
            signal: controller.signal,
          });

          if (fnErr) {
            console.error('[ExtensionExtractionService] Edge function error:', fnErr);

            if (fnErr.message?.includes('FunctionsHttpError')) {
              throw new Error('Extension extraction service temporarily unavailable. Try again shortly.');
            }
            if (fnErr.message?.includes('timeout')) {
              throw new Error('Processing took too long. Try with a smaller/clearer image.');
            }
            throw new Error('Failed to process extension request screenshot. Please try again.');
          }

          if (!data) {
            throw new Error('No data extracted. Ensure screenshot shows extension request details clearly.');
          }

          // FIXED: Now passes ALL fields through instead of just 5
          const cleaned: ExtensionRequestData = {
            candidateName: data.candidateName?.trim() || '',
            facility: data.facility?.trim() || '',
            specialty: data.specialty?.trim() || '',
            currentShift: data.currentShift?.trim() || '',
            currentBillRate: data.currentBillRate?.trim() || '',
            contractEndDate: data.contractEndDate?.trim() || '',
            proposedStartDate: data.proposedStartDate?.trim() || '',
            proposedEndDate: data.proposedEndDate?.trim() || '',
            proposedDates: data.proposedDates?.trim() || '',
            timeOffDates: data.timeOffDates || [],
            localStatus: data.localStatus?.trim() || '',
            accountManager: data.accountManager?.trim() || '',
            accountCoordinator: data.accountCoordinator?.trim() || '',
            // Include alias fields too
            billRate: data.billRate?.trim() || '',
            shift: data.shift?.trim() || '',
            rate: data.rate?.trim() || '',
            extensionDates: data.extensionDates?.trim() || '',
            rto: data.rto?.trim() || '',
            timeOff: data.timeOff?.trim() || '',
          };

          console.log('[ExtensionExtractionService] Extracted data:', {
            billRate: cleaned.currentBillRate || 'NOT FOUND',
            proposedDates: cleaned.proposedDates || 'NOT FOUND',
            specialty: cleaned.specialty || 'NOT FOUND'
          });

          return cleaned;
        } finally {
          clearTimeout(timeoutId);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          throw new Error('Processing took too long. Please try again with a clearer screenshot.');
        }

        throw new Error(err?.message || 'Failed to extract extension request data from screenshot');
      }
    });
  }

  async extractFromStorage(filePath: string): Promise<ExtensionRequestData> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT);

    try {
      const { data: sessionRes } = await supabase.auth.getSession();
      const accessToken = sessionRes?.session?.access_token ?? '';

      const { data, error: fnErr } = await supabase.functions.invoke('extension-request-extraction', {
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: { filePath },
        signal: controller.signal,
      });

      if (fnErr) {
        throw new Error('Failed to process extension request from storage. Please try again.');
      }

      if (!data) {
        throw new Error('No data extracted from stored file.');
      }

      // FIXED: Return all fields for storage extraction too
      return {
        candidateName: data.candidateName?.trim() || '',
        facility: data.facility?.trim() || '',
        specialty: data.specialty?.trim() || '',
        currentShift: data.currentShift?.trim() || '',
        currentBillRate: data.currentBillRate?.trim() || '',
        contractEndDate: data.contractEndDate?.trim() || '',
        proposedStartDate: data.proposedStartDate?.trim() || '',
        proposedEndDate: data.proposedEndDate?.trim() || '',
        proposedDates: data.proposedDates?.trim() || '',
        timeOffDates: data.timeOffDates || [],
        localStatus: data.localStatus?.trim() || '',
        accountManager: data.accountManager?.trim() || '',
        accountCoordinator: data.accountCoordinator?.trim() || '',
        billRate: data.billRate?.trim() || '',
        shift: data.shift?.trim() || '',
        rate: data.rate?.trim() || '',
        extensionDates: data.extensionDates?.trim() || '',
        rto: data.rto?.trim() || '',
        timeOff: data.timeOff?.trim() || '',
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export const ExtensionExtractionService = new ExtensionExtractionServiceClass();

export async function extractExtensionRequestFromImage(file: File): Promise<ExtensionRequestData> {
  return ExtensionExtractionService.extractFromImage(file);
}

export async function extractExtensionRequestFromStorage(filePath: string): Promise<ExtensionRequestData> {
  return ExtensionExtractionService.extractFromStorage(filePath);
}