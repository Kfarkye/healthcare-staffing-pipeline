import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Upload, Loader as Loader2, Copy, CircleCheck as CheckCircle, ExternalLink, Circle as XCircle, FileText, DollarSign, Camera, Download, CircleAlert as AlertCircle, Plus, RefreshCw, Sparkles, Mail, Send, Link2 } from 'lucide-react';

// ============================================================================
// OUTLOOK 365 INTEGRATION CONFIGURATION
// ============================================================================
const OUTLOOK_CONFIG = {
  // Outlook Web App (OWA) Integration
  webApp: {
    baseUrl: 'https://outlook.office.com/mail/deeplink/compose',
    maxUrlLength: 2000, // URL length limit for browsers
  },

  // Outlook Desktop Integration (via mailto)
  desktop: {
    protocol: 'mailto:',
    maxLength: 500, // Conservative limit for mailto links
  },

  // Microsoft Graph API Configuration (for future OAuth integration)
  graph: {
    baseUrl: 'https://graph.microsoft.com/v1.0',
    sendMailEndpoint: '/me/sendMail',
    scopes: ['Mail.Send', 'Mail.ReadWrite'],
  },

  // Email Recipients
  recipients: {
    to: 'Colton.Valdez@ayahealthcare.com',
    cc: 'Tiffany.chavez@ayahealthcare.com',
  }
};

// ============================================================================
// DESIGN SYSTEM CONSTANTS
// ============================================================================
const DESIGN_SYSTEM = {
  animations: {
    transition: {
      fast: 'transition-all duration-200',
      normal: 'transition-all duration-300',
      slow: 'transition-all duration-500'
    }
  },
  colors: {
    text: {
      primary: 'text-gray-900',
      secondary: 'text-gray-600',
      muted: 'text-gray-500',
      inverse: 'text-white'
    },
    bg: {
      primary: 'bg-white',
      secondary: 'bg-gray-50',
      hover: 'hover:bg-gray-50',
      active: 'active:bg-gray-100'
    },
    border: {
      default: 'border-gray-200',
      hover: 'hover:border-gray-300',
      focus: 'focus:border-gray-900'
    }
  },
  typography: {
    hero: 'text-2xl font-bold',
    title: 'text-lg font-semibold',
    label: 'text-xs font-medium uppercase tracking-wider',
    body: 'text-sm leading-relaxed',
    caption: 'text-xs text-gray-500',
    value: 'text-sm font-medium text-gray-900'
  },
  spacing: {
    modal: 'p-8',
    section: 'p-6',
    card: 'p-4'
  }
};

// ============================================================================
// API CONFIGURATION
// ============================================================================
const API_CONFIG = {
  gemini: {
    apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    model: 'gemini-3-flash-preview',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models'
  }
};

const EXTRACTION_CONFIG = {
  prompt: `You are a highly accurate data extraction assistant. Your task is to analyze the provided screenshot of a healthcare staffing margin calculator and extract specific fields into a clean JSON object.

**Instructions:**
1. Locate the field explicitly labeled "Actual Margin".
2. This value is usually a percentage and is often highlighted in a colored box (e.g., red). It is located near the top of the screen.
3. Extract ONLY this numerical value for the margin. Do not confuse it with "Target Margin" or any other percentage on the screen.
4. Return ONLY the JSON object with no extra text, comments, or markdown.

The JSON object must have this exact structure:
{
  "candidateName": "string",
  "facilityName": "string",
  "specialty": "string",
  "actualMarginPercent": "number"
}`,
  responseConfig: {
    response_mime_type: 'application/json',
    temperature: 0.1
  }
};

// ============================================================================
// PRESET CONFIGURATIONS
// ============================================================================
const PRESET_REASONS = [
  {
    id: 'standard',
    label: 'Standard (RFM)',
    template: (margin) => `RFM and Fast Distro set TM% at ${margin}%.`
  },
  {
    id: 'manager',
    label: 'Manager Approval',
    template: (margin) => `Colton approved ${margin}%`
  }
];

