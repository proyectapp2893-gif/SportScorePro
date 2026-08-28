import type { MetadataRoute } from 'next';

/**
 * Web App Manifest used when SportScore Pro is installed on a device.
 * Keep the application identity tenant-neutral; institutional branding is
 * rendered inside the app once a tenant has been selected.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SportScore Pro',
    short_name: 'SportScore',
    description: 'Gestor integral de competiciones multideporte.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f8fafc',
    theme_color: '#0f172a',
    lang: 'es',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
