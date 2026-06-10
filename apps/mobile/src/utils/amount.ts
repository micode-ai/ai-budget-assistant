export function parseAmount(value: string): number {
  return parseFloat(value.replace(',', '.'));
}
