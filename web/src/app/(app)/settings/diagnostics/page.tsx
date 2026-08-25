'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { API_URL } from '@/lib/api/client';
import { useRealtime } from '@/lib/realtime/realtime-context';
import { useToast } from '@/lib/ui/toast';
import { PageHeader } from '@/components/PageHeader';
import { ActionButton } from '@/components/ActionButton';
import { IntegrationChip } from '@/components/IntegrationChip';
import { LoadingState, ErrorState } from '@/components/states';
import { HealthReport, MetaDiagnostics, StatsOverview } from '@/lib/api/types';

const CHECKLIST = `CentralIA — Checklist do Piloto Real
1. Subir API e Web
2. Rodar migrations (prisma:deploy)
3. Rodar seed
4. Rodar npm run pilot:check
5. Validar /settings/diagnostics
6. Configurar webhook da Meta
7. Rodar npm run pilot:ispbox-readonly
8. Ativar PILOT_MODE com telefone permitido (PILOT_ALLOWED_PHONES)
9. Enviar WhatsApp de teste (pilot:meta-send-test)
10. Acompanhar Conversas / Fila Humana
11. Só então ativar production sem PILOT_MODE`;

function Bool({ label, value }: { label: string; value?: boolean }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <span className={`badge badge--${value ? 'primary' : 'red'}`}>{value ? 'configurado' : 'ausente'}</span>
    </div>
  );
}

