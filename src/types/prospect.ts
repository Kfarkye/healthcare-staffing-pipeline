// src/types/prospect.ts
// RE-EXPORTS from the single source of truth
// This file exists for backwards compatibility - prefer importing from '@/shared/types/database'

export {
  type Prospect,
  type ProspectStatus,
  type KanbanStatus,
  type ArchiveStatus,
  type ExitStatus,
  type Toast,
  type ModalType,
  type ColumnDefinition,
  KANBAN_STATUSES,
  ARCHIVE_STATUSES,
  EXIT_STATUSES,
} from '../shared/types/database';

// Legacy type aliases for backwards compatibility
export type VisibleColumnId = 'New' | 'Contacted' | 'Responded' | 'Final Updates';
export type ArchiveStatusId = 'Submittal Ready' | 'Not Interested';
export type StatusId = VisibleColumnId | ArchiveStatusId;

// Stats interface (local to this file, not shared)
export interface Stats {
  total: number;
  ready: number;
  submittalReady: number;
  notInterested: number;
}
