import { AuthRoot } from '@/components/terminal/auth/auth-root';
import { TopBar } from '@/components/terminal/topbar';
import { APP_URL, SITE_URL } from '@/lib/urls';
import type { Metadata } from 'next';
import './terminal.css';

/** Terminal pages live on the app host: share links and previews point there. */
export const metadata: Metadata = { metadataBase: new URL(APP_URL || SITE_URL) };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="terminal-ui relative isolate flex h-dvh flex-col overflow-hidden">
      <div aria-hidden className="aurora pointer-events-none absolute inset-0 -z-10" />
      <TopBar />
      <div className="page-in relative min-h-0 flex-1">{children}</div>
      <AuthRoot />
    </div>
  );
}
