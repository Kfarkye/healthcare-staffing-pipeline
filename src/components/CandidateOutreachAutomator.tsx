import React, { useState, useEffect, useMemo, useRef } from 'react';

// =====================================================================================
// ENVIRONMENT & CONFIGURATION
// =====================================================================================
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Missing Supabase environment variables');
}

// =====================================================================================
// CONSTANTS
// =====================================================================================
const JOB_CONFIG = {
  facility: 'Rush University Medical Center',
  location: 'Chicago, IL',
  shifts: '5x8s – Day Shift (40 hours/week)',
  pay: '$24.90/hr',
  specialty: 'Medical Assistant',
  ccEmail: 'Tiffany.Chavez@ayahealthcare.com',
  recruiterName: 'Kofi Farkye',
  recruiterTitle: 'Senior Recruiter, Aya Healthcare'
} as const;

const TABLE_NAME = 'Rush_Medical_MA_Candidates';

const STATUS_STYLES = {
  parsed: 'bg-gray-50 text-gray-700 border-gray-200',
  email_generated: 'bg-blue-50 text-blue-700 border-blue-200',
  email_sent: 'bg-green-50 text-green-700 border-green-200',
  responded: 'bg-purple-50 text-purple-700 border-purple-200'
} as const;

// Nova base URL for profiles
const NOVA_BASE_URL = 'https://nova.ayahealthcare.com';

// =====================================================================================
// TYPE DEFINITIONS
// =====================================================================================
type CandidateStatus = 'parsed' | 'email_generated' | 'email_sent' | 'responded';
type TabType = 'upload' | 'candidates' | 'analytics';

interface Candidate {
  id?: string;
  novaCandidateId?: string;
  novaProfileUrl?: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  certifications: string[];
  experienceYears: number;
  status?: CandidateStatus;
  lastContact?: Date;
}

interface GeneratedEmail {
  candidateId?: string;
  firstName: string;
  email: string;
  subject: string;
  body: string;
  mailto: string;
  novaProfileUrl?: string;
}

interface ProcessingStats {
  totalProcessed: number;
  matched: number;
  skipped: number;
  saved: number;
}

interface PipelineStats {
  totalCandidates: number;
  emailsGenerated: number;
  emailsSent: number;
  responses: number;
}

// =====================================================================================
// SUPABASE CLIENT
// =====================================================================================
class SimpleSupabase {
  private url: string;
  private key: string;
  private baseHeaders: Record<string, string>;

  constructor(url: string, key: string) {
    this.url = url.replace(/\/$/, '');
    this.key = key;
    this.baseHeaders = {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Prefer: 'return=representation',
    };
  }

  async query(path: string, init?: RequestInit) {
    const res = await fetch(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...this.baseHeaders, ...(init?.headers || {}) },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Supabase ${res.status}: ${res.statusText} ${text}`);
    }

    if (res.status === 204) return null;
    return await res.json();
  }

  insert<T = any>(table: string, rows: T | T[]) {
    return this.query(table, { method: 'POST', body: JSON.stringify(rows) });
  }

  select<T = any>(table: string, filters = ''): Promise<T[]> {
    return this.query(`${table}${filters}`);
  }

  update<T = any>(table: string, patch: Partial<T>, filters: string) {
    return this.query(`${table}${filters}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  upsert<T = any>(table: string, rows: T | T[]) {
    return this.query(table, {
      method: 'POST',
      body: JSON.stringify(rows),
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' }
    });
  }
}

const supabase = new SimpleSupabase(SUPABASE_URL, SUPABASE_ANON_KEY);

// =====================================================================================
// UTILITY FUNCTIONS
// =====================================================================================
const formatters = {
  date: (iso: string): string => {
    const d = new Date(iso + 'T00:00:00');
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(d);
  },

  dateTime: (date: Date): string => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  }
};

