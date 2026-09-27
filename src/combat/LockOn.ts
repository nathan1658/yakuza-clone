/**
 * Target lock (Q / Tab), the enemy outlines, and the player's attack focus.
 */
import type { ICharacter } from '../core/types';
import { wrapAngle, yawTo } from '../core/math';
import type { CombatHub } from './hub';
import { fighterOf } from './Fighter';
import { isHittable } from './hitTest';

const LOCK_RANGE = 12;
const LOCK_BREAK = 15;
/** Attacks home in on the lock target up to this far away. */
const FOCUS_LOCKED = 4;
const FOCUS_FREE = 3.5;
/** Free aim passes over someone who can't be hit right now (mid-air, getting up) unless nobody else is near. */
const UNHITTABLE_PENALTY = 2;
const RED = 0xff3b30;
/** A telegraphed attack is lit orange so the player can read it. */
const TELEGRAPH = 0xff8c00;

function selectable(e: ICharacter): boolean {
  return e.isAlive() && e.combatState !== 'ko';
}

export class LockOn {
  target: ICharacter | null = null;
  private readonly outlined = new Map<ICharacter, number>();

  constructor(private readonly hub: CombatHub) {}

  toggle(): void {
    if (this.target) this.set(null);
    else this.set(this.best(null));
  }

  cycle(): void {
    if (!this.target) {
      this.set(this.best(null));
      return;
    }
    const next = this.best(this.target);
    if (next) this.set(next);
  }

  /** Who the player's next attack aims at. */
  attackFocus(p: ICharacter): ICharacter | null {
    const t = this.target;
    if (t && selectable(t) && Math.hypot(t.position.x - p.position.x, t.position.z - p.position.z) <= FOCUS_LOCKED) return t;
    const mv = this.hub.ctx.input.getMoveVector();
    const moving = mv.x * mv.x + mv.y * mv.y > 0.04;
    const camYaw = this.hub.ctx.cameraRig.getYaw();
    // Stick direction in world yaw: forward follows the camera, right is -90°.
    const aim = moving ? camYaw + Math.atan2(-mv.x, mv.y) : p.facing;
    let best: ICharacter | null = null;
    let bestScore = Infinity;
    for (const e of this.hub.director.activeEnemies) {
      if (!selectable(e)) continue;
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
      if (d > FOCUS_FREE) continue;
      const busy = isHittable(e.combatState, true) ? 0 : UNHITTABLE_PENALTY;
      const score = d / FOCUS_FREE + Math.abs(wrapAngle(yawTo(p.position, e.position) - aim)) / Math.PI + busy;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  update(): void {
    const t = this.target;
    const p = this.hub.ctx.entities.player;
    const broken = t && (!selectable(t) || !this.hub.director.fighting
      || Math.hypot(t.position.x - p.position.x, t.position.z - p.position.z) > LOCK_BREAK);
    if (broken) this.set(this.hub.director.fighting ? this.best(null) : null);
    this.updateOutlines();
  }

  clear(): void {
    this.set(null);
    for (const c of this.outlined.keys()) c.rig.setOutline(false);
    this.outlined.clear();
  }

  private set(t: ICharacter | null): void {
    if (t === this.target) return;
    this.target = t;
    this.hub.ctx.cameraRig.setLockTarget(t ? t.object3d : null);
    this.hub.ctx.events.emit('combat:lockTarget', { targetId: t ? t.id : null });
  }

  /** Best enemy in front of the camera, skipping `after` (for Tab cycling, the next one round). */
  private best(after: ICharacter | null): ICharacter | null {
    const p = this.hub.ctx.entities.player;
    const camYaw = this.hub.ctx.cameraRig.getYaw();
    let best: ICharacter | null = null;
    let bestScore = Infinity;
    for (const e of this.hub.director.activeEnemies) {
      if (e === after || !selectable(e)) continue;
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
      if (d > LOCK_RANGE) continue;
      const score = d / LOCK_RANGE + Math.abs(wrapAngle(yawTo(p.position, e.position) - camYaw)) / Math.PI;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  /** Red rim on the lock target, orange on anyone winding up a telegraphed attack. */
  private updateOutlines(): void {
    for (const [c, colour] of this.outlined) {
      if (this.colourFor(c) !== colour) this.unmark(c);
    }
    for (const e of this.hub.director.activeEnemies) {
      const colour = this.colourFor(e);
      if (colour !== 0 && this.outlined.get(e) !== colour) this.mark(e, colour);
    }
  }

  private colourFor(c: ICharacter): number {
    if (!c.isAlive()) return 0;
    const f = fighterOf(c);
    if (c.combatState === 'attacking' && f.windupTo > 0) return TELEGRAPH;
    return c === this.target ? RED : 0;
  }

  private mark(c: ICharacter, colour: number): void {
    this.outlined.set(c, colour);
    c.rig.setOutline(true, colour);
  }

  private unmark(c: ICharacter): void {
    this.outlined.delete(c);
    c.rig.setOutline(false);
  }
}