// ============================================================================
// OUTLOOK INTEGRATION SERVICE
// ============================================================================
class OutlookIntegrationService {
  /**
   * Open email in Outlook Web App (OWA)
   * This is the primary integration method for Office 365
   */
  static openInOutlookWeb(emailData) {
    const { to, cc, subject, body } = emailData;

    // FIXED: Manually build the query string using encodeURIComponent.
    // This correctly encodes spaces as '%20' instead of '+', which prevents
    // the '+' signs from appearing in the Outlook email body.
    const toParam = `to=${encodeURIComponent(to)}`;
    const ccParam = `cc=${encodeURIComponent(cc)}`;
    const subjectParam = `subject=${encodeURIComponent(subject)}`;
    const bodyParam = `body=${encodeURIComponent(body)}`;

    const outlookUrl = `${OUTLOOK_CONFIG.webApp.baseUrl}?${toParam}&${ccParam}&${subjectParam}&${bodyParam}`;

    // Check URL length and warn if too long
    if (outlookUrl.length > OUTLOOK_CONFIG.webApp.maxUrlLength) {
      console.warn('URL may be too long for some browsers. Consider shortening the email body.');
    }

    try {
      // Open in new tab/window
      const newWindow = window.open(outlookUrl, '_blank', 'noopener,noreferrer');

      // Check if window opened successfully
      if (newWindow === null || newWindow === undefined) {
        return false;
      }

      setTimeout(() => {
        try {
          if (newWindow.closed) {
            // Window was closed immediately, likely blocked
            return false;
          }
        } catch (error) {
          // Cross-origin error, window likely opened successfully
        }
      }, 100);

      return true;
    } catch (error) {
      console.warn('Failed to open Outlook Web App:', error);
      return false;
    }
  }

