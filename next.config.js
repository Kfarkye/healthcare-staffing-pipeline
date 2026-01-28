/** @type {import('next').NextConfig} */
const nextConfig = {
    // Moved from experimental to top level in Next.js 15
    serverExternalPackages: ['@supabase/supabase-js'],

    // Preserve existing static assets
    images: {
        unoptimized: true,
    },

    // Environment variables
    env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    },
};

export default nextConfig;
