'use client';

import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { useRealtimeEvents } from '@/lib/realtime/use-realtime-events';
import { HeroSection } from '@/components/HeroSection';
import { SiteSection } from '@/components/SiteSection';
import { BigMetricCard } from '@/components/BigMetricCard';
import { OperationCard } from '@/components/OperationCard';
import { IntegrationStatusCard } from '@/components/IntegrationStatusCard';
import { ChipNewsButton } from '@/components/ChipNewsButton';
import { LoadingState, ErrorState } from '@/components/states';
import { HealthReport, KnowledgeArticle, SlaStats, StatsOverview } from '@/lib/api/types';

function fmtMin(v: number | null | undefined): string {
  return v == null ? '—' : `${v} min`;
}

export default function DashboardPage() {
  const { request } = useAuth();

  const { data, loading, error, reload } = useQuery(async () => {
    const safe = <T,>(p: Promise<T>, fb: T) => p.catch(() => fb);
    const [overview, sla, health, knowledge] = await Promise.all([
      safe(request<StatsOverview | null>('/stats/overview'), null),
      safe(request<SlaStats | null>('/stats/sla'), null),
      safe(request<HealthReport | null>('/health'), null),
      safe(request<KnowledgeArticle[]>('/knowledge'), [] as KnowledgeArticle[]),
    ]);
    return { overview, sla, health, knowledge };
  }, [request]);

  useRealtimeEvents({
    onConversationUpdated: () => reload(),
    onHumanQueueUpdated: () => reload(),
    onTicketUpdated: () => reload(),
  });

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState error={error} />;
  if (!data) return null;

  const o = data.overview;
  const kb = data.knowledge ?? [];
  const activeArticles = kb.filter((a) => a.active).length;
  const h = data.health;

  return (
    <div>
      <HeroSection
        logo
        eyebrow={<><span className="live-dot" /> Central Interna ChipNews · Sistema online</>}
        title={<><span className="grad">CentralIA</span> — Atendimento Inteligente</>}
        subtitle="Comercial, suporte e financeiro conectados ao WhatsApp e à ISPBOX — conversas, tickets e SLA em tempo real, numa única central."
        actions={
          <>
            <ChipNewsButton variant="cta" href="/conversations">Abrir conversas</ChipNewsButton>
            <ChipNewsButton variant="outline" href="/knowledge">Ver planos</ChipNewsButton>
          </>
        }
      />

      <div className="big-grid">
        <BigMetricCard tone="primary" icon="chat" value={o?.conversasAbertas ?? 0} label="Conversas abertas" hint="Em andamento" cta="Conversas →" />
        <BigMetricCard tone="cyan" icon="queue" value={o?.aguardandoHumano ?? 0} label="Aguardando humano" hint="Fila de handoff" cta="Fila →" />
        <BigMetricCard tone="amber" icon="ticket" value={o?.ticketsAbertos ?? 0} label="Tickets abertos" hint="Suporte e OS" cta="Tickets →" />
        <BigMetricCard tone="red" icon="clock" value={o?.slaAtrasado ?? 0} label="SLA atrasado" hint="Fora do prazo" cta="Resolver →" />
      </div>

      <SiteSection title="Operação" subtitle="Comercial, suporte e financeiro em uma única central.">
        <div className="op-grid">
          <OperationCard
            accent="primary" icon="chat" href="/knowledge"
            title="Comercial"
            description="Planos, cobertura por CEP e cadastro guiado por IA — START a GAMER em fibra óptica."
            status="IA ativa"
          />
          <OperationCard
            accent="cyan" icon="queue" href="/human-queue"
            title="Suporte"
            description="Diagnóstico, status da internet na ISPBOX e abertura de OS com evidências (vídeo/foto)."
            status="Operacional" statusTone="cyan"
          />
          <OperationCard
            accent="amber" icon="ticket" href="/tickets"
            title="Financeiro"
            description="Cobranças, PIX, boleto e segunda via — conectado às cobranças da ISPBOX."
            status="Pagamentos" statusTone="amber"
          />
          <OperationCard
            accent="green" icon="chat" href="/conversations"
            title="Atendimento"
            description="WhatsApp oficial em tempo real — fila humana, handoff da IA e histórico do cliente."
            status="WhatsApp" statusTone="green"
          />
        </div>
      </SiteSection>

      <SiteSection title="Indicadores de hoje">
        <div className="big-grid">
          <BigMetricCard tone="primary" icon="chat" value={o?.mensagensHoje ?? 0} label="Mensagens hoje" hint="Entrada + saída" />
          <BigMetricCard tone="cyan" icon="bolt" value={fmtMin(o?.mediaPrimeiraRespostaMin)} label="1ª resposta (média)" hint="Tempo até atendente" />
          <BigMetricCard tone="amber" icon="ticket" value={o?.pixGeradosHoje ?? 0} label="PIX gerados" hint="Pagamentos" />
          <BigMetricCard tone="primary" icon="book" value={activeArticles} label="Artigos ativos" hint="Base de conhecimento" />
        </div>
      </SiteSection>

      <SiteSection title="Operação em tempo real" subtitle="Status das integrações da central.">
        <div className="int-grid">
          <IntegrationStatusCard name="Meta WhatsApp" status={h?.checks.meta} />
          <IntegrationStatusCard name="ISPBOX" status={h?.checks.ispbox} />
          <IntegrationStatusCard name="Database" status={h?.checks.database} />
          <IntegrationStatusCard name="Redis" status={h?.checks.redis} />
          <IntegrationStatusCard name="IA" status={h?.checks.anthropic} />
          <IntegrationStatusCard name="Storage" status={h?.checks.storage} />
          <IntegrationStatusCard name="Modo" status={h?.appMode} />
        </div>
      </SiteSection>
    </div>
  );
}
