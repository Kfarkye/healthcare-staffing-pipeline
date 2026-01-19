import React, { useState, useCallback } from 'react';
import { Loader2, Upload, FileText, CheckCircle, AlertTriangle, X, Info, Zap } from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface InterestedClickCSV {
  [key: string]: any;
}

interface ProcessedClick {
  application_id: number;
  application_date: string | null;
  job_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_homestate: string;
  job_city: string;
  job_state: string;
  profession: string;
  specialty: string;
  recruiter_name: string;
  recruiter_email: string;
  last_note: string;
  last_note_by: string | null;
  last_note_date: string | null;
  status: 'New';
}

interface ValidationError {
  row: number;
  field: string;
  value: any;
  message: string;
}

// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const BATCH_SIZE = 500;

const FIELD_MAPPINGS: Record<string, string[]> = {
  id: ['Id', 'ID', 'id', 'application_id', 'ApplicationId', 'Application_Id'],
  applicationDate: ['ApplicationDate', 'Application Date', 'application_date', 'Date', 'Applied Date'],
  jobId: ['JobId', 'Job Id', 'job_id', 'Job ID', 'JobID', 'Job_ID'],
  city: ['City', 'city', 'JobCity', 'Job City', 'job_city'],
  state: ['State', 'state', 'JobState', 'Job State', 'job_state'],
  profession: ['Profession', 'profession', 'Job Type'],
  specialty: ['Specialty', 'specialty', 'Speciality', 'Specialization'],
  fullName: ['FullName', 'Full Name', 'full_name', 'Name', 'CandidateName', 'Candidate Name', 'candidate_name'],
  email: ['Email', 'email', 'EmailAddress', 'Email Address', 'email_address', 'E-mail'],
  homeState: ['HomeState', 'Home State', 'home_state', 'State of Residence', 'Candidate State'],
  recruiter: ['Recruiter', 'recruiter', 'RecruiterName', 'Recruiter Name', 'recruiter_name'],
  recruiterEmail: ['RecruiterEmail', 'Recruiter Email', 'recruiter_email', 'Recruiter_Email'],
  lastNote: ['LastNote', 'Last Note', 'last_note', 'Note', 'Notes', 'Comment', 'Comments']
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX_MMDDYYYY = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const NOTE_AUTHOR_REGEX = /--\s*([^(\n]+)/;
const NOTE_DATE_REGEX = /\((\d{1,2}\/\d{1,2}\/\d{4})\)/;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Maps CSV column names to expected field names with case-insensitive fallback
 */
const getMappedValue = (row: InterestedClickCSV, fieldKey: string): any => {
  const possibleKeys = FIELD_MAPPINGS[fieldKey] || [];
  
  // Direct key match
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }
  
  // Case-insensitive fallback
  const rowKeys = Object.keys(row);
  for (const possibleKey of possibleKeys) {
    const match = rowKeys.find(k => k.toLowerCase() === possibleKey.toLowerCase());
    if (match && row[match] !== undefined && row[match] !== null && row[match] !== '') {
      return row[match];
    }
  }
  
  return null;
};

/**
 * Parses note text to extract author and date metadata
 */
const parseNoteMetadata = (lastNote: string): { author: string | null; date: string | null } => {
  if (!lastNote || typeof lastNote !== 'string') {
    return { author: null, date: null };
  }
  
  // Updated patterns to match the actual format: "Aug 14 2025  4:10AM -- Allison Shirk"
  // Date format: "MMM DD YYYY  H:MMAM/PM"
  const datePattern = /(\w{3}\s+\d{1,2}\s+\d{4})\s+\d{1,2}:\d{2}[AP]M/;
  const authorPattern = /--\s*([^(\n]+)$/;
  
  const dateMatch = lastNote.match(datePattern);
  const authorMatch = lastNote.match(authorPattern);
  
  let extractedDate = null;
  if (dateMatch) {
    // Parse "Aug 14 2025" format to YYYY-MM-DD
    const dateStr = dateMatch[1]; // "Aug 14 2025"
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      extractedDate = parsedDate.toISOString().split('T')[0];
    }
  }
  
  return {
    author: authorMatch ? authorMatch[1].trim() : null,
    date: extractedDate
  };
};

/**
 * Converts various date formats to PostgreSQL-compatible format (YYYY-MM-DD)
 */
const formatDateForDB = (dateStr: string | any): string | null => {
  if (!dateStr) return null;
  
  const cleaned = String(dateStr).trim();
  if (!cleaned) return null;
  
  // Try standard Date parsing
  const date = new Date(cleaned);
  if (!isNaN(date.getTime())) {
    const year = date.getFullYear();
    // Validate reasonable date range
    if (year >= 2000 && year <= 2030) {
      return date.toISOString().split('T')[0];
    }
  }
  
  // Manual parsing for MM/DD/YYYY format
  const mmddyyyyMatch = cleaned.match(DATE_REGEX_MMDDYYYY);
  if (mmddyyyyMatch) {
    const [_, month, day, year] = mmddyyyyMatch;
    const parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().split('T')[0];
    }
  }
  
  return null;
};

