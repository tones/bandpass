import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3', 'audio-decode', 'essentia.js'],
};

export default nextConfig;
