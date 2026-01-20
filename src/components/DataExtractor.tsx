import React, { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useToast, useCopyToClipboard } from '../shared/hooks';
import {
  Loader2, CheckCircle, AlertCircle,
  Upload, Mail, Copy, FileImage, Send, Eye, EyeOff,
  Edit2, X, ExternalLink, Download
} from 'lucide-react';

// ============================================================================
// TYPES
// ============================================================================

interface ExtractedOfferData {
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
}

// ============================================================================
// EMAIL CONFIGURATION
// ============================================================================
const EMAIL_CONFIG = {
  outlookUrl: 'https://outlook.office.com/mail/deeplink/compose'
};

// ============================================================================
// OUTLOOK INTEGRATION SERVICE
// ============================================================================
class OutlookIntegrationService {
  static openInOutlookWeb(emailData: { to: string; subject: string; body: string }) {
    const outlookUrl = new URL(EMAIL_CONFIG.outlookUrl);
    outlookUrl.searchParams.append('to', emailData.to);
    outlookUrl.searchParams.append('subject', emailData.subject);
    outlookUrl.searchParams.append('body', emailData.body);

    const finalUrl = outlookUrl.toString().replace(/\+/g, '%20');
    window.open(finalUrl, '_blank');

    return true;
  }

  static downloadEMLFile(emailData: { to: string; subject: string; body: string; htmlBody?: string }, filename = 'outreach-email.eml') {
    const emlContent = `To: ${emailData.to}
Subject: ${emailData.subject}
Content-Type: text/html; charset=utf-8

${emailData.htmlBody || emailData.body.replace(/\n/g, '<br>')}`;

    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static async copyTextToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
  }
}

// ============================================================================
// TOAST COMPONENT
// ============================================================================

interface ToastProps {
  message: string;
  show: boolean;
  type?: 'success' | 'error' | 'info';
}

