import type { Metadata, Viewport } from 'next';
import './globals.css';
import ServiceWorkerLoader from '@/components/ServiceWorkerLoader';
import { SessionProvider } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Hei Atlas',
  description:
    'Voice-enabled oncology decision support powered by clinical guidelines and AI',
  applicationName: 'Hei Atlas',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Hei Atlas',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
};

// `viewport-fit=cover` lets the page extend under the iPhone notch / home
// indicator so we can position safe-area-aware UI. `interactiveWidget=resizes-content`
// keeps the page from jumping when the iOS keyboard appears.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        {/* iOS home-screen icon */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="bg-canvas font-sans text-ink antialiased min-h-[100dvh] overscroll-none">
        <ServiceWorkerLoader />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
