import { ReactNode } from 'react';
import { EmptyState } from './states';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  emptyLabel,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  emptyLabel?: string;
  rowClassName?: (row: T) => string;
}) {
  if (rows.length === 0) {
    return (
      <div className="table-wrap">
        <EmptyState label={emptyLabel ?? 'Nenhum registro.'} />
      </div>
    );
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i}>{c.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className={rowClassName?.(row)}>
              {columns.map((c, i) => (
                <td key={i}>{c.cell(row)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
