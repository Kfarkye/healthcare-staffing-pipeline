// SubmittalReplyGenerator.tsx
// Paste‑and‑go React component. Shows parsed submittal data (left) and auto‑generates
// an Outlook‑ready confirmation email (right) with one‑click Copy and Open in Outlook.
// Uses the refined structured "historyWithFacility" object you requested.

import React, { useMemo, useState } from 'react';

// -----------------------------
// Types
// -----------------------------
export type HistoryWithFacility = {
  workedBefore: boolean;
  lastWorkedDate: string | null; // e.g., "05/2023" or ISO date
  recruiterName: string | null;  // prior recruiter if any
};

export type SubmittalData = {
  candidateName: string;           // e.g., "Smith Vazquez"
  facility: string;                // e.g., "Piedmont Atlanta Hospital"
  startDate: string;               // e.g., "09/29/2025"
  rto: string;                     // e.g., "None" or "11/24 – 11/29"
  interviewRequired: 'Yes' | 'No' | 'Unknown';
  contractCleared: 'Yes' | 'No' | 'Unknown'; // cleared on posted length/shift and no schedule requests
  historyWithFacility: HistoryWithFacility;
  toEmail?: string;                // operations distro / AM email (optional)
  ccEmail?: string;                // default Tiffany
};

// -----------------------------
// Utils
// -----------------------------
function buildHistoryLine(facility: string, h: HistoryWithFacility): string {
  if (!h) return `History with ${facility}: —`;
  if (!h.workedBefore) return `History with ${facility}: Never worked for ${facility}`;
  const parts: string[] = [
    `History with ${facility}: Yes`,
  ];
  if (h.lastWorkedDate) parts.push(`last worked ${h.lastWorkedDate}`);
  if (h.recruiterName) parts.push(`(Recruiter: ${h.recruiterName})`);
  return parts.join(' ');
}

function mailtoHref(to: string, subject: string, body: string, cc?: string) {
  const params = new URLSearchParams();
  if (cc) params.set('cc', cc);
  params.set('subject', subject);
  params.set('body', body);
  return `mailto:${encodeURIComponent(to)}?${params.toString()}`;
}