  /**
   * Open email via mailto protocol (for desktop Outlook)
   */
  static openInDesktopOutlook(emailData) {
    const { to, cc, subject, body } = emailData;

    // Build mailto link with proper encoding
    const mailtoUrl = `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // Check length constraints
    if (mailtoUrl.length > OUTLOOK_CONFIG.desktop.maxLength) {
      // Truncate body if needed
      const truncatedBody = body.substring(0, 200) + '... [Content truncated]';
      const truncatedUrl = `mailto:${to}?cc=${encodeURIComponent(cc)}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(truncatedBody)}`;
      window.location.href = truncatedUrl;
    } else {
      window.location.href = mailtoUrl;
    }
  }

  /**
   * Generate .eml file for download
   * This creates a properly formatted email file with embedded images
   */
  static generateEMLFile(emailData, images = []) {
    const { to, cc, subject, body, htmlBody } = emailData;
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const date = new Date().toUTCString();

    let emlContent = `From: sender@ayahealthcare.com
To: ${to}
CC: ${cc}
Subject: ${subject}
Date: ${date}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="${boundary}"

--${boundary}
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: 8bit

${htmlBody || body.replace(/\n/g, '<br>')}`;

    // Add embedded images if provided
    images.forEach((image, index) => {
      if (image.base64) {
        emlContent += `

--${boundary}
Content-Type: ${image.type || 'image/png'}
Content-Transfer-Encoding: base64
Content-Disposition: inline; filename="${image.name || `image${index + 1}.png`}"
Content-ID: <image${index + 1}>

${image.base64}`;
      }
    });

    emlContent += `

--${boundary}--`;

    return emlContent;
  }

  /**
   * Download EML file
   */
  static downloadEMLFile(emailData, filename = 'email.eml', images = []) {
    const emlContent = this.generateEMLFile(emailData, images);
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

  /**
   * Copy email content to clipboard in HTML format
   * Useful for pasting directly into Outlook
   */
  static async copyEmailAsHTML(emailData) {
    const { htmlBody } = emailData;

    if (!htmlBody) {
      throw new Error('No HTML content to copy');
    }

    // Create a blob with HTML content
    const htmlBlob = new Blob([htmlBody], { type: 'text/html' });
    const textBlob = new Blob([emailData.body], { type: 'text/plain' });

    try {
      // Use Clipboard API with multiple formats
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': htmlBlob,
          'text/plain': textBlob
        })
      ]);
      return true;
    } catch (err) {
      // Fallback to text-only copy
      await navigator.clipboard.writeText(emailData.body);
      return false; // Indicate HTML copy failed
    }
  }
}

// ============================================================================
// MARGIN APPROVAL SERVICE
// ============================================================================
class MarginApprovalService {
  /**
   * Extract data from image using Gemini API
   */
  static async extractDataFromImage(imageFile, imagePreviewUrl) {
    if (!imageFile || !imagePreviewUrl) {
      throw new Error('Image data is missing');
    }

    const apiKey = API_CONFIG.gemini.apiKey;
    if (!apiKey) {
      throw new Error('Gemini API key not configured');
    }

    const base64ImageForApi = imagePreviewUrl.split(',')[1];
    const apiUrl = `${API_CONFIG.gemini.endpoint}/${API_CONFIG.gemini.model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        parts: [
          { text: EXTRACTION_CONFIG.prompt },
          {
            inline_data: {
              mime_type: imageFile.type,
              data: base64ImageForApi
            }
          }
        ]
      }],
      generationConfig: EXTRACTION_CONFIG.responseConfig
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Extraction failed');
    }

    const result = await response.json();
    const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
      throw new Error('No content found in API response');
    }

    return JSON.parse(textResponse);
  }

  /**
   * Generate email content from form data
   */
  static generateEmailContent(extractedData, formState) {
    const { reason, placementType, premiumNeeded, premiumReason, sentToComp, compResponse } = formState;
    const { candidateName, actualMarginPercent } = extractedData;

    const subject = `Margin Approval: ${candidateName || '[Candidate]'} – ${actualMarginPercent || '[Margin]'}%`;

    const body = `Reason needed for approval? ${reason || PRESET_REASONS[0].template(actualMarginPercent || 12)}
Is this a New Placement, Extension, or Change of Contract? ${placementType}
Is premium approval needed? ${premiumNeeded}. Why? ${premiumNeeded === 'Y' ? premiumReason : 'No'}
Was this sent to Comp Info Y/N? ${sentToComp}. If yes, what was the distro's response? ${sentToComp === 'Y' ? compResponse : 'No'}`;

    const htmlBody = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333;">
  <p><strong>Reason needed for approval?</strong> ${reason || PRESET_REASONS[0].template(actualMarginPercent || 12)}</p>
  <p><strong>Is this a New Placement, Extension, or Change of Contract?</strong> ${placementType}</p>
  <p><strong>Is premium approval needed?</strong> ${premiumNeeded}. <strong>Why?</strong> ${premiumNeeded === 'Y' ? premiumReason : 'No'}</p>
  <p><strong>Was this sent to Comp Info Y/N?</strong> ${sentToComp}. <strong>If yes, what was the distro's response?</strong> ${sentToComp === 'Y' ? compResponse : 'No'}</p>
</div>`;

    return {
      to: OUTLOOK_CONFIG.recipients.to,
      cc: OUTLOOK_CONFIG.recipients.cc,
      subject,
      body,
      htmlBody
    };
  }

  /**
   * Copy image to clipboard
   */
  static async copyImageToClipboard(file) {
    if (!file) {
      throw new Error('No image to copy');
    }

    const clipboardItem = new ClipboardItem({ [file.type]: file });
    await navigator.clipboard.write([clipboardItem]);
  }

  /**
   * Copy text to clipboard
   */
  static async copyTextToClipboard(text) {
    if (!text) {
      throw new Error('No text to copy');
    }

    await navigator.clipboard.writeText(text);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const fileToBase64DataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result);
  reader.onerror = (error) => reject(error);
});

const extractBase64FromDataUrl = (dataUrl) => {
  return dataUrl.split(',')[1];
};

// ============================================================================
// COMPONENTS
// ============================================================================

const Toast = ({ message, show, type = 'success' }) => {
  if (!show) return null;

  const styles = {
    success: {
      bg: 'bg-green-50',
      border: 'border-green-200',
      icon: 'text-green-600',
      text: 'text-green-900'
    },
    error: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      icon: 'text-red-600',
      text: 'text-red-900'
    },
    info: {
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      icon: 'text-blue-600',
      text: 'text-blue-900'
    }
  };

  const style = styles[type] || styles.success;

  return (
    <div className="fixed top-6 right-6 z-50 animate-in slide-in-from-top-2 fade-in duration-200">
      <div className={`bg-white px-4 py-3 rounded-lg shadow-lg border ${style.border} flex items-center gap-3`}>
        <div className={`w-8 h-8 ${style.bg} rounded-full flex items-center justify-center flex-shrink-0`}>
          {type === 'success' && <CheckCircle size={16} className={style.icon} />}
          {type === 'error' && <XCircle size={16} className={style.icon} />}
          {type === 'info' && <AlertCircle size={16} className={style.icon} />}
        </div>
        <span className={`text-sm font-medium ${style.text}`}>{message}</span>
      </div>
    </div>
  );
};

const Button = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  onClick,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900';

  const variants = {
    primary: 'bg-gray-900 text-white hover:bg-gray-700 disabled:bg-gray-300',
    secondary: 'bg-white text-gray-900 border border-gray-200 hover:bg-gray-50 disabled:bg-gray-100',
    ghost: 'text-gray-600 hover:bg-gray-100',
    outlook: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300'
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-base gap-2',
    lg: 'px-6 py-3 text-base gap-2'
  };

  return (
    <button
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${DESIGN_SYSTEM.animations.transition.fast} ${className}`}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};

