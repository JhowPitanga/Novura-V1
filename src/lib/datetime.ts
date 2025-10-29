export const SAO_PAULO_TZ = 'America/Sao_Paulo';

type DateLike = string | number | Date | null | undefined;

const ensureDate = (d: DateLike): Date | null => {
  if (!d) return null;
  try {
    return d instanceof Date ? d : new Date(d);
  } catch {
    return null;
  }
};

export function formatDateTimeSP(d: DateLike): string {
  const date = ensureDate(d);
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDateSP(d: DateLike): string {
  const date = ensureDate(d);
  if (!date) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: SAO_PAULO_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function getZonedParts(date: Date, includeTime: boolean) {
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: SAO_PAULO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };
  if (includeTime) {
    opts.hour = '2-digit';
    opts.minute = '2-digit';
    opts.second = '2-digit';
    (opts as any).hour12 = false;
  }
  const parts = new Intl.DateTimeFormat('en-US', opts).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const y = parseInt(map.year, 10);
  const m = parseInt(map.month, 10);
  const d = parseInt(map.day, 10);
  const hh = includeTime ? parseInt(map.hour ?? '0', 10) : 0;
  const mm = includeTime ? parseInt(map.minute ?? '0', 10) : 0;
  const ss = includeTime ? parseInt(map.second ?? '0', 10) : 0;
  return { y, m, d, hh, mm, ss };
}

// Converte um instante real para um número comparável baseado no horário de São Paulo
export function eventToSPEpochMs(d: DateLike): number | null {
  const date = ensureDate(d);
  if (!date) return null;
  const { y, m, d: day, hh, mm, ss } = getZonedParts(date, true);
  return Date.UTC(y, m - 1, day, hh, mm, ss, 0);
}

// Para datas escolhidas no calendário (dia sem horário), consideramos o dia em SP
export function calendarStartOfDaySPEpochMs(d: Date): number {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  return Date.UTC(y, m, day, 0, 0, 0, 0);
}

export function calendarEndOfDaySPEpochMs(d: Date): number {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  return Date.UTC(y, m, day, 23, 59, 59, 999);
}