'use client';

import { ReactNode, useState } from 'react';
import { RealtimeProvider } from '@/lib/realtime/realtime-context';
import { Sidebar } from './Sidebar';
import { SiteLikeHeader } from './SiteLikeHeader';

export function AppShell({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <RealtimeProvider>
      <div className="shell">
        <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
        {navOpen ? (
          <button
            type="button"
            className="sidebar-overlay"
            aria-label="Fechar menu"
            onClick={() => setNavOpen(false)}
          />
        ) : null}
        <SiteLikeHeader onMenuClick={() => setNavOpen(true)} />
        <main className="shell__main">{children}</main>
      </div>
    </RealtimeProvider>
  );
}
