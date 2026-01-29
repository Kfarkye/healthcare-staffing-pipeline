// Re-export shared types and add legacy compatibility
export type { Prospect, Click, PayPackage } from '../shared/types/database';
import type { Prospect } from '../shared/types/database';
export type { ToastState, SortConfig, FilterState } from '../shared/types/index';

// Legacy type aliases for backward compatibility
export type ProspectStatus = 'New' | 'Contacted' | 'Interested' | 'Profile Updates' | 'Submittal Ready' | 'Submitted' | 'Not Interested' | 'Archived' | 'Exited';

export interface ExtractedData {
    name: string;
    email: string | null;
    facility: string;
    specialty: string;
    city: string;
    state: string;
    startDate: string | null;
    endDate: string | null;
    shiftType: string;
    weeklyHours: number;
    taxableRate: number;
    weeklyStipend: number;
    grossWeeklyPay: number;
    jobId: string | null;
    candidateId: string | null;
    contractType: 'New' | 'Extension';
}

export type ModalType = 'addProspect' | 'edit' | 'emailTemplate' | 'profileUpdate' | 'extractor' | 'outreach' | 'reassignment';


export interface CertJob {
    title?: string;
    specialty?: string;
    profession?: string;
    state?: string;
    extras?: string[];
}

export interface EmailTemplate {
    id: string;
    name: string;
    description: string;
    icon: React.ElementType;
    generate: (prospect: Prospect, extractedData?: ExtractedData | null) => {
        subject: string;
        body: string;
        htmlBody: string;
    };
}