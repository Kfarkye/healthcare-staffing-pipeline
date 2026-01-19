import { 
    Users, Target, TrendingUp, CheckCircle, FileEdit, Send, Archive 
} from 'lucide-react';
import { ProspectStatus, CertJob } from '../types/prospects';

export const APP_CONFIG = {
    URLS: {
        NOVA_BASE: 'https://nova.ayahealthcare.com/#/recruiting/candidates',
        OUTLOOK_COMPOSE: 'https://outlook.office.com/mail/deeplink/compose',
    },
    EMAIL: {
        REASSIGNMENT: 'reassignments@ayahealthcare.com',
    },
    UI: {
        TOAST_DURATION: 4000,
        DEBOUNCE_DELAY: 300,
    }
} as const;

// This is the full list of all possible statuses a prospect can have.
// It will be used to configure the drag-and-drop context.
export const ALL_PROSPECT_STATUSES = [
    'New',
    'Contacted',
    'Interested',
    'Profile Updates',
    'Submittal Ready',
    'Submitted',
    'Exited'
];

// ✅ -- THIS IS THE KEY CHANGE -- ✅
// This new array defines ONLY the columns you want to see on the main dashboard.
export const VISIBLE_KANBAN_COLUMNS = [
    'New',
    'Contacted',
    'Interested',
    'Profile Updates',
    'Submittal Ready'
];

export const STATUS_CONFIG = {
    'New': { icon: Target, color: 'text-gray-500' },
    'Contacted': { icon: Users, color: 'text-blue-500' },
    'Interested': { icon: TrendingUp, color: 'text-emerald-500' },
    'Profile Updates': { icon: FileEdit, color: 'text-amber-500' },
    'Submittal Ready': { icon: CheckCircle, color: 'text-teal-500' },
    'Submitted': { icon: Send, color: 'text-purple-500' },
    'Exited': { icon: Archive, color: 'text-slate-400' }
};

export const CERT_MAP: Array<{
    test: (job: CertJob) => boolean;
    build: (job: CertJob) => string;
}> = [
    // GI / Endoscopy Tech
    {
        test: (j) =>
            /\bGI\b|Endoscopy|Gastro/i.test(j.title || "") ||
            /\bGI\b|Endoscopy|Gastro/i.test(j.specialty || ""),
        build: () => "GI/Endoscopy certification (SGNA)",
    },
    // ICU RN
    {
        test: (j) => 
            /(^|\W)rn(\W|$)/i.test(j.profession || j.title || "") &&
            /icu|intensive care|critical care/i.test(j.specialty || j.title || ""),
        build: () => "RN license, BLS, ACLS, and CCRN (preferred)",
    },
    // ED/ER RN
    {
        test: (j) => 
            /(^|\W)rn(\W|$)/i.test(j.profession || j.title || "") &&
            /(emergency|ed(\W|$)|er(\W|$))/i.test(j.specialty || j.title || ""),
        build: () => "RN license, BLS, ACLS, PALS, and TNCC (preferred)",
    },
    // L&D RN
    {
        test: (j) => 
            /(^|\W)rn(\W|$)/i.test(j.profession || j.title || "") &&
            /(labor|l&d|delivery|ob(\W|$)|obstetric)/i.test(j.specialty || j.title || ""),
        build: () => "RN license, BLS, ACLS, NRP, and EFM certification",
    },
    // NICU RN
    {
        test: (j) => 
            /(^|\W)rn(\W|$)/i.test(j.profession || j.title || "") &&
            /nicu|neonatal/i.test(j.specialty || j.title || ""),
        build: () => "RN license, BLS, PALS, NRP",
    },
    // PICU RN
    {
        test: (j) => 
            /(^|\W)rn(\W|$)/i.test(j.profession || j.title || "") &&
            /picu|pediatric icu/i.test(j.specialty || j.title || ""),
        build: () => "RN license, BLS, PALS",
    },
    // OR RN
    {
        test: (j) => 
            /(^|\W)rn(\W|$)/i.test(j.profession || j.title || "") &&
            /(^|\W)or(\W|$)|operating room|periop/i.test(j.specialty || j.title || ""),
        build: () => "RN license, BLS, ACLS, and CNOR (preferred)",
    },
    // Cath Lab RN
    {
        test: (j) => 
            /(^|\W)rn(\W|$)/i.test(j.profession || j.title || "") &&
            /cath|cardiac cath/i.test(j.specialty || j.title || ""),
        build: () => "RN license, BLS, ACLS, and RCIS (preferred)",
    },
    // General RN
    {
        test: (j) => /(^|\W)rn(\W|$)/i.test(j.profession || j.title || ""),
        build: (j) => {
            const base = ["RN license", "BLS", "ACLS"];
            const addl = (j.extras || []).filter(Boolean);
            const all = [...base, ...addl];
            return all.join(", ");
        },
    },
    // CNA
    {
        test: (j) => /(^|\W)cna(\W|$)/i.test(j.profession || j.title || ""),
        build: (j) => `CNA certification for ${j.state || "the assignment state"}`,
    },
    // MRI Tech
    {
        test: (j) =>
            /(^|\W)mri(\W|$)/i.test(j.profession || j.title || j.specialty || ""),
        build: () => "ARRT (MR) and state license",
    },
    // CT Tech
    {
        test: (j) =>
            /(^|\W)ct(\W|$)|computed tomography/i.test(j.profession || j.title || j.specialty || ""),
        build: () => "ARRT (CT) and state license",
    },
    // Rad Tech
    {
        test: (j) =>
            /rad tech|x[-\s]?ray|radiologic/i.test(
                j.profession || j.title || j.specialty || ""
            ),
        build: () => "ARRT and state license",
    },
    // Respiratory Therapist
    {
        test: (j) =>
            /respiratory|rt(\W|$)/i.test(j.profession || j.title || j.specialty || ""),
        build: () => "RRT (NBRC) and state license",
    },
    // Surgical Tech
    {
        test: (j) =>
            /surgical tech|cst|tst|scrub/i.test(
                j.profession || j.title || j.specialty || ""
            ),
        build: () => "NBSTSA (CST) or NCCT (TS-C)",
    },
    // Pharmacy Tech
    {
        test: (j) => /pharm/i.test(j.profession || j.title || j.specialty || ""),
        build: () => "PTCB or ExCPT and state license",
    },
    // Dietitian
    {
        test: (j) => /dietitian|rd(\W|$)/i.test(j.profession || j.title || ""),
        build: () => "State RD/LD license",
    },
    // LCSW
    {
        test: (j) => /lcsw/i.test(j.profession || j.title || ""),
        build: () => "State LCSW license",
    },
    // PT
    {
        test: (j) => /(^|\W)(pt|physical therapist)(\W|$)/i.test(j.profession || j.title || ""),
        build: () => "State PT license",
    },
    // OT
    {
        test: (j) => /(^|\W)(ot|occupational therapist)(\W|$)/i.test(j.profession || j.title || ""),
        build: () => "State OT license",
    },
    // SLP
    {
        test: (j) => /(^|\W)(slp|speech)(\W|$)/i.test(j.profession || j.title || ""),
        build: () => "State SLP license (ASHA CCC if required)",
    },
    // Fallback
    {
        test: () => true,
        build: () => "current role-appropriate license/certification(s)",
    },
];