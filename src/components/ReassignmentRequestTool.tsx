import React, { useState, useCallback, useEffect } from 'react';
import { Upload, Copy, CheckCircle, Loader2, X, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Mock Prospect Type if not globally available
type Prospect = {
    id: number;
    name: string;
    email: string | null;
    // Add other fields if needed by the tool
};

// ============================================================================
// API & EMAIL LOGIC
// ============================================================================
const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

async function extractCandidateInfo(imageData: string) {
    const base64Data = imageData.split(',')[1];
    const prompt = `Extract from this Nova screenshot: Candidate's full name, email address, and Nova profile URL. Return ONLY JSON: {"full_name": "","email": "","nova_url": ""}`;

    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: base64Data } }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
        })
    });

    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(text);
}

function generateReassignmentEmail(candidateInfo: { full_name: string, email: string | null, nova_url: string }) {
    const subject = `Please Reassign – ${candidateInfo.full_name}`;
    const body = `Hi Team,\n\nCan we please reassign ${candidateInfo.full_name}?\n\nEmail: ${candidateInfo.email || '[Email not found]'}\nNova Profile: ${candidateInfo.nova_url}\n\nThank you!`;
    const fullText = `Subject: ${subject}\n\n${body}`;
    return { subject, body, fullText };
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function ReassignmentRequestTool({
    isModalMode = false,
    initialProspect = null
}: {
    isModalMode?: boolean;
    initialProspect?: Prospect | null;
}) {
    const [imageData, setImageData] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [emailText, setEmailText] = useState('');
    const [emailSubject, setEmailSubject] = useState('');
    const [emailBody, setEmailBody] = useState('');
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (initialProspect) {
            const info = {
                full_name: initialProspect.name,
                email: initialProspect.email,
                nova_url: `https://nova.ayahealthcare.com/#/recruiting/candidates/${initialProspect.id}/new-profile/about`
            };
            const email = generateReassignmentEmail(info);
            setEmailText(email.fullText);
            setEmailSubject(email.subject);
            setEmailBody(email.body);
        }
    }, [initialProspect]);

    const handleFile = useCallback((file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            setImageData(e.target?.result as string);
            setError(null);
        };
        reader.readAsDataURL(file);
    }, []);

    const processScreenshot = async () => {
        if (!imageData) return;
        setLoading(true);
        setError(null);
        try {
            const info = await extractCandidateInfo(imageData);
            const email = generateReassignmentEmail(info);
            setEmailText(email.fullText);
            setEmailSubject(email.subject);
            setEmailBody(email.body);
        } catch (err: any) {
            setError(err.message || 'Failed to process screenshot');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(emailText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (isModalMode && initialProspect) {
        return (
            <div className="p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-2">Reassignment Request</h2>
                <p className="text-sm text-gray-600 mb-4">For <span className="font-semibold">{initialProspect.name}</span></p>
                <div className="bg-white rounded-lg">
                    <textarea value={emailText} onChange={(e) => setEmailText(e.target.value)} className="w-full h-48 p-3 border border-gray-200 rounded-lg font-mono text-sm bg-gray-50" />
                    <div className="flex justify-end gap-2 mt-4">
                        <a href={`https://outlook.office.com/mail/deeplink/compose?to=reassignments@ayahealthcare.com&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors">
                            <Mail className="w-4 h-4" /><span>Open in Outlook</span>
                        </a>
                        <button onClick={copyToClipboard} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                            {copied ? <><CheckCircle className="w-4 h-4 text-green-600" /><span className="text-green-600">Copied!</span></> : <><Copy className="w-4 h-4" /><span>Copy</span></>}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Standalone Tool UI
    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-2xl mx-auto">
                <h1 className="text-2xl font-bold text-gray-900 mb-6">Reassignment Request Tool</h1>
                {!imageData ? (
                    <div onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file?.type.startsWith('image/')) handleFile(file); }} onDragOver={(e) => e.preventDefault()} className="bg-white rounded-lg shadow-sm border-2 border-dashed border-gray-300 p-12 text-center">
                        <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                        <p className="text-gray-600 mb-4">Drop screenshot or paste with Ctrl+V</p>
                        <input type="file" accept="image/*" onChange={(e) => e.target.files && handleFile(e.target.files[0])} className="hidden" id="file-upload" />
                        <label htmlFor="file-upload" className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">Choose File</label>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-white rounded-lg shadow-sm p-4 relative">
                            <img src={imageData} alt="Screenshot" className="max-w-full h-auto rounded" style={{ maxHeight: '300px', margin: '0 auto' }} />
                            <button onClick={() => setImageData(null)} className="absolute top-2 right-2 p-1 bg-white rounded-full shadow-md"><X className="w-4 h-4" /></button>
                            {!emailText && <button onClick={processScreenshot} disabled={loading} className="mt-4 w-full py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50 flex items-center justify-center">{loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Processing...</> : 'Generate Reassignment Request'}</button>}
                        </div>
                        {error && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg">{error}</div>}
                        {emailText && (
                            <div className="p-0">
                                <textarea value={emailText} onChange={(e) => setEmailText(e.target.value)} className="w-full h-48 p-3 border border-gray-200 rounded-lg font-mono text-sm bg-gray-50" />
                                <div className="flex justify-end gap-2 mt-4">
                                    <a href={`https://outlook.office.com/mail/deeplink/compose?to=reassignments@ayahealthcare.com&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors">
                                        <Mail className="w-4 h-4" /><span>Open in Outlook</span>
                                    </a>
                                    <button onClick={copyToClipboard} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                                        {copied ? <><CheckCircle className="w-4 h-4 text-green-600" /><span className="text-green-600">Copied!</span></> : <><Copy className="w-4 h-4" /><span>Copy</span></>}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

