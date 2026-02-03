/**
 * ════════════════════════════════════════════════════════════════════════════════
 * EMAIL HANDLER — Unified Email Generation
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Single entry point for all email generation flows.
 * 
 * Flow:
 * 1. Determine template type
 * 2. Extract data (if needed)
 * 3. Build email (deterministic)
 * 4. Format response
 *
 * @module handlers/email
 * @version 1.0.0
 */

import type {
    HandlerInput,
    HandlerOutput,
    HandlerContext,
    TemplateTypeValue,
    PayPackageData,
    EmailOutput,
} from '../types/index';
import { TemplateType } from '../types/index';
import { CONTEXT_TEMPLATE_MAP } from '../lib/config';
import { extractPayPackageData, extractCandidateData, extractLicensingData } from '../lib/extractor';
import {
    buildEmail,
    detectTemplateType,
    formatEmailText,
    formatEmailStructured
} from '../lib/email-builder';

// ════════════════════════════════════════════════════════════════════════════════
// Template Type Resolution
// ════════════════════════════════════════════════════════════════════════════════

function resolveTemplateType(
    input: HandlerInput,
    classifiedType: TemplateTypeValue | null
): TemplateTypeValue {
    // 1. Check mode context mapping first
    if (input.modeContext) {
        const contextType = CONTEXT_TEMPLATE_MAP[input.modeContext];
        if (contextType) return contextType as TemplateTypeValue;
    }

    // 2. Use classified type if provided
    if (classifiedType) return classifiedType;

    // 3. Detect from message content
    return detectTemplateType(input.inputText, input.modeContext);
}

// ════════════════════════════════════════════════════════════════════════════════
// Data Extraction
// ════════════════════════════════════════════════════════════════════════════════

async function extractDataForTemplate(
    templateType: TemplateTypeValue,
    input: HandlerInput,
    context: HandlerContext
): Promise<Record<string, any>> {
    const { google, logger } = context;

    // Start with any provided context
    let data: Record<string, any> = { ...input.userContext };

    // Extract based on template type
    switch (templateType) {
        case TemplateType.PAY_PACKAGE:
        case TemplateType.WORKING_TRAVELER:
        case TemplateType.REENGAGED_TRAVELER:
        case TemplateType.OFFER_DETAILS:
            if (input.hasImage) {
                logger.info('extracting_pay_package_data', { templateType });
                const result = await extractPayPackageData(input.messages, google);
                if (result.success) {
                    data = { ...data, ...result.data };
                    logger.info('extraction_complete', {
                        fieldsFound: Object.keys(result.data).filter(k => result.data[k as keyof PayPackageData]).length
                    });
                } else if ('error' in result) {
                    logger.warn('extraction_failed', { error: result.error.message });
                }
            }
            break;

        case TemplateType.REASSIGNMENT:
            if (input.inputText) {
                const result = await extractCandidateData(input.inputText, google);
                if (result.success) {
                    data = { ...data, ...result.data };
                }
            }
            break;

        case TemplateType.LICENSING:
            if (input.inputText) {
                const result = await extractLicensingData(input.inputText, google);
                if (result.success) {
                    data = { ...data, ...result.data };
                }
            }
            break;

        case TemplateType.DOC_REQUEST:
            // Extract document list from message
            const docMatches = input.inputText.match(/\b(bls|acls|pals|cpr|license|resume|skills?\s*checklist)\b/gi);
            if (docMatches) {
                data.documents = [...new Set(docMatches.map(m => m.toUpperCase()))];
            }
            // Try to extract candidate info
            if (input.inputText) {
                const result = await extractCandidateData(input.inputText, google);
                if (result.success) {
                    data = { ...data, ...result.data };
                }
            }
            break;

        case TemplateType.REFERENCE_REQUEST:
            if (input.inputText) {
                const result = await extractCandidateData(input.inputText, google);
                if (result.success) {
                    data = { ...data, ...result.data };
                }
            }
            break;
    }

    return data;
}

// ════════════════════════════════════════════════════════════════════════════════
// Main Handler
// ════════════════════════════════════════════════════════════════════════════════

export async function handleEmailIntent(
    input: HandlerInput,
    context: HandlerContext,
    classifiedTemplateType: TemplateTypeValue | null = null
): Promise<HandlerOutput> {
    const { traceId, logger } = context;

    try {
        // 1. Resolve template type
        const templateType = resolveTemplateType(input, classifiedTemplateType);
        logger.info('template_resolved', { templateType, modeContext: input.modeContext });

        // 2. Extract data
        const data = await extractDataForTemplate(templateType, input, context);
        logger.info('data_prepared', {
            templateType,
            hasImage: input.hasImage,
            dataKeys: Object.keys(data).filter(k => data[k])
        });

        // 3. Build email (DETERMINISTIC - no LLM)
        const email: EmailOutput = buildEmail(templateType, data);
        logger.info('email_built', {
            templateType: email.templateType,
            isComplete: email.isComplete,
            missing: email.missing
        });

        // 4. Format response
        const content = formatEmailText(email);
        const structured = formatEmailStructured(email);

        return {
            type: 'email',
            content,
            structured: structured as any,
        };

    } catch (error) {
        logger.error('email_handler_error', error as Error, { traceId });

        return {
            type: 'error',
            content: 'Failed to generate email. Please try again.',
        };
    }
}

// ════════════════════════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════════════════════════

export default handleEmailIntent;
