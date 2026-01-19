import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Sparkles, X, Copy, Check, Upload, FileText, Edit3, ChevronRight, Zap, Calendar, Building2, Briefcase, Hash, Activity, AlertCircle, Loader, ClipboardPaste, MapPin, Clock, Users, Phone, Mail, User, Award, FileIcon } from 'lucide-react';
import * as mammoth from 'mammoth';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================
type WorkHistoryEntry = {
    // Core fields matching the form
    startMonth: string;
    startYear: string;
    endMonth: string;
    endYear: string;
    currentlyWorking: boolean;
    facility: string;
    city: string;
    state: string;
    positionHeld: string;
    unitSpecialty: string;
    employmentType: string;
    nursePatientRatio: string;
    chargeExperience: boolean;
    shift: string;
    chartingSystem: string;
    teachingFacility: boolean;
    traumaFacility: boolean;
    traumaLevel: string;
    magnetFacility: boolean;
    facilityBeds: string;
    unitBeds: string;
    // Additional parsed info
    responsibilities: string;
};

// ============================================================================
// DESIGN SYSTEM
// ============================================================================
const DESIGN = {
    colors: {
        background: '#FFFFFF',
        surface: '#FAFAFA',
        border: {
            default: '#E5E5E7',
            hover: '#D1D1D4',
            focus: '#0071E3'
        },
        text: {
            primary: '#000000',
            secondary: '#6E6E73',
            tertiary: '#86868B',
            inverse: '#FFFFFF'
        },
        accent: {
            primary: '#0071E3',
            primaryHover: '#0051C3',
            success: '#34C759',
            warning: '#FF9500',
            error: '#FF3B30',
            purple: '#AF52DE',
            gradient: 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)'
        }
    },
    shadows: {
        xs: '0 1px 2px 0 rgba(0, 0, 0, 0.02)',
        sm: '0 2px 4px 0 rgba(0, 0, 0, 0.04)',
        md: '0 4px 6px -1px rgba(0, 0, 0, 0.06)',
        lg: '0 10px 15px -3px rgba(0, 0, 0, 0.08)',
    }
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function WorkHistoryParser() {
    const [resumeText, setResumeText] = useState('');
    const [fileName, setFileName] = useState<string | null>(null);
    const [parsedHistory, setParsedHistory] = useState<WorkHistoryEntry[]>([]);
    const [isParsing, setIsParsing] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [selectedEntry, setSelectedEntry] = useState<number | null>(null);
    const [inputSource, setInputSource] = useState<'file' | 'paste' | null>(null);

    const handleFileChange = async (file: File | null) => {
        if (!file) return;

        setFileName(file.name);
        setInputSource('file');
        
        if (file.type === 'text/plain') {
            const reader = new FileReader();
            reader.onload = async (event) => {
                setResumeText(event.target?.result as string);
            };
            reader.readAsText(file);
        } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const arrayBuffer = event.target?.result as ArrayBuffer;
                    const result = await mammoth.extractRawText({ arrayBuffer });
                    setResumeText(result.value);
                } catch (error) {
                    console.error('Error parsing .docx file:', error);
                    alert('Failed to parse the .docx file. Please try copying and pasting the text instead.');
                    handleClear();
                }
            };
            reader.readAsArrayBuffer(file);
        } else if (file.type === 'application/pdf') {
            // PDF files need special handling
            alert('PDF parsing requires you to copy and paste the text from your PDF. Please open your PDF, select all text (Ctrl/Cmd+A), copy it (Ctrl/Cmd+C), and paste it here.');
            handleClear();
        }
    };

    const handlePaste = (text: string) => {
        setResumeText(text);
        setFileName('Pasted Resume');
        setInputSource('paste');
    };

    const parseDate = (dateStr: string): { month: string; year: string } => {
        // Handle MM/YYYY format
        if (dateStr.match(/\d{1,2}\/\d{2,4}/)) {
            const [month, year] = dateStr.split('/');
            const monthNum = parseInt(month);
            const yearNum = parseInt(year);
            const fullYear = yearNum < 100 ? (yearNum > 50 ? 1900 + yearNum : 2000 + yearNum) : yearNum;
            return { 
                month: monthNum.toString(), 
                year: fullYear.toString() 
            };
        }
        
        // Handle Month YYYY format
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                          'july', 'august', 'september', 'october', 'november', 'december'];
        const monthMatch = dateStr.toLowerCase().match(new RegExp(`(${monthNames.join('|')})\\s+(\\d{4})`));
        if (monthMatch) {
            const monthIndex = monthNames.indexOf(monthMatch[1].toLowerCase()) + 1;
            return { 
                month: monthIndex.toString(), 
                year: monthMatch[2] 
            };
        }
        
        // Handle abbreviated months
        const abbrevMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const abbrevMatch = dateStr.toLowerCase().match(new RegExp(`(${abbrevMonths.join('|')})\\w*\\s+(\\d{4})`));
        if (abbrevMatch) {
            const monthIndex = abbrevMonths.indexOf(abbrevMatch[1].substring(0, 3)) + 1;
            return { 
                month: monthIndex.toString(), 
                year: abbrevMatch[2] 
            };
        }
        
        return { month: '', year: '' };
    };

    const handleParseResume = useCallback(async () => {
        if (!resumeText || resumeText.trim().length === 0) {
            alert('No resume text to parse. Please upload a file or paste text.');
            return;
        }
        
        setIsParsing(true);
        setParsedHistory([]);
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const entries: WorkHistoryEntry[] = [];
        const cleanText = resumeText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Find experience section
        const experienceMatch = cleanText.match(/(?:EXPERIENCE|WORK\s*HISTORY|EMPLOYMENT|Work Experience)[:\s]*[\s\S]*?(?=(?:EDUCATION|LICENSE|SKILLS|Additional Information|$))/i);
        const experienceSection = experienceMatch ? experienceMatch[0] : cleanText;
        
        // Detect if this is a nursing resume or SPT/other healthcare role
        const isNursingResume = /(?:Registered\s*Nurse|RN\b|BSN|ADN|LPN|LVN)/i.test(cleanText);
        const isSPTResume = /(?:Sterile\s*Processing|CRCST|SPT|Surgical\s*Tech)/i.test(cleanText);
        
        // Split into job blocks
        const jobBlocks: string[] = [];
        const lines = experienceSection.split('\n');
        let currentBlock = '';
        let inBlock = false;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
            
            // Check if this line starts a new job entry
            // For SPT resumes: Look for facility name followed by location
            // For nursing: Look for facility pattern with pipe or comma
            const looksLikeFacility = line.match(/(?:Hospital|Medical|Healthcare|Health|Center|Clinic|Brigham|Trauma|Kaiser|Regional)/i);
            const nextLooksLikeLocation = nextLine.match(/^[A-Z][^,]+,\s*[A-Z]{2}$/);
            
            if (line.match(/^[A-Z].*(?:\||,)\s*[A-Z]/) || 
                (looksLikeFacility && nextLooksLikeLocation) ||
                looksLikeFacility) {
                if (currentBlock && inBlock) {
                    jobBlocks.push(currentBlock);
                }
                currentBlock = line;
                inBlock = true;
            } else if (inBlock) {
                currentBlock += '\n' + line;
                // Check if we've reached the end of this job block
                // (next line starts with a new facility or we hit education/skills section)
                if (i + 1 < lines.length) {
                    const upcomingLine = lines[i + 1].trim();
                    if (upcomingLine.match(/(?:Hospital|Medical|Healthcare|Health|Center|Clinic)/i) ||
                        upcomingLine.match(/^[A-Z].*(?:\||,)\s*[A-Z]/)) {
                        jobBlocks.push(currentBlock);
                        currentBlock = '';
                        inBlock = false;
                    }
                }
            }
        }
        
        if (currentBlock && inBlock) {
            jobBlocks.push(currentBlock);
        }

        // Parse each job block
        jobBlocks.forEach((block) => {
            const blockLines = block.split('\n').filter(l => l.trim());
            if (blockLines.length === 0) return;
            
            // Parse facility and location
            let facility = '';
            let city = '';
            let state = '';
            let lineIndex = 0;
            
            // First line is usually facility
            facility = blockLines[lineIndex]?.trim() || '';
            lineIndex++;
            
            // Check if next line is location (City, State format)
            if (lineIndex < blockLines.length) {
                const locationMatch = blockLines[lineIndex].match(/^([^,]+),\s*([A-Z]{2}|[A-Za-z\s]+)$/);
                if (locationMatch) {
                    city = locationMatch[1].trim();
                    state = locationMatch[2].trim();
                    lineIndex++;
                } else {
                    // Try to extract from facility line if it has pipe or comma
                    const facilityMatch = facility.match(/^([^|,]+?)[\s]*[|,]\s*([^,]+),?\s*([A-Z]{2}\b|Ohio|California|[A-Z][a-z]+)/);
                    if (facilityMatch) {
                        facility = facilityMatch[1].trim();
                        city = facilityMatch[2].trim();
                        state = facilityMatch[3].trim();
                    }
                }
            }
            
            // Standardize state abbreviations
            if (state.toLowerCase() === 'ohio') state = 'OH';
            if (state.toLowerCase() === 'california') state = 'CA';
            if (state.toLowerCase() === 'michigan') state = 'MI';
            if (state.toLowerCase() === 'maryland') state = 'MD';
            if (state.toLowerCase() === 'florida') state = 'FL';
            if (state.toLowerCase() === 'virginia') state = 'VA';
            
            // Parse dates - look ahead a few lines
            let startMonth = '';
            let startYear = '';
            let endMonth = '';
            let endYear = '';
            let currentlyWorking = false;
            
            for (let i = lineIndex; i < Math.min(lineIndex + 3, blockLines.length); i++) {
                const dateLine = blockLines[i];
                const datePattern = /(\w+\s+\d{4}|\d{1,2}\/\d{2,4})[\s\-–to]+(?:(\w+\s+\d{4}|\d{1,2}\/\d{2,4})|(?:Present|Current|Now|Ongoing))/i;
                const dateMatch = dateLine.match(datePattern);
                
                if (dateMatch) {
                    const startDate = parseDate(dateMatch[1]);
                    startMonth = startDate.month;
                    startYear = startDate.year;
                    
                    if (dateMatch[2]) {
                        const endDate = parseDate(dateMatch[2]);
                        endMonth = endDate.month;
                        endYear = endDate.year;
                    } else {
                        currentlyWorking = true;
                    }
                    lineIndex = i + 1;
                    break;
                }
            }
            
            // Parse position and unit/specialty
            let positionHeld = '';
            let unitSpecialty = '';
            
            // Determine position based on resume type
            if (isSPTResume) {
                positionHeld = 'Sterile Processing Technician';
                // Look for specific role details
                const roleMatch = block.match(/(?:Travel|Traveler|Contract|Lead|Senior)?\s*(?:Sterile\s*Processing\s*Technician|CRCST|SPT)/i);
                if (roleMatch) {
                    if (roleMatch[0].match(/Travel/i)) {
                        positionHeld = 'Travel Sterile Processing Technician';
                    }
                }
                // SPT units might be OR, Decontam, etc.
                if (block.match(/OR\s*Distribution/i)) unitSpecialty = 'OR Distribution';
                else if (block.match(/Decontamination/i)) unitSpecialty = 'Decontamination';
                else if (block.match(/Case\s*Cart/i)) unitSpecialty = 'Case Cart';
                else unitSpecialty = 'Central Sterile';
            } else if (isNursingResume) {
                positionHeld = 'Registered Nurse';
                // Look for unit/specialty
                const unitPatterns = [
                    /(?:Emergency\s*Room|Emergency|ED|ER)/i,
                    /(?:ICU|Intensive\s*Care)/i,
                    /(?:LTAC|Long[\s\-]?term)/i,
                    /(?:Hospice)/i,
                    /(?:Float\s*Pool|Float)/i,
                    /(?:Med[\s\/\-]?Surg|Medical[\s\/\-]?Surgical)/i,
                    /(?:Telemetry|Tele)/i,
                    /(?:Step[\s\-]?down|Progressive)/i,
                    /(?:House\s*Supervisor)/i,
                    /(?:Labor\s*&?\s*Delivery|L&D|OB)/i,
                    /(?:NICU|PICU|Pediatric)/i,
                    /(?:OR|Operating\s*Room|Peri[\s\-]?op)/i
                ];
                
                for (const pattern of unitPatterns) {
                    const match = block.match(pattern);
                    if (match) {
                        unitSpecialty = match[0].replace(/\s+/g, ' ').trim();
                        break;
                    }
                }
            } else {
                // Generic healthcare position
                const positionMatch = block.match(/(?:Technician|Nurse|Therapist|Assistant|Coordinator|Manager|Director)/i);
                if (positionMatch) {
                    positionHeld = positionMatch[0];
                }
            }
            
            // Parse charting system
            const chartingPattern = /(epic|cerner|meditech|allscripts|nextgen|athena|eclinicalworks|trubridge|home\s*care\s*home\s*base|pointclickcare|mckesson|sunrise|paper\s*chart|spm\s*computer|censitrac)/i;
            const chartingMatch = block.match(chartingPattern);
            let chartingSystem = chartingMatch ? chartingMatch[1].replace(/\s+/g, ' ').trim() : '';
            
            // Standardize charting system names
            if (chartingSystem.toLowerCase().includes('epic')) chartingSystem = 'Epic';
            if (chartingSystem.toLowerCase().includes('cerner')) chartingSystem = 'Cerner';
            if (chartingSystem.toLowerCase().includes('meditech')) chartingSystem = 'Meditech';
            if (chartingSystem.toLowerCase().includes('trubridge')) chartingSystem = 'TruBridge';
            if (chartingSystem.toLowerCase().includes('spm')) chartingSystem = 'SPM';
            if (chartingSystem.toLowerCase().includes('censitrac')) chartingSystem = 'Censitrac';
            
            // Check for charge experience (mainly for nurses)
            const chargeExperience = /charge\s*(?:nurse|rn|experience)/i.test(block);
            
            // Check for trauma facility and level
            let traumaFacility = false;
            let traumaLevel = '';
            const traumaMatch = block.match(/(?:Trauma|Level)\s*([I|II|III|IV|V|1|2|3|4|5])/i);
            if (traumaMatch) {
                traumaFacility = true;
                traumaLevel = traumaMatch[1].replace(/1|2|3|4|5/, m => ['I','II','III','IV','V'][parseInt(m)-1]);
            }
            
            // Check for teaching facility
            const teachingFacility = /(?:university|teaching|academic|medical\s*center)/i.test(facility);
            
            // Check for magnet facility
            const magnetFacility = /magnet/i.test(block);
            
            // Parse bed counts if mentioned
            let facilityBeds = '';
            let unitBeds = '';
            const bedMatch = block.match(/(\d+)[\s\-]*bed/i);
            if (bedMatch) {
                if (block.match(/unit|department|ed|er|icu/i)) {
                    unitBeds = bedMatch[1];
                } else {
                    facilityBeds = bedMatch[1];
                }
            }
            
            // Determine employment type
            const employmentType = block.match(/travel|traveler|contract|per\s*diem|prn|agency/i) ? 'Contract' : 'Permanent';
            
            // Determine shift
            let shift = '';
            if (block.match(/night/i)) shift = 'Nights';
            else if (block.match(/day/i)) shift = 'Days';
            else if (block.match(/evening|pm/i)) shift = 'Evenings';
            
            // Extract nurse to patient ratio if mentioned (for nurses)
            let nursePatientRatio = '';
            if (isNursingResume) {
                const ratioMatch = block.match(/(\d+)[:\s]+(\d+)\s*(?:ratio|patients?)/i);
                if (ratioMatch) {
                    nursePatientRatio = `1:${ratioMatch[2]}`;
                }
            }
            
            // Extract key responsibilities
            const responsibilities = blockLines
                .slice(lineIndex)
                .filter(line => !line.match(/^\d{1,2}\/\d{2,4}/) && line.length > 10)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 200);
            
            const entry: WorkHistoryEntry = {
                startMonth,
                startYear,
                endMonth,
                endYear,
                currentlyWorking,
                facility,
                city,
                state,
                positionHeld,
                unitSpecialty,
                employmentType,
                nursePatientRatio,
                chargeExperience,
                shift,
                chartingSystem,
                teachingFacility,
                traumaFacility,
                traumaLevel,
                magnetFacility,
                facilityBeds,
                unitBeds,
                responsibilities
            };
            
            entries.push(entry);
        });
        
        if (entries.length === 0) {
            alert('Could not parse any work history. Please ensure the resume contains work experience.');
        }
        
        setParsedHistory(entries);
        setIsParsing(false);
        if (entries.length > 0) {
            setSelectedEntry(0);
        }
    }, [resumeText]);

    const handleCopy = (text: string, fieldId: string) => {
        navigator.clipboard.writeText(text);
        setCopiedField(fieldId);
        setTimeout(() => setCopiedField(null), 2000);
    };

    const handleClear = () => {
        setResumeText('');
        setParsedHistory([]);
        setFileName(null);
        setSelectedEntry(null);
        setInputSource(null);
    };

    return (
        <div className="min-h-screen bg-white">
            <div className="max-w-7xl mx-auto p-6">
                {/* Header */}
                <header className="mb-8 text-center">
                    <h1 className="text-3xl font-bold mb-2" style={{ color: DESIGN.colors.text.primary }}>
                        Work History Parser
                    </h1>
                    <p className="text-base" style={{ color: DESIGN.colors.text.secondary }}>
                        Parse resume and copy fields directly to your form
                    </p>
                </header>

                {/* Main Grid */}
                <div className="grid lg:grid-cols-2 gap-6">
                    {/* Input Section */}
                    <div className="space-y-4">
                        <div className="p-6 rounded-xl" style={{ 
                            background: DESIGN.colors.background,
                            boxShadow: DESIGN.shadows.md,
                            border: `1px solid ${DESIGN.colors.border.default}`
                        }}>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold" style={{ color: DESIGN.colors.text.primary }}>
                                    Resume Input
                                </h2>
                                {fileName && (
                                    <span className="text-xs px-2 py-1 rounded-full" style={{
                                        background: DESIGN.colors.accent.success + '20',
                                        color: DESIGN.colors.accent.success
                                    }}>
                                        Ready
                                    </span>
                                )}
                            </div>

                            {fileName ? (
                                <FileDisplay 
                                    fileName={fileName} 
                                    onClear={handleClear}
                                />
                            ) : (
                                <FileDropzone onFileChange={handleFileChange} onPaste={handlePaste} />
                            )}

                            <button
                                onClick={handleParseResume}
                                disabled={!resumeText || isParsing}
                                className="w-full mt-4 px-4 py-3 rounded-lg font-medium text-white transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
                                style={{
                                    background: resumeText && !isParsing ? DESIGN.colors.accent.primary : DESIGN.colors.text.tertiary,
                                }}
                            >
                                {isParsing ? (
                                    <>
                                        <Loader className="animate-spin" size={16} />
                                        Parsing...
                                    </>
                                ) : (
                                    <>
                                        <Zap size={16} />
                                        Parse Resume
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Results Section */}
                    <div className="space-y-4">
                        {isParsing ? (
                            <div className="p-12 rounded-xl flex items-center justify-center" style={{ 
                                background: DESIGN.colors.background,
                                boxShadow: DESIGN.shadows.md,
                                border: `1px solid ${DESIGN.colors.border.default}`
                            }}>
                                <div className="text-center">
                                    <Loader className="animate-spin mx-auto mb-3" size={24} style={{ color: DESIGN.colors.accent.primary }} />
                                    <p className="text-sm" style={{ color: DESIGN.colors.text.secondary }}>
                                        Analyzing resume...
                                    </p>
                                </div>
                            </div>
                        ) : parsedHistory.length > 0 ? (
                            <>
                                {/* Position selector */}
                                <div className="flex gap-2 mb-2">
                                    {parsedHistory.map((_, index) => (
                                        <button
                                            key={index}
                                            onClick={() => setSelectedEntry(index)}
                                            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                                            style={{
                                                background: selectedEntry === index ? DESIGN.colors.accent.primary : DESIGN.colors.surface,
                                                color: selectedEntry === index ? DESIGN.colors.text.inverse : DESIGN.colors.text.secondary,
                                                border: `1px solid ${selectedEntry === index ? DESIGN.colors.accent.primary : DESIGN.colors.border.default}`
                                            }}
                                        >
                                            Position {index + 1}
                                        </button>
                                    ))}
                                </div>

                                {/* Selected position details */}
                                {selectedEntry !== null && parsedHistory[selectedEntry] && (
                                    <WorkHistoryFields
                                        entry={parsedHistory[selectedEntry]}
                                        index={selectedEntry}
                                        onCopy={handleCopy}
                                        copiedField={copiedField}
                                    />
                                )}
                            </>
                        ) : (
                            <div className="p-12 rounded-xl" style={{ 
                                background: DESIGN.colors.background,
                                boxShadow: DESIGN.shadows.md,
                                border: `1px solid ${DESIGN.colors.border.default}`
                            }}>
                                <EmptyState />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// WORK HISTORY FIELDS COMPONENT
// ============================================================================
const WorkHistoryFields: React.FC<{
    entry: WorkHistoryEntry;
    index: number;
    onCopy: (text: string, fieldId: string) => void;
    copiedField: string | null;
}> = ({ entry, index, onCopy, copiedField }) => {
    const CopyButton = ({ text, fieldId }: { text: string; fieldId: string }) => (
        <button
            onClick={() => onCopy(text, fieldId)}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
            title="Copy to clipboard"
        >
            {copiedField === fieldId ? 
                <Check size={14} className="text-green-500" /> : 
                <Copy size={14} style={{ color: DESIGN.colors.text.tertiary }} />
            }
        </button>
    );

    const Field = ({ label, value, fieldId, icon }: { label: string; value: string; fieldId: string; icon?: React.ReactNode }) => (
        <div className="p-3 rounded-lg group" style={{ background: DESIGN.colors.surface }}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1">
                    {icon && <div style={{ color: DESIGN.colors.text.tertiary }}>{icon}</div>}
                    <div className="flex-1">
                        <p className="text-xs font-medium" style={{ color: DESIGN.colors.text.tertiary }}>
                            {label}
                        </p>
                        <p className="text-sm font-medium mt-0.5" style={{ color: value ? DESIGN.colors.text.primary : DESIGN.colors.text.tertiary }}>
                            {value || 'Not specified'}
                        </p>
                    </div>
                </div>
                {value && <CopyButton text={value} fieldId={fieldId} />}
            </div>
        </div>
    );

    return (
        <div className="p-6 rounded-xl" style={{ 
            background: DESIGN.colors.background,
            boxShadow: DESIGN.shadows.md,
            border: `1px solid ${DESIGN.colors.border.default}`
        }}>
            <div className="mb-4">
                <h3 className="text-lg font-semibold" style={{ color: DESIGN.colors.text.primary }}>
                    {entry.facility || 'Position'} {index + 1}
                </h3>
                <p className="text-sm" style={{ color: DESIGN.colors.text.secondary }}>
                    {entry.unitSpecialty} • {entry.city}, {entry.state}
                </p>
            </div>

            <div className="space-y-3">
                {/* Date Fields */}
                <div className="grid grid-cols-2 gap-3">
                    <Field 
                        label="Start Month" 
                        value={entry.startMonth} 
                        fieldId={`${index}-startMonth`}
                        icon={<Calendar size={14} />}
                    />
                    <Field 
                        label="Start Year" 
                        value={entry.startYear} 
                        fieldId={`${index}-startYear`}
                        icon={<Calendar size={14} />}
                    />
                </div>

                {entry.currentlyWorking ? (
                    <Field 
                        label="Currently Working" 
                        value="Yes" 
                        fieldId={`${index}-current`}
                        icon={<Clock size={14} />}
                    />
                ) : (
                    <div className="grid grid-cols-2 gap-3">
                        <Field 
                            label="End Month" 
                            value={entry.endMonth} 
                            fieldId={`${index}-endMonth`}
                            icon={<Calendar size={14} />}
                        />
                        <Field 
                            label="End Year" 
                            value={entry.endYear} 
                            fieldId={`${index}-endYear`}
                            icon={<Calendar size={14} />}
                        />
                    </div>
                )}

                {/* Core Fields */}
                <Field 
                    label="Position Held" 
                    value={entry.positionHeld} 
                    fieldId={`${index}-position`}
                    icon={<Briefcase size={14} />}
                />
                
                <Field 
                    label="Facility" 
                    value={entry.facility} 
                    fieldId={`${index}-facility`}
                    icon={<Building2 size={14} />}
                />
                
                <div className="grid grid-cols-2 gap-3">
                    <Field 
                        label="City" 
                        value={entry.city} 
                        fieldId={`${index}-city`}
                        icon={<MapPin size={14} />}
                    />
                    <Field 
                        label="State" 
                        value={entry.state} 
                        fieldId={`${index}-state`}
                        icon={<MapPin size={14} />}
                    />
                </div>

                <Field 
                    label="Unit/Specialty" 
                    value={entry.unitSpecialty} 
                    fieldId={`${index}-unit`}
                    icon={<Activity size={14} />}
                />

                <Field 
                    label="Charting System" 
                    value={entry.chartingSystem} 
                    fieldId={`${index}-charting`}
                    icon={<FileText size={14} />}
                />

                {/* Additional Fields */}
                <div className="grid grid-cols-2 gap-3">
                    <Field 
                        label="Employment Type" 
                        value={entry.employmentType} 
                        fieldId={`${index}-employment`}
                        icon={<Briefcase size={14} />}
                    />
                    <Field 
                        label="Shift" 
                        value={entry.shift} 
                        fieldId={`${index}-shift`}
                        icon={<Clock size={14} />}
                    />
                </div>

                {/* Facility Details */}
                <div className="grid grid-cols-2 gap-3">
                    <Field 
                        label="Charge Experience" 
                        value={entry.chargeExperience ? 'Yes' : 'No'} 
                        fieldId={`${index}-charge`}
                        icon={<User size={14} />}
                    />
                    <Field 
                        label="Trauma Level" 
                        value={entry.traumaFacility ? `Level ${entry.traumaLevel}` : 'No'} 
                        fieldId={`${index}-trauma`}
                        icon={<AlertCircle size={14} />}
                    />
                </div>

                {/* Bed counts if available */}
                {(entry.facilityBeds || entry.unitBeds) && (
                    <div className="grid grid-cols-2 gap-3">
                        <Field 
                            label="Facility Beds" 
                            value={entry.facilityBeds} 
                            fieldId={`${index}-facilityBeds`}
                            icon={<Hash size={14} />}
                        />
                        <Field 
                            label="Unit Beds" 
                            value={entry.unitBeds} 
                            fieldId={`${index}-unitBeds`}
                            icon={<Hash size={14} />}
                        />
                    </div>
                )}

                {/* Certifications */}
                <div className="grid grid-cols-3 gap-3">
                    <Field 
                        label="Teaching" 
                        value={entry.teachingFacility ? 'Yes' : 'No'} 
                        fieldId={`${index}-teaching`}
                        icon={<Award size={14} />}
                    />
                    <Field 
                        label="Trauma" 
                        value={entry.traumaFacility ? 'Yes' : 'No'} 
                        fieldId={`${index}-traumaFac`}
                        icon={<AlertCircle size={14} />}
                    />
                    <Field 
                        label="Magnet" 
                        value={entry.magnetFacility ? 'Yes' : 'No'} 
                        fieldId={`${index}-magnet`}
                        icon={<Award size={14} />}
                    />
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================
const FileDropzone: React.FC<{ 
    onFileChange: (file: File | null) => void;
    onPaste: (text: string) => void;
}> = ({ onFileChange, onPaste }) => {
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleDrag = (e: React.DragEvent<HTMLDivElement>, isDragging: boolean) => {
        e.preventDefault();
        setIsDragging(isDragging);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        onFileChange(file || null);
    };

    const handlePasteEvent = (e: React.ClipboardEvent<HTMLDivElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text');
        if (text) {
            onPaste(text);
        }
    };

    return (
        <div
            onDragEnter={(e) => handleDrag(e, true)}
            onDragOver={(e) => handleDrag(e, true)}
            onDragLeave={(e) => handleDrag(e, false)}
            onDrop={handleDrop}
            onPaste={handlePasteEvent}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg cursor-pointer transition-all duration-200 p-8"
            style={{
                background: isDragging ? `${DESIGN.colors.accent.primary}08` : DESIGN.colors.surface,
                border: `2px dashed ${isDragging ? DESIGN.colors.accent.primary : DESIGN.colors.border.default}`,
            }}
            tabIndex={0}
        >
            <input
                type="file"
                ref={inputRef}
                onChange={(e) => onFileChange(e.target.files?.[0] || null)}
                accept=".docx,.txt,.pdf"
                className="hidden"
            />
            
            <div className="text-center">
                <div className="flex justify-center gap-2 mb-3">
                    <Upload size={20} style={{ color: DESIGN.colors.accent.primary }} />
                    <ClipboardPaste size={20} style={{ color: DESIGN.colors.accent.purple }} />
                </div>
                <p className="text-sm font-medium mb-1" style={{ color: DESIGN.colors.text.primary }}>
                    Drop file here or paste text
                </p>
                <p className="text-xs" style={{ color: DESIGN.colors.text.tertiary }}>
                    Supports .DOCX, .TXT, .PDF • Ctrl/Cmd+V to paste
                </p>
            </div>
        </div>
    );
};

const FileDisplay: React.FC<{ 
    fileName: string; 
    onClear: () => void;
}> = ({ fileName, onClear }) => (
    <div className="p-3 rounded-lg flex items-center justify-between"
         style={{ 
             background: DESIGN.colors.surface,
             border: `1px solid ${DESIGN.colors.border.default}`
         }}>
        <div className="flex items-center gap-2">
            <FileText size={16} style={{ color: DESIGN.colors.accent.primary }} />
            <p className="text-sm font-medium" style={{ color: DESIGN.colors.text.primary }}>
                {fileName}
            </p>
        </div>
        <button
            onClick={onClear}
            className="p-1.5 rounded hover:bg-gray-100 transition-colors"
        >
            <X size={16} style={{ color: DESIGN.colors.text.tertiary }} />
        </button>
    </div>
);

const EmptyState: React.FC = () => (
    <div className="text-center">
        <FileText size={32} style={{ color: DESIGN.colors.text.tertiary }} className="mx-auto mb-3" />
        <p className="text-sm font-medium" style={{ color: DESIGN.colors.text.primary }}>
            No data yet
        </p>
        <p className="text-xs mt-1" style={{ color: DESIGN.colors.text.tertiary }}>
            Upload a resume or paste text to get started
        </p>
    </div>
);