/** 1234 → 'HK$1,234'; -20 → '-HK$20'. Rounds to whole dollars. */
export function formatMoney(amount: number): string {
  const n = Math.round(amount);
  const digits = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '-' : ''}HK$${digits}`;
}

/** Signed money change: '+HK$120' / '-HK$20'. */
export function formatMoneyDelta(delta: number): string {
  return delta >= 0 ? `+${formatMoney(delta)}` : formatMoney(delta);
}

/** Seconds → 'H:MM:SS' (play time on the title / continue row). */
export function formatPlayTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const pad = (v: number) => String(v).padStart(2, '0');
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
}
