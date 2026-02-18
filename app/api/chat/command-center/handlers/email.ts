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
    MarginApprovalData,
    EmailOutput,
    IntentType,
} from '../types/index';
import { TemplateType, MessageType } from '../types/index';
import { CONTEXT_TEMPLATE_MAP } from '../lib/config';
import {
    extractPayPackageData,
    extractCandidateData,
    extractCandidateDataFromMessages,
    extractCandidateNameFromMessages,
    extractNovaLinkFromMessages,
    extractLicensingData,
    extractWithRegex,
    extractPayPackageNotesFromText,
    extractMarginApprovalDataFromMessages,
    extractMarginApprovalFromText
} from '../lib/extractor';
import {
    buildEmail,
    detectTemplateType,
    formatEmailText,
    formatEmailStructured
} from '../lib/email-builder';
import { buildFromTemplate } from '../lib/template-registry';

// ════════════════════════════════════════════════════════════════════════════════
// Template Type Resolution
// ════════════════════════════════════════════════════════════════════════════════

function resolveTemplateType(
    input: HandlerInput,
    classifiedType: TemplateTypeValue | null
): TemplateTypeValue {
    // 1. Explicit template type from template picker (highest priority)
    if (input.templateType) return input.templateType;

    // 2. Check mode context mapping
    if (input.modeContext) {
        const contextType = CONTEXT_TEMPLATE_MAP[input.modeContext];
        if (contextType) return contextType as TemplateTypeValue;
    }

    // 3. Use classified type if provided
    if (classifiedType) return classifiedType;

    // 4. Detect from message content
    return detectTemplateType(input.inputText, input.modeContext);
}

// ════════════════════════════════════════════════════════════════════════════════
// Data Extraction
// ════════════════════════════════════════════════════════════════════════════════

async function extractDataForTemplate(
    templateType: TemplateTypeValue,
    input: HandlerInput,
    context: HandlerContext,
    classifiedIntent?: IntentType
): Promise<Record<string, any>> {
    const { google, logger, traceId } = context;
    const llmLogContext = {
        logger,
        traceId,
        intent: classifiedIntent,
        isFallback: false,
        reason: 'primary',
    };

    // Start with any provided context
    let data: Record<string, any> = { ...input.userContext };

    const mergeDefined = (base: Record<string, any>, updates: Record<string, any>) => {
        for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === undefined) continue;
            if (typeof value === 'string' && value.trim() === '') continue;
            base[key] = value;
        }
    };

    // Extract based on template type
    switch (templateType) {
        case TemplateType.PAY_PACKAGE:
        case TemplateType.WORKING_TRAVELER:
        case TemplateType.REENGAGED_TRAVELER:
        case TemplateType.OFFER_DETAILS:
            if (input.hasImage) {
                logger.info('extracting_pay_package_data', { templateType });
                const result = await extractPayPackageData(input.messages, google, llmLogContext);
                if (result.success) {
                    data = { ...data, ...result.data };
                    logger.info('extraction_complete', {
                        fieldsFound: Object.keys(result.data).filter(k => result.data[k as keyof PayPackageData]).length
                    });
                } else if ('error' in result) {
                    logger.warn('extraction_failed', { error: result.error.message });
                }
            }
            if (input.inputText) {
                const textData = extractWithRegex(input.inputText);
                mergeDefined(data, textData as Record<string, any>);

                const requirements = extractPayPackageNotesFromText(input.inputText);
                if (requirements.length > 0) {
                    const existing = Array.isArray(data.requirements) ? data.requirements : [];
                    const merged = [...existing];
                    for (const req of requirements) {
                        if (!merged.includes(req)) merged.push(req);
                    }
                    data.requirements = merged;
                }
            }
            break;

        case TemplateType.REASSIGNMENT:
            if (input.hasImage) {
                const result = await extractCandidateDataFromMessages(input.messages, google, llmLogContext);
                if (result.success) {
                    data = { ...data, ...result.data };
                }
                const linkResult = await extractNovaLinkFromMessages(input.messages, google, llmLogContext);
                if (linkResult.success) {
                    data = { ...data, ...linkResult.data };
                }
                if (!data.candidateName || String(data.candidateName).trim().split(/\s+/).length < 2) {
                    const nameResult = await extractCandidateNameFromMessages(input.messages, google, llmLogContext);
                    if (nameResult.success && nameResult.data?.candidateName) {
                        data.candidateName = nameResult.data.candidateName;
                    }
                }
            }
            if (input.inputText) {
                const result = await extractCandidateData(input.inputText, google, llmLogContext);
                if (result.success) {
                    data = { ...data, ...result.data };
                }
            }
            if (!data.novaId && data.novaUrl) {
                const match = String(data.novaUrl).match(/\/candidates?\/(\d+)/i);
                if (match?.[1]) data.novaId = match[1];
            }
            break;

        case TemplateType.LICENSING:
            if (input.inputText) {
                const result = await extractLicensingData(input.inputText, google, llmLogContext);
                if (result.success) {
                    data = { ...data, ...result.data };
                }
            }
            break;

        case TemplateType.MARGIN_APPROVAL:
            if (input.hasImage) {
                const result = await extractMarginApprovalDataFromMessages(input.messages, google, llmLogContext);
                if (result.success) {
                    data = { ...data, ...result.data };
                }
            }
            if (input.inputText) {
                const textData = extractMarginApprovalFromText(input.inputText);
                mergeDefined(data, textData as Record<string, any>);
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
                const result = await extractCandidateData(input.inputText, google, llmLogContext);
                if (result.success) {
                    data = { ...data, ...result.data };
                }
            }
            break;

        case TemplateType.REFERENCE_REQUEST:
            if (input.inputText) {
                const result = await extractCandidateData(input.inputText, google, llmLogContext);
                if (result.success) {
                    data = { ...data, ...result.data };
                }
            }
            break;
    }

    return data;
}