const Toast: React.FC<ToastProps> = ({ message, show, type = 'success' }) => {
  if (!show) return null;

  const styles = {
    success: { bg: 'bg-green-50', border: 'border-green-200', icon: 'text-green-600', text: 'text-green-900' },
    error: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600', text: 'text-red-900' },
    info: { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600', text: 'text-blue-900' },
  };

  const style = styles[type];
  const Icon = type === 'error' ? AlertCircle : CheckCircle;

  return (
    <div className="fixed top-6 right-6 z-50 animate-in slide-in-from-top-2 fade-in duration-200">
      <div className={`${style.bg} px-4 py-3 rounded-lg shadow-lg border ${style.border} flex items-center gap-3 max-w-md`}>
        <Icon size={20} className={style.icon} />
        <span className={`text-sm font-medium ${style.text}`}>{message}</span>
      </div>
    </div>
  );
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatDate = (dateString: string | null): string => {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString + 'T00:00:00');
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
};

const formatCurrency = (amount: number): string => {
  if (isNaN(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve((reader.result as string).split(',')[1]);
  reader.onerror = error => reject(error);
});

// ============================================================================
// EMAIL TEMPLATE GENERATOR
// ============================================================================

const generateEmailContent = (data: ExtractedOfferData) => {
  const datesLine = `Assignment Dates: ${formatDate(data.startDate)} – ${formatDate(data.endDate)}`;

  let subject = '';
  let payDetails = '';

  if (data.weeklyStipend > 0) {
    subject = `${data.specialty} Assignment – ${data.facility} | ${formatCurrency(data.grossWeeklyPay)}/week`;
    payDetails = `Pay Package:
Taxable Hourly Rate: ${formatCurrency(data.taxableRate)}
Meals & Housing Stipend: ${formatCurrency(data.weeklyStipend)}
Total Gross Weekly Pay: ${formatCurrency(data.grossWeeklyPay)}`;
  } else {
    subject = `${data.specialty} Assignment – ${data.facility}`;
    payDetails = `Hourly Rate: ${formatCurrency(data.taxableRate)}`;
  }

  const body = `Hi ${data.name.split(' ')[0]},

Thanks for your interest in the ${data.specialty} position at ${data.facility}. Here's the full breakdown — this looks like an excellent match for your background:

Facility: ${data.facility}
Location: ${data.city}, ${data.state}
${datesLine}
Shifts & Hours: ${data.shiftType} (${data.weeklyHours}/week)
${payDetails}

This role is moving quickly — I can get you submitted today if everything looks good.

To move forward, just confirm the following:
- Are you available to start ${formatDate(data.startDate)}?
- Do you have any time-off requests during the contract?
- Is your Aya profile current (work history, certs, skills checklist)?

Please let me know if you have any questions.

Thank you!`;

  const htmlBody = `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333;">
<p>Hi ${data.name.split(' ')[0]},</p>
<p>Thanks for your interest in the ${data.specialty} position at ${data.facility}. Here's the full breakdown — this looks like an excellent match for your background:</p>
<p><strong>Facility:</strong> ${data.facility}<br>
<strong>Location:</strong> ${data.city}, ${data.state}<br>
<strong>${datesLine}</strong><br>
<strong>Shifts & Hours:</strong> ${data.shiftType} (${data.weeklyHours}/week)</p>
<p><strong>${payDetails.replace(/\n/g, '<br>')}</strong></p>
<p>This role is moving quickly — I can get you submitted today if everything looks good.</p>
<p>To move forward, just confirm the following:</p>
<ul>
<li>Are you available to start ${formatDate(data.startDate)}?</li>
<li>Do you have any time-off requests during the contract?</li>
<li>Is your Aya profile current (work history, certs, skills checklist)?</li>
</ul>
<p>Please let me know if you have any questions.</p>
<p>Thank you!</p>
</div>`;

  return { subject, body, htmlBody };
};

// ============================================================================
// EXTRACTION PROMPT
// ============================================================================

const EXTRACTION_PROMPT = `You are an expert data extractor. Analyze the provided screenshot of a healthcare staffing margin calculator. Extract the specified fields and return them ONLY as a clean JSON object. Do not include any extra text, comments, or markdown formatting.

The JSON object must have this exact structure:
{
  "name": "string",
  "email": "email address if visible or null",
  "facility": "string",
  "specialty": "string",
  "city": "string",
  "state": "string (2-letter abbreviation)",
  "startDate": "YYYY-MM-DD format or null",
  "endDate": "YYYY-MM-DD format or null",
  "shiftType": "string (e.g., 'Day', 'Night')",
  "weeklyHours": number,
  "taxableRate": number,
  "weeklyStipend": number,
  "grossWeeklyPay": number,
  "jobId": "string or null",
  "candidateId": "string or null"
}

IMPORTANT FIELD INSTRUCTIONS:
- "startDate": Look for labels like 'Start Date', 'Start', or the first date in a range. If it says 'ASAP', return null.
- "endDate": Look for labels like 'End Date', 'End', or the second date in a date range.
- "taxableRate": Look for labels like "Taxable Hourly Rate", "Hourly Rate", "W2 Rate". If you cannot find it directly, YOU MUST CALCULATE IT using this formula: (grossWeeklyPay - weeklyStipend) / weeklyHours. The final value must be a number with two decimal places.`;

// ============================================================================
// MAIN COMPONENT - PROSPECT OUTREACH GENERATOR
// ============================================================================

export default function ProspectOutreachGenerator(): JSX.Element {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedOfferData | null>(null);
  const [editedData, setEditedData] = useState<ExtractedOfferData | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  const [showFullPreview, setShowFullPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast, showToast } = useToast();
  const { copyWithFeedback, copiedId } = useCopyToClipboard();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        showToast('File size must be less than 10MB', 'error');
        return;
      }

      setImageFile(file);
      setExtractedData(null);
      setEditedData(null);
      setIsEditing(false);

      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);

      showToast('Image uploaded successfully');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) {
      const event = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleFileChange(event);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await copyWithFeedback(text, fieldName);
      showToast('Copied to clipboard');
    } catch {
      showToast('Failed to copy', 'error');
    }
  };

  const copyEmailContent = async () => {
    if (!extractedData) return;
    const data = editedData || extractedData;
    const { subject, body } = generateEmailContent(data);
    const fullContent = `Subject: ${subject}\n\n${body}`;
    await copyToClipboard(fullContent, 'email');
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedData(JSON.parse(JSON.stringify(extractedData))); // Create a deep copy
  };

  const handleSaveEdit = () => {
    if (editedData) {
      setExtractedData(editedData);
      setIsEditing(false);
      showToastNotification('Data updated successfully');
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedData(null);
  };

  const handleFieldChange = (field: keyof ExtractedOfferData, value: any) => {
    if (editedData) {
      setEditedData({ ...editedData, [field]: value });
    }
  };

  const handleOpenInOutlook = () => {
    const data = editedData || extractedData;
    if (!data) return;

    const emailContent = generateEmailContent(data);
    const emailData = {
      to: data.email || '',
      subject: emailContent.subject,
      body: emailContent.body
    };

    OutlookIntegrationService.openInOutlookWeb(emailData);
    showToast('Opening in Outlook Web...');
  };

  const handleDownloadEmail = () => {
    const data = editedData || extractedData;
    if (!data) return;

    const emailContent = generateEmailContent(data);
    const emailData = {
      to: data.email || '',
      subject: emailContent.subject,
      body: emailContent.body,
      htmlBody: emailContent.htmlBody
    };

    const filename = `outreach-${data.name.replace(/\s+/g, '-').toLowerCase()}.eml`;
    OutlookIntegrationService.downloadEMLFile(emailData, filename);
    showToast('Email file downloaded successfully');
  };

  const processAndGenerate = async () => {
    if (!imageFile) {
      showToast('Please select a screenshot file first', 'error');
      return;
    }

    setIsLoading(true);

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("Gemini API key not configured. Check your .env file.");

      const base64Image = await fileToBase64(imageFile);
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`;
      const payload = {
        contents: [{
          parts: [
            { text: EXTRACTION_PROMPT },
            { inlineData: { mimeType: imageFile.type, data: base64Image } }
          ]
        }],
        generationConfig: { responseMimeType: "application/json" }
      };

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = await response.json();
        console.error("API Error Response:", errorBody);
        throw new Error(`API request failed: ${response.status} - ${errorBody.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) throw new Error("No content found in API response");

      const data: ExtractedOfferData = JSON.parse(textResponse);
      setExtractedData(data);

      const emailContent = generateEmailContent(data);

      if (data.jobId) {
        await supabase.from('outreach_templates').upsert({
          job_id: data.jobId,
          facility_name: data.facility,
          specialty: data.specialty,
          location: `${data.city}, ${data.state}`,
          gross_weekly_pay: data.grossWeeklyPay,
          email_subject: emailContent.subject,
          email_body: emailContent.body,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'job_id' });
      }

      if (data.candidateId && data.jobId) {
        // First, try to find existing engagement
        const { data: existingEngagement } = await supabase
          .from('engagements')
          .select('id')
          .eq('candidate_id', data.candidateId)
          .eq('job_id', data.jobId)
          .single();

        let engagementId = existingEngagement?.id;

        // If no existing engagement, create one
        if (!engagementId) {
          const { data: newEngagement, error: engagementError } = await supabase
            .from('engagements')
            .insert({
              candidate_id: data.candidateId,
              job_id: data.jobId,
              candidate_name: data.name,
              facility_name: data.facility,
              specialty: data.specialty,
              status: 'Prospect'
            })
            .select('id')
            .single();

          if (engagementError || !newEngagement) {
            throw new Error('Failed to create engagement record.');
          }
          engagementId = newEngagement.id;
        }

        // Log the action
        const { error: actionError } = await supabase
          .from('actions')
          .insert({
            engagement_id: engagementId,
            type: 'Outreach',
            content: emailContent.body,
            metadata: { subject: emailContent.subject }
          });

        if (actionError) {
          throw new Error('Failed to log engagement action.');
        }
      }

      showToast('Data extracted and logged successfully');

    } catch (err: any) {
      console.error("Extraction failed:", err);
      showToast(err.message, 'error');
      setExtractedData(null);
    } finally {
      setIsLoading(false);
    }
  };

  const clearAll = () => {
    setImageFile(null);
    setImagePreview('');
    setExtractedData(null);
    setEditedData(null);
    setIsEditing(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayData = editedData || extractedData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Toast {...toast} onClose={() => { }} />

      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Prospect Outreach Generator
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Extract candidate data and generate personalized outreach
              </p>
            </div>
            {extractedData && (
              <button
                onClick={clearAll}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Clear All
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!extractedData && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <FileImage className="w-5 h-5 text-gray-600" />
              Upload Screenshot
            </h2>

            <input
              ref={fileInputRef}
              type="file"
              id="file-upload"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <label
              htmlFor="file-upload"
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`block w-full p-12 border-2 border-dashed ${imageFile ? 'border-blue-300 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
                } text-center cursor-pointer transition-all duration-200 rounded-lg relative overflow-hidden group`}
            >
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" className="max-h-48 mx-auto rounded-lg shadow-md" />
                  <div className="mt-4">
                    <span className="text-sm font-medium text-gray-900">{imageFile?.name}</span>
                    <span className="text-xs text-gray-500 block mt-1">Click to change image</span>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                  <span className="text-sm font-medium text-gray-900 block">
                    Click to upload or drag and drop
                  </span>
                  <span className="text-xs text-gray-500 mt-2 block">PNG, JPG up to 10MB</span>
                </>
              )}
            </label>

            <button
              onClick={processAndGenerate}
              disabled={!imageFile || isLoading}
              className={`w-full mt-6 px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2 ${!imageFile || isLoading
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-md hover:shadow-lg transform hover:-translate-y-0.5'
                }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing Image...
                </>
              ) : (
                'Extract & Generate'
              )}
            </button>
          </div>
        )}

        {displayData && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Extracted Data</h3>
                  {!isEditing ? (
                    <button
                      onClick={handleEdit}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        className="text-sm text-green-600 hover:text-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {Object.entries(displayData).map(([key, value]) => (
                    <div key={key} className="group">
                      <label className="text-xs uppercase tracking-wider text-gray-500 font-medium">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </label>
                      {isEditing ? (
                        <input
                          type={typeof value === 'number' ? 'number' : 'text'}
                          value={value || ''}
                          onChange={(e) => handleFieldChange(key as keyof ExtractedOfferData,
                            typeof value === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                          )}
                          className="w-full mt-1 px-2 py-1 text-sm font-mono border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ) : (
                        <div className="flex items-center justify-between mt-1">
                          {key === 'jobId' && value ? (
                            <a
                              href={`https://nova.ayahealthcare.com/jobs/${value}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                            >
                              {String(value)}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : key === 'candidateId' && value ? (
                            <a
                              href={`https://nova.ayahealthcare.com/recruiting/profile/${value}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                            >
                              {String(value)}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <p className="text-sm font-mono text-gray-900">
                              {key.includes('Rate') || key.includes('Pay') || key.includes('Stipend')
                                ? formatCurrency(Number(value))
                                : key.includes('Date')
                                  ? formatDate(value as string)
                                  : String(value) || '—'}
                            </p>
                          )}
                          <button
                            onClick={() => copyToClipboard(String(value), key)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-100 rounded"
                          >
                            {copiedId === key ? (
                              <CheckCircle className="w-3 h-3 text-green-600" />
                            ) : (
                              <Copy className="w-3 h-3 text-gray-400" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Email Preview</h3>
                  <button
                    onClick={() => setShowFullPreview(!showFullPreview)}
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    {showFullPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showFullPreview ? 'Collapse' : 'Expand'}
                  </button>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mb-2">Subject</p>
                  <p className="text-sm font-medium text-gray-900">
                    {generateEmailContent(displayData).subject}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 relative">
                  <pre className={`text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed ${!showFullPreview ? 'max-h-96 overflow-hidden' : ''
                    }`}>
                    {generateEmailContent(displayData).body}
                  </pre>
                  {!showFullPreview && (
                    <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />
                  )}
                </div>

                <div className="flex gap-3 mt-6">
                  <button
                    onClick={handleOpenInOutlook}
                    className="flex-1 bg-gray-900 text-white font-medium py-2.5 px-4 rounded-lg hover:bg-gray-700 transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open in Outlook
                  </button>

                  <button
                    onClick={handleDownloadEmail}
                    className="bg-white border border-gray-300 text-gray-700 font-medium py-2.5 px-4 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>

                  <button
                    onClick={copyEmailContent}
                    className="bg-white border border-gray-300 text-gray-700 font-medium py-2.5 px-4 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    {copiedId === 'email' ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy
                      </>
                    )}
                  </button>
                </div>

                <div className="text-xs text-center text-gray-500 pt-4 mt-4 border-t border-gray-100">
                  <p>
                    <strong>Tip:</strong> Click "Open in Outlook" to compose directly in Outlook 365, or "Download" for an .eml file with formatted content.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}