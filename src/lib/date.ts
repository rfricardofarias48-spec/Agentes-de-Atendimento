export const TZ = 'America/Sao_Paulo'

/** Returns a Date whose .getHours(), .getDay(), .getDate(), .getMonth() reflect BRT time */
export function toBRT(d: Date): Date {
  return new Date(d.toLocaleString('en-US', { timeZone: TZ }))
}

/** Returns YYYY-MM-DD string in BRT timezone */
export function brtDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: TZ })
}
