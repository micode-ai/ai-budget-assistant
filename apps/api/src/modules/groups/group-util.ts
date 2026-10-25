export const isP2002 = (e: unknown) => (e as { code?: string })?.code === 'P2002';
export const toDateOnly = (d: string) => new Date(`${d}T00:00:00.000Z`);
