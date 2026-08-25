'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { useToast } from '@/lib/ui/toast';
import { PageHeader } from '@/components/PageHeader';
import { HeroSection } from '@/components/HeroSection';
import { ChipNewsButton } from '@/components/ChipNewsButton';
import { ActionButton } from '@/components/ActionButton';
import { IntegrationChip } from '@/components/IntegrationChip';
import { IspboxSnapshotView } from '@/components/IspboxSnapshotView';
import { LoadingState, ErrorState } from '@/components/states';
import { IspboxDiagnostics, IspboxLookupResult } from '@/lib/api/types';

function Bool({ label, value }: { label: string; value?: boolean }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <span className={`badge badge--${value ? 'primary' : 'red'}`}>{value ? 'configurado' : 'ausente'}</span>
    </div>
  );
}

export default function IspboxSettingsPage() {
  const { request, hasRole } = useAuth();
  const toast = useToast();
  const allowed = hasRole('MANAGER'); // ADMIN passa em hasRole
  const [testing, setTesting] = useState(false);
  const [term, setTerm] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<IspboxLookupResult | null>(null);

  const { data, loading, error, reload } = useQuery(
    () => request<IspboxDiagnostics>('/ispbox/diagnostics'),
    [request, allowed],
  );

  if (!allowed) {
    return (
      <div>
        <PageHeader title="ISPBOX" subtitle="Integração e leitura controlada" />
        <ErrorState error={{ name: 'Forbidden', message: 'Apenas ADMIN e MANAGER.' }} />
      </div>
    );
  }

  async function testAuth() {
    setTesting(true);
    try {
      const res = await request<{ ok: boolean; sandbox?: boolean; reason?: string }>('/ispbox/test-auth', { method: 'POST' });
      if (res.ok) toast.push(res.sandbox ? 'Sandbox: ISPBOX usa mock' : 'Autenticação ISPBOX OK', 'success');
      else toast.push(res.reason ?? 'Falha na autenticação', 'error');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha ao testar', 'error');
    } finally {
      setTesting(false);
    }
  }

  async function search() {
    if (term.trim().length < 2) return;
    setSearching(true);
    setResult(null);
    try {
      const res = await request<IspboxLookupResult>('/customers/ispbox-lookup', {
        method: 'POST',
        body: JSON.stringify({ query: term.trim() }),
      });
      setResult(res);
      if (res.source === 'none') toast.push('Nenhum cliente encontrado', 'info');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha na busca', 'error');
    } finally {
      setSearching(false);
    }
  }

  const d = data;

  return (
    <div>
      <HeroSection
        compact
        eyebrow="Integração ISPBOX"
        title="Conexão ISPBOX"
        subtitle="Status, autenticação e consulta de cliente — somente leitura, sem expor segredos."
        actions={
          <>
            <ChipNewsButton variant="cta" disabled={testing} onClick={testAuth}>
              {testing ? 'Testando…' : 'Testar conexão'}
            </ChipNewsButton>
            <ChipNewsButton variant="ghost" onClick={() => reload()}>Atualizar diagnóstico</ChipNewsButton>
          </>
        }
      />

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <div className="section-title">Conexão</div>
          <div className="card">
            <div className="chip-row">
              <IntegrationChip name="APP_MODE" status={d?.appMode} />
              <span className={`badge badge--${d?.ispboxEnabled ? 'primary' : 'gray'}`}>ISPBOX_ENABLED: {d?.ispboxEnabled ? 'true' : 'false'}</span>
              <IntegrationChip name="Auth" status={d?.authStatus} />
            </div>
            <div className="toolbar mt-12">
              <ActionButton small variant="primary" disabled={testing} onClick={testAuth}>
                {testing ? 'Testando…' : 'Testar autenticação'}
              </ActionButton>
            </div>
            <div className="kv mt-12"><span>Último token renovado</span><span className="muted">{d?.lastRenewedAt ? new Date(d.lastRenewedAt).toLocaleString('pt-BR') : '—'}</span></div>
            <div className="kv"><span>Último erro</span><span className="muted">{d?.lastError ?? '—'}</span></div>
          </div>

          <div className="section-title">Configuração (booleana)</div>
          <div className="card">
            <Bool label="baseUrl" value={d?.config.baseUrlConfigured} />
            <Bool label="clientId" value={d?.config.clientIdConfigured} />
            <Bool label="clientSecret" value={d?.config.clientSecretConfigured} />
            <Bool label="scopes" value={d?.config.scopesConfigured} />
            <Bool label="requestId" value={d?.config.requestIdConfigured} />
            <div className="kv"><span>Pagamentos (PIX/PDF)</span><span className={`badge badge--${d?.writeFlags.financialPaymentActions ? 'primary' : 'gray'}`}>{d?.writeFlags.financialPaymentActions ? 'liberado' : 'bloqueado'}</span></div>
            <div className="kv"><span>Abertura de OS</span><span className={`badge badge--${d?.writeFlags.supportOsCreation ? 'primary' : 'gray'}`}>{d?.writeFlags.supportOsCreation ? 'liberado' : 'bloqueado'}</span></div>
            <div className="kv"><span>PILOT_MODE</span><span className={`badge badge--${d?.writeFlags.pilotMode ? 'amber' : 'gray'}`}>{d?.writeFlags.pilotMode ? 'ligado' : 'desligado'}</span></div>
          </div>

          <div className="section-title">Consultar cliente (leitura)</div>
          <div className="card">
            <div className="toolbar">
              <div className="field field--wide">
                <label htmlFor="isp-q">Telefone / CPF / nome</label>
                <input id="isp-q" className="input" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="ex.: 5511955554444, 123.456.789-00 ou Cliente Demo"
                  onKeyDown={(e) => { if (e.key === 'Enter') search(); }} />
              </div>
              <ActionButton variant="primary" disabled={searching || term.trim().length < 2} onClick={search}>
                {searching ? 'Buscando…' : 'Buscar'}
              </ActionButton>
            </div>

            {result?.source === 'ispbox-multiple' ? (
              <p className="muted mt-12">Múltiplos cadastros encontrados — refine por CPF/CNPJ completo.</p>
            ) : null}

            {result?.customer ? (
              <div className="mt-16">
                <div className="kv"><span>Cliente</span><span>{result.customer.name}</span></div>
                <div className="kv"><span>ID ISPBOX</span><span>{result.customer.ispboxId ?? '—'}</span></div>
                <div className="kv"><span>CPF/CNPJ</span><span>{result.customer.cpfCnpj ?? '—'}</span></div>
                <div className="kv"><span>Telefone</span><span>{result.customer.phone ?? '—'}</span></div>
                <div className="kv"><span>Origem</span><span className="badge badge--secondary">{result.source}</span></div>
                <div className="mt-12"><IspboxSnapshotView snapshot={result.snapshot} /></div>
                <p className="muted mt-12">Esta tela é somente leitura. Geração de PIX/PDF e OS ficam no atendimento, respeitando as flags.</p>
              </div>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
