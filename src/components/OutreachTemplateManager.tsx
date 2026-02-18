import React, { useState, useCallback, useRef } from 'react';
import {
  Loader2, CheckCircle, AlertCircle, Upload, Mail, Copy, FileImage,
  Edit2, X, ExternalLink, Download, Sparkles, ChevronLeft, ChevronRight,
  Package, Clock, CheckSquare, Send, Expand, FileText
} from 'lucide-react';
import { ExtractionService, ExtractedOfferData } from '../services/extractionService';
import { useBatchStore, BatchItem } from '../store/batchStore';
import { OUTREACH_EMAIL_TEMPLATES } from '../outreach/templates';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return 'ASAP';
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ============================================================================
// Template bodies are the SSOT in src/outreach/templates.ts.
// This module re-uses OUTREACH_EMAIL_TEMPLATES directly.
// The extraction service and template schemas are structurally compatible
// at runtime; the cast bridges the minor field-name differences (actual_margin
// vs actualMargin, string vs number IDs) that exist between the two types.
// ============================================================================

interface EmailTemplate {
  id: string;
  name: string;
  generateContent: (data: ExtractedOfferData) => { subject: string; body: string; to?: string; cc?: string };
}

const EMAIL_TEMPLATES: EmailTemplate[] = OUTREACH_EMAIL_TEMPLATES as unknown as EmailTemplate[];

// ============================================================================
// TOAST COMPONENT
// ============================================================================

