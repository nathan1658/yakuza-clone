import type { TriggerDef, TriggerShape } from '../../core/types';

/** Does the body's vertical segment (x, [y0, y1], z) touch the shape? */
function touches(shape: TriggerShape, x: number, y0: number, y1: number, z: number): boolean {
  if (shape.type === 'box') {
    const { min, max } = shape;
    return x >= min.x && x <= max.x && z >= min.z && z <= max.z && y0 <= max.y && y1 >= min.y;
  }
  const c = shape.center;
  const y = Math.min(y1, Math.max(y0, c.y));
  return (c.x - x) ** 2 + (c.y - y) ** 2 + (c.z - z) ** 2 <= shape.radius ** 2;
}

/**
 * Enter/exit edge detection for the player's body. Map.forEach with a bound
 * visitor keeps the per-frame check allocation-free; entries may be added or
 * removed from inside the callbacks (Map iteration tolerates both).
 */
export class TriggerSet {
  private readonly defs = new Map<string, TriggerDef>();
  private readonly inside = new Set<string>();
  private x = 0;
  private y0 = 0;
  private y1 = 0;
  private z = 0;

  constructor(
    private readonly onEnter: (id: string) => void,
    private readonly onExit: (id: string) => void,
  ) {}

  get size(): number {
    return this.defs.size;
  }

  /** Re-adding an id replaces it; the body counts as outside until the next update. */
  add(def: TriggerDef): void {
    this.defs.set(def.id, def);
    this.inside.delete(def.id);
  }

  /** Silent: no exit event for a trigger that is taken away. */
  remove(id: string): void {
    this.defs.delete(id);
    this.inside.delete(id);
  }

  update(x: number, y0: number, y1: number, z: number): void {
    this.x = x;
    this.y0 = y0;
    this.y1 = y1;
    this.z = z;
    this.defs.forEach(this.visit);
  }

  private readonly visit = (def: TriggerDef): void => {
    const now = touches(def.shape, this.x, this.y0, this.y1, this.z);
    if (now === this.inside.has(def.id)) return;
    if (!now) {
      this.inside.delete(def.id);
      this.onExit(def.id);
      return;
    }
    if (def.once) this.defs.delete(def.id);
    else this.inside.add(def.id);
    this.onEnter(def.id);
  };
}
