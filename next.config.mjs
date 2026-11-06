import 'dotenv/config';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // pg est chargé tel quel par Node côté serveur plutôt que bundlé.
  serverExternalPackages: ['pg'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
