/** Formata tamanho de arquivo; null/0/indefinido → "tamanho indisponível" (item 9). */
export function formatBytes(sizeBytes?: number | null): string {
  if (sizeBytes == null || sizeBytes <= 0) return 'tamanho indisponível';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}
