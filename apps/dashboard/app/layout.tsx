import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import Script from 'next/script';
import { Toaster } from 'sonner';
import './tokens.css';
import './globals.css';

// "The Lucid Architect" font — Plus Jakarta Sans per DESIGN (1).md
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Noxivo — Enterprise WhatsApp Automation',
  description: 'AI-powered WhatsApp workflow automation for modern agencies and enterprises.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Start with dark class — ThemeToggle will adjust on client based on localStorage
    <html lang="en" className={`${plusJakartaSans.variable} dark`} suppressHydrationWarning>
      <head>
        {/*
          No-flash theme script — runs before React hydrates.
          Reads localStorage and applies the correct class immediately
          so there's no light-flash on dark-mode users.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nf_theme');if(t==='light'){document.documentElement.classList.remove('dark')}else{document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
        {/* Material Symbols for icons */}
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
        />
      </head>
      <body className="font-display antialiased">
        {children}
        <Toaster position="top-right" richColors closeButton />
        {process.env.NODE_ENV === 'development' && (
          <Script
            src="//unpkg.com/react-grab/dist/index.global.js"
            crossOrigin="anonymous"
            strategy="beforeInteractive"
          />
        )}
      </body>
    </html>
  );
}
