'use client';

import { useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { useToast } from '@/lib/ui/toast';
import { PageHeader } from '@/components/PageHeader';
import { ActionButton } from '@/components/ActionButton';
import { DataTable, Column } from '@/components/DataTable';
import { PlanLikeCard } from '@/components/PlanLikeCard';
import { LoadingState, ErrorState } from '@/components/states';
import { KnowledgeArticle } from '@/lib/api/types';

const CATEGORY_LABEL: Record<string, string> = {
  COMERCIAL_PLANOS_FIBRA: 'Planos Fibra',
  COMERCIAL_PLANOS_MOVEL: 'Planos Móvel',
  COMERCIAL_COBERTURA: 'Cobertura',
  SUPORTE_PROCEDIMENTOS: 'Suporte',
  FINANCEIRO_PROCEDIMENTOS: 'Financeiro',
  FAQ: 'FAQ',
};
const catLabel = (c: string) => CATEGORY_LABEL[c] ?? c;
const isPlanCategory = (c: string) => c.startsWith('COMERCIAL_PLANOS');

interface FormState {
  id?: string;
  category: string;
  title: string;
  content: string;
  active: boolean;
}

const EMPTY: FormState = { category: '', title: '', content: '', active: true };

export default function KnowledgePage() {
  const { request, hasRole } = useAuth();
  const toast = useToast();
  const canWrite = hasRole('MANAGER'); // ADMIN passa em hasRole
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  // Guarda de reentrância por id: evita DELETE/PATCH duplicado em cliques múltiplos
  // (o 2º request iria 404 e poderia deixar a UI inconsistente). BUG-03 hardening.
  const actingRef = useRef<Set<string>>(new Set());

  const qs = new URLSearchParams();
  if (category) qs.set('category', category);
  if (search.trim()) qs.set('search', search.trim());

  const { data, loading, error, reload } = useQuery(
    () => request<KnowledgeArticle[]>(`/knowledge${qs.toString() ? `?${qs}` : ''}`),
    [request, category, search],
  );
  const { data: cats } = useQuery(() => request<string[]>('/knowledge/categories'), [request]);

  const rows = data ?? [];
  const categories = cats ?? [];
  const planRows = rows.filter((a) => isPlanCategory(a.category));
  const otherRows = rows.filter((a) => !isPlanCategory(a.category));

  async function save() {
    if (!form) return;
    if (!form.category.trim() || !form.title.trim() || !form.content.trim()) {
      toast.push('Preencha categoria, título e conteúdo', 'error');
      return;
    }
    setBusy(true);
    try {
      const body = JSON.stringify({
        category: form.category.trim(),
        title: form.title.trim(),
        content: form.content,
        active: form.active,
      });
      if (form.id) await request(`/knowledge/${form.id}`, { method: 'PATCH', body });
      else await request('/knowledge', { method: 'POST', body });
      toast.push(form.id ? 'Artigo atualizado' : 'Artigo criado', 'success');
      setForm(null);
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha ao salvar', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(a: KnowledgeArticle) {
    if (actingRef.current.has(a.id)) return;
    actingRef.current.add(a.id);
    try {
      await request(`/knowledge/${a.id}`, { method: 'PATCH', body: JSON.stringify({ active: !a.active }) });
      toast.push(a.active ? 'Artigo desativado' : 'Artigo ativado', 'success');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha', 'error');
    } finally {
      actingRef.current.delete(a.id);
    }
  }

  async function remove(a: KnowledgeArticle) {
    if (actingRef.current.has(a.id)) return;
    if (!window.confirm(`Excluir o artigo "${a.title}"? Esta ação não pode ser desfeita.`)) return;
    actingRef.current.add(a.id);
    try {
      await request(`/knowledge/${a.id}`, { method: 'DELETE' });
      toast.push('Artigo excluído', 'success');
      reload();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Falha ao excluir', 'error');
    } finally {
      actingRef.current.delete(a.id);
    }
  }

  const columns: Column<KnowledgeArticle>[] = useMemo(() => {
    const base: Column<KnowledgeArticle>[] = [
      { header: 'Categoria', cell: (a) => <span className="badge badge--secondary">{catLabel(a.category)}</span> },
      { header: 'Título', cell: (a) => a.title },
      { header: 'Conteúdo', cell: (a) => <span className="muted">{a.content.length > 80 ? `${a.content.slice(0, 80)}…` : a.content}</span> },
      { header: 'Ativo', cell: (a) => <span className={`badge badge--${a.active ? 'primary' : 'gray'}`}>{a.active ? 'Sim' : 'Não'}</span> },
    ];
    if (!canWrite) return base;
    return [
      ...base,
      {
        header: 'Ações',
        cell: (a) => (
          <div className="row-actions">
            <ActionButton small onClick={() => setForm({ id: a.id, category: a.category, title: a.title, content: a.content, active: a.active })}>Editar</ActionButton>
            <ActionButton small onClick={() => toggle(a)}>{a.active ? 'Desativar' : 'Ativar'}</ActionButton>
            <ActionButton small variant="danger" onClick={() => remove(a)}>Excluir</ActionButton>
          </div>
        ),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canWrite]);

  return (
    <div>
      <PageHeader
        title="Base de Conhecimento"
        subtitle="Planos, cobertura e procedimentos — conteúdo editável da ChipNews"
        actions={
          canWrite ? (
            <ActionButton variant="primary" onClick={() => setForm({ ...EMPTY })}>Novo artigo</ActionButton>
          ) : (
            <ActionButton onClick={() => reload()}>Atualizar</ActionButton>
          )
        }
      />

      <div className="toolbar">
        <div className="field">
          <label htmlFor="kb-cat">Categoria</label>
          <select id="kb-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Todas</option>
            {categories.map((c) => (<option key={c} value={c}>{catLabel(c)}</option>))}
          </select>
        </div>
        <div className="field field--wide">
          <label htmlFor="kb-search">Buscar</label>
          <input id="kb-search" className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Título ou conteúdo…" />
        </div>
      </div>

      {form ? (
        <div className="card mt-16">
          <div className="detail-header">
            <strong>{form.id ? 'Editar artigo' : 'Novo artigo'}</strong>
            <ActionButton small variant="ghost" onClick={() => setForm(null)}>Fechar</ActionButton>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="f-cat">Categoria</label>
            <input id="f-cat" className="input" list="kb-categories" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="ex.: COMERCIAL_PLANOS_FIBRA" />
            <datalist id="kb-categories">
              {categories.map((c) => (<option key={c} value={c} />))}
            </datalist>
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="f-title">Título</label>
            <input id="f-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="ex.: ULTRA 400 MEGA" />
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label htmlFor="f-content">Conteúdo</label>
            <textarea id="f-content" className="input" rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="ex.: R$ 99,90 — Fibra 400 Mega. [recomendado]" />
          </div>
          <label className="kb-checkbox" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Ativo
          </label>
          <div className="toolbar mt-16">
            <ActionButton variant="primary" disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar'}</ActionButton>
            <ActionButton variant="ghost" onClick={() => setForm(null)}>Cancelar</ActionButton>
          </div>
        </div>
      ) : null}

      <div className="mt-16">
        {loading && !data ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} />
        ) : (
          <>
            {planRows.length > 0 ? (
              <>
                <div className="site-section__title" style={{ marginBottom: 14 }}>Planos de Fibra Óptica</div>
                <div className="plan-like-grid">
                  {planRows.map((a) => (
                    <PlanLikeCard
                      key={a.id}
                      title={a.title}
                      content={a.content}
                      active={a.active}
                      canEdit={canWrite}
                      onEdit={() => setForm({ id: a.id, category: a.category, title: a.title, content: a.content, active: a.active })}
                    />
                  ))}
                </div>
                {otherRows.length > 0 ? <div className="site-section__title" style={{ margin: '24px 0 14px' }}>Demais artigos</div> : null}
              </>
            ) : null}
            {planRows.length === 0 || otherRows.length > 0 ? (
              <DataTable columns={columns} rows={planRows.length > 0 ? otherRows : rows} emptyLabel="Nenhum artigo nesta categoria." />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
