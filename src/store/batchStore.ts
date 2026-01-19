import { create } from 'zustand';
import { ExtractedOfferData } from '../services/extractionService';

// ============================================================================
// TYPES (Copied from your component)
// ============================================================================

export interface BatchItem {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  extractedData?: ExtractedOfferData;
  error?: string;
  customEmail?: { subject: string; body: string };
}

// ============================================================================
// STORE DEFINITION
// ============================================================================

interface BatchState {
  batchItems: BatchItem[];
  currentItemIndex: number;
  addBatchItems: (files: FileList) => void;
  updateBatchItem: (id: string, updates: Partial<BatchItem>) => void;
  processChunk: (chunk: BatchItem[]) => void;
  setCurrentItemIndex: (index: number) => void;
  clearAll: () => void;
}

export const useBatchStore = create<BatchState>((set, get) => ({
  // --- STATE ---
  batchItems: [],
  currentItemIndex: 0,

  // --- ACTIONS ---

  // Adds new files to the batch
  addBatchItems: (files) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const newItem: BatchItem = {
            id: `batch-${Date.now()}-${i}`,
            file,
            preview: e.target?.result as string,
            status: 'pending',
          };
          set(state => ({ batchItems: [...state.batchItems, newItem] }));
        };
        reader.readAsDataURL(file);
      }
    }
  },

  // Updates a single item in the batch (e.g., to set its status or add data)
  updateBatchItem: (id, updates) => {
    set(state => ({
      batchItems: state.batchItems.map(item =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  },
  
  // A helper to mark a chunk of items as 'processing'
  processChunk: (chunk) => {
    const chunkIds = new Set(chunk.map(c => c.id));
    set(state => ({
        batchItems: state.batchItems.map(item => 
            chunkIds.has(item.id) ? { ...item, status: 'processing' } : item
        )
    }));
  },

  // Sets the currently viewed item in the UI
  setCurrentItemIndex: (index) => set({ currentItemIndex: index }),

  // Clears the entire state
  clearAll: () => set({ batchItems: [], currentItemIndex: 0 }),
}));