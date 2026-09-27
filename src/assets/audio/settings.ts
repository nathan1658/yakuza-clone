/**
 * Bus volume persistence (agreement #17).
 * Stored in localStorage 'hk-dragon.settings' under the `volume` field; any other
 * fields in that object belong to other modules and are preserved on write.
 */
export type Bus = 'master' | 'music' | 'sfx' | 'ambience';
export type Volumes = Record<Bus, number>;

export const SETTINGS_KEY = 'hk-dragon.settings';
export const BUSES: readonly Bus[] = ['master', 'music', 'sfx', 'ambience'];
export const DEFAULT_VOLUMES: Readonly<Volumes> = { master: 0.8, music: 0.6, sfx: 0.9, ambience: 0.7 };

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** localStorage, or null where it does not exist or access is denied (node, sandboxed iframes). */
export function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function clampVolume(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function readObject(store: KeyValueStore | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(SETTINGS_KEY) ?? '{}');
    return parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function loadVolumes(store: KeyValueStore | null): Volumes {
  const saved = readObject(store).volume as Partial<Record<Bus, unknown>> | undefined;
  const out = { ...DEFAULT_VOLUMES };
  for (const bus of BUSES) out[bus] = clampVolume(saved?.[bus], DEFAULT_VOLUMES[bus]);
  return out;
}

export function saveVolumes(store: KeyValueStore | null, volumes: Volumes): void {
  if (!store) return;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify({ ...readObject(store), volume: { ...volumes } }));
  } catch {
    // Quota exceeded or storage disabled: volumes still apply for this session.
  }
}
