'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/auth-context';
import { FeatureCard } from '@/components/FeatureCard';
import { ChipNewsButton } from '@/components/ChipNewsButton';

export default function LoginPage() {
  const router = useRouter();
  const { login, status } = useAuth();
  const [email, setEmail] = useState('admin@centralia.local');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no login.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-landing">
      <section className="login-hero">
        <img src="/chipnews-logo.svg" alt="ChipNews" className="login-hero__logo" />
        <div className="login-hero__eyebrow" style={{ marginTop: 28 }}>Central Interna ChipNews</div>
        <h1 className="login-hero__title">
          <span className="grad">CentralIA</span>
        </h1>
        <p className="login-hero__sub">
          Atendimento Inteligente ChipNews — Comercial, Suporte e Financeiro conectados ao
          WhatsApp e à ISPBOX, em uma única central.
        </p>
        <div className="login-hero__feats">
          <FeatureCard icon="💬" title="WhatsApp" text="Atendimento no número oficial." />
          <FeatureCard icon="🛰️" title="ISPBOX" text="Cliente, cobranças e OS integrados." />
          <FeatureCard icon="🤖" title="IA" text="Triagem e respostas automáticas." />
          <FeatureCard icon="🎧" title="Atendimento" text="Fila humana e SLA em tempo real." />
        </div>
      </section>

      <section className="login-right">
        <div className="card login-card">
          <h1 className="login-title">Bem-vindo</h1>
          <p className="login-subtitle">Acesse a central de atendimento da ChipNews.</p>
          <div className="login-seal">
            <i>●</i> <span>Ambiente seguro</span> · ChipNews Provider
          </div>
          {error ? <div className="alert" role="alert">{error}</div> : null}
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="email">E-mail</label>
              <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="voce@empresa.com" required />
            </div>
            <div className="field">
              <label htmlFor="password">Senha</label>
              <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" required />
            </div>
            <ChipNewsButton type="submit" variant="cta" full disabled={submitting}>
              {submitting ? 'Entrando…' : 'Entrar na Central'}
            </ChipNewsButton>
          </form>
          <p className="login-hint">Demo: admin@centralia.local / CentralIA@123</p>
        </div>
      </section>
    </div>
  );
}
