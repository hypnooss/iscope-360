/**
 * Centralized date formatting utilities.
 * All dates are displayed in the user's preferred timezone,
 * which is set globally via setUserTimezone() from AuthContext.
 */

let _userTZ = 'UTC';

/** Set the global timezone used by all format functions. Called by AuthContext on login. */
export function setUserTimezone(tz: string) { _userTZ = tz; }

/** Get the current global timezone. */
export function getUserTimezone(): string { return _userTZ; }

/**
 * Get the UTC offset in hours for a given IANA timezone.
 * Uses Intl.DateTimeFormat to dynamically resolve offset (handles DST).
 * Example: 'America/Sao_Paulo' → -3, 'Asia/Kolkata' → 5.5
 */
export function getUtcOffsetHours(timezone: string): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  });
  const parts = formatter.formatToParts(now);
  const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT';
  // Parse "GMT", "GMT-3", "GMT+5:30", etc.
  const match = offsetStr.match(/GMT([+-]?\d+)?(?::(\d+))?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  return hours + (hours >= 0 ? minutes / 60 : -minutes / 60);
}

/**
 * Format a date in pt-BR locale with the user's preferred timezone.
 * Accepts any Intl.DateTimeFormatOptions overrides.
 */
export function formatDateBR(
  date: string | Date | null | undefined,
  opts?: Intl.DateTimeFormatOptions
): string {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleString('pt-BR', { timeZone: _userTZ, ...opts });
  } catch {
    return String(date);
  }
}

/** dd/MM/yyyy, HH:mm */
export function formatDateTimeBR(date: string | Date | null | undefined): string {
  return formatDateBR(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** dd/MM/yyyy, HH:mm:ss */
export function formatDateTimeFullBR(date: string | Date | null | undefined): string {
  return formatDateBR(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** dd/MM, HH:mm */
export function formatShortDateTimeBR(date: string | Date | null | undefined): string {
  return formatDateBR(date, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** dd/MM/yyyy */
export function formatDateOnlyBR(date: string | Date | null | undefined): string {
  return formatDateBR(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Long format: "11 de março de 2026" */
export function formatDateLongBR(date: string | Date | null | undefined): string {
  return formatDateBR(date, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Long format with time: "11 de mar. de 2026 às 15:30" */
export function formatDateTimeLongBR(date: string | Date | null | undefined): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    const datePart = d.toLocaleDateString('pt-BR', {
      timeZone: _userTZ,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timePart = d.toLocaleTimeString('pt-BR', {
      timeZone: _userTZ,
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart} às ${timePart}`;
  } catch {
    return String(date);
  }
}

/** Medium format with time: "11 mar 2026 às 15:30" */
export function formatDateTimeMediumBR(date: string | Date | null | undefined): string {
  if (!date) return '—';
  try {
    const d = new Date(date);
    const datePart = d.toLocaleDateString('pt-BR', {
      timeZone: _userTZ,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    const timePart = d.toLocaleTimeString('pt-BR', {
      timeZone: _userTZ,
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${datePart} às ${timePart}`;
  } catch {
    return String(date);
  }
}

/**
 * Convert a Date/string to a "fake local" Date shifted to the user's timezone.
 * Use this when you need date-fns `format()` with the user's timezone.
 * 
 * Example: format(toUserTZ(someDate), 'dd/MM/yyyy HH:mm', { locale: ptBR })
 */
export function toUserTZ(date: Date | string): Date {
  const d = new Date(date);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: _userTZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0');
  return new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
}

/** @deprecated Use toUserTZ instead. Kept for backwards compatibility. */
export const toBRT = toUserTZ;
