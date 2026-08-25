import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Poppins } from 'next/font/google';
import { AuthProvider } from '@/lib/auth/auth-context';
import { ToastProvider } from '@/lib/ui/toast';
import './globals.css';
import './chipnews-site.css';

// Poppins é a tipografia oficial do site chipnews.com.br.
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://chipnews.com.br'),
  title: { default: 'ChipNews CentralIA', template: '%s · ChipNews CentralIA' },
  description: 'Central de Atendimento Inteligente da ChipNews.',
  applicationName: 'ChipNews CentralIA',
  manifest: '/manifest.webmanifest',
  openGraph: {
    title: 'ChipNews CentralIA',
    description: 'Central de Atendimento Inteligente da ChipNews.',
    siteName: 'ChipNews CentralIA',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'ChipNews CentralIA',
    description: 'Central de Atendimento Inteligente da ChipNews.',
  },
};

export const viewport: Viewport = {
  themeColor: '#003366',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className={poppins.variable}>
      <body>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
