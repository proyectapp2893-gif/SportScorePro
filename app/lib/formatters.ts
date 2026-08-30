/** Formats monetary values using the tournament's Colombian peso convention. */
export function formatCopAmount(value: number | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0 COP';
  // Legacy tournaments stored fine amounts in thousands (25 means $25.000).
  // Values already expressed in pesos (for example 30000) remain unchanged.
  const normalizedAmount = amount !== 0 && Math.abs(amount) < 1000 ? amount * 1000 : amount;
  return `${new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(normalizedAmount)} COP`;
}