const Toast = ({ message, show, type = 'success' }) => {
  if (!show) return null;

  const styles = {
    success: 'bg-green-50 border-green-200 text-green-900',
    error: 'bg-red-50 border-red-200 text-red-900',
    info: 'bg-blue-50 border-blue-200 text-blue-900',
  };

  const Icon = type === 'error' ? AlertCircle : CheckCircle;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <div className={`${styles[type]} px-4 py-3 rounded-md shadow-lg border flex items-center gap-3 max-w-md`}>
        <Icon size={20} />
        <span className="text-sm">{message}</span>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function BatchOutreachSystem() {
  // Use the global store instead of local state
  const {
    batchItems,
    currentItemIndex,
    addBatchItems,
    updateBatchItem,
    processChunk,
    setCurrentItemIndex,
    clearAll: clearBatchStore
  } = useBatchStore();

  // Local UI state (not shared) remains in the component
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate>(EMAIL_TEMPLATES[0]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('success');
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState<ExtractedOfferData | null>(null);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editedEmailContent, setEditedEmailContent] = useState<{ subject: string, body: string } | null>(null);
  const [customEmailContent, setCustomEmailContent] = useState<{ [key: string]: { subject: string, body: string } }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToastNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleFieldChange = (field: keyof ExtractedOfferData, value: any) => {
    if (editedData) {
      setEditedData({ ...editedData, [field]: value });
    }
  };

  const handleSaveEdit = () => {
    if (editedData && currentItem) {
      updateBatchItem(currentItem.id, { extractedData: editedData });
      setIsEditing(false);
      setEditedData(null);
      showToastNotification('Changes saved');
    }
  };

  const handleSaveEmailEdit = () => {
    if (editedEmailContent && currentItem) {
      setCustomEmailContent(prev => ({
        ...prev,
        [currentItem.id]: editedEmailContent
      }));
      setIsEditingEmail(false);
      setEditedEmailContent(null);
      showToastNotification('Email saved');
    }
  };

  const copyKeyDetails = async () => {
    if (!displayData) return;

    const keyDetails = `Facility: ${displayData.facility}
Location: ${displayData.city}, ${displayData.state}
Assignment Dates: ${formatDate(displayData.startDate)} – ${formatDate(displayData.endDate)}
Shifts & Hours: ${displayData.shiftType} (${displayData.weeklyHours}/week)

Pay Package:
Taxable Hourly Rate: ${formatCurrency(displayData.taxableRate)}
Meals & Housing Stipend: ${formatCurrency(displayData.weeklyStipend)}
Total Gross Weekly Pay: ${formatCurrency(displayData.grossWeeklyPay)}`;

    try {
      await navigator.clipboard.writeText(keyDetails);
      showToastNotification('Key details copied');
    } catch {
      showToastNotification('Failed to copy', 'error');
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      addBatchItems(files);
      showToastNotification(`Added ${files.length} screenshots`);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      addBatchItems(files);
      showToastNotification(`Added ${files.length} screenshots`);
    }
  };

  const processBatch = async () => {
    setIsProcessing(true);
    const pendingItems = batchItems.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) {
      showToastNotification('No pending items to process.', 'info');
      setIsProcessing(false);
      return;
    }

    showToastNotification(`Processing ${pendingItems.length} items...`, 'info');
    const BATCH_SIZE = 3;
    let successCount = 0;

    for (let i = 0; i < pendingItems.length; i += BATCH_SIZE) {
      const chunk = pendingItems.slice(i, i + BATCH_SIZE);
      processChunk(chunk);

      const promises = chunk.map(item =>
        ExtractionService.extractDataFromImage(item.file)
          .then(data => ({ ...item, status: 'completed' as const, extractedData: data as unknown as ExtractedOfferData }))
          .catch(error => ({ ...item, status: 'error' as const, error: error.message }))
      );

      const results = await Promise.all(promises);
      results.forEach(processedItem => {
        if (processedItem.status === 'completed') successCount++;
        updateBatchItem(processedItem.id, processedItem);
      });
    }
    setIsProcessing(false);
    showToastNotification(`Processed ${successCount} items successfully.`);
  };

  const exportSelectedEmails = () => {
    const selectedItems = batchItems.filter(item =>
      selectedForExport.has(item.id) && item.extractedData
    );
    if (selectedItems.length === 0) {
      showToastNotification('No items selected for export', 'error');
      return;
    }
    let combinedContent = '';
    selectedItems.forEach((item, index) => {
      if (item.extractedData) {
        const emailContent = customEmailContent[item.id] || selectedTemplate.generateContent(item.extractedData);
        combinedContent += `--- Email ${index + 1} for ${item.extractedData.name} ---\n`;
        combinedContent += `To: ${item.extractedData.email || ''}\n`;
        combinedContent += `Subject: ${emailContent.subject}\n\n`;
        combinedContent += `${emailContent.body}\n\n========================================\n\n`;
      }
    });
    const blob = new Blob([combinedContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-outreach-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToastNotification(`Exported ${selectedItems.length} emails`);
  };

  const openInOutlook = async () => {
    const selectedItems = batchItems.filter(item =>
      selectedForExport.has(item.id) && item.extractedData
    );

    if (selectedItems.length === 0) {
      showToastNotification('No items selected', 'error');
      return;
    }

    for (let i = 0; i < selectedItems.length; i++) {
      const item = selectedItems[i];
      if (item.extractedData) {
        const emailContent = customEmailContent[item.id] || selectedTemplate.generateContent(item.extractedData);
        const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(item.extractedData.email || '')}&subject=${encodeURIComponent(emailContent.subject)}&body=${encodeURIComponent(emailContent.body)}`;
        window.open(outlookUrl, '_blank');

        if (i < selectedItems.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    showToastNotification(`Opened ${selectedItems.length} emails`);
  };

  const clearAll = () => {
    clearBatchStore();
    setSelectedForExport(new Set());
    setIsEditing(false);
    setEditedData(null);
    setIsEditingEmail(false);
    setEditedEmailContent(null);
    setCustomEmailContent({});
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const navigateToItem = (index: number) => {
    if (index >= 0 && index < batchItems.length) {
      setCurrentItemIndex(index);
      setIsEditing(false);
      setEditedData(null);
      setIsEditingEmail(false);
      setEditedEmailContent(null);
    }
  };

  const currentItem = batchItems[currentItemIndex];
  const displayData = isEditing && editedData ? editedData : currentItem?.extractedData;
  const completedCount = batchItems.filter(item => item.status === 'completed').length;

  return (
    <div className="min-h-screen bg-white">
      <Toast message={toastMessage} show={showToast} type={toastType} />

      <header className="border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-gray-900">
              Prospect Outreach Generator
            </h1>
            {batchItems.length > 0 && (
              <button
                onClick={clearAll}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Clear All
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Extract candidate data and generate personalized outreach
          </p>
        </div>
      </header>

      <div className="p-6">
        {batchItems.length === 0 ? (
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="p-8">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />

                <label
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => fileInputRef.current?.click()}
                  className="block w-full p-16 border-2 border-dashed border-gray-300 hover:border-gray-400 bg-gray-50 hover:bg-gray-100 text-center cursor-pointer transition-colors rounded-lg"
                >
                  <Upload className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-base font-medium text-gray-700 mb-1">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-sm text-gray-500">
                    Upload margin calculator screenshots (PNG, JPG up to 10MB)
                  </p>
                </label>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-6">
            <div className="col-span-1">
              <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                <div className="p-4 border-b border-gray-200">
                  <h2 className="font-semibold text-gray-900">Queue</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    {completedCount} of {batchItems.length} processed
                  </p>
                </div>

                <div className="p-4 space-y-2">
                  <button
                    onClick={processBatch}
                    disabled={isProcessing}
                    className={`w-full py-2 px-4 rounded-md text-sm font-medium transition-colors ${isProcessing
                      ? 'bg-gray-100 text-gray-400'
                      : 'bg-black text-white hover:bg-gray-800'
                      }`}
                  >
                    {isProcessing ? 'Processing...' : 'Process All'}
                  </button>

                  <select
                    value={selectedTemplate.id}
                    onChange={(e) => {
                      const template = EMAIL_TEMPLATES.find(t => t.id === e.target.value);
                      if (template) setSelectedTemplate(template);
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-400"
                  >
                    {EMAIL_TEMPLATES.map(template => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="p-4 border-t border-gray-200 max-h-96 overflow-y-auto">
                  {batchItems.map((item, index) => (
                    <div
                      key={item.id}
                      onClick={() => navigateToItem(index)}
                      className={`p-2 rounded-md cursor-pointer flex items-center gap-2 mb-2 ${currentItemIndex === index
                        ? 'bg-gray-100'
                        : 'hover:bg-gray-50'
                        }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedForExport.has(item.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          const newSet = new Set(selectedForExport);
                          if (newSet.has(item.id)) {
                            newSet.delete(item.id);
                          } else {
                            newSet.add(item.id);
                          }
                          setSelectedForExport(newSet);
                        }}
                        disabled={item.status !== 'completed'}
                        className="rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.extractedData?.name || `Item ${index + 1}`}
                        </p>
                        <p className="text-xs text-gray-500">
                          {item.status === 'completed' ? 'Ready' : item.status}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="col-span-3">
              {currentItem && currentItem.extractedData && (
                <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
                  <div className="grid grid-cols-2 divide-x divide-gray-200">
                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900">Extracted Data</h3>
                        {!isEditing ? (
                          <button
                            onClick={() => {
                              setIsEditing(true);
                              setEditedData({ ...currentItem.extractedData });
                            }}
                            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" />
                            Edit
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={handleSaveEdit} className="text-sm text-green-600">
                              Save
                            </button>
                            <button onClick={() => setIsEditing(false)} className="text-sm text-gray-500">
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-4">
                        {Object.entries(displayData).map(([key, value]) => (
                          <div key={key}>
                            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {key.replace(/([A-Z])/g, ' $1').trim()}
                            </label>
                            {isEditing ? (
                              <input
                                type={typeof value === 'number' ? 'number' : 'text'}
                                value={editedData?.[key] || ''}
                                onChange={(e) => handleFieldChange(
                                  key as keyof ExtractedOfferData,
                                  typeof value === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                                )}
                                className="w-full mt-1 px-2 py-1 text-sm border-b border-gray-200 focus:border-gray-400 focus:outline-none"
                              />
                            ) : (
                              <p className="mt-1 text-sm font-medium text-gray-900">
                                {key.includes('Rate') || key.includes('Pay') || key.includes('Stipend')
                                  ? formatCurrency(Number(value))
                                  : value || '—'}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900">Email Preview</h3>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={copyKeyDetails}
                            className="text-sm text-gray-600 hover:text-gray-800"
                            title="Copy Key Details"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          {!isEditingEmail ? (
                            <button
                              onClick={() => {
                                const content = selectedTemplate.generateContent(displayData);
                                setEditedEmailContent(content);
                                setIsEditingEmail(true);
                              }}
                              className="text-sm text-blue-600 hover:text-blue-700"
                            >
                              <Expand className="w-4 h-4" />
                            </button>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={handleSaveEmailEdit} className="text-sm text-green-600">
                                Save
                              </button>
                              <button onClick={() => setIsEditingEmail(false)} className="text-sm text-gray-500">
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Subject
                          </label>
                          {isEditingEmail ? (
                            <input
                              type="text"
                              value={editedEmailContent?.subject || ''}
                              onChange={(e) => setEditedEmailContent(prev => ({
                                ...prev!,
                                subject: e.target.value
                              }))}
                              className="w-full mt-1 px-2 py-1 text-sm font-medium border-b border-gray-200 focus:border-gray-400 focus:outline-none"
                            />
                          ) : (
                            <p className="mt-1 text-sm font-medium text-gray-900">
                              {customEmailContent?.[currentItem.id]?.subject || selectedTemplate.generateContent(displayData).subject}
                            </p>
                          )}
                        </div>

                        <div className="flex-1">
                          {isEditingEmail ? (
                            <textarea
                              value={editedEmailContent?.body || ''}
                              onChange={(e) => setEditedEmailContent(prev => ({
                                ...prev!,
                                body: e.target.value
                              }))}
                              className="w-full h-64 text-sm text-gray-700 font-sans border border-gray-200 rounded-md p-3 focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none"
                            />
                          ) : (
                            <div className="text-sm text-gray-700 bg-gray-50 rounded-md p-4 max-h-64 overflow-y-auto">
                              <pre className="whitespace-pre-wrap font-sans">
                                {customEmailContent?.[currentItem.id]?.body || selectedTemplate.generateContent(displayData).body}
                              </pre>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-3 mt-6">
                        <button
                          onClick={openInOutlook}
                          className="flex-1 bg-black text-white py-2.5 px-4 rounded-md hover:bg-gray-800 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Open in Outlook
                        </button>

                        <button
                          onClick={exportSelectedEmails}
                          className="py-2.5 px-4 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </button>

                        <button
                          onClick={copyKeyDetails}
                          className="py-2.5 px-4 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium flex items-center gap-2"
                        >
                          <Copy className="w-4 h-4" />
                          Copy
                        </button>
                      </div>

                      <p className="text-xs text-gray-500 text-center mt-4">
                        Tip: Click "Open in Outlook" to compose directly in Outlook 365, or "Download" for an .eml file with formatted content.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}