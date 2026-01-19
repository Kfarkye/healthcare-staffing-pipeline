import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Loader2, X, Wand2, Clipboard, Check, Send, AlertTriangle } from 'lucide-react';
import { Prospect } from '../../types/prospects'; // Assuming you have a types file

interface ExtractorModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedProspects: Prospect[];
}

const ExtractorModal: React.FC<ExtractorModalProps> = ({ isOpen, onClose, selectedProspects }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [generatedContent, setGeneratedContent] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    // Reset state when modal is closed or selection changes
    if (!isOpen) {
      setGeneratedContent(null);
      setIsProcessing(false);
      setErrorMessage(null);
      setIsCopied(false);
    }
  }, [isOpen, selectedProspects]);

  const processAndGenerate = async () => {
    setIsProcessing(true);
    setErrorMessage(null);
    setGeneratedContent(null);
    setIsCopied(false);

    // --- FIX: Extract jobIds from selected prospects ---
    const jobIds = selectedProspects.map(p => p.job_id).filter(id => id != null);

    if (jobIds.length === 0) {
      setErrorMessage("No prospects with valid Job IDs are selected.");
      setIsProcessing(false);
      return;
    }
    // --- END FIX ---

    try {
      const { data, error } = await supabase.functions.invoke('process-outreach', {
        // --- FIX: Send jobIds in the request body ---
        body: { jobIds },
        // --- END FIX ---
      });

      if (error) {
        throw new Error(error.message || 'An unknown error occurred.');
      }
      
      if (data && data.success) {
        setGeneratedContent(data.templates);
      } else {
        throw new Error(data.error || 'Failed to generate outreach templates.');
      }

    } catch (err: any) {
      const displayError = err.details || err.message || 'An unexpected error occurred during processing.';
      setErrorMessage(displayError);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };
  
  const getEmailClientLink = (prospect: Prospect, template: any) => {
    const email = prospect.candidate_email;
    const subject = encodeURIComponent(template.subject);
    const body = encodeURIComponent(template.body);
    return `mailto:${email}?subject=${subject}&body=${body}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl p-8 transform transition-all duration-300 ease-in-out" 
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-2 text-gray-400 hover:bg-gray-100 rounded-full"
        >
          <X size={20} />
        </button>

        <div className="flex flex-col items-center text-center">
            <div className="p-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl inline-block mb-4 shadow-lg shadow-blue-500/20">
                <Wand2 size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Generate Outreach</h2>
            <p className="text-gray-500 mt-1">
              {`Generate personalized email templates for your ${selectedProspects.length} selected prospect(s).`}
            </p>
        </div>

        <div className="mt-8">
          {!generatedContent && !isProcessing && !errorMessage && (
            <div className="text-center">
              <button 
                onClick={processAndGenerate}
                disabled={isProcessing}
                className="w-full px-6 py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Wand2 size={18} />
                Generate
              </button>
            </div>
          )}

          {isProcessing && (
            <div className="flex flex-col items-center justify-center space-y-3 p-8 text-center">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <p className="font-medium text-gray-700">Analyzing job details...</p>
              <p className="text-sm text-gray-500">This may take a few moments.</p>
            </div>
          )}
          
          {errorMessage && (
             <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
               <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
               <div className="flex-1 text-left">
                 <p className="text-sm font-medium text-red-800">Error</p>
                 <p className="text-xs text-red-600 mt-1">{errorMessage}</p>
               </div>
             </div>
          )}

          {generatedContent && (
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 -mr-2">
              {selectedProspects.map((prospect) => {
                const template = generatedContent.find((t: any) => t.jobId == prospect.job_id);
                if (!template) return null;
                
                return (
                  <div key={prospect.candidate_id + prospect.job_id} className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{prospect.candidate_name}</p>
                        <p className="text-sm text-gray-500">{template.subject}</p>
                      </div>
                      <div className="flex items-center gap-2">
                         <button onClick={() => handleCopyToClipboard(template.body)} className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg transition-colors">
                           {isCopied ? <Check size={16} className="text-emerald-500" /> : <Clipboard size={16} />}
                         </button>
                         <a href={getEmailClientLink(prospect, template)} target="_blank" rel="noopener noreferrer" className="p-2 bg-blue-500 text-white hover:bg-blue-600 rounded-lg transition-colors">
                           <Send size={16} />
                         </a>
                      </div>
                    </div>
                    <div className="prose prose-sm max-w-none text-gray-700 bg-white p-3 rounded-lg border border-gray-200">
                      <p style={{ whiteSpace: 'pre-wrap' }}>{template.body}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExtractorModal;