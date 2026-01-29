import React, { useState, useCallback } from 'react';
import { Loader2, Upload, FileText, Info, CheckCircle2, X, Mail, Phone, Calendar } from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================
interface WorkingCandidateCSV {
  Id: number;
  'Contract Type': string;
  'Candidate Name': string;
  Email: string;
  'Day Phone': string;
  'Cell Phone': string;
  'Start Date': string;
  'End Date': string;
  Contract: string;
  Facility: string;
  Margin: number;
  Recruiter: string;
  'AM/AC': string;
  CS: string;
  CL: string;
  Specialty: string;
  [key: string]: any;
}

interface ProcessedCandidate {
  candidate_name: string;
  candidate_id: string;
  job_id: string;
  facility_name: string;
  start_date: string | null;
  end_date: string | null;
  margin_id: string;
  contract_type: string;
  email: string;
  phone_number: string;
  am_ac: string;
  cs_name: string;
  cl_name: string;
  recruiter: string;
  specialty: string;
  status: 'Active' | 'Needs New Role' | 'Completed';
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
const extractJobId = (contract: string): string => {
  const jobMatch = contract?.match(/(\d{7,})/);
  return jobMatch ? jobMatch[0] : contract || '';
};

const formatDateForDB = (dateStr: string): string | null => {
  if (!dateStr) return null;

  // Try MM/DD/YYYY format first
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    let [month, day, year] = parts;
    if (year.length === 2) {
      year = parseInt(year) > 50 ? '19' + year : '20' + year;
    }
    const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    const testDate = new Date(formattedDate);
    if (!isNaN(testDate.getTime())) {
      return formattedDate;
    }
  }

  // Fallback to Date parsing
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0];
  }

  return null;
};

const determineStatus = (endDateStr: string | null): 'Active' | 'Needs New Role' | 'Completed' => {
  if (!endDateStr) return 'Active';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(endDateStr);

  if (isNaN(endDate.getTime())) return 'Active';
  endDate.setHours(0, 0, 0, 0);

  if (endDate < today) {
    return 'Completed';
  }

  const daysRemaining = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (daysRemaining <= 56) { // 8 weeks
    return 'Needs New Role';
  }

  return 'Active';
};

const processCSVRow = (row: WorkingCandidateCSV): ProcessedCandidate | null => {
  // Required fields validation
  if (!row['Candidate Name'] || !row['Start Date'] || !row['End Date'] || !row.Id) {
    return null;
  }

  const phone = row['Cell Phone'] || row['Day Phone'] || '';
  const endDate = formatDateForDB(row['End Date']);
  const startDate = formatDateForDB(row['Start Date']);

  // Clean candidate name (remove ID if present in name)
  const candidateName = row['Candidate Name']?.replace(/\s*\(ID:\s*\d+\)/i, '').trim() || '';

  return {
    candidate_name: candidateName,
    candidate_id: row.Id.toString(),
    job_id: extractJobId(row.Contract),
    facility_name: row.Facility || '',
    start_date: startDate,
    end_date: endDate,
    margin_id: row.Margin ? row.Margin.toString() : '',
    contract_type: row['Contract Type'] || '',
    email: row.Email || '',
    phone_number: String(phone),
    am_ac: row['AM/AC'] || '',
    cs_name: row.CS || '',
    cl_name: row.CL || '',
    recruiter: row.Recruiter || '',
    specialty: row.Specialty || '',
    status: determineStatus(endDate)
  };
};

const formatDisplayDate = (dateString: string | null): string => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
};

