'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { AppShell } from '@/components/AppShell';
import { LoadingState } from '@/components/states';

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'guest') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="login-wrap">
        <LoadingState label="Verificando sessão…" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
