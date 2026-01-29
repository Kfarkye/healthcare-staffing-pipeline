import type { Metadata } from 'next';
import { Providers } from './providers';
import '../src/index.css';
import '../src/styles/animations.css';

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
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    );
}
