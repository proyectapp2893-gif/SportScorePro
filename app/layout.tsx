import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AppDialogHost } from './components/AppDialog';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SportScore Pro',
  description: 'Gestor Integral de Competiciones',
  manifest: '/manifest.webmanifest',
  applicationName: 'SportScore Pro',
  appleWebApp: {
    capable: true,
    title: 'SportScore Pro',
    statusBarStyle: 'default',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${inter.className} min-h-screen antialiased`}>
        <Toaster 
          position="top-center"
          containerStyle={{ inset: 'max(12px, env(safe-area-inset-top)) 12px auto' }}
          toastOptions={{
            style: { width: 'min(92vw, 440px)', maxWidth: '440px', background: '#0f172a', color: '#fff', border: '1px solid #1e293b', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' },
            success: { iconTheme: { primary: '#84cc16', secondary: '#0f172a' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#0f172a' } },
          }}
        />
        <AppDialogHost />
        {children}
      </body>
    </html>
  );
}
