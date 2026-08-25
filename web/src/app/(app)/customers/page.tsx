'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-context';
import { useQuery } from '@/lib/api/use-query';
import { PageHeader } from '@/components/PageHeader';
import { ActionButton } from '@/components/ActionButton';
import { DataTable, Column } from '@/components/DataTable';
import { Pager } from '@/components/Pager';
import { LoadingState, ErrorState } from '@/components/states';
import { Customer, Paginated } from '@/lib/api/types';

export default function CustomersPage() {
  const { request } = useAuth();
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);

  const qs = new URLSearchParams();
  if (term.trim()) qs.set('search', term.trim());
  qs.set('page', String(page));
  qs.set('limit', '20');

  const { data, loading, error, reload } = useQuery(
    () => request<Paginated<Customer>>(`/customers?${qs}`),
    [request, term, page],
  );

  const rows = data?.data ?? [];

  const columns: Column<Customer>[] = [
    { header: 'Nome', cell: (c) => <Link className="link-cell" href={`/customers/${c.id}`}>{c.name}</Link> },
    { header: 'CPF/CNPJ', cell: (c) => c.cpfCnpj ?? '—' },
    { header: 'Telefone', cell: (c) => c.phone ?? '—' },
    { header: 'E-mail', cell: (c) => c.email ?? '—' },
    { header: '', cell: (c) => <Link className="btn btn--sm" href={`/customers/${c.id}`}>Perfil</Link> },
  ];

  return (
    <div>
      <PageHeader
        title="Clientes"
        subtitle="Base de clientes sincronizada com a ISPBOX"
        actions={<ActionButton onClick={() => reload()}>Atualizar</ActionButton>}
      />
      <div className="toolbar">
        <div className="field field--wide">
          <label htmlFor="cust-search">Buscar (nome / CPF / telefone)</label>
          <input id="cust-search" className="input" value={term} onChange={(e) => { setPage(1); setTerm(e.target.value); }} placeholder="Digite para filtrar…" />
        </div>
      </div>

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} />
      ) : (
        <>
          <DataTable columns={columns} rows={rows} emptyLabel="Nenhum cliente." />
          <Pager page={data?.page ?? 1} limit={data?.limit ?? 20} total={data?.total ?? 0} onPage={setPage} unit="clientes" />
        </>
      )}
    </div>
  );
}
