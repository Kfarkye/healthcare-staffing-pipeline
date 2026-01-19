import React, { useState, useCallback, useEffect } from 'react';
import { Loader as Loader2, CircleCheck as CheckCircle, Clipboard, FileText, Upload, Image, Circle as XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../shared/hooks';
import { Toast } from '../shared/components';

// ============================================================================
// TYPE DEFINITIONS & CONSTANTS
// ============================================================================
interface MarginDetails {
    margin_id: string;
    job_id: string;
    candidate_name?: string;
    facility_name?: string;
    specialty?: string;
    start_date: string;
    end_date: string;
    bill_rate?: number;
    actual_margin_percentage?: number;
}

const HTML_EXTRACTION_PROMPT = `You are an AI assistant that extracts key details from the HTML of a "Margin Calculator" page. Your task is to parse the HTML and return a single, clean JSON object with numerical values for rates and percentages.

**Extraction Details:**
- **margin_id**: The final numerical ID in the page's URL (e.g., ".../margin/7501867").
- **job_id**: Text content from the element with \`data-qa-id="JobIdView"\`.
- **candidate_name**: Text content from the element with \`data-qa-id="CandidateNameView"\`.
- **facility_name**: Text content from the element with \`data-qa-id="FacilityNameView"\`.
- **specialty**: Text content from the element with \`data-qa-id="SpecialtyView"\`.
- **start_date**: The value from the form control named "startDate".
- **end_date**: The value from the form control named "endDate".
- **bill_rate**: The numerical value from the form control named "billRate".
- **actual_margin_percentage**: The numerical value from the element with \`data-qa-id="ActualMarginPercentage"\`.

Return ONLY the JSON object. Do not include any other text, explanations, or markdown. Ensure all rates and percentages are numbers, not strings.`;

const SCREENSHOT_EXTRACTION_PROMPT = `You are an AI assistant that extracts key details from a screenshot of a "Margin Calculator" page. Your task is to analyze the image and return a single, clean JSON object with numerical values for rates and percentages.

**Extraction Details:**
- **margin_id**: Find the "Margin ID", which is a large number usually near the top (e.g., "7501867").
- **job_id**: Find the "Job ID".
- **candidate_name**: Find the "Candidate" name.
- **facility_name**: Find the "Facility" name.
- **specialty**: Find the "Specialty".
- **start_date**: Find the "Start Date".
- **end_date**: Find the "End Date".
- **bill_rate**: Find the "Bill Rate" from the main grid.
- **actual_margin_percentage**: Find the "Actual Margin %", which is often in a colored box.

Return ONLY the JSON object. Do not include any other text, explanations, or markdown. Ensure all rates and percentages are numbers, not strings.`;


// ============================================================================
// HELPER COMPONENTS
// ============================================================================

const FileUploadZone: React.FC<{
    file: File | null;
    previewUrl: string;
    isLoading: boolean;
    onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onRemove: () => void;
}> = ({ file, previewUrl, isLoading, onFileChange, onRemove }) => (
    <div className="text-center border-2 border-dashed border-gray-300 rounded-lg p-8 relative">
        <input
            type="file"
            id="screenshot-upload"
            accept="image/*"
            onChange={onFileChange}
            className="hidden"
            disabled={isLoading}
        />
        <label
            htmlFor="screenshot-upload"
            className={`cursor-pointer ${isLoading ? 'cursor-wait' : ''}`}
        >
            {isLoading && (
                <div className="flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 mx-auto mb-3 text-blue-500 animate-spin" />
                    <span className="text-sm font-medium text-blue-700">Analyzing Screenshot...</span>
                </div>
            )}
            {!isLoading && previewUrl && file && (
                <div>
                     <img src={previewUrl} alt="Screenshot Preview" className="max-h-32 mx-auto rounded-md mb-3" />
                     <p className="text-xs text-gray-500">{file.name}</p>
                </div>
            )}
            {!isLoading && !previewUrl && (
                <div className="flex flex-col items-center justify-center">
                    <Image size={48} className="mx-auto text-gray-400" />
                    <h2 className="mt-4 text-xl font-semibold text-gray-700">Upload Screenshot</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        Drag & drop an image file or click here to browse.
                    </p>
                </div>
            )}
        </label>
        {file && !isLoading && (
            <button
                onClick={onRemove}
                className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500"
            >
                <XCircle size={20} />
            </button>
        )}
    </div>
);


// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function MarginDataSync(): JSX.Element {
    const [isHtmlLoading, setIsHtmlLoading] = useState<boolean>(false);
    const [isScreenshotLoading, setIsScreenshotLoading] = useState<boolean>(false);
    const [isSyncing, setIsSyncing] = useState<boolean>(false);
    const [screenshotFile, setScreenshotFile] = useState<File | null>(null);
    const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState<string>('');
    const { toast, showToast } = useToast();
    
    // --- DATA PROCESSING LOGIC ---

    const processAndSync = useCallback(async (extractionPromise: Promise<MarginDetails | null>) => {
        let extractedData: MarginDetails | null = null;

        try {
            extractedData = await extractionPromise;
            if (!extractedData || !extractedData.job_id || !extractedData.margin_id) {
                throw new Error('AI failed to extract required IDs from the source.');
            }
            showToast(`Extracted data for ${extractedData.candidate_name}. Syncing...`, 'info');
        } catch (err: any) {
            showToast(err.message || 'Error during data extraction.', 'error');
            return; // Stop the process if extraction fails
        } finally {
            setIsHtmlLoading(false);
            setIsScreenshotLoading(false);
        }

        setIsSyncing(true);
        const { data, error } = await supabase
            .from('engagements')
            .update({
                margin_id: extractedData.margin_id,
                candidate_name: extractedData.candidate_name,
                facility_name: extractedData.facility_name,
                specialty: extractedData.specialty,
                start_date: new Date(extractedData.start_date).toISOString().split('T')[0],
                end_date: new Date(extractedData.end_date).toISOString().split('T')[0],
                bill_rate: extractedData.bill_rate,
                actual_margin_percentage: extractedData.actual_margin_percentage,
                updated_at: new Date().toISOString()
            })
            .eq('job_id', extractedData.job_id)
            .select();

        if (error) {
            showToast(`Sync failed: ${error.message}`, 'error');
        } else if (data && data.length > 0) {
            showToast(`Successfully synced details for Job ID ${extractedData.job_id}.`, 'success');
        } else {
            showToast(`No matching record found for Job ID: ${extractedData.job_id}. Run Livelist Sync first.`, 'error');
        }

        setIsSyncing(false);
        setScreenshotFile(null);
        setScreenshotPreviewUrl('');
    }, [showToast]);

    const extractDataFromHtml = async (html: string): Promise<MarginDetails | null> => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const bodyHtml = doc.body.outerHTML;

        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error("API key is not configured.");

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: HTML_EXTRACTION_PROMPT }, { text: bodyHtml }] }],
            generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
        };
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error('AI service communication failed.');
        const result = await response.json();
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        return JSON.parse(textResponse);
    };

    const extractDataFromScreenshot = async (file: File): Promise<MarginDetails | null> => {
        const reader = new FileReader();
        const fileAsBase64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
        const base64Data = fileAsBase64.split(',')[1];
        
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error("API key is not configured.");

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${apiKey}`;
        const payload = {
            contents: [{ parts: [{ text: SCREENSHOT_EXTRACTION_PROMPT }, { inline_data: { mime_type: file.type, data: base64Data } }] }],
            generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
        };
        const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error('AI service communication failed.');
        const result = await response.json();
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        return JSON.parse(textResponse);
    };

    // --- EVENT HANDLERS ---

    const handleSyncFromClipboard = async () => {
        setIsHtmlLoading(true);
        try {
            const clipboardText = await navigator.clipboard.readText();
            if (!clipboardText || !clipboardText.includes('nova-margin-calculator-ngrx')) {
                throw new Error('Margin Calculator HTML not found in clipboard.');
            }
            await processAndSync(extractDataFromHtml(clipboardText));
        } catch (err: any) {
            showToast(err.message || 'Could not read from clipboard.', 'error');
            setIsHtmlLoading(false);
        }
    };

    const handleScreenshotChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setIsScreenshotLoading(true);
            setScreenshotFile(file);
            setScreenshotPreviewUrl(URL.createObjectURL(file));
            processAndSync(extractDataFromScreenshot(file));
        }
    };
    
    const isLoading = isHtmlLoading || isScreenshotLoading || isSyncing;

    return (
        <div className="bg-white p-8 rounded-lg shadow-md">
            <Toast {...toast} onClose={() => {}} />
            <h1 className="text-2xl font-bold text-gray-800">Margin Data Sync</h1>
            <p className="text-sm text-gray-500 mt-1 mb-6">
                Enrich engagement records using either the HTML bookmarklet or a screenshot.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
                {/* --- HTML SYNC METHOD --- */}
                <div className="text-center border-2 border-dashed border-gray-300 rounded-lg p-12">
                    <Clipboard size={48} className="mx-auto text-gray-400"/>
                    <h2 className="mt-4 text-xl font-semibold text-gray-700">Power User: Sync via HTML</h2>
                    <p className="mt-2 text-sm text-gray-500">
                        Use your bookmarklet on a margin page, then click below. Fastest and most accurate.
                    </p>
                    <button
                        onClick={handleSyncFromClipboard}
                        disabled={isLoading}
                        className="mt-6 bg-blue-600 text-white font-semibold py-3 px-8 rounded-lg flex items-center justify-center gap-2 disabled:bg-blue-300 mx-auto hover:bg-blue-700 transition-colors"
                    >
                        {isHtmlLoading ? <><Loader2 className="w-5 h-5 animate-spin" />Processing...</> : 'Sync from Clipboard'}
                    </button>
                </div>

                {/* --- SCREENSHOT SYNC METHOD --- */}
                <FileUploadZone 
                    file={screenshotFile}
                    previewUrl={screenshotPreviewUrl}
                    isLoading={isScreenshotLoading}
                    onFileChange={handleScreenshotChange}
                    onRemove={() => { setScreenshotFile(null); setScreenshotPreviewUrl(''); }}
                />
            </div>
        </div>
    );
}