import { APP_CONFIG } from '../config/prospects';

export const OutlookIntegrationService = {
    openInOutlookWeb: (emailData: { 
        to: string; 
        subject: string; 
        body: string; 
        htmlBody: string; 
    }) => {
        const outlookUrl = new URL(APP_CONFIG.URLS.OUTLOOK_COMPOSE);
        outlookUrl.searchParams.append('to', emailData.to);
        outlookUrl.searchParams.append('subject', emailData.subject);
        outlookUrl.searchParams.append('body', emailData.body);
        
        const finalUrl = outlookUrl.toString().replace(/\+/g, '%20');
        window.open(finalUrl, '_blank', 'noopener,noreferrer');
    }
};