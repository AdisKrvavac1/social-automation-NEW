/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Ne pakuj serverske biblioteke s nativnim ili opcionalnim zavisnostima
  experimental: { serverComponentsExternalPackages: ['bullmq', 'ioredis', 'sharp'] },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