const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
    {children}
  </div>
);

const HeaderLine = ({ label, text, onCopy }) => (
  <div className="flex items-center justify-between text-sm group">
    <div className="flex items-baseline gap-2">
      <span className="font-semibold text-gray-500 w-16">{label}:</span>
      <span className="font-mono text-gray-800 break-all flex-1">{text}</span>
    </div>
    <button
      onClick={onCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-400 hover:text-gray-800 ml-2 flex-shrink-0"
      title={`Copy ${label}`}
    >
      <Copy size={14} />
    </button>
  </div>
);

const InputField = ({ label, value, onChange, placeholder, className = '' }) => (
  <div className={className}>
    <label className={DESIGN_SYSTEM.typography.label + ' ' + DESIGN_SYSTEM.colors.text.muted}>
      {label}
    </label>
    <input
      type="text"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="mt-1 w-full p-2 border border-gray-200 rounded-md bg-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
    />
  </div>
);

const RadioGroup = ({ label, options, selectedValue, onChange }) => (
  <div>
    <label className={`${DESIGN_SYSTEM.typography.label} ${DESIGN_SYSTEM.colors.text.muted} block mb-2`}>
      {label}
    </label>
    <div className="flex gap-4">
      {options.map((option) => (
        <label key={option} className="flex items-center gap-2 text-sm font-mono cursor-pointer">
          <input
            type="radio"
            name={label}
            value={option}
            checked={selectedValue === option}
            onChange={(e) => onChange(e.target.value)}
            className="h-4 w-4 text-gray-900 focus:ring-gray-900 border-gray-300"
          />
          <span className="text-gray-700">{option}</span>
        </label>
      ))}
    </div>
  </div>
);

const FileUploadZone = ({
  id,
  file,
  onChange,
  label,
  onRemove = null,
  isProcessing = false,
  extractionComplete = false
}) => (
  <div>
    <h2 className={`${DESIGN_SYSTEM.typography.title} text-gray-900 mb-4 flex items-center gap-2`}>
      {label}
      {extractionComplete && (
        <span className="text-xs font-normal text-green-600 flex items-center gap-1">
          <CheckCircle size={14} />
          Data extracted
        </span>
      )}
    </h2>
    <input
      type="file"
      id={id}
      accept="image/*"
      onChange={onChange}
      className="hidden"
      disabled={isProcessing}
    />
    <label
      htmlFor={id}
      className={`relative block w-full p-8 border-2 border-dashed rounded-lg text-center transition-colors ${isProcessing
        ? 'border-blue-300 bg-blue-50 cursor-wait'
        : file
          ? 'border-green-300 bg-green-50 cursor-pointer hover:border-green-400'
          : 'border-gray-300 cursor-pointer hover:border-gray-400'
        }`}
    >
      {isProcessing ? (
        <>
          <Loader2 className="w-8 h-8 mx-auto mb-3 text-blue-500 animate-spin" />
          <span className="text-sm font-medium text-blue-700 block">
            Extracting data from screenshot...
          </span>
          <span className="text-xs text-blue-600 mt-1 block">
            This usually takes 3-5 seconds
          </span>
        </>
      ) : (
        <>
          {file ? (
            <CheckCircle className="w-8 h-8 mx-auto mb-3 text-green-500" />
          ) : (
            <Upload className="w-8 h-8 mx-auto mb-3 text-gray-400" />
          )}
          <span className="text-sm font-medium text-gray-900 block">
            {file ? file.name : 'Click to upload or drag and drop'}
          </span>
          <span className="text-xs text-gray-500 mt-1 block">
            {file ? 'Click to replace' : 'PNG, JPG, GIF up to 10MB'}
          </span>
        </>
      )}
      {file && onRemove && !isProcessing && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-red-500 rounded-full bg-white/90 shadow-sm"
        >
          <XCircle size={20} />
        </button>
      )}
    </label>
  </div>
);

