import React, { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, Upload, FileText, CheckCircle, Zap, AlertTriangle } from 'lucide-react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
interface ExtractedCandidate {
  candidate_id: number;
  name: string;
  email: string | null;
  phone: string | null;
  recruiter: string | null;
  specialty: string | null;
  last_login_date: string | null;
  registration_date: string | null;
}

type SyncStatus = 'idle' | 'reading' | 'parsing' | 'saving' | 'success' | 'error';

// ============================================================================
// CONSTANTS & HELPERS
// ============================================================================
const EXTRACTION_PROMPT = `You are a specialized AI that parses HTML from a Nova "Search All Candidates Results" page. Analyze the provided HTML source and extract every candidate listed in the main table.

**Instructions:**
1.  The primary repeating element for each candidate is a \`<mat-row>\` tag.
2.  Within each row, data is in \`<mat-cell>\` tags with specific class names.
3.  For each row, extract the following:
    - **name**: From the cell with class "mat-column-firstName".
    - **candidate_id**: The numerical ID from the \`href\` attribute of the link around the name (e.g., ".../candidates/4734592/..." -> 4734592).
    - **email**: From the cell with class "mat-column-email".
    - **phone**: From the cell with class "mat-column-phone".
    - **recruiter**: From the cell with class "mat-column-travelRecruiterFirstName".
    - **specialty**: From the cell with class "mat-column-expertise".
    - **last_login_date**: From "mat-column-lastLoginDate".
    - **registration_date**: From "mat-column-registrationDateUtc".
4.  Return ONLY a clean JSON array of objects.

The final JSON output must be an array of objects, each following this exact structure:
[{
  "candidate_id": 1234567,
  "name": "string",
  "email": "string or null",
  "phone": "string or null",
  "recruiter": "string or null",
  "specialty": "string or null",
  "last_login_date": "YYYY-MM-DD HH:MM AM/PM format or null",
  "registration_date": "YYYY-MM-DD format or null"
}]`;

const formatDate = (dateStr: string | null): string | null => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return !isNaN(date.getTime()) ? date.toISOString() : null;
};

// ============================================================================
// UI COMPONENTS
// ============================================================================
const Toast: React.FC<{ message: string, type: 'success' | 'error', onDismiss: () => void }> = ({ message, type, onDismiss }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const colors = type === 'success'
    ? 'bg-green-100 text-green-800 border-green-200'
    : 'bg-red-100 text-red-800 border-red-200';
  const Icon = type === 'success' ? CheckCircle : AlertTriangle;

  return (
    <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg animate-in fade-in slide-in-from-top-4 duration-300 ${colors}`}>
      <Icon size={18} />
      <span className="text-sm font-medium">{message}</span>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function CandidateSync(): JSX.Element {
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.match(/\.html$/i)) {
        showToast('Please select an HTML file', 'error');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        showToast('File size must be less than 10MB', 'error');
        return;
      }
      setHtmlFile(file);
    }
  };

  const handleSync = useCallback(async () => {
    if (!htmlFile) {
      showToast('Please upload an HTML file first.', 'error');
      return;
    }
    setSyncStatus('reading');

    try {
      const htmlContent = await htmlFile.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");
      const tableBody = doc.querySelector('mat-table > tbody');

      if (!tableBody) {
        throw new Error("Could not find the candidate table in the HTML file.");
      }

      setSyncStatus('parsing');
      const cleanHtml = tableBody.outerHTML;

      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) throw new Error("API key not configured.");

      // Using Flash for speed and cost-efficiency
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{ parts: [{ text: EXTRACTION_PROMPT }, { text: cleanHtml }] }],
        generationConfig: { response_mime_type: "application/json" }
      };

      const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`AI service failed: ${response.statusText}`);

      const result = await response.json();
      const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!jsonText) throw new Error("AI did not return any data.");

      const extractedData: ExtractedCandidate[] = JSON.parse(jsonText);

      setSyncStatus('saving');
      const recordsToUpsert = extractedData.map(c => ({
        candidate_id: Number(c.candidate_id), // Ensure it's a number for the database
        name: c.name,
        email: c.email,
        phone: c.phone,
        recruiter: c.recruiter,
        specialty: c.specialty,
        last_login_date: formatDate(c.last_login_date),
        registration_date: formatDate(c.registration_date)
      }));

      const { error } = await supabase.from('candidates').upsert(recordsToUpsert, { onConflict: 'candidate_id' });

      if (error) throw error;

      setSyncStatus('success');
      showToast(`Successfully synced ${recordsToUpsert.length} candidates!`);
      setHtmlFile(null);
      setTimeout(() => setSyncStatus('idle'), 2000);

    } catch (err: any) {
      console.error("Sync Error:", err);
      showToast(`An error occurred: ${err.message}`, 'error');
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 4000);
    }
  }, [htmlFile]);

  const isLoading = ['reading', 'parsing', 'saving'].includes(syncStatus);
  const syncButtonText = {
    idle: 'Sync to Database',
    reading: 'Reading File...',
    parsing: 'Extracting Data...',
    saving: 'Saving to DB...',
    success: 'Sync Complete!',
    error: 'Sync Failed'
  }[syncStatus];

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
      <div className="max-w-xl w-full bg-white rounded-xl shadow-lg border border-gray-200 p-8 space-y-8">
        <div className="text-center">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900">Candidate Search Sync</h1>
          <p className="mt-2 text-gray-600">
            Upload your "Search All Candidates" HTML file to sync records to the database.
          </p>
        </div>

        <div>
          <input id="html-upload" type="file" ref={fileInputRef} className="sr-only" accept=".html" onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer"
          >
            <Upload size={40} className="mx-auto text-gray-400 mb-3" />
            <h3 className="text-md font-semibold text-gray-700">
              {htmlFile ? 'File Selected:' : 'Upload HTML File'}
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {htmlFile ? htmlFile.name : 'Drag and drop, or click to browse'}
            </p>
          </button>
        </div>

        <button
          onClick={handleSync}
          disabled={!htmlFile || isLoading}
          className="w-full bg-gray-900 text-white font-semibold py-3 px-6 rounded-lg flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors disabled:bg-gray-300"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : syncStatus === 'success' ? <CheckCircle size={18} /> : <Zap size={16} />}
          {syncButtonText}
        </button>
      </div>
    </div>
  );
}