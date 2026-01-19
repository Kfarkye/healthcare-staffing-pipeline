import React, { useState, useCallback, useEffect } from 'react';
import { Loader as Loader2, CircleCheck as CheckCircle, Clipboard, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from '../shared/hooks';
import { Toast } from '../shared/components';

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// ============================================================================
// TYPE DEFINITIONS & CONSTANTS
// ============================================================================
interface MarginDetails {
  job_id: string;
  margin_id: string;
  start_date: string;
  end_date: string;
}

const MARGIN_EXTRACTION_PROMPT = `You are an AI assistant that extracts key identifiers and dates from the HTML of a "Margin Calculator" page. Your task is to parse the HTML and return a single, clean JSON object.

**Extraction Details:**
-   **margin_id**: This is the final numerical ID in the page's URL. For example, in a URL ending with "/margin/7501867", the margin_id is "7501867".
-   **job_id**: Find the element with the data attribute \`data-qa-id="JobIdView"\`. Extract its text content.
-   **start_date**: Find the element with the form control name "startDate" (\`formcontrolname="startDate"\`). Extract its value.
-   **end_date**: Find the element with the form control name "endDate" (\`formcontrolname="endDate"\`). Extract its value.

Return ONLY the JSON object. Do not include any other text, explanations, or array brackets.`;


// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function MarginDataSync(): JSX.Element {
  const [htmlToProcess, setHtmlToProcess] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const { toast, showToast } = useToast();

  const handleSyncFromClipboard = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText || !clipboardText.includes('nova-margin-calculator-ngrx')) {
        showToast('Margin Calculator HTML not found. Use the bookmarklet on the correct page.', 'error');
        return;
      }
      setHtmlToProcess(clipboardText);
    } catch (err) {
      showToast('Could not read from clipboard. Please allow clipboard access.', 'error');
    }
  };

  useEffect(() => {
    const processAndSync = async () => {
      if (!htmlToProcess) return;

      setIsLoading(true);
      let extractedData: MarginDetails | null = null;

      try {
        // Step 1: Extract Data using AI
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlToProcess, "text/html");
        const bodyHtml = doc.body.outerHTML;
        
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        if (!apiKey) throw new Error("API key is not configured.");

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        const payload = {
          contents: [{ parts: [{ text: MARGIN_EXTRACTION_PROMPT }, { text: bodyHtml }] }],
          generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
        };

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('AI service communication failed.');

        const result = await response.json();
        const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
        extractedData = JSON.parse(textResponse);

        if (!extractedData || !extractedData.job_id || !extractedData.margin_id) throw new Error('AI failed to extract required IDs.');
        
        // Validate job_id is a valid numerical string
        if (!/^\d+$/.test(extractedData.job_id)) {
          throw new Error(`Invalid job_id extracted: "${extractedData.job_id}". Expected a numerical ID.`);
        }
        
        showToast(`Extracted Margin ID ${extractedData.margin_id} for Job ID ${extractedData.job_id}. Syncing...`, 'info');
        
      } catch (err: any) {
        showToast(err.message || 'Error during extraction.', 'error');
        setIsLoading(false);
        setHtmlToProcess('');
        return;
      }

      // Step 2: Sync to Database
      setIsLoading(false);
      setIsSyncing(true);
      
      const { data, error } = await supabase
        .from('engagements')
        .update({
          margin_id: extractedData.margin_id,
          start_date: new Date(extractedData.start_date).toISOString().split('T')[0],
          end_date: new Date(extractedData.end_date).toISOString().split('T')[0],
        })
        .eq('job_id', extractedData.job_id)
        .select();

      if (error) {
        showToast(`Sync failed: ${error.message}`, 'error');
      } else if (data && data.length > 0) {
        showToast(`Successfully linked Margin ID ${extractedData.margin_id} to Job ID ${extractedData.job_id}.`, 'success');
      } else {
        showToast(`No matching record found for Job ID: ${extractedData.job_id}. Run Livelist Sync first.`, 'error');
      }

      setIsSyncing(false);
      setHtmlToProcess('');
    };
    processAndSync();
  }, [htmlToProcess, showToast]);

  return (
    <div className="bg-white p-8 rounded-lg shadow-md">
      <Toast {...toast} onClose={() => {}} />
      <h1 className="text-2xl font-bold text-gray-800">Margin Data Sync</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        Syncs Margin ID and dates from a Margin Calculator page to the pipeline.
      </p>
      <div className="text-center border-2 border-dashed border-gray-300 rounded-lg p-12">
        <FileText size={48} className="mx-auto text-gray-400"/>
        <h2 className="mt-4 text-xl font-semibold text-gray-700">Sync Margin Details from Clipboard</h2>
        <p className="mt-2 text-sm text-gray-500">
          Use your `Copy Nova HTML` bookmarklet on a "Margin Calculator" page, then click below.
        </p>
        <button
          onClick={handleSyncFromClipboard}
          disabled={isLoading || isSyncing}
          className="mt-6 bg-green-600 text-white font-semibold py-3 px-8 rounded-lg flex items-center justify-center gap-2 disabled:bg-green-300 mx-auto hover:bg-green-700 transition-colors"
        >
          {isLoading || isSyncing ? <><Loader2 className="w-5 h-5 animate-spin" />Processing...</> : 'Start Margin Sync'}
        </button>
      </div>
    </div>
  );
}