/** Friendly loading captions for the boot systems (GameSystem.name → caption). */
export const SYSTEM_CAPTIONS: Readonly<Record<string, string>> = {
  save: '翻查舊賬',
  audio: '調校音響',
  ui: '貼好街招',
  cameraRig: '架好攝影機',
  world: '起緊銅鑼灣',
  entities: '召集人馬',
  interactions: '打點街坊',
  inventory: '點算銀包',
  combat: '磨利西瓜刀',
  narrative: '寫緊劇本',
};

/**
 * GameInstance reports whole-boot progress per system (i / n, label = system
 * name) and the world forwards its own 0..1 build progress with free-form
 * labels. This folds the latter into the current system's slice so the bar
 * only ever moves forward.
 */
export class LoadingProgress {
  private base = 0;
  private width = 0.1;
  private shown = 0;

  /** Returns [overall progress 0..1, caption]. */
  map(progress: number, label: string): [number, string] {
    const p = Math.min(1, Math.max(0, progress));
    const system = Object.hasOwn(SYSTEM_CAPTIONS, label);
    if (system && p > this.base) this.width = p - this.base;
    if (system) this.base = p;
    const overall = system ? p : this.base + p * this.width;
    this.shown = Math.max(this.shown, Math.min(1, overall));
    return [this.shown, system ? SYSTEM_CAPTIONS[label]! : label];
  }
}
