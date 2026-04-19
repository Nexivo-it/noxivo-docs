import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  compress: true,
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
  },
  productionBrowserSourceMaps: false,
  output: 'standalone',
  images: {
    formats: ['image/avif', 'image/webp']
  },
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  async rewrites() {
    return [
      {
        source: '/product/canva/:path*',
        destination: 'http://0.0.0.0:3005/product/canva/:path*'
      }
    ];
  },
  webpack: (config, { isServer }) => {
    config.resolve = config.resolve || {};
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs']
    };
    return config;
  }
};

export default nextConfig;
