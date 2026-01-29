/** @type {import('next').NextConfig} */
const nextConfig = {
    serverExternalPackages: ['@supabase/supabase-js'],

    images: {
        unoptimized: true,
    },

    typescript: {
        // Allow production builds to complete even with type errors during migration
        ignoreBuildErrors: false,
    },

    eslint: {
        // Allow production builds to complete even with ESLint errors during migration
        ignoreDuringBuilds: true,
    },

    env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    },
};

export default nextConfig;
