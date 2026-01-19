/**
 * A simple EML parser to extract the plain text body.
 * It looks for the first text/plain content part.
 * @param emlContent The full raw text content of the .eml file.
 * @returns The plain text body of the email.
 */
export function getTextBodyFromEml(emlContent: string): string {
    try {
        // Find the boundary for multipart content
        const boundaryMatch = emlContent.match(/boundary="([^"]+)"/);
        if (!boundaryMatch) {
            // If not multipart, it might be a simple plain text email.
            // A basic cleanup to remove headers.
            const bodyStartIndex = emlContent.indexOf('\n\n');
            return bodyStartIndex > -1 ? emlContent.substring(bodyStartIndex).trim() : emlContent;
        }

        const boundary = `--${boundaryMatch[1]}`;
        const parts = emlContent.split(boundary);

        // Find the plain text part
        const textPart = parts.find(part => part.includes('Content-Type: text/plain'));

        if (textPart) {
            // Clean up headers within the part to get just the body
            let body = textPart.substring(textPart.indexOf('\n\n') + 2);
            // Decode "quoted-printable" encoding
            body = body.replace(/=\s*(\r\n|\n|\r)/g, '').replace(/=3D/g, '=').replace(/=E2=80=99/g, "'");
            return body.trim();
        }

        return "Could not find plain text body in EML.";
    } catch (error) {
        console.error("Failed to parse EML:", error);
        return "Error parsing EML file.";
    }
}