const emailUtils = {
  buildOutlookDeepLink: (to: string, subject: string, body: string, cc?: string): string => {
    const encode = (s: string) => encodeURIComponent(s ?? '');
    return `https://outlook.office.com/mail/deeplink/compose?to=${encode(to)}${cc ? `&cc=${encode(cc)}` : ''}&subject=${encode(subject)}&body=${encode(body)}`;
  },

  exportToCSV: (emails: GeneratedEmail[]): void => {
    if (!emails.length) return;

    const rows = emails.map(e => ({
      first_name: e.firstName,
      email: e.email,
      subject: e.subject,
      body: e.body.replace(/\n/g, ' '),
      nova_profile: e.novaProfileUrl || ''
    }));

    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${(r[h as keyof typeof r] ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `candidate_emails_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

// Nova utilities
const novaUtils = {
  extractCandidateId: (href: string): string => {
    // Extract candidate ID from href like "/candidates/12345/"
    const match = href.match(/\/candidates\/(\d+)/);
    return match ? match[1] : '';
  },

  buildFullUrl: (path: string): string => {
    // Convert relative path to full URL
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return `${NOVA_BASE_URL}${path}`;
  }
};

// =====================================================================================
// OUTREACH SKIP LOGIC
// =====================================================================================
const outreachLogic = {
  normalizeName: (s?: string | null): string =>
    (s || '').trim().replace(/\s+/g, ' ').toLowerCase(),

  isPerDiem: (name: string): boolean =>
    /\bpd$/i.test(name.trim()),

  extractOwner: (row: Element): string => {
    const selectors = [
      '.cdk-column-travelRecruiterFirstName a',
      '.cdk-column-perDiemRecruiterFirstName a',
      '.cdk-column-recruiterFirstName a'
    ];

    for (const selector of selectors) {
      const elements = row.querySelectorAll(selector);
      if (elements.length > 0) {
        return (elements[elements.length - 1].textContent || '').trim();
      }
    }
    return '';
  },

  extractLastNoteAuthor: (row: Element): string => {
    const lastNoteCell = row.querySelector('.cdk-column-lastNoteDate, .cdk-column-lastNote');
    if (lastNoteCell) {
      const authorDiv = lastNoteCell.querySelector('div.app-table-row:nth-child(2), div:nth-child(2)');
      if (authorDiv?.textContent) {
        return authorDiv.textContent.trim();
      }
    }
    return '';
  },

  shouldSkipOutreach: (row: Element): boolean => {
    const owner = outreachLogic.extractOwner(row);
    const lastAuthor = outreachLogic.extractLastNoteAuthor(row);

    if (!owner || !lastAuthor) return false;
    if (outreachLogic.isPerDiem(owner)) return false;

    return outreachLogic.normalizeName(owner) === outreachLogic.normalizeName(lastAuthor);
  }
};

// =====================================================================================
// EMAIL TEMPLATE
// =====================================================================================
const createEmailBody = (firstName: string, dates: string): string => {
  const startDate = dates.split(' – ')[0];

  return `Hi ${firstName},

I wanted to connect about a local Medical Assistant contract at Rush University Medical Center in Chicago, IL. It's a high-paying local role at one of the city's most respected hospitals — a great opportunity if you're nearby.

Facility: ${JOB_CONFIG.facility}
Location: ${JOB_CONFIG.location}
Assignment Dates: ${dates}
Shifts & Hours: ${JOB_CONFIG.shifts}
Pay: ${JOB_CONFIG.pay}

To move forward, could you confirm:
• Are you within commuting distance and able to start ${startDate}?
• Any time-off requests during the contract?
• Is your Aya profile current (work history, certifications, skills checklist)?

Once I have that, I can move your file forward quickly with the facility.

Thank you!`;
};

// =====================================================================================
// UI COMPONENTS
// =====================================================================================
const LoadingSpinner: React.FC = () => (
  <svg className="w-4 h-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

interface TabButtonProps {
  id: TabType;
  label: string;
  isActive: boolean;
  onClick: (id: TabType) => void;
  count?: number;
}

const TabButton: React.FC<TabButtonProps> = ({ id, label, isActive, onClick, count }) => (
  <button
    onClick={() => onClick(id)}
    className={`relative px-1 pb-4 text-sm font-medium transition-all ${isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
      }`}
  >
    <span className="flex items-center gap-2">
      {label}
      {count !== undefined && (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isActive ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
          }`}>
          {count}
        </span>
      )}
    </span>
    <span className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all ${isActive ? 'bg-gray-900' : 'bg-transparent'
      }`} />
  </button>
);

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, trend }) => (
  <div className="relative overflow-hidden bg-white rounded-xl border border-gray-200 p-6 hover:shadow-sm transition-shadow">
    <div className="absolute top-0 right-0 w-32 h-32 transform translate-x-8 -translate-y-8">
      <div className="w-full h-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-full opacity-20" />
    </div>
    <div className="relative">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-gray-900">{value}</p>
      {trend && <p className="mt-1 text-xs text-gray-500">{trend}</p>}
    </div>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const className = STATUS_STYLES[status as keyof typeof STATUS_STYLES] || STATUS_STYLES.parsed;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

// Nova Profile Link Button Component
const NovaProfileButton: React.FC<{ url?: string }> = ({ url }) => {
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:text-blue-700 transition-colors"
      title="View in Nova"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
      Nova Profile
    </a>
  );
};

// =====================================================================================
// MAIN COMPONENT
// =====================================================================================
export default function CandidateOutreachAutomator() {
  // State Management
  const [activeTab, setActiveTab] = useState<TabType>('upload');
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [certification, setCertification] = useState('CertMedAs');
  const [experience, setExperience] = useState(2);
  const [startDate, setStartDate] = useState('2025-10-13');
  const [endDate, setEndDate] = useState('2026-01-10');

  // Processing State
  const [status, setStatus] = useState<'idle' | 'parsing' | 'saving' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [processingStats, setProcessingStats] = useState<ProcessingStats | null>(null);

  // Data State
  const [filteredCandidates, setFilteredCandidates] = useState<Candidate[]>([]);
  const [savedCandidates, setSavedCandidates] = useState<Candidate[]>([]);
  const [generatedEmails, setGeneratedEmails] = useState<GeneratedEmail[]>([]);
  const [stats, setStats] = useState<PipelineStats>({
    totalCandidates: 0,
    emailsGenerated: 0,
    emailsSent: 0,
    responses: 0
  });

  // UI State
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [sentIndices, setSentIndices] = useState<Set<number>>(new Set());

  // Computed Values - Updated Subject Format
  const emailSubject = useMemo(() =>
    `MA Assignment – ${JOB_CONFIG.facility} | ${JOB_CONFIG.pay}`,
    []);

  // Effects
  useEffect(() => {
    loadSavedCandidates();
  }, []);

  // Database Operations
  const loadSavedCandidates = async () => {
    try {
      const data = await supabase.select<any>(TABLE_NAME, '?order=created_at.desc');
      const formatted: Candidate[] = (data || []).map((c: any) => ({
        id: c.id,
        novaCandidateId: c.nova_candidate_id,
        novaProfileUrl: c.nova_profile_url,
        name: `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim(),
        firstName: c.first_name ?? '',
        lastName: c.last_name ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
        certifications: c.certifications ?? [],
        experienceYears: c.experience_years ?? 0,
        lastContact: c.last_contact ? new Date(c.last_contact) : undefined,
        status: c.status ?? 'parsed',
      }));
      setSavedCandidates(formatted);
      updateStats(formatted);
    } catch (e: any) {
      console.error('Failed to load candidates:', e?.message || e);
    }
  };

  const saveCandidates = async (cands: Candidate[]) => {
    try {
      const rows = cands.map(c => ({
        nova_candidate_id: c.novaCandidateId || null,
        nova_profile_url: c.novaProfileUrl || null,
        first_name: c.firstName,
        last_name: c.lastName,
        email: c.email,
        phone: c.phone || null,
        certifications: c.certifications,
        experience_years: c.experienceYears,
        status: 'email_generated'
      }));

      const saved = await supabase.upsert(TABLE_NAME, rows);
      await loadSavedCandidates();

      return cands.map(c => {
        const dbRecord = saved?.find((s: any) => s.email === c.email);
        return {
          ...c,
          id: dbRecord?.id,
          novaCandidateId: dbRecord?.nova_candidate_id,
          novaProfileUrl: dbRecord?.nova_profile_url
        };
      });
    } catch (e: any) {
      console.error('Save error:', e?.message || e);
      return cands;
    }
  };

  const markEmailAsSent = async (email: GeneratedEmail, index: number) => {
    setSentIndices(prev => new Set([...prev, index]));

    if (!email.candidateId) return;
    try {
      await supabase.update(
        TABLE_NAME,
        { last_contact: new Date().toISOString(), status: 'email_sent' },
        `?id=eq.${email.candidateId}`
      );
      await loadSavedCandidates();
    } catch (e: any) {
      console.error('Update error:', e?.message || e);
    }
  };

  // Stats Management
  const updateStats = (candidates: Candidate[]) => {
    setStats({
      totalCandidates: candidates.length,
      emailsGenerated: candidates.filter(c =>
        ['email_generated', 'email_sent', 'responded'].includes(c.status || '')
      ).length,
      emailsSent: candidates.filter(c =>
        ['email_sent', 'responded'].includes(c.status || '')
      ).length,
      responses: candidates.filter(c => c.status === 'responded').length
    });
  };

  // File Handling
  const processFile = (file: File | null | undefined) => {
    setStatus('idle');
    setGeneratedEmails([]);
    setFilteredCandidates([]);
    setProcessingStats(null);

    if (file && file.type === 'text/html') {
      setHtmlFile(file);
      setErrorMessage('');
    } else if (file) {
      setHtmlFile(null);
      setErrorMessage('Please upload a valid HTML file (not PDF or other formats).');
      setStatus('error');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    processFile(file);
  };

  // HTML Parsing with Nova Profile Extraction
  const parseHTML = (html: string): { candidates: Candidate[], stats: ProcessingStats } => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rows = doc.querySelectorAll('mat-row.results-row');

    if (!rows.length) {
      throw new Error('No candidate rows found. Please ensure this is a valid Nova export.');
    }

    const matches: Candidate[] = [];
    let totalProcessed = 0;
    let skippedCount = 0;
    let matchedCount = 0;

    rows.forEach((row) => {
      totalProcessed++;

      // Extract name and Nova profile link
      const nameAnchor = row.querySelector('.cdk-column-firstName a') as HTMLAnchorElement | null;
      const nameText = (nameAnchor?.textContent || '').trim();
      const novaHref = nameAnchor?.getAttribute('href') || '';
      const novaCandidateId = novaUtils.extractCandidateId(novaHref);
      const novaProfileUrl = novaHref ? novaUtils.buildFullUrl(novaHref) : '';

      // Extract other fields
      const emailElement = row.querySelector('.cdk-column-email a') as HTMLAnchorElement | null;
      const email = (emailElement?.textContent || '').trim();
      const phoneRaw = (row.querySelector('.cdk-column-phone span')?.textContent || '').trim();
      const phone = phoneRaw.replace(/[\s-]/g, '');
      const expertiseText = (row.querySelector('.cdk-column-expertise')?.textContent || '').trim();

      if (!nameText || !email) return;

      const [firstName, ...rest] = nameText.split(' ');
      const lastName = rest.join(' ');

      const specialties = expertiseText.split(',').map(s => s.trim()).filter(Boolean);
      let matched = false;
      let maxExp = 0;
      const certs: string[] = [];

      for (const s of specialties) {
        const m = s.match(/(\w+)\((\d+)\)/);
        if (!m) continue;
        const cert = m[1];
        const yrs = parseInt(m[2], 10);
        certs.push(cert);
        maxExp = Math.max(maxExp, yrs);
        if (cert === certification && yrs >= experience) matched = true;
      }

      if (matched) {
        matchedCount++;

        if (outreachLogic.shouldSkipOutreach(row)) {
          skippedCount++;
          return;
        }

        matches.push({
          novaCandidateId,
          novaProfileUrl,
          name: nameText,
          firstName,
          lastName,
          email,
          phone,
          certifications: certs,
          experienceYears: maxExp,
          status: 'parsed'
        });
      }
    });

    const stats = {
      totalProcessed,
      matched: matchedCount,
      skipped: skippedCount,
      saved: matches.length
    };

    if (!matches.length) {
      const msg = skippedCount > 0
        ? `All ${skippedCount} matching candidates were skipped due to recent outreach.`
        : `No candidates found with ${certification} certification and ${experience}+ years experience.`;
      throw new Error(msg);
    }

    return { candidates: matches, stats };
  };

  // Email Generation with Nova URLs
  const generateEmails = (cands: Candidate[]) => {
    const dates = `${formatters.date(startDate)} – ${formatters.date(endDate)}`;
    const emails: GeneratedEmail[] = cands.map(c => {
      const body = createEmailBody(c.firstName, dates);
      return {
        candidateId: c.id,
        firstName: c.firstName,
        email: c.email,
        subject: emailSubject,
        body,
        mailto: emailUtils.buildOutlookDeepLink(c.email, emailSubject, body, JOB_CONFIG.ccEmail),
        novaProfileUrl: c.novaProfileUrl
      };
    });
    setGeneratedEmails(emails);
    setSentIndices(new Set());
  };

  // Action Handlers
  const handleParseAndGenerate = async () => {
    if (!htmlFile) {
      setErrorMessage('Please select an HTML file first.');
      setStatus('error');
      return;
    }

    setStatus('parsing');
    setGeneratedEmails([]);

    try {
      const text = await htmlFile.text();
      const { candidates, stats } = parseHTML(text);
      setFilteredCandidates(candidates);
      setProcessingStats(stats);

      setStatus('saving');
      const saved = await saveCandidates(candidates);
      generateEmails(saved);
      setStatus('success');
    } catch (e: any) {
      setErrorMessage(e?.message || 'Failed to process file');
      setStatus('error');
    }
  };

  const handleSendEmail = (email: GeneratedEmail, index: number) => {
    window.open(email.mailto, '_blank');
    markEmailAsSent(email, index);
  };

  const copyEmailDetails = (email: GeneratedEmail, index: number) => {
    const emailContent = `To: ${email.email}\nCC: ${JOB_CONFIG.ccEmail}\nSubject: ${email.subject}\n\n${email.body}`;
    navigator.clipboard.writeText(emailContent).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  };

  // Render
  return (
    <div className="min-h-screen bg-gray-50 antialiased">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Candidate Outreach</h1>
                <p className="mt-1 text-sm text-gray-500">{JOB_CONFIG.facility}</p>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Total Pipeline</p>
                  <p className="text-2xl font-semibold text-gray-900 tabular-nums">{stats.totalCandidates}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Success Rate</p>
                  <p className="text-2xl font-semibold text-gray-900 tabular-nums">
                    {stats.emailsSent > 0 ? `${Math.round((stats.responses / stats.emailsSent) * 100)}%` : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <nav className="flex gap-8">
            <TabButton
              id="upload"
              label="Upload & Generate"
              isActive={activeTab === 'upload'}
              onClick={setActiveTab}
            />
            <TabButton
              id="candidates"
              label="Candidates"
              isActive={activeTab === 'candidates'}
              onClick={setActiveTab}
              count={savedCandidates.length || undefined}
            />
            <TabButton
              id="analytics"
              label="Analytics"
              isActive={activeTab === 'analytics'}
              onClick={setActiveTab}
            />
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="px-8 py-6 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Import Configuration</h2>
                <p className="mt-1 text-sm text-gray-500">Upload Nova HTML export and configure filters</p>
              </div>

              <div className="px-8 py-6 space-y-6">
                {/* File Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Nova HTML Export
                  </label>
                  <div
                    className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${isDragging
                        ? 'border-blue-400 bg-blue-50'
                        : htmlFile
                          ? 'border-green-300 bg-green-50'
                          : 'border-gray-300 hover:border-gray-400 bg-white'
                      }`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <input
                      ref={fileInputRef}
                      id="file"
                      type="file"
                      accept=".html"
                      onChange={handleFileChange}
                      className="sr-only"
                    />

                    {htmlFile ? (
                      <div className="space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100">
                          <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <p className="text-sm font-medium text-gray-900">{htmlFile.name}</p>
                        <p className="text-xs text-gray-500">{(htmlFile.size / 1024).toFixed(1)} KB</p>
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="text-sm text-blue-600 hover:text-blue-500 font-medium"
                        >
                          Change file
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100">
                          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                        </div>
                        <div>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="text-sm font-medium text-blue-600 hover:text-blue-500"
                          >
                            Choose file
                          </button>
                          <span className="text-sm text-gray-500"> or drag and drop</span>
                        </div>
                        <p className="text-xs text-gray-400">HTML files only</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Filter Grid */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="cert" className="block text-sm font-medium text-gray-700 mb-2">
                      Certification Code
                    </label>
                    <input
                      id="cert"
                      type="text"
                      value={certification}
                      onChange={e => setCertification(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      placeholder="e.g., CertMedAs"
                    />
                  </div>
                  <div>
                    <label htmlFor="exp" className="block text-sm font-medium text-gray-700 mb-2">
                      Minimum Experience
                    </label>
                    <div className="relative">
                      <input
                        id="exp"
                        type="number"
                        value={experience}
                        onChange={e => setExperience(Number(e.target.value))}
                        className="w-full px-4 py-2.5 pr-12 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        min="0"
                        max="50"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">
                        years
                      </span>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="start" className="block text-sm font-medium text-gray-700 mb-2">
                      Assignment Start
                    </label>
                    <input
                      id="start"
                      type="date"
                      value={startDate}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label htmlFor="end" className="block text-sm font-medium text-gray-700 mb-2">
                      Assignment End
                    </label>
                    <input
                      id="end"
                      type="date"
                      value={endDate}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Action Button */}
                <div className="pt-2">
                  <button
                    onClick={handleParseAndGenerate}
                    disabled={!htmlFile || status === 'parsing' || status === 'saving'}
                    className="w-full py-3 px-4 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all"
                  >
                    {status === 'parsing' ? (
                      <span className="flex items-center justify-center gap-2">
                        <LoadingSpinner />
                        Parsing HTML...
                      </span>
                    ) : status === 'saving' ? (
                      <span className="flex items-center justify-center gap-2">
                        <LoadingSpinner />
                        Saving to Database...
                      </span>
                    ) : 'Generate Outreach Emails'}
                  </button>
                </div>
              </div>
            </div>

            {/* Processing Stats */}
            {processingStats && status === 'success' && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 text-sm text-blue-800">
                    <p className="font-medium">Processing complete</p>
                    <p className="mt-1">
                      Processed {processingStats.totalProcessed} candidates •
                      {' '}{processingStats.matched} matched filters •
                      {' '}{processingStats.skipped > 0 && `${processingStats.skipped} skipped • `}
                      {processingStats.saved} ready for outreach
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {status === 'error' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-800">Error processing file</p>
                    <p className="mt-1 text-sm text-red-700">{errorMessage}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Generated Emails */}
            {status === 'success' && generatedEmails.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">Generated Emails</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {generatedEmails.length} {generatedEmails.length === 1 ? 'candidate' : 'candidates'} ready for outreach
                    </p>
                  </div>
                  <button
                    onClick={() => emailUtils.exportToCSV(generatedEmails)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Export CSV
                  </button>
                </div>

                <div className="grid gap-4">
                  {generatedEmails.map((email, idx) => (
                    <div
                      key={idx}
                      className={`bg-white rounded-lg border transition-all ${sentIndices.has(idx)
                          ? 'border-green-200 shadow-sm'
                          : 'border-gray-200 hover:shadow-sm'
                        }`}
                    >
                      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 text-sm font-medium text-gray-700">
                            {email.firstName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">{email.firstName}</p>
                            <p className="text-sm text-gray-500">{email.email}</p>
                          </div>
                          {sentIndices.has(idx) && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                              </svg>
                              Sent
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <NovaProfileButton url={email.novaProfileUrl} />
                          <button
                            onClick={() => copyEmailDetails(email, idx)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-all ${copiedIndex === idx
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                            title="Copy full email details"
                          >
                            {copiedIndex === idx ? (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Copied
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                </svg>
                                Copy All
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleSendEmail(email, idx)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            Open in Email
                          </button>
                        </div>
                      </div>
                      <div className="px-6 py-4">
                        <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">{email.body}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Candidates Tab */}
        {activeTab === 'candidates' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="px-8 py-6 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">All Candidates</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    {savedCandidates.length} {savedCandidates.length === 1 ? 'candidate' : 'candidates'} in database
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Auto-refreshes after actions</span>
                </div>
              </div>
            </div>

            {savedCandidates.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Qualifications</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Contact</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {savedCandidates.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-xs font-medium text-gray-700">
                              {c.firstName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{c.name}</p>
                              {c.novaCandidateId && (
                                <p className="text-xs text-gray-500">ID: {c.novaCandidateId}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900">{c.email}</p>
                          <p className="text-sm text-gray-500">{c.phone || '—'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900">{c.certifications.join(', ') || '—'}</p>
                          <p className="text-sm text-gray-500">{c.experienceYears} years exp</p>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={c.status || 'parsed'} />
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {c.lastContact ? formatters.dateTime(c.lastContact) : '—'}
                        </td>
                        <td className="px-6 py-4">
                          <NovaProfileButton url={c.novaProfileUrl} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-8 py-12 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 mb-4">
                  <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-900 mb-1">No candidates yet</p>
                <p className="text-sm text-gray-500 mb-4">Upload and parse an HTML file to get started</p>
                <button
                  onClick={() => setActiveTab('upload')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Go to Upload
                </button>
              </div>
            )}
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Candidates"
                value={stats.totalCandidates}
              />
              <StatCard
                label="Emails Generated"
                value={stats.emailsGenerated}
                trend={`${Math.round((stats.emailsGenerated / Math.max(stats.totalCandidates, 1)) * 100)}% of total`}
              />
              <StatCard
                label="Emails Sent"
                value={stats.emailsSent}
                trend={`${Math.round((stats.emailsSent / Math.max(stats.emailsGenerated, 1)) * 100)}% of generated`}
              />
              <StatCard
                label="Response Rate"
                value={stats.emailsSent > 0 ? `${Math.round((stats.responses / stats.emailsSent) * 100)}%` : '—'}
                trend={stats.responses > 0 ? `${stats.responses} responses` : 'No responses yet'}
              />
            </div>

            {/* Pipeline Visualization */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-8">Recruitment Pipeline</h3>
              <div className="space-y-6">
                {[
                  { label: 'Candidates Added', value: stats.totalCandidates, color: 'bg-gray-500', percentage: 100 },
                  { label: 'Emails Generated', value: stats.emailsGenerated, color: 'bg-blue-500', percentage: Math.round((stats.emailsGenerated / Math.max(stats.totalCandidates, 1)) * 100) },
                  { label: 'Emails Sent', value: stats.emailsSent, color: 'bg-green-500', percentage: Math.round((stats.emailsSent / Math.max(stats.totalCandidates, 1)) * 100) },
                  { label: 'Responded', value: stats.responses, color: 'bg-purple-500', percentage: Math.round((stats.responses / Math.max(stats.totalCandidates, 1)) * 100) }
                ].map((stage) => (
                  <div key={stage.label}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">{stage.label}</span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">
                        {stage.value} ({stage.percentage}%)
                      </span>
                    </div>
                    <div className="relative">
                      <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`${stage.color} h-full rounded-full transition-all duration-700 ease-out`}
                          style={{ width: `${stage.percentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {stats.totalCandidates === 0 && (
                <div className="mt-8 text-center py-8 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">No data available yet</p>
                  <p className="text-xs text-gray-400 mt-1">Upload candidates to see analytics</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}