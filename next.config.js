/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Lint is enforced in dev + CI (see `npm run lint`). Don't block deploys
  // on cosmetic issues like unescaped-entities — the running code is correct.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    // Same-origin relay to the FastAPI backend. Hospital DNS filters
    // sometimes block our API hostnames while allowing the site itself;
    // lib/apiBase.ts falls back to `/backend/*` and Vercel's edge — which is
    // not subject to the client network's DNS — forwards to Fly. WebSockets
    // do not traverse rewrites; sync connects to an absolute base only.
    return [
      { source: '/backend/:path*', destination: 'https://hei-atlas-api.fly.dev/:path*' },
    ];
  },
};

module.exports = nextConfig;
