import { Color, DirectionalLight, HemisphereLight, PointLight, Vector3 } from 'three';
import type { Object3D } from 'three';
import { LIGHT_SLOTS, type WorldUniforms } from './uniforms';

/** Something in the city that deserves a real light when the camera is near it. */
export interface LightSource {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** sRGB hex. */
  readonly color: number;
  /** Candela. */
  readonly intensity: number;
}

const POINT_LIGHTS = LIGHT_SLOTS;
const POINT_RANGE = 18;
const REASSIGN_SEC = 0.25;
const FADE_SEC = 0.3;
const SHADOW_HALF = 22;
const SHADOW_MAP = 2048;
const SHADOW_DISTANCE = 60;
/** From the shadow focus towards the light: high and a little south-west, so kerbs and stalls throw short shadows. */
const LIGHT_DIR = new Vector3(-0.3, 1, 0.35).normalize();

interface Slot {
  readonly light: PointLight;
  source: number;
  next: number;
  level: number;
}

/**
 * Night lighting inside the budget: one hemisphere, one 2048 shadow-casting
 * directional light that follows the player (texel-snapped so shadows don't
 * crawl), and a fixed pool of 8 point lights handed to the most important
 * nearby sources a few times per second, fading out and in on reassignment.
 * The light count never changes, so no program ever recompiles.
 */
export class LightRig {
  private readonly hemi = new HemisphereLight(0x3a4070, 0x1a1210, 4);
  private readonly sun = new DirectionalLight(0x8a9cff, 0.8);
  private readonly slots: Slot[] = [];
  private readonly best = new Int32Array(POINT_LIGHTS);
  private readonly bestScore = new Float32Array(POINT_LIGHTS);
  private readonly colors: Color[];
  private readonly axisX = new Vector3();
  private readonly axisY = new Vector3();
  private readonly snapped = new Vector3();
  private clock = REASSIGN_SEC;

  constructor(
    private readonly sources: readonly LightSource[],
    private readonly u: WorldUniforms,
  ) {
    this.colors = sources.map((s) => new Color(s.color));
    const sun = this.sun;
    sun.castShadow = true;
    sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    const cam = sun.shadow.camera;
    cam.left = -SHADOW_HALF;
    cam.right = SHADOW_HALF;
    cam.top = SHADOW_HALF;
    cam.bottom = -SHADOW_HALF;
    cam.near = 1;
    cam.far = SHADOW_DISTANCE * 2;
    cam.updateProjectionMatrix();
    sun.shadow.normalBias = 0.04;
    sun.shadow.bias = -0.0004;
    // The light camera's basis, as lookAt(-LIGHT_DIR) with +Y up will build it.
    this.axisX.crossVectors(new Vector3(0, 1, 0), LIGHT_DIR).normalize();
    this.axisY.crossVectors(LIGHT_DIR, this.axisX);
    for (let i = 0; i < POINT_LIGHTS; i++) {
      const light = new PointLight(0xffffff, 0, POINT_RANGE, 2);
      this.slots.push({ light, source: -1, next: -1, level: 0 });
    }
  }

  attach(parent: Object3D): void {
    parent.add(this.hemi, this.sun, this.sun.target);
    for (const s of this.slots) parent.add(s.light);
    // Every light also shines in the planar reflection (layer 1).
    this.hemi.layers.enable(1);
    this.sun.layers.enable(1);
    for (const s of this.slots) s.light.layers.enable(1);
  }

  /** `focus`: the player (or camera) on the ground; `realDt` keeps fades smooth in slow motion. */
  update(focus: Vector3, realDt: number): void {
    this.follow(focus);
    this.clock += realDt;
    if (this.clock >= REASSIGN_SEC) {
      this.clock = 0;
      this.rank(focus);
      this.assign();
    }
    const step = realDt / FADE_SEC;
    for (const slot of this.slots) {
      if (slot.next !== slot.source) {
        slot.level -= step;
        if (slot.level <= 0) {
          slot.level = 0;
          slot.source = slot.next;
          if (slot.source >= 0) {
            const src = this.sources[slot.source];
            slot.light.position.set(src.x, src.y, src.z);
            slot.light.color.copy(this.colors[slot.source]);
          }
        }
      } else if (slot.source >= 0) {
        slot.level = Math.min(1, slot.level + step);
      }
      const k = slot.level * slot.level * (3 - 2 * slot.level);
      slot.light.intensity = slot.source >= 0 ? this.sources[slot.source].intensity * k : 0;
    }
    this.publish();
  }

  /** Hand the lit slots to the effects that glow near them. */
  private publish(): void {
    const pos = this.u.uLightPos.value;
    const col = this.u.uLightCol.value;
    this.slots.forEach((slot, i) => {
      pos[i].copy(slot.light.position);
      col[i].copy(slot.light.color).multiplyScalar(slot.light.intensity);
    });
  }

  private follow(focus: Vector3): void {
    // Snap the focus to whole shadow texels in light space.
    const texel = (SHADOW_HALF * 2) / SHADOW_MAP;
    const fx = focus.dot(this.axisX);
    const fy = focus.dot(this.axisY);
    this.snapped
      .copy(focus)
      .addScaledVector(this.axisX, Math.round(fx / texel) * texel - fx)
      .addScaledVector(this.axisY, Math.round(fy / texel) * texel - fy);
    this.sun.target.position.copy(this.snapped);
    this.sun.position.copy(this.snapped).addScaledVector(LIGHT_DIR, SHADOW_DISTANCE);
    this.sun.target.updateMatrixWorld();
  }

  /** Keep the POINT_LIGHTS best sources by intensity over squared distance. */
  private rank(focus: Vector3): void {
    this.best.fill(-1);
    this.bestScore.fill(0);
    for (let i = 0; i < this.sources.length; i++) {
      const s = this.sources[i];
      const dx = s.x - focus.x;
      const dz = s.z - focus.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > POINT_RANGE * POINT_RANGE * 4) continue;
      const score = s.intensity / (d2 + 25);
      let j = POINT_LIGHTS - 1;
      if (score <= this.bestScore[j]) continue;
      while (j > 0 && this.bestScore[j - 1] < score) {
        this.bestScore[j] = this.bestScore[j - 1];
        this.best[j] = this.best[j - 1];
        j--;
      }
      this.bestScore[j] = score;
      this.best[j] = i;
    }
  }

  /** Slots already showing a winner keep it; the others fade over to the newcomers. */
  private assign(): void {
    for (const slot of this.slots) slot.next = this.best.includes(slot.source) ? slot.source : -1;
    for (const idx of this.best) {
      if (idx < 0 || this.shown(idx)) continue;
      for (const slot of this.slots) {
        if (slot.next !== -1) continue;
        slot.next = idx;
        break;
      }
    }
  }

  private shown(idx: number): boolean {
    for (const slot of this.slots) if (slot.next === idx) return true;
    return false;
  }
}
