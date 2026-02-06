/**
 * ════════════════════════════════════════════════════════════════════════════════
 * ROUTER — Intent Classification
 * ════════════════════════════════════════════════════════════════════════════════
 *
 * Deterministic routing with LLM fallback only when necessary.
 * Uses configuration from config.ts for all mappings.
 *
 * @module lib/router
 * @version 2.0.0
 */

import { generateObject } from 'ai';
import { z } from 'zod';
import type {
    ClassifyInput,
    ClassifyResult,
    IntentType,
    ChatModeType,
    TemplateTypeValue,
    NormalizedMessage,
} from '../types/index';
import { Intent, ChatMode, TemplateType } from '../types/index';
import {
    getIntentConfig,
    CONTEXT_TEMPLATE_MAP,
    MODEL_CONFIG
} from './config';
import { detectTemplateType } from './email-builder';

// ════════════════════════════════════════════════════════════════════════════════
// Regex Patterns
// ════════════════════════════════════════════════════════════════════════════════

const PATTERNS = {
    // Fast path commands
    slashCommand: /^\/(reset|help|mode)\b/i,
    novaId: /^#?\d{6,8}$/,
    novaUrl: /nova\.ayahealthcare\.com/i,

    // Intent detection
    infoQuestion: /^(who|what|where|when|why|how)\b/i,
    draftVerb: /\b(draft|write|compose|create|generate)\b/i,
    editVerb: /\b(clean\s*up|edit|fix|rewrite|revise|polish|improve|refine|tweak)\b/i,
    editFollowup: /\b(remove|omit|leave\s+this\s+out|leave\s+out|delete|cut|exclude|strip|take\s+out|drop|change)\b|\b(shorter|longer|tone|polish|tweak|adjust|revise|edit|rewrite|reply|response|respond|answer)\b/i,
    continueDraft: /\b(rest\s+of|the\s+rest|finish|complete|full|entire|continue|resume|remaining|keep\s+going|carry\s+on)\b/i,
    replyVerb: /\b(reply|respond|response|replying|responding|answer|answering)\b/i,
    emailMedium: /\b(email|message|draft)\b/i,
    outreach: /\boutreach\b/i,
    payPackage: /\bpay\s*package\b/i,
    marginApproval: /\b(margin\s*approval|margin\s*approve|approval\s*for\s*margin|low\s*margin)\b/i,
    marginPercent: /\b\d{1,2}(?:\.\d{1,2})?\s*%\b/i,
    contextUpdate: /\b(update|fyi|new\s+info|correction|approved|denied|declined|confirmed|extension|rate|offer|accepted|rejected|start\s+date|end\s+date|shift|facility|location|pay|stipend|weekly|bonus|rto|time[-\s]?off)\b/i,

    // Entity detection
    reference: /\breference/i,
    document: /\b(document|bls|acls|resume|certification)/i,
    reassign: /\breassign/i,
    licensing: /\blicensing?\b/i,
    addCandidate: /\b(?:add|create|new|save|enter|register|onboard)\s+(?:candidate|prospect)\b|\b(?:add|save|enter|register|onboard)\s+(?:him|her|them|this)\s*(?:to|in)\s+(?:the\s+)?system\b|\b(?:add|save|enter|register|onboard)\s+(?!note\b)(?:[a-z][a-z'.-]+(?:\s+[a-z][a-z'.-]+){0,3})\s+(?:to|in)\s+(?:the\s+)?system\b/i,
    addNote: /\b(add|create|leave|log|write|save)\s+(a\s+)?note\b/i,
    noteFor: /\b(note\s+for|note\s+to)\b/i,
    updateCandidate: /\b(update|edit|change)\s+(candidate|prospect)\b/i,
    noteHistory: /\b(notes?\s+(history|log)|note\s+history)\b/i,
    stateBoard: /\b(state\s+board|board\s+verification|license\s+verification|verify\s+license|license\s+lookup)\b/i,
    novaLink: /\b(nova\s+(link|url|page|deal|deals|jobs|job\s+openings|live|search|tickets|margins|contract\s+requests))\b/i,
    credentialVerify: /\b(verify|verification|check|confirm)\b.*\b(certification|credential|license|csfa|cst|nbstsa)\b|\b(csfa|cst|nbstsa)\b.*\b(verify|verification|check)\b/i,

    // Negation
    negation: /\b(don't|do not|cancel|stop|no)\b/i,

    // Code detection
    codeFence: /```/,
    codeTokens: /\b(import|export|function|const|class)\b/,
};

// ════════════════════════════════════════════════════════════════════════════════
// Classification Schema (for LLM fallback)
// ════════════════════════════════════════════════════════════════════════════════

const ClassificationSchema = z.object({
    intent: z.enum([
        Intent.DRAFT_OUTREACH,
        Intent.DRAFT_EMAIL,
        Intent.DATABASE_ACTION,
        Intent.CAMPAIGN_WORKFLOW,
        Intent.GENERAL_CHAT,
        Intent.UNKNOWN,
    ]),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
});

// ════════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ════════════════════════════════════════════════════════════════════════════════

function createResult(
    intent: IntentType,
    templateType: TemplateTypeValue | null,
    reason: string,
    fastPath: boolean = true,
    confidence: number = 1.0
): ClassifyResult {
    const config = getIntentConfig(intent);
    return {
        intent,
        templateType,
        requiresExtraction: config.requiresExtraction,
        requiresTools: config.requiresTools,
        confidence,
        reason,
        fastPath,
    };
}

function isInfoQuestion(text: string): boolean {
    const t = text.trim().toLowerCase();
    if (PATTERNS.infoQuestion.test(t)) return true;
    if (t.endsWith('?') && !PATTERNS.draftVerb.test(t)) return true;
    return false;
}

function isCodeLike(text: string): boolean {
    if (PATTERNS.codeFence.test(text)) return true;
    if (PATTERNS.codeTokens.test(text)) {
        const symbolRatio = text.replace(/[a-z0-9\s]/gi, '').length / text.length;
        if (symbolRatio > 0.12) return true;
    }
    return false;
}

function isEmailRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (PATTERNS.negation.test(t) && PATTERNS.emailMedium.test(t)) return false;
    return PATTERNS.draftVerb.test(t) && PATTERNS.emailMedium.test(t);
}

function isEditRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (PATTERNS.negation.test(t)) return false;
    return PATTERNS.editVerb.test(t);
}

function isReplyRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (PATTERNS.negation.test(t)) return false;
    return PATTERNS.replyVerb.test(t);
}

function isOutreachRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (PATTERNS.negation.test(t)) return false;
    if (PATTERNS.outreach.test(t) && PATTERNS.draftVerb.test(t)) return true;
    if (PATTERNS.payPackage.test(t)) return true;
    return false;
}

function isAddCandidateRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (PATTERNS.negation.test(t)) return false;
    return PATTERNS.addCandidate.test(t);
}

function isAddNoteRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (PATTERNS.negation.test(t)) return false;
    return PATTERNS.addNote.test(t) || PATTERNS.noteFor.test(t);
}

function isUpdateCandidateRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (PATTERNS.negation.test(t)) return false;
    return PATTERNS.updateCandidate.test(t);
}

function isNoteHistoryRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (PATTERNS.negation.test(t)) return false;
    return PATTERNS.noteHistory.test(t);
}

function isStateBoardRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (PATTERNS.negation.test(t)) return false;
    return PATTERNS.stateBoard.test(t);
}

function isNovaLinkRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (PATTERNS.negation.test(t)) return false;
    return PATTERNS.novaLink.test(t);
}

function isCredentialVerifyRequest(text: string): boolean {
    const t = text.toLowerCase();
    if (PATTERNS.negation.test(t)) return false;
    return PATTERNS.credentialVerify.test(t);
}

function getLastAssistantEmailScan(history: NormalizedMessage[], scanLimit: number = 6): { found: boolean; scanned: number } {
    if (!Array.isArray(history) || history.length === 0) return { found: false, scanned: 0 };
    let scanned = 0;
    for (let i = history.length - 1; i >= 0; i -= 1) {
        const msg = history[i];
        if (!msg || msg.role !== 'assistant') continue;
        scanned += 1;
        const text = msg.content
            .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
            .map(c => c.text)
            .join('\n')
            .trim();
        if (!text) continue;
        if (
            /(^|\n)\s*Subject\s*:/i.test(text) ||
            /(^|\n)\s*To\s*:/i.test(text) ||
            /\[EMAIL_DRAFT_JSON\]/i.test(text) ||
            /\[SUBJECT\]/i.test(text) ||
            /\[BODY\]/i.test(text)
        ) {
            return { found: true, scanned };
        }
        if (scanned >= scanLimit) break;
    }
    return { found: false, scanned };
}

// ════════════════════════════════════════════════════════════════════════════════
// Main Classifier
// ════════════════════════════════════════════════════════════════════════════════

export async function classify(input: ClassifyInput, googleClient?: any): Promise<ClassifyResult> {
    const { message, mode, modeLocked, hasImage } = input;
    const text = (message || '').trim();
    const lower = text.toLowerCase();
    const lastEmailScan = getLastAssistantEmailScan(input.history, 6);
    const lastEmailFound = lastEmailScan.found;

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 1: Empty/Trivial
    // ══════════════════════════════════════════════════════════════════════════

    if (!text && !hasImage) {
        return {
            ...createResult(Intent.GENERAL_CHAT, null, 'Empty input'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 1.5: Add Candidate (must win over edit/reply)
    // ══════════════════════════════════════════════════════════════════════════

    if (isAddCandidateRequest(text)) {
        return {
            ...createResult(
            Intent.DATABASE_ACTION,
            null,
            PATTERNS.reassign.test(lower) ? 'Add candidate + reassignment request' : 'Add candidate request'
            ),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 1.6: Edit/Reply Requests (with image = LLM editing, not templating)
    // ══════════════════════════════════════════════════════════════════════════

    if (hasImage && isEditRequest(text)) {
        return {
            ...createResult(Intent.EDIT_CONTENT, null, 'Edit request with image'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    if (hasImage && isReplyRequest(text)) {
        return {
            ...createResult(Intent.EDIT_CONTENT, null, 'Reply/response request with image'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    // Reassignment requests should always route to the internal reassignment template,
    // even when an image is attached.
    if (PATTERNS.reassign.test(lower) || /reassign/i.test(input.modeContext || '')) {
        return {
            ...createResult(Intent.REASSIGNMENT_REQUEST, TemplateType.REASSIGNMENT, 'Reassignment request'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 1.6: Short Follow-up After Email Draft
    // Example: "The response", "Make it shorter", "Reply with this tone"
    // ══════════════════════════════════════════════════════════════════════════

    const isShortFollowup = text.length > 0 && text.length <= 80;
    const isEditFollowup = PATTERNS.editFollowup.test(text);
    const isContinuation = PATTERNS.continueDraft.test(text);
    if (
        lastEmailFound &&
        (isEditFollowup || isContinuation || (isShortFollowup && !isInfoQuestion(text)))
    ) {
        return {
            ...createResult(
            Intent.EDIT_CONTENT,
            null,
            isContinuation ? 'Draft continuation request' : 'Short follow-up after email draft'
            ),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
                isShortFollowup,
                isEditFollowup,
                isContinuation,
            },
        };
    }

    const isContextUpdate = PATTERNS.contextUpdate.test(text);
    if (lastEmailFound && !isInfoQuestion(text) && isContextUpdate) {
        return {
            ...createResult(Intent.EDIT_CONTENT, null, 'Context update after email draft'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
                isContextUpdate,
            },
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 2: Fast Path (Slash commands, IDs)
    // ══════════════════════════════════════════════════════════════════════════

    if (PATTERNS.slashCommand.test(text)) {
        return {
            ...createResult(Intent.GENERAL_CHAT, null, 'Slash command'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    if (PATTERNS.novaId.test(text) || PATTERNS.novaUrl.test(text)) {
        return {
            ...createResult(Intent.DATABASE_ACTION, null, 'Nova ID/URL detected'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    // Explicit DB mutations: add/update candidate / leave note / note history / links
    if (
        isAddCandidateRequest(text) ||
        isUpdateCandidateRequest(text) ||
        isAddNoteRequest(text) ||
        isNoteHistoryRequest(text) ||
        isStateBoardRequest(text) ||
        isNovaLinkRequest(text) ||
        isCredentialVerifyRequest(text)
    ) {
        return {
            ...createResult(Intent.DATABASE_ACTION, null, 'Database mutation request'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 3: Mode-Locked Routing
    // ══════════════════════════════════════════════════════════════════════════

    if (modeLocked && mode !== ChatMode.DEFAULT) {
        // Info questions bypass mode lock
        if (isInfoQuestion(text)) {
            return createResult(Intent.GENERAL_CHAT, null, 'Info question bypasses mode');
        }

        switch (mode) {
            case ChatMode.COLD_OUTREACH:
                if (hasImage) {
                    return {
                        ...createResult(
                        Intent.DRAFT_OUTREACH,
                        TemplateType.PAY_PACKAGE,
                        'COLD_OUTREACH mode + image'
                        ),
                        debug: {
                            messageLength: text.length,
                            hasImage,
                            lastEmailFound,
                            lastEmailScanDepth: lastEmailScan.scanned,
                        },
                    };
                }
                if (isEmailRequest(text) || isOutreachRequest(text)) {
                    return {
                        ...createResult(
                        Intent.DRAFT_OUTREACH,
                        TemplateType.PAY_PACKAGE,
                        'COLD_OUTREACH mode + email request'
                        ),
                        debug: {
                            messageLength: text.length,
                            hasImage,
                            lastEmailFound,
                            lastEmailScanDepth: lastEmailScan.scanned,
                        },
                    };
                }
                return {
                    ...createResult(Intent.CAMPAIGN_WORKFLOW, null, 'COLD_OUTREACH mode default'),
                    debug: {
                        messageLength: text.length,
                        hasImage,
                        lastEmailFound,
                        lastEmailScanDepth: lastEmailScan.scanned,
                    },
                };

            case ChatMode.BATCH_REASSIGN:
                return {
                    ...createResult(
                    Intent.REASSIGNMENT_REQUEST,
                    TemplateType.REASSIGNMENT,
                    'BATCH_REASSIGN mode'
                    ),
                    debug: {
                        messageLength: text.length,
                        hasImage,
                        lastEmailFound,
                        lastEmailScanDepth: lastEmailScan.scanned,
                    },
                };

            case ChatMode.REPLY_MODE:
                // Reply mode always uses LLM to draft contextual replies
                return {
                    ...createResult(
                    Intent.EDIT_CONTENT,
                    null,
                    'REPLY_MODE - LLM handles reply drafting'
                    ),
                    debug: {
                        messageLength: text.length,
                        hasImage,
                        lastEmailFound,
                        lastEmailScanDepth: lastEmailScan.scanned,
                    },
                };
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 4: Image + Context Detection
    // ══════════════════════════════════════════════════════════════════════════

    if (hasImage) {
        const templateType = detectTemplateType(text, input.modeContext || '');
        const lowerText = text.toLowerCase();

        // Margin approval screenshots should always route to margin approval,
        // even if the user mentions extensions or other context.
        if (
            PATTERNS.marginApproval.test(lowerText) ||
            (PATTERNS.marginPercent.test(text) && /margin/i.test(lowerText)) ||
            /\b(actual\s+margin|target\s+margin|margin\s+calculator)\b/i.test(text)
        ) {
            return {
                ...createResult(Intent.DRAFT_EMAIL, TemplateType.MARGIN_APPROVAL, 'Image + margin approval'),
                debug: {
                    messageLength: text.length,
                    hasImage,
                    lastEmailFound,
                    lastEmailScanDepth: lastEmailScan.scanned,
                },
            };
        }

        // Explicit outreach/pay package keywords with image → deterministic template
        if (isOutreachRequest(text) || PATTERNS.payPackage.test(lowerText)) {
            return {
                ...createResult(Intent.DRAFT_OUTREACH, templateType, 'Image + outreach keywords'),
                debug: {
                    messageLength: text.length,
                    hasImage,
                    lastEmailFound,
                    lastEmailScanDepth: lastEmailScan.scanned,
                },
            };
        }

        // Image + explicit email request (non-edit/reply) → treat as outreach by default
        const isDocOrReference = PATTERNS.reference.test(text.toLowerCase()) || PATTERNS.document.test(text.toLowerCase());
        if (isEmailRequest(text) && !isReplyRequest(text) && !isEditRequest(text) && !isDocOrReference) {
            return {
                ...createResult(Intent.DRAFT_OUTREACH, templateType, 'Image + email request'),
                debug: {
                    messageLength: text.length,
                    hasImage,
                    lastEmailFound,
                    lastEmailScanDepth: lastEmailScan.scanned,
                },
            };
        }

        // Image + ambiguous text → LLM handles it (don't assume pay package)
        // This catches: "draft response", "clean up", "reply", etc.
        return {
            ...createResult(
            Intent.EDIT_CONTENT,
            null,
            'Image with ambiguous context - LLM handles',
            false,
            0.8
            ),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 5: Pre-Gates (Block certain patterns)
    // ══════════════════════════════════════════════════════════════════════════

    if (isInfoQuestion(text)) {
        return {
            ...createResult(Intent.GENERAL_CHAT, null, 'Info question'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    if (isCodeLike(text) && !isEmailRequest(text)) {
        return {
            ...createResult(Intent.GENERAL_CHAT, null, 'Code detected'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 6: Content-Based Detection
    // ══════════════════════════════════════════════════════════════════════════

    // Outreach request
    if (isOutreachRequest(text)) {
        return {
            ...createResult(Intent.DRAFT_OUTREACH, TemplateType.PAY_PACKAGE, 'Outreach keywords'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    // Specific email types
    if (PATTERNS.reference.test(lower) && isEmailRequest(text)) {
        return {
            ...createResult(Intent.DRAFT_EMAIL, TemplateType.REFERENCE_REQUEST, 'Reference request'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    if (PATTERNS.document.test(lower) && isEmailRequest(text)) {
        return {
            ...createResult(Intent.DRAFT_EMAIL, TemplateType.DOC_REQUEST, 'Document request'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    if (PATTERNS.marginApproval.test(lower) || (PATTERNS.marginPercent.test(text) && /margin/i.test(lower))) {
        return {
            ...createResult(Intent.DRAFT_EMAIL, TemplateType.MARGIN_APPROVAL, 'Margin approval request'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    if (PATTERNS.reassign.test(lower)) {
        return {
            ...createResult(Intent.REASSIGNMENT_REQUEST, TemplateType.REASSIGNMENT, 'Reassignment request'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    if (PATTERNS.licensing.test(lower)) {
        return {
            ...createResult(Intent.LICENSING_REQUEST, TemplateType.LICENSING, 'Licensing request'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    // General email request
    if (isEmailRequest(text)) {
        const templateType = detectTemplateType(text, '');
        return {
            ...createResult(Intent.DRAFT_EMAIL, templateType, 'Email request'),
            debug: {
                messageLength: text.length,
                hasImage,
                lastEmailFound,
                lastEmailScanDepth: lastEmailScan.scanned,
            },
        };
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 7: LLM Fallback (only when necessary)
    // ══════════════════════════════════════════════════════════════════════════

    if (googleClient) {
        try {
            const { object } = await generateObject({
                model: googleClient(MODEL_CONFIG.primary, { structuredOutputs: true }),
                schema: ClassificationSchema,
                messages: [{ role: 'user', content: text }],
                system: `Classify the user's intent. Options: DRAFT_OUTREACH (cold emails), DRAFT_EMAIL (specific requests), DATABASE_ACTION (lookups), CAMPAIGN_WORKFLOW (automation), GENERAL_CHAT (other).`,
                temperature: 0,
            });

            const parsed = ClassificationSchema.safeParse(object);
            if (parsed.success) {
                const intent = parsed.data.intent as IntentType;
                const config = getIntentConfig(intent);
                return {
                    intent,
                    templateType: config.templateType,
                    requiresExtraction: config.requiresExtraction,
                    requiresTools: config.requiresTools,
                    confidence: parsed.data.confidence,
                    reason: parsed.data.reason,
                    fastPath: false,
                    debug: {
                        messageLength: text.length,
                        hasImage,
                        lastEmailFound,
                        lastEmailScanDepth: lastEmailScan.scanned,
                    },
                };
            }
        } catch (error) {
            console.warn('[Router] LLM classification failed:', error);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TIER 8: Default
    // ══════════════════════════════════════════════════════════════════════════

    return {
        ...createResult(Intent.GENERAL_CHAT, null, 'Default fallback', true, 0.5),
        debug: {
            messageLength: text.length,
            hasImage,
            lastEmailFound,
            lastEmailScanDepth: lastEmailScan.scanned,
        },
    };
}

// ════════════════════════════════════════════════════════════════════════════════
// Exports
// ════════════════════════════════════════════════════════════════════════════════

export { Intent, ChatMode, TemplateType };
