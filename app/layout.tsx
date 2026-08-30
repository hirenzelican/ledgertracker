import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { LedgerProvider } from '@/components/providers/LedgerProvider';
import { LanguageProvider } from '@/components/providers/LanguageProvider';
import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { ToastProvider } from '@/components/providers/ToastProvider';
import { Toaster } from '@/components/ui/Toaster';
import { ServiceWorkerRegistrar } from '@/components/layout/ServiceWorkerRegistrar';
import { SplashScreen } from '@/components/layout/SplashScreen';

export const metadata: Metadata = {
  title: 'Potli',
  description: 'Track money you are holding for family and friends.',
  applicationName: 'Potli',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Potli',
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#faf7f5',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Applied before paint so a dark-mode user never sees a white flash on launch.
 * Kept inline and tiny; it only reads one localStorage key.
 */
const THEME_BOOTSTRAP = `(function(){try{var p=localStorage.getItem('potli-theme')||'system';var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <ThemeProvider>
          <LanguageProvider>
            <ToastProvider>
              <AuthProvider>
                <LedgerProvider>
                  {children}
                  <SplashScreen />
                  <Toaster />
                  <ServiceWorkerRegistrar />
                </LedgerProvider>
              </AuthProvider>
            </ToastProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
