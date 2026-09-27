/**
 * The only reader of gameplay input. Reads and consumes actions only in
 * freeRoam/combat while input is enabled; every other mode (heatAction QTE,
 * dialogue, menus...) leaves the keys to their owners.
 */
import { Vector3 } from 'three';
import { turnTowards } from '../core/math';
import type { CombatAction, GameContext, GameTime, IInputManager, InputAction } from '../core/types';
import type { Character } from './Character';
import { approach, cameraRelative } from './motion';

/** [run, sprint] m/s before stats.speed. */
const SPEEDS = { freeRoam: [4.5, 7.5], combat: [3.2, 5.0] } as const;
const ACCEL = 20;
const DECEL = 36;
const TURN_RATE = 12;
const LOCK_TURN_RATE = 16;
const FACE_MIN_SPEED_SQ = 0.04;

/** Combat-only presses that map straight onto a combat request. */
const COMBAT_PRESSES: ReadonlyArray<readonly [InputAction, CombatAction]> = [
  ['lightAttack', 'light'],
  ['heavyAttack', 'heavy'],
  ['heatAction', 'heat'],
];

function take(input: IInputManager, action: InputAction): boolean {
  if (!input.wasPressed(action)) return false;
  input.consume(action);
  return true;
}

export class PlayerController {
  private readonly vel = new Vector3();
  private readonly want = new Vector3();
  private driving = false;
  private guarding = false;

  constructor(
    private readonly ctx: GameContext,
    private readonly player: Character,
  ) {}

  update(time: GameTime): void {
    const { ctx, player } = this;
    const inCombat = ctx.state.is('combat');
    player.stance = inCombat || ctx.state.is('heatAction') ? 'combat' : 'normal';
    const active = ctx.state.is('freeRoam', 'combat') && ctx.entities.playerInputEnabled && player.isAlive();
    if (this.guarding && !(active && inCombat)) this.setGuard(false);
    if (!active) return this.release();
    this.driving = true;
    this.move(time.dt, inCombat);
    if (inCombat) this.combatInput();
    this.interact();
  }

  private move(dt: number, inCombat: boolean): void {
    const { ctx, player } = this;
    if (player.scripted || !ctx.combat.canMove(player)) {
      this.vel.copy(player.desiredVelocity);
      return;
    }
    const speed = SPEEDS[inCombat ? 'combat' : 'freeRoam'][ctx.input.isDown('sprint') ? 1 : 0];
    this.intent(speed);
    approach(this.vel, this.want, (this.want.lengthSq() > this.vel.lengthSq() ? ACCEL : DECEL) * dt);
    player.setDesiredVelocity(this.vel);
    const lock = inCombat ? ctx.combat.lockTarget : null;
    if (lock) player.faceTowards(lock.position, LOCK_TURN_RATE * dt);
    else if (this.vel.lengthSq() > FACE_MIN_SPEED_SQ) {
      player.facing = turnTowards(player.facing, Math.atan2(this.vel.x, this.vel.z), TURN_RATE * dt);
    }
  }

  /** Camera-relative input scaled to `speed` × stats.speed, into `want`. */
  private intent(speed: number): Vector3 {
    const m = this.ctx.input.getMoveVector();
    return cameraRelative(m.x, m.y, this.ctx.cameraRig.getYaw(), this.want).multiplyScalar(speed * this.player.stats.speed);
  }

  private combatInput(): void {
    const { input, combat } = this.ctx;
    const p = this.player;
    for (const [action, request] of COMBAT_PRESSES) if (take(input, action)) combat.requestAction(p, request);
    if (take(input, 'grab')) combat.requestAction(p, p.heldWeapon ? 'throwWeapon' : 'grab');
    if (take(input, 'dodge')) {
      p.setDesiredVelocity(this.intent(SPEEDS.combat[0]));
      combat.requestAction(p, 'dodge');
    }
    if (take(input, 'lockOn')) combat.toggleLockOn();
    if (take(input, 'cycleTarget')) combat.cycleLockTarget();
    if (take(input, 'guard')) this.setGuard(true);
    else if (this.guarding && !input.isDown('guard')) this.setGuard(false);
  }

  private interact(): void {
    const { input, interactions, combat } = this.ctx;
    if (!take(input, 'interact')) return;
    // E is also 'confirm': don't let a dialogue opened this frame advance on the same press.
    if (interactions.tryInteract()) input.consume('confirm');
    else if (this.player.heldWeapon) combat.requestAction(this.player, 'dropWeapon');
  }

  private setGuard(on: boolean): void {
    this.guarding = on;
    this.ctx.combat.requestAction(this.player, on ? 'guardStart' : 'guardEnd');
  }

  /** Leaving player control: stop once, unless something else owns motion. */
  private release(): void {
    if (!this.driving) return;
    this.driving = false;
    this.vel.set(0, 0, 0);
    if (!this.player.scripted && this.ctx.combat.canMove(this.player)) this.player.setDesiredVelocity(this.vel);
  }
}