export default function DiagnosticsPage() {
  const { request, hasRole } = useAuth();
  const { connected } = useRealtime();
  const toast = useToast();
  const allowed = hasRole('MANAGER'); // ADMIN passa em hasRole
  const isAdmin = hasRole(); // só ADMIN (hasRole sem args → user.role === 'ADMIN')

  const { data, loading, error, reload } = useQuery(async () => {
    const safe = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);
    const [health, meta, stats] = await Promise.all([
      safe(request<HealthReport | null>('/health'), null),
      safe(request<MetaDiagnostics | null>('/meta-whatsapp/diagnostics'), null),
      safe(request<StatsOverview | null>('/stats/overview'), null),
    ]);
    return { health, meta, stats };
  }, [request, allowed]);

  const [statsBusy, setStatsBusy] = useState(false);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Diagnóstico" subtitle="Prontidão do ambiente para o piloto" />
        <ErrorState error={{ name: 'Forbidden', message: 'Apenas ADMIN e MANAGER.' }} />
      </div>
    );
  }

  const h = data?.health;
  const m = data?.meta;

  async function copyChecklist() {
    try {
      await navigator.clipboard.writeText(CHECKLIST);
      toast.push('Checklist copiado', 'success');
    } catch {
      toast.push('Não foi possível copiar', 'error');
    }
  }

  async function runStats() {
    setStatsBusy(true);
    try {
      await request<StatsOverview>('/stats/overview');
      toast.push('Stats OK', 'success');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha ao consultar stats', 'error');
    } finally {
      setStatsBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Diagnóstico do Piloto"
        subtitle="Prontidão de ambiente — Health, Meta, ISPBOX, filas, storage e tempo real"
        actions={<ActionButton onClick={() => reload()}>Rodar health</ActionButton>}
      />

      <div className="toolbar">
        <ActionButton small disabled={statsBusy} onClick={runStats}>Rodar stats</ActionButton>
        <ActionButton small onClick={copyChecklist}>Copiar checklist</ActionButton>
        <ActionButton small onClick={() => window.open(`${API_URL}/api`, '_blank')}>Abrir Swagger</ActionButton>
        <ActionButton small onClick={() => window.open(`${API_URL}/admin/queues`, '_blank')}>Abrir filas</ActionButton>
      </div>

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <div className="section-title">Modo de operação</div>
          <div className="card">
            <div className="chip-row">
              <IntegrationChip name="APP_MODE" status={h?.appMode ?? '—'} />
              <span className={`badge badge--${h?.pilotMode ? 'amber' : 'gray'}`}>
                PILOT_MODE: {h?.pilotMode ? 'LIGADO' : 'desligado'}
              </span>
              <span className={`badge badge--${connected ? 'primary' : 'gray'}`}>
                Tempo real: {connected ? 'conectado' : 'offline (polling)'}
              </span>
            </div>
          </div>

          <div className="section-title">Infraestrutura</div>
          <div className="card">
            <div className="chip-row">
              <IntegrationChip name="Database" status={h?.checks.database} />
              <IntegrationChip name="Redis" status={h?.checks.redis} />
              <IntegrationChip name="Filas" status={h?.checks.queues} />
              <IntegrationChip name="Storage" status={h?.checks.storage} />
              <IntegrationChip name="ISPBOX" status={h?.checks.ispbox} />
              <IntegrationChip name="Meta" status={h?.checks.meta} />
              <IntegrationChip name="IA (Anthropic)" status={h?.checks.anthropic} />
            </div>
          </div>

          <div className="section-title">Meta WhatsApp {isAdmin ? '' : '(requer ADMIN)'}</div>
          <div className="card">
            {m ? (
              <>
                <Bool label="Verify token" value={m.meta.verifyTokenConfigured} />
                <Bool label="App secret (assinatura)" value={m.meta.appSecretConfigured} />
                <Bool label="Phone Number ID" value={m.meta.phoneNumberIdConfigured} />
                <Bool label="Access token" value={m.meta.accessTokenConfigured} />
                <div className="kv"><span>Graph version</span><span>{m.meta.graphVersion || '—'}</span></div>
                <div className="kv">
                  <span>Outbound</span>
                  <span className={`badge badge--${m.outbound.allowed ? 'primary' : 'amber'}`}>
                    {m.outbound.allowed ? 'permitido' : 'bloqueado'}
                  </span>
                </div>
                <div className="kv"><span>Motivo</span><span className="muted">{m.outbound.reason}</span></div>
                <div className="kv"><span>Telefones no piloto</span><span>{m.pilotAllowedPhonesCount}</span></div>
                <div className="kv"><span>Último evento</span><span>{m.lastEventAt ? new Date(m.lastEventAt).toLocaleString('pt-BR') : '—'}</span></div>
                <div className="kv">
                  <span>Último erro Meta</span>
                  <span className="muted">{m.lastError ? `${m.lastError.operation}: ${m.lastError.message}` : '—'}</span>
                </div>
              </>
            ) : (
              <p className="muted">Diagnóstico da Meta indisponível (requer ADMIN ou API offline).</p>
            )}
          </div>

          <div className="section-title">Operação (stats)</div>
          <div className="card">
            {data?.stats ? (
              <>
                <div className="kv"><span>Conversas abertas</span><span>{data.stats.conversasAbertas}</span></div>
                <div className="kv"><span>Aguardando humano</span><span>{data.stats.aguardandoHumano}</span></div>
                <div className="kv"><span>Tickets abertos</span><span>{data.stats.ticketsAbertos}</span></div>
                <div className="kv"><span>Mensagens hoje</span><span>{data.stats.mensagensHoje}</span></div>
                <div className="kv"><span>SLA no prazo / atrasado</span><span>{data.stats.slaNoPrazo} / {data.stats.slaAtrasado}</span></div>
                <div className="kv"><span>PIX gerados hoje</span><span>{data.stats.pixGeradosHoje}</span></div>
              </>
            ) : (
              <>
                <div className="kv">
                  <span>Operação</span>
                  <span className="badge badge--amber">indisponível</span>
                </div>
                <p className="muted" style={{ marginTop: 8 }}>
                  Não foi possível carregar /stats/overview agora. Use “Rodar stats” para tentar novamente.
                </p>
                <ActionButton small disabled={statsBusy} onClick={runStats}>Rodar stats</ActionButton>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