// -----------------------------
// Component
// -----------------------------
const SubmittalReplyGenerator: React.FC<{
  initial?: Partial<SubmittalData>;
}> = ({ initial }) => {
  // Default data (can be fed by your parser)
  const [data, setData] = useState<SubmittalData>({
    candidateName: initial?.candidateName || 'Smith Vazquez',
    facility: initial?.facility || 'Piedmont Atlanta Hospital',
    startDate: initial?.startDate || '09/29/2025',
    rto: initial?.rto || 'None',
    interviewRequired: initial?.interviewRequired || 'No',
    contractCleared: initial?.contractCleared || 'Yes',
    historyWithFacility: initial?.historyWithFacility || {
      workedBefore: false,
      lastWorkedDate: null,
      recruiterName: null,
    },
    toEmail: initial?.toEmail || 'ops-team@ayahealthcare.com',
    ccEmail: initial?.ccEmail || 'Tiffany.Chavez@ayahealthcare.com',
  });

  const subject = useMemo(
    () => `Please Confirm – ${data.facility} Submission`,
    [data.facility]
  );

  const historyLine = useMemo(
    () => buildHistoryLine(data.facility, data.historyWithFacility),
    [data.facility, data.historyWithFacility]
  );

  const body = useMemo(() => {
    return (
`Hi Team,

Please confirm the following details for ${data.candidateName}'s submission to ${data.facility}:

• Start Date: ${data.startDate}
• Finalized RTO Dates: ${data.rto}
• Interview Required: ${data.interviewRequired}
• Contract/Shift Agreement: ${data.contractCleared}
• ${historyLine}

Thank you,
Kofi Farkye
Senior Recruiter, Aya Healthcare
CC: Tiffany Chavez`
    );
  }, [data, historyLine]);

  const mailto = useMemo(
    () => mailtoHref(data.toEmail || '', subject, body, data.ccEmail),
    [data.toEmail, subject, body, data.ccEmail]
  );

  const copy = async () => {
    await navigator.clipboard.writeText(body);
    alert('Email body copied to clipboard');
  };

  return (
    <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 p-6 sm:grid-cols-2 text-slate-800">
      {/* Left: Parsed Data Controls (optional edits) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Parsed Candidate Info</h2>
        <div className="mt-4 space-y-3 text-sm">
          <div className="grid grid-cols-3 items-center gap-2">
            <label className="text-slate-600">Candidate</label>
            <input className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5" value={data.candidateName} onChange={e=>setData({...data, candidateName: e.target.value})} />
          </div>
          <div className="grid grid-cols-3 items-center gap-2">
            <label className="text-slate-600">Facility</label>
            <input className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5" value={data.facility} onChange={e=>setData({...data, facility: e.target.value})} />
          </div>
          <div className="grid grid-cols-3 items-center gap-2">
            <label className="text-slate-600">Start Date</label>
            <input className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5" value={data.startDate} onChange={e=>setData({...data, startDate: e.target.value})} />
          </div>
          <div className="grid grid-cols-3 items-center gap-2">
            <label className="text-slate-600">RTO</label>
            <input className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5" value={data.rto} onChange={e=>setData({...data, rto: e.target.value})} />
          </div>
          <div className="grid grid-cols-3 items-center gap-2">
            <label className="text-slate-600">Interview Required</label>
            <select className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5" value={data.interviewRequired} onChange={e=>setData({...data, interviewRequired: e.target.value as any})}>
              <option>No</option>
              <option>Yes</option>
              <option>Unknown</option>
            </select>
          </div>
          <div className="grid grid-cols-3 items-center gap-2">
            <label className="text-slate-600">Contract Cleared</label>
            <select className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5" value={data.contractCleared} onChange={e=>setData({...data, contractCleared: e.target.value as any})}>
              <option>Yes</option>
              <option>No</option>
              <option>Unknown</option>
            </select>
          </div>

          {/* History With Facility */}
          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <div className="mb-2 text-sm font-medium">History With Facility</div>
            <div className="grid grid-cols-3 items-center gap-2">
              <label className="text-slate-600">Worked Before</label>
              <select className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5" value={String(data.historyWithFacility.workedBefore)} onChange={e=>setData({...data, historyWithFacility: {...data.historyWithFacility, workedBefore: e.target.value === 'true'}})}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div className="mt-2 grid grid-cols-3 items-center gap-2">
              <label className="text-slate-600">Last Worked</label>
              <input className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5" placeholder="MM/YYYY" value={data.historyWithFacility.lastWorkedDate || ''} onChange={e=>setData({...data, historyWithFacility: {...data.historyWithFacility, lastWorkedDate: e.target.value || null}})} />
            </div>
            <div className="mt-2 grid grid-cols-3 items-center gap-2">
              <label className="text-slate-600">Prior Recruiter</label>
              <input className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5" value={data.historyWithFacility.recruiterName || ''} onChange={e=>setData({...data, historyWithFacility: {...data.historyWithFacility, recruiterName: e.target.value || null}})} />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 items-center gap-2">
            <label className="text-slate-600">To (Ops)</label>
            <input className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5" value={data.toEmail} onChange={e=>setData({...data, toEmail: e.target.value})} />
          </div>
          <div className="grid grid-cols-3 items-center gap-2">
            <label className="text-slate-600">CC</label>
            <input className="col-span-2 rounded-md border border-slate-300 px-3 py-1.5" value={data.ccEmail} onChange={e=>setData({...data, ccEmail: e.target.value})} />
          </div>
        </div>
      </section>

      {/* Right: Generated Email */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Generated Email</h2>
        <div className="mt-2 text-sm text-slate-500">Subject</div>
        <div className="rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm">{subject}</div>

        <div className="mt-4 text-sm text-slate-500">Body</div>
        <textarea readOnly className="mt-1 h-72 w-full rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-[12px]" value={body} />

        <div className="mt-3 flex gap-2">
          <button onClick={copy} className="rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-black/90">Copy Body</button>
          <a href={mailto} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50">Open in Outlook</a>
        </div>
      </section>
    </div>
  );
};

export default SubmittalReplyGenerator;