const INTERNAL_TEMPLATES = new Set<TemplateTypeValue>([
    TemplateType.REASSIGNMENT,
    TemplateType.LICENSING,
    TemplateType.MARGIN_APPROVAL,
]);

const HARD_FAIL_TEMPLATES = new Set<TemplateTypeValue>([
    TemplateType.PAY_PACKAGE,
    TemplateType.WORKING_TRAVELER,
    TemplateType.REENGAGED_TRAVELER,
    TemplateType.OFFER_DETAILS,
]);

function formatMissingList(missing: string[]): string {
    const LABELS: Record<string, string> = {
        facility: 'facility',
        location: 'location',
        startDate: 'start date',
        weeklyTotal: 'weekly total',
        candidateName: 'candidate name',
        marginPercentage: 'margin %',
        reason: 'reason needed for approval',
        placementType: 'placement type (new placement/extension/change)',
        premiumNeeded: 'premium approval needed (Y/N)',
        sentToComp: 'sent to comp info (Y/N)',
        approverEmail: 'approver email',
        novaId: 'Nova ID',
    };

    return missing.map((field) => LABELS[field] || field).join(', ');
}

function buildClarifyPrompt(templateType: TemplateTypeValue, missing: string[], messageType?: string): string {
    const missingText = formatMissingList(missing);
    const isInternal = INTERNAL_TEMPLATES.has(templateType);
    const needsMessageType = !isInternal && messageType === MessageType.AUTO;

    if (templateType === TemplateType.MARGIN_APPROVAL) {
        let prompt = `I can draft the margin approval email, but I still need: ${missingText}.`;
        if (needsMessageType) prompt += ' Should this be an email or a text?';
        return prompt;
    }

    if (HARD_FAIL_TEMPLATES.has(templateType)) {
        let prompt = `I can draft the outreach, but I still need: ${missingText}.`;
        if (needsMessageType) prompt += ' Should this be an email or a text?';
        return prompt;
    }

    let prompt = `I can draft that, but I still need: ${missingText}.`;
    if (needsMessageType) prompt += ' Should this be an email or a text?';
    return prompt;
}

// ════════════════════════════════════════════════════════════════════════════════
// Main Handler
// ════════════════════════════════════════════════════════════════════════════════

export async function handleEmailIntent(
    input: HandlerInput,
    context: HandlerContext,
    classifiedTemplateType: TemplateTypeValue | null = null,
    classifiedIntent?: IntentType
): Promise<HandlerOutput> {
    const { traceId, logger } = context;

    try {
        // 1. Resolve template type
        const templateType = resolveTemplateType(input, classifiedTemplateType);
        logger.info('template_resolved', { templateType, modeContext: input.modeContext });

        // Default AUTO to EMAIL for external drafting flows to avoid channel-clarification loops.
        const requestedMessageType = input.messageType || MessageType.AUTO;
        const effectiveMessageType =
            requestedMessageType === MessageType.AUTO && !INTERNAL_TEMPLATES.has(templateType)
                ? MessageType.EMAIL
                : requestedMessageType;

        // 2. Extract data
        const data = await extractDataForTemplate(templateType, input, context, classifiedIntent);
        const requirementsCount = Array.isArray((data as PayPackageData).requirements)
            ? (data as PayPackageData).requirements!.length
            : 0;
        logger.info('data_prepared', {
            templateType,
            hasImage: input.hasImage,
            dataKeys: Object.keys(data).filter(k => data[k]),
            requirementsCount,
            messageType: effectiveMessageType,
        });

        // 3. Build email (DETERMINISTIC - no LLM)
        // Try core builders first, fall through to registry for extended templates.
        let email: EmailOutput;
        const registryOutput = buildFromTemplate(templateType, data);
        if (registryOutput && 'subject' in registryOutput) {
            email = registryOutput as EmailOutput;
            const resolvedMsgType = effectiveMessageType === MessageType.AUTO ? MessageType.EMAIL : effectiveMessageType;
            email.messageType = resolvedMsgType;
        } else if (registryOutput && registryOutput.messageType === 'sms') {
            // SMS template — wrap as EmailOutput for consistent downstream handling
            email = {
                to: registryOutput.to,
                cc: [],
                subject: '',
                body: registryOutput.body,
                missing: registryOutput.missing,
                isComplete: registryOutput.isComplete,
                templateType: registryOutput.templateType,
                messageType: MessageType.SMS,
            };
        } else {
            email = buildEmail(templateType, data, effectiveMessageType);
        }
        logger.info('template_built', {
            templateType: email.templateType,
            messageType: email.messageType,
            isComplete: email.isComplete,
            missingCount: email.missing.length,
            missing: email.missing,
            source: registryOutput ? 'registry' : 'core_builder',
            explicitPick: !!input.templateType,
        });

        const needsMessageType = !INTERNAL_TEMPLATES.has(templateType) && effectiveMessageType === MessageType.AUTO;

        // Hard-fail only for non-image requests. For image-driven outreach, return best-effort draft.
        if (HARD_FAIL_TEMPLATES.has(templateType) && email.missing.length > 0 && !input.hasImage) {
            return {
                type: 'chat',
                content: buildClarifyPrompt(templateType, email.missing, effectiveMessageType),
            };
        }

        // Margin approval: ask for missing fields rather than sending placeholders
        if (templateType === TemplateType.MARGIN_APPROVAL && email.missing.length > 0) {
            return {
                type: 'chat',
                content: buildClarifyPrompt(templateType, email.missing, effectiveMessageType),
            };
        }

        if (needsMessageType) {
            return {
                type: 'chat',
                content: 'Do you want this as an email or a text?',
            };
        }

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
