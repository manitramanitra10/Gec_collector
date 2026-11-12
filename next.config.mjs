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
  async redirects() {
    return [
      // Ancienne adresse de la page Lissage.
      { source: '/correct', destination: '/lissage', permanent: true },
    ]
  },
}

export default nextConfig
