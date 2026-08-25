'use client';

import { Fragment, useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { API_URL, uploadWithProgress, UploadHandle } from '@/lib/api/client';
import { useToast } from '@/lib/ui/toast';
import { useRealtimeEvents } from '@/lib/realtime/use-realtime-events';
import { usePolling } from '@/lib/realtime/use-polling';
import { PageHeader } from '@/components/PageHeader';
import { ActionButton } from '@/components/ActionButton';
import { Pager } from '@/components/Pager';
import { StatusBadge } from '@/components/StatusBadge';
import { AssigneeSelect } from '@/components/AssigneeSelect';
import { IspboxPanel } from '@/components/IspboxPanel';
import { LoadingState, ErrorState, EmptyState } from '@/components/states';
import { Attachment, Conversation, ConversationDetail, ConversationSummary, CopilotReply, Message, Paginated } from '@/lib/api/types';
import { formatBytes } from '@/lib/format';

const STATUSES = ['', 'BOT', 'PENDING', 'HUMAN', 'CLOSED'];
const POLL_MS = 5000;
const URGENCY_LABEL: Record<string, string> = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };

type LocalMessage = Message & { sending?: boolean; simulated?: boolean };

export default function ConversationsPage() {
  const { request } = useAuth();
  const [status, setStatus] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'chat' | 'client'>('chat'); // abas no mobile (item 2)

  const qs = new URLSearchParams();
  if (status) qs.set('status', status);
  if (term.trim()) qs.set('search', term.trim());
  qs.set('page', String(page));
  qs.set('limit', '30');

  const { data, loading, error, reload } = useQuery(
    () => request<Paginated<Conversation>>(`/conversations?${qs}`),
    [request, status, term, page],
  );

  // Tempo real: novos eventos recarregam a lista; o polling vira fallback.
  const { connected } = useRealtimeEvents({
    onMessageCreated: () => reload(),
    onConversationUpdated: () => reload(),
  });
  usePolling(reload, { connected, fallbackMs: POLL_MS });

  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('c');
    if (c) setSelected(c);
  }, []);

  const list = data?.data ?? [];

  async function openConversation(id: string) {
    setSelected(id);
    setMobileTab('chat');
    try {
      await request(`/conversations/${id}/read`, { method: 'POST' });
      reload();
    } catch {
      /* ignore */
    }
  }

  return (
    <div>
      <PageHeader
        title="Conversas"
        subtitle="Central de atendimento em tempo real — IA, fila e resposta humana"
        actions={<ActionButton onClick={() => reload()}>Atualizar</ActionButton>}
      />

      <div className={`conv-screen ${selected ? 'has-selection' : ''} tab-${mobileTab}`}>
        {selected ? (
          <div className="conv-tabs" role="tablist" aria-label="Abas da conversa">
            <button type="button" role="tab" aria-selected={mobileTab === 'chat' ? 'true' : 'false'} className={`conv-tabs__btn ${mobileTab === 'chat' ? 'is-active' : ''}`} onClick={() => setMobileTab('chat')}>💬 Chat</button>
            <button type="button" role="tab" aria-selected={mobileTab === 'client' ? 'true' : 'false'} className={`conv-tabs__btn ${mobileTab === 'client' ? 'is-active' : ''}`} onClick={() => setMobileTab('client')}>👤 Cliente / ISPBOX</button>
          </div>
        ) : null}
        {/* Coluna esquerda */}
        <div className="conv-col conv-col--list">
          <div className="conv-col__head">
            <div className="field" style={{ marginBottom: 10 }}>
              <label htmlFor="conv-status">Status</label>
              <select id="conv-status" className="select" value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
                {STATUSES.map((s) => (<option key={s} value={s}>{s || 'Todos'}</option>))}
              </select>
            </div>
            <input className="input" placeholder="Buscar cliente ou telefone…" value={term} onChange={(e) => { setPage(1); setTerm(e.target.value); }} aria-label="Buscar" />
          </div>
          <div className="conv-col__body">
            {loading && !data ? (
              <Skeleton rows={5} />
            ) : error ? (
              <ErrorState error={error} />
            ) : list.length === 0 ? (
              <EmptyState label="Nenhuma conversa." />
            ) : (
              list.map((c) => (
                <div
                  key={c.id}
                  className={`conv-item ${selected === c.id ? 'active' : ''} ${c.unread ? 'conv-item--unread' : ''}`}
                  onClick={() => openConversation(c.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div className="conv-item__name">{c.customer?.name ?? c.contact ?? 'Sem identificação'}</div>
                    {c.unread ? <span className="pill">novo</span> : null}
                  </div>
                  <div className="conv-item__badges">
                    <span className="chan-badge">WhatsApp</span>
                    {c.intent ? <IntentBadge intent={c.intent} /> : null}
                  </div>
                  <div className="conv-item__meta">
                    <StatusBadge value={c.status} friendly />
                    <span>{new Date(c.lastMessageAt ?? c.updatedAt).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          {data && data.total > data.limit ? (
            <div style={{ padding: '8px 12px' }}>
              <Pager page={data.page} limit={data.limit} total={data.total} onPage={setPage} unit="conversas" />
            </div>
          ) : null}
        </div>

        {selected ? (
          <Workspace key={selected} id={selected} connected={connected} onChanged={() => reload()} onBack={() => setSelected(null)} />
        ) : (
          <>
            <div className="conv-col"><div className="conv-col__body"><EmptyState label="Selecione uma conversa para iniciar o atendimento. 💬" /></div></div>
            <div className="conv-col"><div className="conv-col__body"><EmptyState label="Os dados do cliente aparecem aqui." /></div></div>
          </>
        )}
      </div>
    </div>
  );
}

function Skeleton({ rows }: { rows: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton--line" style={{ height: 40 }} />
      ))}
    </div>
  );
}

function Workspace({ id, connected, onChanged, onBack }: { id: string; connected: boolean; onChanged: () => void; onBack?: () => void }) {
  const { request, user } = useAuth();
  const toast = useToast();
  const { data, loading, error, reload } = useQuery(
    () => request<ConversationDetail>(`/conversations/${id}`),
    [request, id],
  );
  // Copilot: resumo inteligente determinístico (não bloqueia o chat se falhar).
  const { data: summary, loading: summaryLoading, reload: reloadSummary } = useQuery(
    () => request<ConversationSummary>(`/conversations/${id}/summary`),
    [request, id],
  );

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<UploadHandle | null>(null);

  // Tempo real do detalhe (apenas para esta conversa); polling é fallback.
  useRealtimeEvents({
    onMessageCreated: (p) => { if (p.conversationId === id) reload(); },
    onConversationUpdated: (p) => { if (p.conversationId === id) reload(); },
  });
  usePolling(reload, { connected, fallbackMs: POLL_MS });

  useEffect(() => {
    setMessages((prev) => {
      const temps = prev.filter((m) => String(m.id).startsWith('temp-'));
      return [...(data?.messages ?? []), ...temps];
    });
  }, [data]);

  useEffect(() => {
    if (atBottom) bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, atBottom]);

  const attachmentsById = useMemo(() => {
    const map = new Map<string, Attachment>();
    (data?.attachments ?? []).forEach((a) => map.set(a.id, a));
    return map;
  }, [data]);

  function onScroll() {
    const el = bodyRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  }

  async function send() {
    const content = draft.trim();
    if (!content || sending) return;
    const temp: LocalMessage = { id: `temp-${Date.now()}`, role: 'AGENT', content, createdAt: new Date().toISOString(), sending: true };
    setMessages((m) => [...m, temp]);
    setDraft('');
    setSending(true);
    try {
      const res = await request<{ delivery?: { simulated?: boolean } }>(`/conversations/${id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      if (res.delivery?.simulated) toast.push('Mensagem enviada (sandbox: simulado)', 'info');
      else toast.push('Mensagem enviada', 'success');
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      reload();
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== temp.id));
      toast.push(e instanceof Error ? e.message : 'Falha ao enviar', 'error');
    } finally {
      setSending(false);
    }
  }

  async function sendAttachment() {
    if (!file || sending) return;
    setSending(true);
    setUploadError(null);
    setUploadPct(0);
    try {
      const form = new FormData();
      form.append('file', file);
      if (draft.trim()) form.append('caption', draft.trim());
      const handle = uploadWithProgress(`/conversations/${id}/attachments`, form, setUploadPct);
      uploadRef.current = handle;
      const res = (await handle.promise) as { delivery?: { simulated?: boolean } };
      if (res?.delivery?.simulated) toast.push('Anexo enviado (sandbox: simulado)', 'info');
      else toast.push('Anexo enviado', 'success');
      setFile(null);
      setDraft('');
      reload();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao enviar anexo';
      setUploadError(msg);
      if (msg !== 'Cancelado') toast.push(msg, 'error');
    } finally {
      uploadRef.current = null;
      setUploadPct(null);
      setSending(false);
    }
  }

  function cancelUpload() {
    uploadRef.current?.cancel();
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (file) sendAttachment();
      else send();
    }
  }

  async function act(action: 'assign' | 'close' | 'reopen', uid?: string) {
    setBusy(true);
    try {
      const body = action === 'assign' ? JSON.stringify({ assignedUserId: uid ?? user?.id }) : undefined;
      await request(`/conversations/${id}/${action}`, { method: 'PATCH', body });
      toast.push('Ação concluída', 'success');
      reload();
      onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha na ação', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function shareLink(attId: string): Promise<string> {
    const link = await request<{ url: string }>(`/attachments/${attId}/share-link`, { method: 'POST' });
    return `${API_URL}${link.url}`;
  }

  async function download(attId: string) {
    try {
      window.open(await shareLink(attId), '_blank');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha ao gerar link', 'error');
    }
  }

  // Copilot: gera uma sugestão e PREENCHE o composer (nunca envia automaticamente).
  async function suggestReply() {
    if (suggesting) return;
    setSuggesting(true);
    try {
      const res = await request<CopilotReply>(`/conversations/${id}/copilot/suggest-reply`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setDraft(res.suggestion);
      toast.push('Sugestão gerada. Revise antes de enviar.', 'success');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha ao sugerir resposta', 'error');
    } finally {
      setSuggesting(false);
    }
  }

  async function copySummary() {
    if (!summary) return;
    const text = [
      `Cliente: ${summary.customerName}`,
      `Intenção: ${summary.intentLabel}`,
      `Situação: ${summary.currentSituation}`,
      summary.collectedData.length ? `Coletados: ${summary.collectedData.join(', ')}` : '',
      summary.pendingItems.length ? `Pendências: ${summary.pendingItems.join(', ')}` : '',
      `Próximo passo: ${summary.recommendedNextStep}`,
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      request(`/conversations/${id}/copilot/copy`, { method: 'POST' }).catch(() => {});
      toast.push('Resumo copiado', 'success');
    } catch {
      toast.push('Não foi possível copiar', 'error');
    }
  }

  if (loading && !data) {
    return (
      <>
        <div className="conv-col"><div className="conv-col__body"><Skeleton rows={6} /></div></div>
        <div className="conv-col"><div className="conv-col__body"><Skeleton rows={4} /></div></div>
      </>
    );
  }
  if (error || !data) {
    return <div className="conv-col"><div className="conv-col__body"><ErrorState error={error} /></div></div>;
  }

  const closed = data.status === 'CLOSED';
  const ticket = data.tickets?.[0];

  return (
    <>
      <div className="conv-col conv-col--chat">
        <div className="chat">
          <div className="chat__header">
            <div className="chat-peer">
              {onBack ? (
                <button type="button" className="chat__back" aria-label="Voltar para a lista" onClick={onBack}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                </button>
              ) : null}
              <div className="chat-peer__avatar">
                {(data.customer?.name ?? data.contact ?? '?').charAt(0).toUpperCase()}
                <span className="dot" />
              </div>
              <div className="chat-peer__meta">
                <div className="chat-peer__name">{data.customer?.name ?? data.contact ?? 'Sem identificação'}</div>
                <div className="chat-peer__sub">
                  <span className="chan-badge">WhatsApp</span>
                  <StatusBadge value={data.status} friendly />
                </div>
              </div>
            </div>
            <div className="row-actions">
              <ActionButton small disabled={busy} onClick={() => act('assign')}>Assumir</ActionButton>
              {closed ? (
                <ActionButton small variant="primary" disabled={busy} onClick={() => act('reopen')}>Reabrir</ActionButton>
              ) : (
                <ActionButton small variant="danger" disabled={busy} onClick={() => act('close')}>Fechar</ActionButton>
              )}
            </div>
          </div>

          <div className="chat__body" ref={bodyRef} onScroll={onScroll}>
            {messages.length === 0 ? (
              <EmptyState label="Nenhuma mensagem ainda. Envie a primeira resposta. ✍️" />
            ) : (
              messages.map((m, i) => {
                const meta = (m.metadata ?? {}) as { attachmentId?: string; type?: string };
                const att = meta.attachmentId ? attachmentsById.get(meta.attachmentId) : undefined;
                const isImage = att?.type === 'image' || meta.type === 'image';
                const prev = messages[i - 1];
                const showDay = !prev || !sameDay(m.createdAt, prev.createdAt);
                return (
                  <Fragment key={m.id}>
                  {showDay ? <div className="day-sep"><span>{fmtDay(m.createdAt)}</span></div> : null}
                  <div className={`bubble bubble--${bubbleTone(m.role)}`}>
                    {att && isImage ? <ImageThumb load={() => shareLink(att.id)} /> : null}
                    {att && !isImage ? (
                      <button type="button" className="attach-chip" onClick={() => download(att.id)}>
                        📄 {att.filename ?? 'documento'} · baixar
                      </button>
                    ) : null}
                    {m.content}
                    <div className="bubble__meta">
                      {roleLabel(m.role)} · {new Date(m.createdAt).toLocaleTimeString('pt-BR')}
                      {m.sending ? <span className="muted">enviando…</span> : null}
                      {m.simulated ? <span className="badge badge--amber">simulado</span> : null}
                    </div>
                  </div>
                  </Fragment>
                );
              })
            )}
          </div>

          {!atBottom ? (
            <ActionButton small className="scroll-bottom" onClick={() => bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })}>
              ↓ Últimas
            </ActionButton>
          ) : null}

          <div className="composer-wrap">
            {file ? (
              <div className="attach-preview">
                📎 {file.name} ({Math.round(file.size / 1024)} KB)
                {uploadPct !== null ? (
                  <>
                    <span className="upload-bar"><span className="upload-bar__fill" style={{ width: `${uploadPct}%` }} /></span>
                    <span className="muted">{uploadPct}%</span>
                    <ActionButton small variant="ghost" onClick={cancelUpload}>cancelar</ActionButton>
                  </>
                ) : (
                  <ActionButton small variant="ghost" onClick={() => { setFile(null); setUploadError(null); }}>remover</ActionButton>
                )}
                {uploadError ? <span className="badge badge--red">{uploadError}</span> : null}
              </div>
            ) : null}
            <div className="composer-suggest">
              <button type="button" className="cnbtn cnbtn--outline cnbtn--sm" disabled={suggesting || closed} onClick={suggestReply} title="Gera uma sugestão e preenche o campo (revise antes de enviar)">
                {suggesting ? '✨ Gerando…' : '✨ Sugerir resposta'}
              </button>
            </div>
            <div className="composer">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,application/pdf" hidden onChange={(e) => { setUploadError(null); setFile(e.target.files?.[0] ?? null); }} />
              <button type="button" className="icon-btn" title="Anexar imagem ou PDF" onClick={() => fileRef.current?.click()}>📎</button>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKey}
                placeholder={closed ? 'Conversa finalizada (ADMIN/MANAGER podem responder)' : 'Escreva… (Enter envia, Shift+Enter quebra linha)'}
                aria-label="Mensagem"
              />
              {file ? (
                <ActionButton variant="primary" disabled={sending} onClick={() => sendAttachment()}>
                  {sending ? 'Enviando…' : 'Enviar anexo'}
                </ActionButton>
              ) : (
                <ActionButton variant="primary" disabled={sending || !draft.trim()} onClick={() => send()}>
                  {sending ? 'Enviando…' : 'Enviar'}
                </ActionButton>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="conv-col conv-col--panel">
        <div className="conv-col__body" style={{ padding: 0 }}>
          <div className="cust-head">
            <div className="cust-head__avatar">{(data.customer?.name ?? data.contact ?? '?').charAt(0).toUpperCase()}</div>
            <div className="cust-head__name">{data.customer?.name ?? data.contact ?? 'Sem identificação'}</div>
            <div className="cust-head__tags">
              <span className="chan-badge">WhatsApp</span>
              {data.intent ? <IntentBadge intent={data.intent} /> : null}
              <StatusBadge value={data.status} friendly />
            </div>
          </div>

          <div className="panel-section copilot">
            <div className="copilot__head">
              <h4>🤖 Resumo da IA</h4>
              <div className="copilot__actions">
                <button type="button" className="copilot__btn" title="Atualizar resumo" disabled={summaryLoading} onClick={() => reloadSummary()}>↻</button>
                <button type="button" className="copilot__btn" title="Copiar resumo" disabled={!summary} onClick={copySummary}>⧉</button>
              </div>
            </div>
            {summaryLoading && !summary ? (
              <p className="muted">Gerando resumo…</p>
            ) : summary ? (
              <div className="copilot__body">
                <div className="copilot__tags">
                  {summary.intent !== 'UNKNOWN' ? <span className={`intent-badge intent-badge--${summary.intent}`}>{summary.intentLabel}</span> : null}
                  <span className={`urgency urgency--${summary.urgency}`}>{URGENCY_LABEL[summary.urgency]}</span>
                  {summary.handoffReason ? <span className="badge badge--gray">Handoff: {summary.handoffReason}</span> : null}
                </div>
                <p className="copilot__situation">{summary.currentSituation}</p>
                {summary.highlights.length ? (
                  <div className="copilot__chips">
                    {summary.highlights.map((h, i) => <span key={i} className="copilot__chip">{h}</span>)}
                  </div>
                ) : null}
                {summary.collectedData.length ? (
                  <div className="copilot__line"><span>Coletados</span><strong>{summary.collectedData.join(', ')}</strong></div>
                ) : null}
                {summary.pendingItems.length ? (
                  <div className="copilot__line copilot__line--pending"><span>Pendências</span><strong>{summary.pendingItems.join(', ')}</strong></div>
                ) : null}
                <div className="copilot__next"><span>Próximo passo</span><p>{summary.recommendedNextStep}</p></div>
              </div>
            ) : (
              <p className="muted">Resumo indisponível.</p>
            )}
          </div>

          <div className="panel-section">
            <h4>Cliente</h4>
            <div className="kv"><span>Nome</span><span>{data.customer?.name ?? '—'}</span></div>
            <div className="kv"><span>Telefone</span><span>{data.customer?.phone ?? data.contact ?? '—'}</span></div>
            <div className="kv"><span>CPF/CNPJ</span><span>{data.customer?.cpfCnpj ?? '—'}</span></div>
            <div className="kv"><span>E-mail</span><span>{data.customer?.email ?? '—'}</span></div>
            <div className="kv"><span>Status</span><span><StatusBadge value={data.status} friendly /></span></div>
          </div>

          {ticket ? (
            <div className="panel-section">
              <h4>Ticket relacionado</h4>
              <div className="kv"><span>Tipo</span><span><StatusBadge value={ticket.type} friendly /></span></div>
              <div className="kv"><span>Status</span><span><StatusBadge value={ticket.status} friendly /></span></div>
              <div className="kv"><span>Resumo</span><span>{ticket.summary ?? '—'}</span></div>
              <div className="kv"><span>OS ISPBOX</span><span>{ticket.workOrders?.map((w) => w.ispboxOsId ?? w.status).join(', ') || '—'}</span></div>
            </div>
          ) : null}

          {data.fsm ? (
            <div className="panel-section">
              <h4>Fluxo (FSM)</h4>
              <div className="kv"><span>Estado</span><span>{data.fsm.state}</span></div>
              {Object.entries(data.fsm.collectedData ?? {})
                .filter(([k]) => ['servico', 'cep', 'plano', 'nome', 'cpf'].includes(k))
                .map(([k, v]) => (<div className="kv" key={k}><span>{k}</span><span>{String(v)}</span></div>))}
            </div>
          ) : null}

          {data.attachments.length > 0 ? (
            <div className="panel-section">
              <h4>Anexos</h4>
              {data.attachments.map((a) => (
                <div className="kv" key={a.id}>
                  <span>{a.type} · {a.filename ?? '—'} · {formatBytes(a.sizeBytes)}</span>
                  <ActionButton small onClick={() => download(a.id)}>Baixar</ActionButton>
                </div>
              ))}
            </div>
          ) : null}

          {data.customer ? <IspboxPanel conversationId={id} /> : null}

          <div className="panel-section">
            <h4>Ações rápidas</h4>
            <div className="panel-actions">
              <AssigneeSelect busy={busy} onAssign={(uid) => act('assign', uid)} />
              {data.assignedUser ? <div className="kv"><span>Atribuída a</span><span>{data.assignedUser.name}</span></div> : null}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/** Miniatura de imagem: carrega o share-link autenticado e renderiza inline. */
function ImageThumb({ load }: { load: () => Promise<string> }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    load()
      .then((u) => active && setSrc(u))
      .catch(() => active && setFailed(true));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (failed) return <div className="thumb thumb--failed">imagem indisponível</div>;
  if (!src) return <div className="thumb skeleton" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <a href={src} target="_blank" rel="noreferrer"><img className="thumb" src={src} alt="anexo" /></a>;
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}
function fmtDay(d: string): string {
  const date = new Date(d);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Hoje';
  if (date.toDateString() === yest.toDateString()) return 'Ontem';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function bubbleTone(role: string): string {
  if (role === 'CUSTOMER') return 'customer';
  if (role === 'AI') return 'ai';
  if (role === 'AGENT') return 'agent';
  return 'system';
}
function roleLabel(role: string): string {
  return { CUSTOMER: 'Cliente', AI: 'IA', AGENT: 'Atendente', SYSTEM: 'Sistema' }[role] ?? role;
}

const INTENT_LABEL: Record<string, string> = {
  COMMERCIAL: 'Comercial', SUPPORT: 'Suporte', FINANCIAL: 'Financeiro', HUMAN: 'Humano',
};
function IntentBadge({ intent }: { intent: string }) {
  const key = intent.toUpperCase();
  return <span className={`intent-badge intent-badge--${key}`}>{INTENT_LABEL[key] ?? intent}</span>;
}