// ============================================================================
// OUTLOOK INTEGRATION MODAL
// ============================================================================
const OutlookIntegrationModal = ({ isOpen, onClose, emailData, images = [] }) => {
  const [sending, setSending] = useState(false);
  const [method, setMethod] = useState('web'); // Default to 'web' as it's fastest.

  if (!isOpen) return null;

  const handleSend = async () => {
    setSending(true);

    try {
      switch (method) {
        case 'web':
          const success = OutlookIntegrationService.openInOutlookWeb(emailData);
          if (!success) {
            throw new Error('Failed to open Outlook Web App. Please try another method.');
          }
          break;

        case 'desktop':
          OutlookIntegrationService.openInDesktopOutlook(emailData);
          break;

        case 'copy':
          const htmlCopied = await OutlookIntegrationService.copyEmailAsHTML(emailData);
          if (!htmlCopied) {
            console.warn('HTML copy failed, copied as plain text');
          }
          break;

        default:
          throw new Error('Invalid method selected');
      }

      onClose(true); // Success
    } catch (err) {
      console.error('Send failed:', err);
      onClose(false); // Failed
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-600" />
            Send with Outlook 365
          </h3>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                value="web"
                checked={method === 'web'}
                onChange={(e) => setMethod(e.target.value)}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-gray-900">Outlook Web App (Recommended)</div>
                <div className="text-sm text-gray-500">Opens instantly in your browser.</div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                value="copy"
                checked={method === 'copy'}
                onChange={(e) => setMethod(e.target.value)}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-gray-900">Copy to Clipboard</div>
                <div className="text-sm text-gray-500">Copies formatted email for you to paste manually.</div>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                value="desktop"
                checked={method === 'desktop'}
                onChange={(e) => setMethod(e.target.value)}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-gray-900">Desktop Outlook</div>
                <div className="text-sm text-gray-500">Opens in your local desktop app.</div>
              </div>
            </label>
          </div>

          {images.length > 0 && (
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <strong>Note:</strong> {images.length} screenshot{images.length > 1 ? 's' : ''} will need to be attached manually after opening Outlook.
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-200 flex gap-3">
          <Button
            onClick={handleSend}
            disabled={sending}
            variant="outlook"
            className="flex-1"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Continue
              </>
            )}
          </Button>
          <Button
            onClick={() => onClose(false)}
            variant="secondary"
            disabled={sending}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// CUSTOM HOOKS
// ============================================================================
const useToast = () => {
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState('success');

  const showToastNotification = useCallback((message, type = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  }, []);

  return {
    showToast,
    toastMessage,
    toastType,
    showToastNotification
  };
};

const useMarginApproval = () => {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [additionalImageFile, setAdditionalImageFile] = useState(null);
  const [additionalImagePreviewUrl, setAdditionalImagePreviewUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [showOutlookModal, setShowOutlookModal] = useState(false);
  const [formState, setFormState] = useState({
    reason: '',
    placementType: 'Extension',
    premiumNeeded: 'N',
    premiumReason: '',
    sentToComp: 'N',
    compResponse: ''
  });

  const { showToast, toastMessage, toastType, showToastNotification } = useToast();

  const emailParts = useMemo(() => {
    if (!extractedData) {
      return { to: '', cc: '', subject: '', body: '', htmlBody: '' };
    }

    const parts = MarginApprovalService.generateEmailContent(extractedData, formState);

    // Add image references to HTML body
    let enhancedHtmlBody = parts.htmlBody;
    if (imagePreviewUrl) {
      enhancedHtmlBody += `<br><p><strong>Screenshot for Reference:</strong></p>`;
      enhancedHtmlBody += `<img src="cid:image1" alt="Margin Calculator Screenshot" style="max-width: 100%; height: auto; display: block; margin-top: 10px;">`;
    }
    if (additionalImagePreviewUrl) {
      enhancedHtmlBody += `<br><p><strong>Additional Screenshot:</strong></p>`;
      enhancedHtmlBody += `<img src="cid:image2" alt="Additional Screenshot" style="max-width: 100%; height: auto; display: block; margin-top: 10px;">`;
    }

    return { ...parts, htmlBody: enhancedHtmlBody };
  }, [extractedData, formState, imagePreviewUrl, additionalImagePreviewUrl]);

  const processImage = useCallback(async (file, previewUrl) => {
    setIsLoading(true);
    setExtractedData(null);

    try {
      const data = await MarginApprovalService.extractDataFromImage(file, previewUrl);
      setExtractedData(data);

      if (data && data.actualMarginPercent) {
        setFormState(prev => ({
          ...prev,
          reason: PRESET_REASONS[0].template(data.actualMarginPercent)
        }));
      }

      showToastNotification('Data extracted successfully');
    } catch (err) {
      showToastNotification(err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToastNotification]);

  const handleFileChange = useCallback(async (event) => {
    const file = event.target.files[0];
    if (file) {
      setImageFile(file);
      const dataUrl = await fileToBase64DataUrl(file);
      setImagePreviewUrl(String(dataUrl));
      showToastNotification('Uploading and processing screenshot...');
      await processImage(file, dataUrl);
    }
  }, [processImage, showToastNotification]);

  const handleAdditionalFileChange = useCallback(async (event) => {
    const file = event.target.files[0];
    if (file) {
      setAdditionalImageFile(file);
      const dataUrl = await fileToBase64DataUrl(file);
      setAdditionalImagePreviewUrl(String(dataUrl));
      showToastNotification('Additional screenshot uploaded successfully');
    }
  }, [showToastNotification]);

  const removeAdditionalImage = useCallback(() => {
    setAdditionalImageFile(null);
    setAdditionalImagePreviewUrl('');
    showToastNotification('Additional screenshot removed');
  }, [showToastNotification]);

  const reExtract = useCallback(async () => {
    if (imageFile && imagePreviewUrl) {
      await processImage(imageFile, imagePreviewUrl);
    }
  }, [imageFile, imagePreviewUrl, processImage]);

  const handleFormChange = useCallback((field, value) => {
    setFormState(prev => ({ ...prev, [field]: value }));
  }, []);

  const openInOutlook = useCallback(() => {
    if (!extractedData) return;
    setShowOutlookModal(true);
  }, [extractedData]);

  const handleOutlookModalClose = useCallback((success) => {
    setShowOutlookModal(false);
    if (success) {
      showToastNotification('Email action completed successfully');
    }
  }, [showToastNotification]);

  const downloadEMLFile = useCallback(() => {
    if (!extractedData) return;

    const images = [];
    if (imagePreviewUrl) {
      images.push({
        base64: extractBase64FromDataUrl(imagePreviewUrl),
        type: imageFile.type,
        name: 'margin-calculator.png'
      });
    }
    if (additionalImagePreviewUrl) {
      images.push({
        base64: extractBase64FromDataUrl(additionalImagePreviewUrl),
        type: additionalImageFile.type,
        name: 'additional-screenshot.png'
      });
    }

    const filename = `margin-approval-${extractedData.candidateName || 'candidate'}.eml`;
    OutlookIntegrationService.downloadEMLFile(emailParts, filename, images);
    showToastNotification('Email file downloaded successfully');
  }, [extractedData, emailParts, imagePreviewUrl, additionalImagePreviewUrl, imageFile, additionalImageFile, showToastNotification]);

  const copyImage = useCallback(async (file, message) => {
    try {
      await MarginApprovalService.copyImageToClipboard(file);
      showToastNotification(message);
    } catch (err) {
      showToastNotification('Failed to copy screenshot', 'error');
    }
  }, [showToastNotification]);

  const copyText = useCallback(async (text) => {
    try {
      await MarginApprovalService.copyTextToClipboard(text);
      showToastNotification('Copied to clipboard!');
    } catch (err) {
      showToastNotification('Failed to copy text', 'error');
    }
  }, [showToastNotification]);

  return {
    imageFile,
    imagePreviewUrl,
    additionalImageFile,
    additionalImagePreviewUrl,
    isLoading,
    extractedData,
    formState,
    emailParts,
    showToast,
    toastMessage,
    toastType,
    showOutlookModal,
    handleFileChange,
    handleAdditionalFileChange,
    removeAdditionalImage,
    reExtract,
    handleFormChange,
    openInOutlook,
    handleOutlookModalClose,
    downloadEMLFile,
    copyImage,
    copyText
  };
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export default function MarginApprovalGenerator() {
  const {
    imageFile,
    additionalImageFile,
    isLoading,
    extractedData,
    formState,
    emailParts,
    showToast,
    toastMessage,
    toastType,
    showOutlookModal,
    handleFileChange,
    handleAdditionalFileChange,
    removeAdditionalImage,
    reExtract,
    handleFormChange,
    openInOutlook,
    handleOutlookModalClose,
    downloadEMLFile,
    copyImage,
    copyText
  } = useMarginApproval();

  const images = [];
  if (imageFile) images.push(imageFile);
  if (additionalImageFile) images.push(additionalImageFile);

  return (
    <div className="min-h-screen bg-gray-50">
      <Toast message={toastMessage} show={showToast} type={toastType} />

      <OutlookIntegrationModal
        isOpen={showOutlookModal}
        onClose={handleOutlookModalClose}
        emailData={emailParts}
        images={images}
      />

      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <Mail className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className={DESIGN_SYSTEM.typography.hero}>
                Margin Approval Generator
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Outlook 365 One-Click Integration
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          <div className="space-y-6">
            <Card className={DESIGN_SYSTEM.spacing.section}>
              <FileUploadZone
                id="primary-file-upload"
                file={imageFile}
                onChange={handleFileChange}
                label="1. Upload Margin Calculator Screenshot"
                isProcessing={isLoading}
                extractionComplete={!!extractedData}
              />

              {extractedData && !isLoading && (
                <Button
                  onClick={reExtract}
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                >
                  <RefreshCw className="w-3 h-3" />
                  Re-extract Data
                </Button>
              )}
            </Card>

            {extractedData && (
              <Card className={`${DESIGN_SYSTEM.spacing.section} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
                <h2 className={`${DESIGN_SYSTEM.typography.title} text-gray-900 mb-6`}>
                  2. Customize Approval Details
                </h2>

                <div className="space-y-6">
                  <div>
                    <label className={`${DESIGN_SYSTEM.typography.label} ${DESIGN_SYSTEM.colors.text.muted}`}>
                      Reason for Approval
                    </label>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {PRESET_REASONS.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => handleFormChange('reason', preset.template(extractedData.actualMarginPercent))}
                          className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-colors ${formState.reason === preset.template(extractedData.actualMarginPercent)
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                            }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="text"
                      value={formState.reason}
                      onChange={(e) => handleFormChange('reason', e.target.value)}
                      placeholder="Select a preset or type a custom reason..."
                      className="mt-2 w-full p-2 border border-gray-200 rounded-md bg-white font-mono text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
                    />
                  </div>

                  <RadioGroup
                    label="Placement Type"
                    options={['New Placement', 'Extension', 'Change of Contract']}
                    selectedValue={formState.placementType}
                    onChange={(value) => handleFormChange('placementType', value)}
                  />

                  <RadioGroup
                    label="Premium Approval Needed?"
                    options={['Y', 'N']}
                    selectedValue={formState.premiumNeeded}
                    onChange={(value) => handleFormChange('premiumNeeded', value)}
                  />

                  {formState.premiumNeeded === 'Y' && (
                    <InputField
                      label="Reason for Premium"
                      value={formState.premiumReason}
                      onChange={(e) => handleFormChange('premiumReason', e.target.value)}
                      placeholder="Enter justification..."
                      className="animate-in slide-in-from-top-2 duration-200"
                    />
                  )}

                  <RadioGroup
                    label="Sent to Comp Info?"
                    options={['Y', 'N']}
                    selectedValue={formState.sentToComp}
                    onChange={(value) => handleFormChange('sentToComp', value)}
                  />

                  {formState.sentToComp === 'Y' && (
                    <InputField
                      label="Comp Info Response"
                      value={formState.compResponse}
                      onChange={(e) => handleFormChange('compResponse', e.target.value)}
                      placeholder="Enter response from distro..."
                      className="animate-in slide-in-from-top-2 duration-200"
                    />
                  )}

                  <div className="border-t border-gray-200 pt-6">
                    <h3 className={`${DESIGN_SYSTEM.typography.label} ${DESIGN_SYSTEM.colors.text.muted} mb-4`}>
                      3. Additional Screenshot (Optional)
                    </h3>

                    <FileUploadZone
                      id="additional-file-upload"
                      file={additionalImageFile}
                      onChange={handleAdditionalFileChange}
                      label=""
                      onRemove={removeAdditionalImage}
                    />
                  </div>
                </div>
              </Card>
            )}
          </div>

          <div className="lg:sticky lg:top-6">
            <Card className={`${DESIGN_SYSTEM.spacing.section} flex flex-col h-full`}>
              <h2 className={`${DESIGN_SYSTEM.typography.title} text-gray-900 mb-4`}>
                Preview & Send
              </h2>

              {!extractedData && (
                <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                  <div className="w-2 h-2 bg-gray-300 rounded-full animate-pulse" />
                  <span>Waiting for screenshot upload...</span>
                </div>
              )}

              {extractedData && (
                <div className="border border-gray-200 rounded-lg p-4 mb-4 space-y-2">
                  <HeaderLine
                    label="To"
                    text={emailParts.to}
                    onCopy={() => copyText(emailParts.to)}
                  />
                  <HeaderLine
                    label="CC"
                    text={emailParts.cc}
                    onCopy={() => copyText(emailParts.cc)}
                  />
                  <HeaderLine
                    label="Subject"
                    text={emailParts.subject}
                    onCopy={() => copyText(emailParts.subject)}
                  />
                </div>
              )}

              <div
                className="bg-gray-50 p-4 min-h-[300px] flex-grow overflow-auto border border-gray-200 rounded-lg"
                dangerouslySetInnerHTML={{
                  __html: emailParts.htmlBody ||
                    '<div class="flex items-center justify-center h-full text-sm text-gray-500">Approval preview will appear here...</div>'
                }}
              />

              <div className="mt-4 space-y-3">
                <Button
                  onClick={openInOutlook}
                  disabled={!extractedData}
                  size="lg"
                  variant="outlook"
                  className="w-full"
                >
                  <Mail className="w-4 h-4" />
                  Send with Outlook 365
                </Button>

                <div className="flex gap-3">
                  <Button
                    onClick={downloadEMLFile}
                    disabled={!extractedData}
                    size="md"
                    variant="secondary"
                    className="flex-1"
                    title="Download email file with embedded images"
                  >
                    <Download className="w-4 h-4" />
                    Download .eml
                  </Button>

                  <Button
                    onClick={() => copyImage(imageFile, 'Screenshot copied!')}
                    disabled={!imageFile}
                    size="md"
                    variant="secondary"
                    className="flex-1"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Image
                  </Button>
                </div>

                <div className="text-xs text-center text-gray-500 pt-2 border-t border-gray-100">
                  <p className="flex items-center justify-center gap-1">
                    <Link2 className="w-3 h-3" />
                    One-click integration with Office 365
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}