import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg', 'audio-decode', 'essentia.js'],
};

export default nextConfig;
