/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ['@att/core', '@att/server'],
  experimental: { serverComponentsExternalPackages: ['@prisma/client'] },
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};