/**
 * Validates email format
 */
const isValidEmail = (email: string): boolean => {
  return EMAIL_REGEX.test(email);
};

/**
 * Safely parses integer values with fallback
 */
const safeParseInt = (value: any): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = parseInt(String(value).trim(), 10);
  return isNaN(parsed) ? null : parsed;
};

// ============================================================================
// DATA PROCESSING
// ============================================================================

/**
 * Validates and processes a single CSV row into database format
 */
const processCSVRow = (
  row: InterestedClickCSV, 
  rowIndex: number
): { 
  data: ProcessedClick | null; 
  errors: ValidationError[]; 
  warnings: ValidationError[] 
} => {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  
  // Debug logging for first few rows to check mapping
  if (rowIndex <= 4) {
    console.log(`Row ${rowIndex} raw data:`, row);
    console.log('Column names in this row:', Object.keys(row));
  }
  
  // Extract field values - Get raw values first
  // Extract field values - with explicit debugging
  const id = getMappedValue(row, 'id') || row['Id'];
  const fullName = getMappedValue(row, 'fullName') || row['FullName'];
  const jobId = getMappedValue(row, 'jobId') || row['JobId'];
  const email = getMappedValue(row, 'email') || row['Email'];
  const applicationDate = getMappedValue(row, 'applicationDate') || row['ApplicationDate'];
  const lastNote = row['LastNote'] || getMappedValue(row, 'lastNote') || '';
  
  // CRITICAL FIX: Direct access to Recruiter column with extensive debugging
  const recruiter = row['Recruiter'] || '';
  const recruiterEmail = row['RecruiterEmail'] || '';
  
  // Debug log to find where recruiter is getting lost
  if (rowIndex <= 5) {
    console.log(`\n=== ROW ${rowIndex} RECRUITER DEBUG ===`);
    console.log('All column keys:', Object.keys(row));
    console.log('Row data:', row);
    console.log('Recruiter value from row["Recruiter"]:', row['Recruiter']);
    console.log('Recruiter value from row.Recruiter:', row.Recruiter);
    console.log('Type of recruiter value:', typeof row['Recruiter']);
    console.log('Recruiter will be saved as:', String(recruiter).trim());
    console.log('=====================================\n');
  }
  
  // === CRITICAL VALIDATIONS ===
  
  // Application ID validation
  if (!id) {
    errors.push({
      row: rowIndex,
      field: 'Application ID',
      value: id,
      message: 'Missing required application ID'
    });
  }
  
  const applicationId = safeParseInt(id);
  if (id && !applicationId) {
    errors.push({
      row: rowIndex,
      field: 'Application ID',
      value: id,
      message: 'Application ID must be a valid number'
    });
  }
  
  // Candidate name validation
  if (!fullName || String(fullName).trim().length === 0) {
    errors.push({
      row: rowIndex,
      field: 'Candidate Name',
      value: fullName,
      message: 'Missing required candidate name'
    });
  }
  
  // === WARNINGS (non-blocking) ===
  
  // Job ID warning
  if (!jobId) {
    warnings.push({
      row: rowIndex,
      field: 'Job ID',
      value: jobId,
      message: 'Missing Job ID - record will be incomplete'
    });
  }
  
  // Email format validation
  if (email && !isValidEmail(String(email).trim())) {
    warnings.push({
      row: rowIndex,
      field: 'Email',
      value: email,
      message: 'Invalid email format'
    });
  }
  
  // Date validation
  if (applicationDate && !formatDateForDB(applicationDate)) {
    warnings.push({
      row: rowIndex,
      field: 'Application Date',
      value: applicationDate,
      message: 'Invalid date format - date will be empty'
    });
  }
  
  // Stop processing if critical errors exist
  if (errors.length > 0) {
    return { data: null, errors, warnings };
  }
  
  // === BUILD PROCESSED RECORD ===
  
  const noteMetadata = parseNoteMetadata(lastNote);
  
  const processedData: ProcessedClick = {
    application_id: applicationId!,
    application_date: formatDateForDB(applicationDate),
    job_id: String(jobId || '').trim(),
    candidate_name: String(fullName).trim(),
    candidate_email: email ? String(email).trim() : '',
    candidate_homestate: String(getMappedValue(row, 'homeState') || '').trim(),
    job_city: String(getMappedValue(row, 'city') || '').trim(),
    job_state: String(getMappedValue(row, 'state') || '').trim(),
    profession: String(getMappedValue(row, 'profession') || '').trim(),
    specialty: String(getMappedValue(row, 'specialty') || '').trim(),
    recruiter_name: String(recruiter).trim(),
    recruiter_email: String(recruiterEmail).trim(),
    last_note: String(lastNote).trim(),
    last_note_by: noteMetadata.author,
    last_note_date: noteMetadata.date,
    status: 'New'
  };
  
  return { data: processedData, errors, warnings };
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function InterestedClicksSync(): JSX.Element {
  // State Management
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [processedData, setProcessedData] = useState<ProcessedClick[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationError[]>([]);
  const [syncProgress, setSyncProgress] = useState(0);
  const [showErrors, setShowErrors] = useState(false);

  /**
   * Handles file selection via input or drag-drop
   */
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      resetState();
      setFile(selectedFile);
      processFile(selectedFile);
    }
  };

  /**
   * Resets component state
   */
  const resetState = () => {
    setFile(null);
    setProcessedData([]);
    setValidationErrors([]);
    setValidationWarnings([]);
    setSyncProgress(0);
    setShowErrors(false);
  };

  /**
   * Processes CSV file and validates data
   */
  const processFile = useCallback((fileToProcess: File) => {
    setIsProcessing(true);
    setValidationErrors([]);
    setValidationWarnings([]);
    
    Papa.parse(fileToProcess, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      delimitersToGuess: [',', '\t', '|', ';'],
      complete: (results) => {
        const rawData = results.data as InterestedClickCSV[];
        
        // CRITICAL: Log the first row to see exact column names and values
        if (rawData.length > 0) {
          console.log('=== CSV PARSING DEBUG ===');
          console.log('First row raw data:', rawData[0]);
          console.log('Column names detected:', Object.keys(rawData[0]));
          console.log('Recruiter column value:', rawData[0]['Recruiter']);
          console.log('=========================');
        }
        
        const processed: ProcessedClick[] = [];
        const allErrors: ValidationError[] = [];
        const allWarnings: ValidationError[] = [];
        
        // Process each row
        rawData.forEach((row, index) => {
          // Skip completely empty rows
          if (Object.values(row).every(v => v === null || v === undefined || v === '')) {
            return;
          }
          
          const result = processCSVRow(row, index + 2); // +2 for header and 1-based indexing
          
          if (result.data) {
            processed.push(result.data);
          }
          if (result.errors.length > 0) {
            allErrors.push(...result.errors);
          }
          if (result.warnings.length > 0) {
            allWarnings.push(...result.warnings);
          }
        });
        
        // Log what we're about to save
        if (processed.length > 0) {
          console.log('=== PROCESSED DATA DEBUG ===');
          console.log('First processed record:', processed[0]);
          console.log('Recruiter name in first record:', processed[0].recruiter_name);
          console.log('============================');
        }
        
        setProcessedData(processed);
        setValidationErrors(allErrors);
        setValidationWarnings(allWarnings);
        setIsProcessing(false);
        
        // Auto-show errors panel if errors exist
        if (allErrors.length > 0) {
          setShowErrors(true);
        }
      },
      error: (error) => {
        alert(`Failed to parse CSV: ${error.message}`);
        setIsProcessing(false);
      }
    });
  }, []);

  /**
   * Syncs validated data to database in batches
   */
  const handleSync = async () => {
    if (processedData.length === 0) return;
    
    setIsSyncing(true);
    setSyncProgress(0);
    
    try {
      // Create batches for large datasets
      const totalRecords = processedData.length;
      const batches: ProcessedClick[][] = [];
      
      for (let i = 0; i < totalRecords; i += BATCH_SIZE) {
        batches.push(processedData.slice(i, Math.min(i + BATCH_SIZE, totalRecords)));
      }
      
      let processedCount = 0;
      
      // Process each batch
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        
        // Log first record of first batch to verify data
        if (batchIndex === 0 && batch.length > 0) {
          console.log('First record being sent to database:', batch[0]);
        }
        
        const { error } = await supabase
          .from('interested_clicks')
          .upsert(batch, { 
            onConflict: 'application_id',
            ignoreDuplicates: false 
          });
        
        if (error) {
          // Specific error handling
          let errorMessage = 'Sync failed';
          
          switch (error.code) {
            case '23505':
              errorMessage = 'Duplicate application IDs found in database';
              break;
            case '22P02':
              errorMessage = 'Invalid data format detected';
              break;
            case '23502':
              errorMessage = 'Required database field is missing';
              break;
            case '42P01':
              errorMessage = 'Database table not found';
              break;
            default:
              errorMessage = `Database error: ${error.message}`;
          }
          
          alert(`${errorMessage}\n\nBatch ${batchIndex + 1} of ${batches.length} failed.`);
          setIsSyncing(false);
          setSyncProgress(0);
          return;
        }
        
        processedCount += batch.length;
        setSyncProgress(Math.round((processedCount / totalRecords) * 100));
      }
      
      // Success
      alert(`✅ Successfully synced ${totalRecords} records to database!`);
      resetState();
      
    } catch (error) {
      console.error('Sync error:', error);
      alert(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  /**
   * Handles file drag-and-drop
   */
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    
    if (droppedFile) {
      // Validate file type
      const fileType = droppedFile.type;
      const fileName = droppedFile.name.toLowerCase();
      
      if (fileType === 'text/csv' || fileName.endsWith('.csv')) {
        resetState();
        setFile(droppedFile);
        processFile(droppedFile);
      } else {
        alert('Please upload a CSV file');
      }
    }
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-5xl w-full bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        
        {/* Header */}
        <div className="text-center mb-8">
          <FileText size={48} className="mx-auto text-blue-600 mb-4" />
          <h1 className="text-3xl font-bold text-gray-900">Interested Clicks CSV Sync</h1>
          <p className="mt-2 text-gray-600">
            Upload your CSV to validate, process, and sync with the database
          </p>
        </div>

        {!file ? (
          /* Upload Area */
          <label 
            htmlFor="file-upload" 
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()} 
            className="block border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition-colors cursor-pointer bg-gray-50 hover:bg-blue-50"
          >
            <Upload size={40} className="mx-auto text-gray-400 mb-3" />
            <h3 className="text-lg font-semibold text-gray-700">Upload "Interested Clicks" CSV</h3>
            <p className="text-sm text-gray-500 mt-1">Drag and drop, or click to browse</p>
            <p className="text-xs text-gray-400 mt-4">
              Supports flexible column naming • Validates data before sync
            </p>
            <input 
              id="file-upload" 
              type="file" 
              className="sr-only" 
              accept=".csv,text/csv" 
              onChange={handleFileChange} 
            />
          </label>
        ) : (
          /* Processing & Preview Area */
          <div className="space-y-6">
            
            {/* File Status Bar */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isProcessing ? (
                    <Loader2 className="text-blue-600 animate-spin" size={20} />
                  ) : validationErrors.length > 0 ? (
                    <AlertTriangle className="text-amber-600" size={20} />
                  ) : (
                    <CheckCircle className="text-green-600" size={20} />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {isProcessing 
                        ? 'Processing file...' 
                        : `${processedData.length} valid record${processedData.length !== 1 ? 's' : ''} ready`
                      }
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      {file.name} 
                      {(validationErrors.length > 0 || validationWarnings.length > 0) && ' • '}
                      {validationErrors.length > 0 && (
                        <span className="text-red-600">{validationErrors.length} error{validationErrors.length !== 1 ? 's' : ''}</span>
                      )}
                      {validationErrors.length > 0 && validationWarnings.length > 0 && ', '}
                      {validationWarnings.length > 0 && (
                        <span className="text-amber-600">{validationWarnings.length} warning{validationWarnings.length !== 1 ? 's' : ''}</span>
                      )}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={resetState}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  title="Clear and start over"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Validation Issues Panel */}
            {(validationErrors.length > 0 || validationWarnings.length > 0) && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setShowErrors(!showErrors)}
                  className="w-full px-4 py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 transition-colors text-left"
                >
                  <span className="font-medium text-sm text-gray-700">
                    Validation Issues ({validationErrors.length + validationWarnings.length})
                  </span>
                  <Info size={16} className={`text-gray-500 transform transition-transform ${showErrors ? 'rotate-180' : ''}`} />
                </button>
                
                {showErrors && (
                  <div className="max-h-64 overflow-y-auto p-4 bg-white">
                    <div className="space-y-2">
                      {/* Errors */}
                      {validationErrors.map((error, idx) => (
                        <div key={`error-${idx}`} className="text-xs p-2.5 bg-red-50 text-red-800 rounded-md border border-red-200">
                          <span className="font-semibold">Row {error.row}:</span> {error.message}
                          {error.value !== undefined && error.value !== null && (
                            <span className="ml-1 text-red-600">
                              (Value: "{String(error.value)}")
                            </span>
                          )}
                        </div>
                      ))}
                      
                      {/* Warnings */}
                      {validationWarnings.map((warning, idx) => (
                        <div key={`warning-${idx}`} className="text-xs p-2.5 bg-amber-50 text-amber-800 rounded-md border border-amber-200">
                          <span className="font-semibold">Row {warning.row}:</span> {warning.message}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            {/* Data Preview Table */}
            {processedData.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                  <h3 className="text-sm font-semibold text-gray-700">Data Preview</h3>
                </div>
                <div className="overflow-x-auto">
                  <div className="max-h-96 overflow-y-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Candidate
                          </th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Job ID
                          </th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Specialty
                          </th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Home State
                          </th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Applied
                          </th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {processedData.slice(0, 10).map((row, idx) => (
                          <tr key={`row-${row.application_id}-${idx}`} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                              <div>
                                <div>{row.candidate_name}</div>
                                {row.candidate_email && (
                                  <div className="text-xs text-gray-500">{row.candidate_email}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-600 font-mono whitespace-nowrap">
                              {row.job_id || '-'}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">
                              {row.specialty || '-'}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">
                              {row.candidate_homestate || '-'}
                            </td>
                            <td className="px-3 py-3 text-sm text-gray-600 whitespace-nowrap">
                              {row.application_date || '-'}
                            </td>
                            <td className="px-3 py-3 whitespace-nowrap">
                              <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                {processedData.length > 10 && (
                  <div className="bg-gray-50 px-4 py-2 border-t border-gray-200">
                    <p className="text-xs text-gray-500 text-center">
                      Showing 10 of {processedData.length} records
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {/* Sync Button */}
            <div className="space-y-2">
              <button 
                onClick={handleSync} 
                disabled={isProcessing || isSyncing || processedData.length === 0 || validationErrors.length > 0} 
                className={`
                  w-full py-3.5 px-6 rounded-lg font-semibold
                  flex items-center justify-center gap-2.5
                  transition-all duration-200
                  ${(isSyncing || processedData.length === 0 || validationErrors.length > 0)
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                    : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                  }
                `}
              >
                {isSyncing ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> 
                    Syncing... {syncProgress > 0 && `${syncProgress}%`}
                  </>
                ) : (
                  <>
                    <Zap size={18} /> 
                    Sync {processedData.length} Record{processedData.length !== 1 ? 's' : ''} to Database
                  </>
                )}
              </button>
              
              {validationErrors.length > 0 && (
                <p className="text-xs text-red-600 text-center font-medium">
                  ⚠️ Fix {validationErrors.length} error{validationErrors.length !== 1 ? 's' : ''} before syncing
                </p>
              )}
            </div>
            
          </div>
        )}
      </div>
    </div>
  );
}