const getDaysRemaining = (endDateString: string | null): number | null => {
  if (!endDateString) return null;
  const endDate = new Date(endDateString);
  const today = new Date();
  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function WorkingCandidatesCSVSync(): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [processedData, setProcessedData] = useState<ProcessedCandidate[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [syncResults, setSyncResults] = useState<{
    show: boolean;
    success: number;
    errors: number;
    errorDetails?: string;
  }>({ show: false, success: 0, errors: 0 });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (!selectedFile.name.match(/\.csv$/i)) {
        alert('Please select a CSV file');
        return;
      }
      setFile(selectedFile);
      setProcessedData([]);
      setShowPreview(false);
      setSyncResults({ show: false, success: 0, errors: 0 });
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.match(/\.csv$/i)) {
      setFile(droppedFile);
      setProcessedData([]);
      setShowPreview(false);
      setSyncResults({ show: false, success: 0, errors: 0 });
    }
  };

  const processFile = useCallback(async () => {
    if (!file) return;
    setIsProcessing(true);
    setSyncResults({ show: false, success: 0, errors: 0 });

    try {
      const text = await file.text();

      Papa.parse(text, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimitersToGuess: [',', '\t', '|', ';'],
        complete: (results) => {
          const rawData = results.data as WorkingCandidateCSV[];
          const processed = rawData
            .map(row => processCSVRow(row))
            .filter((row): row is ProcessedCandidate => row !== null);

          if (processed.length === 0) {
            alert('No valid data found in CSV. Required columns: "Candidate Name", "Id", "Start Date", "End Date"');
            setIsProcessing(false);
            return;
          }

          setProcessedData(processed);
          setShowPreview(true);
          setIsProcessing(false);
        },
        error: (error: Error) => {
          alert(`CSV parsing error: ${error.message}`);
          setIsProcessing(false);
        }
      });
    } catch (error: any) {
      alert(error.message || 'Error processing file');
      setIsProcessing(false);
    }
  }, [file]);

  const syncToDatabase = useCallback(async () => {
    if (processedData.length === 0) return;
    setIsSyncing(true);

    const recordsToUpsert = processedData.map(p => ({
      // Columns used for conflict resolution
      candidate_id: p.candidate_id,
      job_id: p.job_id,
      // All columns to insert or update
      status: p.status,
      candidate_name: p.candidate_name,
      facility_name: p.facility_name,
      specialty: p.specialty,
      start_date: p.start_date,
      end_date: p.end_date,
      margin_id: p.margin_id,
      contract_type: p.contract_type,
      email: p.email,
      phone_number: p.phone_number,
      am_ac: p.am_ac,
      cs_name: p.cs_name,
      cl_name: p.cl_name,
      recruiter: p.recruiter
    }));

    try {
      // Use upsert with composite key for conflict resolution
      const { error } = await supabase
        .from('engagements')
        .upsert(recordsToUpsert, {
          onConflict: 'candidate_id,job_id',
        });

      if (error) {
        console.error("Supabase upsert error:", error);
        setSyncResults({
          show: true,
          success: 0,
          errors: recordsToUpsert.length,
          errorDetails: error.message
        });
      } else {
        setSyncResults({
          show: true,
          success: recordsToUpsert.length,
          errors: 0
        });

        // Reset after successful sync
        setTimeout(() => {
          setShowPreview(false);
          setProcessedData([]);
          setFile(null);
        }, 3000);
      }
    } catch (error: any) {
      console.error("Sync error:", error);
      setSyncResults({
        show: true,
        success: 0,
        errors: recordsToUpsert.length,
        errorDetails: error.message
      });
    }

    setIsSyncing(false);
  }, [processedData]);

  const statusCounts = processedData.reduce((acc, curr) => {
    acc[curr.status] = (acc[curr.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Working Candidates Sync</h1>
          <p className="mt-2 text-gray-600">
            Upload your Working Candidates CSV export to update active assignments in the database
          </p>
        </div>

        {!showPreview ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            {/* Upload Section */}
            <div className="p-8">
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center hover:border-blue-400 transition-colors"
              >
                <FileText size={56} className="mx-auto text-gray-400 mb-4" />

                <h3 className="text-lg font-semibold text-gray-700 mb-2">
                  Upload Working Candidates CSV
                </h3>

                <p className="text-sm text-gray-500 mb-6">
                  Drag and drop your CSV file here, or click to browse
                </p>

                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="inline-flex items-center px-6 py-3 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    Select CSV File
                  </span>
                  <input
                    id="file-upload"
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    accept=".csv"
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              {file && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <FileText size={20} className="text-blue-600" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{file.name}</p>
                        <p className="text-xs text-gray-500">
                          {(file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          setFile(null);
                          setProcessedData([]);
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <X size={20} />
                      </button>
                      <button
                        onClick={processFile}
                        disabled={isProcessing}
                        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4 mr-2" />
                            Process File
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Instructions */}
            <div className="border-t border-gray-200 px-8 py-6 bg-gray-50 rounded-b-xl">
              <div className="flex items-start space-x-3">
                <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-gray-600">
                  <p className="font-medium text-gray-900 mb-2">Required CSV columns:</p>
                  <ul className="list-disc list-inside space-y-1 text-gray-600 mb-3">
                    <li>Id - Candidate ID</li>
                    <li>Candidate Name</li>
                    <li>Start Date & End Date</li>
                    <li>Contract - Contains job ID</li>
                    <li>Facility - Assignment location</li>
                  </ul>
                  <p className="text-xs text-gray-500">
                    Status will be automatically assigned: Active, Needs New Role (ending within 8 weeks), or Completed
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Status Summary */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Processing Summary
              </h2>
              <div className="grid grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{processedData.length}</div>
                  <div className="text-sm text-gray-500">Total Records</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{statusCounts['Active'] || 0}</div>
                  <div className="text-sm text-gray-500">Active</div>
                </div>
                <div className="text-center p-4 bg-orange-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{statusCounts['Needs New Role'] || 0}</div>
                  <div className="text-sm text-gray-500">Ending Soon</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">{statusCounts['Completed'] || 0}</div>
                  <div className="text-sm text-gray-500">Completed</div>
                </div>
              </div>
            </div>

            {/* Data Preview */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">
                    Data Preview
                  </h2>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => {
                        setShowPreview(false);
                        setProcessedData([]);
                        setFile(null);
                        setSyncResults({ show: false, success: 0, errors: 0 });
                      }}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={syncToDatabase}
                      disabled={isSyncing}
                      className="inline-flex items-center px-6 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSyncing ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Syncing...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Sync to Database
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Candidate
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Assignment
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Duration
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Support Team
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {processedData.slice(0, 10).map((row, index) => {
                      const daysRemaining = getDaysRemaining(row.end_date);
                      return (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {row.candidate_name}
                              </div>
                              <div className="text-xs text-gray-500">
                                ID: {row.candidate_id}
                              </div>
                              {row.email && (
                                <div className="text-xs text-gray-500 flex items-center mt-1">
                                  <Mail size={12} className="mr-1" />
                                  {row.email}
                                </div>
                              )}
                              {row.phone_number && (
                                <div className="text-xs text-gray-500 flex items-center mt-1">
                                  <Phone size={12} className="mr-1" />
                                  {row.phone_number}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">{row.facility_name || '-'}</div>
                            <div className="text-xs text-gray-500">{row.contract_type}</div>
                            {row.job_id && (
                              <div className="text-xs text-gray-400">Job: {row.job_id}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center text-sm text-gray-900">
                              <Calendar size={14} className="mr-1 text-gray-400" />
                              {formatDisplayDate(row.start_date)} - {formatDisplayDate(row.end_date)}
                            </div>
                            {daysRemaining !== null && (
                              <div className={`text-xs mt-1 ${daysRemaining < 0 ? 'text-gray-500' :
                                  daysRemaining <= 14 ? 'text-red-600 font-medium' :
                                    daysRemaining <= 56 ? 'text-orange-600 font-medium' :
                                      'text-gray-500'
                                }`}>
                                {daysRemaining < 0 ? 'Ended' : `${daysRemaining} days remaining`}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${row.status === 'Active' ? 'bg-green-100 text-green-800' :
                                row.status === 'Needs New Role' ? 'bg-orange-100 text-orange-800' :
                                  'bg-gray-100 text-gray-800'
                              }`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-xs text-gray-600 space-y-1">
                              {row.recruiter && <div>Recruiter: {row.recruiter}</div>}
                              {row.am_ac && <div>AM/AC: {row.am_ac}</div>}
                              {row.cs_name && <div>CS: {row.cs_name}</div>}
                              {row.cl_name && <div>CL: {row.cl_name}</div>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {processedData.length > 10 && (
                  <div className="px-6 py-3 bg-gray-50 text-center text-sm text-gray-500 border-t">
                    Showing 10 of {processedData.length} records
                  </div>
                )}
              </div>
            </div>

            {/* Sync Results */}
            {syncResults.show && (
              <div className={`rounded-lg p-4 ${syncResults.errors > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
                }`}>
                <div className="flex items-center">
                  <CheckCircle2 className={`w-5 h-5 mr-3 ${syncResults.errors > 0 ? 'text-red-600' : 'text-green-600'
                    }`} />
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${syncResults.errors > 0 ? 'text-red-800' : 'text-green-800'
                      }`}>
                      {syncResults.errors > 0 ? 'Sync Failed' : 'Sync Complete'}
                    </p>
                    <p className={`text-sm mt-1 ${syncResults.errors > 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                      {syncResults.errors > 0
                        ? `Failed to sync ${syncResults.errors} records${syncResults.errorDetails ? `: ${syncResults.errorDetails}` : ''}`
                        : `Successfully synced ${syncResults.success} records`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}