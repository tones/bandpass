import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg', '@aws-sdk/client-s3', '@aws-sdk/s3-request-presigner'],
};

export default nextConfig;
