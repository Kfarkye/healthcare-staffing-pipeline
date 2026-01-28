import type { Metadata } from 'next';
import '../src/index.css';

export const metadata: Metadata = {
    title: 'The Drip - Healthcare Staffing Pipeline',
    description: 'AI-powered healthcare staffing command center',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className="antialiased">
                {children}
            </body>
        </html>
    );
}
