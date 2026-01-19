import { supabase } from '../lib/supabase';

const PDF_ATTACHMENTS: Record<string, { 
    filename: string; 
    mimeType: string; 
    getBase64: () => Promise<string | null> 
}> = {
    referenceForm: {
        filename: 'Aya Reference Evaluation.pdf',
        mimeType: 'application/pdf',
        getBase64: async () => {
            try {
                const { data } = await supabase.storage
                    .from('email-attachments')
                    .download('reference-form.pdf');
                if (data) {
                    const reader = new FileReader();
                    return new Promise((resolve) => {
                        reader.onloadend = () => {
                            const result = reader.result as string;
                            resolve(result.split(',')[1]);
                        };
                        reader.readAsDataURL(data);
                    });
                }
            } catch (error) {
                console.warn('Reference form PDF not found in storage:', error);
            }
            return null;
        }
    },
    benefits: {
        filename: 'Aya Traveler Benefits.pdf',
        mimeType: 'application/pdf',
        getBase64: async () => {
            try {
                const { data } = await supabase.storage
                    .from('email-attachments')
                    .download('benefits-guide.pdf');
                if (data) {
                    const reader = new FileReader();
                    return new Promise((resolve) => {
                        reader.onloadend = () => {
                            const result = reader.result as string;
                            resolve(result.split(',')[1]);
                        };
                        reader.readAsDataURL(data);
                    });
                }
            } catch (error) {
                console.warn('Benefits PDF not found in storage:', error);
            }
            return null;
        }
    },
    housing: {
        filename: 'Aya Housing Resources.pdf',
        mimeType: 'application/pdf',
        getBase64: async () => {
            try {
                const { data } = await supabase.storage
                    .from('email-attachments')
                    .download('Aya Housing Resources.pdf');
                if (data) {
                    const reader = new FileReader();
                    return new Promise((resolve) => {
                        reader.onloadend = () => {
                            const result = reader.result as string;
                            resolve(result.split(',')[1]);
                        };
                        reader.readAsDataURL(data);
                    });
                }
            } catch (error) {
                console.warn('Housing resources PDF not found in storage:', error);
            }
            return null;
        }
    }
};

export const generateEMLWithAttachments = async (
    emailData: { to: string; subject: string; htmlBody: string }, 
    attachmentTypes: string[] = []
): Promise<string> => {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const date = new Date().toUTCString();
    
    let eml = `Date: ${date}\r\n`;
    eml += `From: "Kofi Farkye" <Kofi.Farkye@ayahealthcare.com>\r\n`;
    eml += `To: ${emailData.to}\r\n`;
    eml += `Subject: ${emailData.subject}\r\n`;
    eml += `MIME-Version: 1.0\r\n`;
    eml += `X-Unsent: 1\r\n`;
    eml += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    
    eml += `--${boundary}\r\n`;
    eml += `Content-Type: text/html; charset=UTF-8\r\n`;
    eml += `Content-Transfer-Encoding: 7bit\r\n\r\n`;
    eml += `<!DOCTYPE html>\r\n<html>\r\n<body>\r\n${emailData.htmlBody}\r\n</body>\r\n</html>\r\n\r\n`;
    
    for (const attachmentType of attachmentTypes) {
        const attachment = PDF_ATTACHMENTS[attachmentType];
        if (attachment) {
            const base64Data = await attachment.getBase64();
            if (base64Data) {
                eml += `--${boundary}\r\n`;
                eml += `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"\r\n`;
                eml += `Content-Transfer-Encoding: base64\r\n`;
                eml += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n\r\n`;
                const formatted = base64Data.match(/.{1,76}/g)?.join('\r\n') || base64Data;
                eml += `${formatted}\r\n\r\n`;
            }
        }
    }
    
    eml += `--${boundary}--\r\n`;
    return eml;
};

export const downloadEMLFile = (emlContent: string, filename = 'email-draft.eml') => {
    const blob = new Blob([emlContent], { type: 'message/rfc822' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
};