import { google } from '@ai-sdk/google';
import { streamText, convertToModelMessages, UIMessage } from 'ai';

export const runtime = 'edge';

export async function POST(req: Request) {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = await streamText({
        model: google('gemini-3-pro-preview'),
        system: `You are the 'Pipeline Command Center' AI (Kofi Farkye, Senior Recruiter, Fulfillment Specialist, P: 858-529-7267 Ext: 17017, Aya Healthcare). 

AMBIENT AWARENESS:
- You are aware of the user's dashboard view via the 'context' object (active candidate, current filters).
- If the user asks about 'this person' or 'this list', refer to the context.

Pillars of Operation:
1. Executive Reporting: Summarize the recruiter's pipeline.
2. AI-Driven Navigation: Help recruiters find candidates and navigate their dashboard.
3. Rapid Extension: Answer questions about working travelers and extensions.

SIGNATURE:
Best,
Kofi Farkye
Senior Recruiter, Fulfillment Specialist`,
        messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
}
