export const POST_TYPES = [
  { id: 'DNEVNI_MENI', label: 'Dnevni meni', hint: 'Jela danas, svaki red jedno jelo' },
  { id: 'JELO_DANA', label: 'Jelo dana', hint: 'Naziv jela i kratka napomena' },
  { id: 'ZELENA_OAZA', label: 'Zelena Oaza', hint: 'Šta je ubrano ili šta se radi na ranču' },
  { id: 'CATERING', label: 'Catering', hint: 'Za koga i kakav događaj' },
  { id: 'DOGADJAJ', label: 'Događaj', hint: 'Datum, šta se dešava, poziv na rezervaciju' },
  { id: 'OSTALO', label: 'Ostalo', hint: 'Slobodna tema' },
] as const;

export type PostTypeId = (typeof POST_TYPES)[number]['id'];
export const POST_TYPE_IDS = POST_TYPES.map((t) => t.id) as [PostTypeId, ...PostTypeId[]];
export const postTypeLabel = (id: string) => POST_TYPES.find((t) => t.id === id)?.label ?? id;

export const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  PENDING_APPROVAL: { label: 'Čeka odobrenje', cls: 'bg-amber-100 text-amber-900' },
  SCHEDULED: { label: 'Zakazano', cls: 'bg-blue-100 text-blue-900' },
  PROCESSING: { label: 'Objavljuje se', cls: 'bg-blue-100 text-blue-900' },
  PUBLISHED: { label: 'Objavljeno', cls: 'bg-mm-tint text-mm-dark' },
  FAILED: { label: 'Greška', cls: 'bg-red-100 text-red-900' },
  REJECTED: { label: 'Odbijeno', cls: 'bg-stone-200 text-stone-800' },
};
