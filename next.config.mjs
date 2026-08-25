import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export keeps the app deployable to Cloudflare Pages with no adapter,
  // no server runtime and no risk of leaking secrets server-side. All data access
  // happens in the browser against Supabase, guarded by Row Level Security.
  output: 'export',
  reactStrictMode: true,
  images: { unoptimized: true },
  trailingSlash: true,
  env: {
    // Surfaced on the Settings screen so a bug report can name the exact build.
    NEXT_PUBLIC_APP_VERSION: version,
  },
};

export default nextConfig;
