/**
 * Street fights: walking through 東星 turf in free roam now and then gets
 * you jumped. Thugs step out of the crowd, shout, and close in; the fight
 * starts once one is on top of you and all of them can get at you; if they
 * can't (a railing, the harbour), the ambush is called off.
 */
import { Vector3 } from 'three';
import { CG, type ICharacter } from '../core/types';
import type { CombatHub } from './hub';

/** Territory chances are "per 10 s spent inside". */
const ROLL_EVERY = 10;
/** Breathing room after any fight before the street picks another one. */
const QUIET_AFTER_FIGHT = 90;
const RUN_SPEED = 4.5;
/** The ring goes up once one thug is this close and every thug is within ENCLOSE_DIST (the ring caps at 18 m). */
const START_DIST = 7;
const ENCLOSE_DIST = 15;
/** Thugs re-aim at the player this often while closing in. */
const RETARGET_EVERY = 1;
/** Nobody got through (a railing, the harbour, a sprinting player): call it off rather than ring in someone unreachable. */
const GIVE_UP_AFTER = 8;
/** Line-of-sight height: above the kerb, below the top of a railing. */
const SIGHT_Y = 0.6;
const SHOUT = { text: '喂！你咪洪興嗰條友？兄弟，搞佢！', speaker: '東星打仔', dur: 3 } as const;

export class RandomEncounters {
  enabled = false;
  private rollTimer = ROLL_EVERY;
  private quiet = QUIET_AFTER_FIGHT;
  /** Thugs walking up to the player; the fight hasn't started yet. */
  private closing: ICharacter[] | null = null;
  private closingTime = 0;
  private nextRetarget = 0;
  private readonly from = new Vector3();
  private readonly dir = new Vector3();

  constructor(private readonly hub: CombatHub) {}

  update(dt: number): void {
    if (this.closing) {
      this.approach(dt);
      return;
    }
    if (this.hub.director.encounterId !== null) {
      this.quiet = QUIET_AFTER_FIGHT;
      return;
    }
    if (!this.enabled || !this.hub.ctx.state.is('freeRoam')) return;
    this.quiet -= dt;
    this.rollTimer -= dt;
    if (this.rollTimer > 0) return;
    this.rollTimer = ROLL_EVERY;
    if (this.quiet > 0) return;
    const chance = this.territoryChance();
    if (chance > 0 && Math.random() < chance) this.ambush();
  }

  /** Drop a pending ambush (game over, load, new game). */
  cancel(): void {
    this.closing = null;
    this.quiet = QUIET_AFTER_FIGHT;
    this.rollTimer = ROLL_EVERY;
  }

  private territoryChance(): number {
    const p = this.hub.ctx.entities.player.position;
    for (const t of this.hub.ctx.world.getTerritories()) {
      if (p.x >= t.min.x && p.x <= t.max.x && p.z >= t.min.z && p.z <= t.max.z) return t.encounterChance;
    }
    return 0;
  }

  private ambush(): void {
    const { ctx } = this.hub;
    const thugs = this.hub.director.prepare('random_street');
    if (thugs.length === 0) return;
    this.chase(thugs);
    ctx.ui.showSubtitle(SHOUT.text, SHOUT.speaker, SHOUT.dur);
    ctx.audio.playSfx('enemy_alert', { position: thugs[0].position });
    this.closing = thugs;
    this.closingTime = 0;
    this.nextRetarget = RETARGET_EVERY;
  }

  private approach(dt: number): void {
    const thugs = this.closing;
    if (!thugs) return;
    // Anything else taking over the screen (a cutscene, a shop) calls it off.
    if (!this.hub.ctx.state.is('freeRoam')) {
      this.closing = null;
      this.hub.director.abort();
      return;
    }
    this.closingTime += dt;
    const p = this.hub.ctx.entities.player.position;
    if (ringReady(p, thugs, (c) => this.inSight(p, c.position))) {
      this.closing = null;
      this.hub.director.start('random_street');
    } else if (this.closingTime >= GIVE_UP_AFTER) {
      this.hub.director.abort();
      this.cancel();
    } else if (this.closingTime >= this.nextRetarget) {
      this.nextRetarget += RETARGET_EVERY;
      this.chase(thugs);
    }
  }

  private chase(thugs: readonly ICharacter[]): void {
    const p = this.hub.ctx.entities.player.position;
    for (const c of thugs) void c.moveTo(p.clone(), RUN_SPEED, RETARGET_EVERY * 2);
  }

  /** Nothing solid in between: once ringed in, the two can always reach each other. */
  private inSight(a: Vector3, b: Vector3): boolean {
    this.from.set(a.x, SIGHT_Y, a.z);
    this.dir.set(b.x - a.x, 0, b.z - a.z);
    const d = this.dir.length();
    return d < 1e-3 || this.hub.ctx.physics.raycast(this.from, this.dir, d, CG.STATIC) === null;
  }
}

/**
 * One thug is in the player's face, none is too far out to be ringed in, and
 * nothing stands between any of them and the player.
 */
export function ringReady<T extends { position: Vector3 }>(
  player: Vector3,
  thugs: readonly T[],
  inSight: (thug: T) => boolean,
): boolean {
  let nearest = Infinity;
  for (const c of thugs) {
    const d = Math.hypot(c.position.x - player.x, c.position.z - player.z);
    if (d > ENCLOSE_DIST || !inSight(c)) return false;
    nearest = Math.min(nearest, d);
  }
  return nearest <= START_DIST;
}
