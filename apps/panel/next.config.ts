import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@vega-hogar/db',
    '@vega-hogar/agent-pipeline',
    '@vega-hogar/channel-adapters',
    '@vega-hogar/composio-actions',
    '@vega-hogar/shared-validator',
  ],
};

export default nextConfig;
