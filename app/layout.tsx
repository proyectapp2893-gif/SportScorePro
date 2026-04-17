import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CSJB Championship',
  description: 'Plataforma Oficial Multideporte',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className={`${inter.className} min-h-screen antialiased bg-[#020617] text-white`}>
        <Toaster 
          position="top-center"
          toastOptions={{
            style: { background: '#0f172a', color: '#fff', border: '1px solid #1e293b', borderRadius: '16px', fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' },
            success: { iconTheme: { primary: '#84cc16', secondary: '#0f172a' } },
            error: { iconTheme: { primary: '#ef4444', secondary: '#0f172a' } },
          }}
        />
        {children}
      </body>
    </html>
  );
}