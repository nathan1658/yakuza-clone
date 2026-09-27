/**
 * The COMBAT module's front door: owns every combat piece, ticks them in a
 * fixed order, and turns requests from the player controller and the story
 * into fights. Implements the CombatHub the pieces use to reach each other.
 */
import type {
  CombatAction, EncounterId, EncounterResult, GameContext, GameSystem, GameTime, ICharacter, ICombatSystem, IWeaponProp,
} from '../core/types';
import type { CombatHub } from './hub';
import { canAct, fighterOf } from './Fighter';
import { BossPhases } from './BossPhases';
import { DaiPaiDongTables } from './boss/DaiPaiDongTables';
import { EncounterDirector } from './EncounterDirector';
import { Grabs } from './Grabs';
import { HeatGauge } from './HeatGauge';
import { HeatActions } from './heat/HeatActions';
import { HitResolver } from './HitResolver';
import { LockOn } from './LockOn';
import { Motor } from './Motor';
import { RandomEncounters } from './RandomEncounters';
import { RenderFx } from './RenderFx';
import { AttackTokens } from './rules';
import { HEAT, MAX_ATTACK_TOKENS } from './tables';
import { TimeFx } from './TimeFx';
import { ImpactVfx } from './vfx/ImpactVfx';
import { WeaponManager } from './weapons/WeaponManager';
import { MOVES } from './moves';
import type { Fighter } from './Fighter';

/** Actions that only make sense inside a fight. */
const FIGHT_ONLY: ReadonlySet<CombatAction> = new Set<CombatAction>([
  'light', 'heavy', 'dodge', 'guardStart', 'grab', 'heat', 'throwWeapon',
]);

export class CombatSystem implements ICombatSystem, GameSystem, CombatHub {
  readonly name = 'combat';
  readonly maxHeat = HEAT.max;
  readonly tokens = new AttackTokens(MAX_ATTACK_TOKENS);

  motor!: Motor;
  hits!: HitResolver;
  timeFx!: TimeFx;
  gauge!: HeatGauge;
  lock!: LockOn;
  director!: EncounterDirector;
  vfx!: ImpactVfx;
  renderFx!: RenderFx;
  grabs!: Grabs;
  weapons!: WeaponManager;
  boss!: BossPhases;
  heatActions!: HeatActions;
  private bossTables!: DaiPaiDongTables;
  private random!: RandomEncounters;

  private deathPending = false;
  private deathSent = false;
  private readonly unsubs: (() => void)[] = [];

  constructor(readonly ctx: GameContext) {}

  init(): void {
    this.motor = new Motor(this);
    this.hits = new HitResolver(this);
    this.timeFx = new TimeFx(this.ctx);
    this.gauge = new HeatGauge(this.ctx);
    this.lock = new LockOn(this);
    this.director = new EncounterDirector(this);
    this.vfx = new ImpactVfx();
    this.vfx.attach(this.ctx.engine.scene);
    this.renderFx = new RenderFx(this.ctx);
    this.grabs = new Grabs(this);
    this.weapons = new WeaponManager(this);
    this.weapons.populate();
    this.boss = new BossPhases(this);
    this.bossTables = new DaiPaiDongTables(this);
    this.heatActions = new HeatActions(this);
    this.random = new RandomEncounters(this);
    const ev = this.ctx.events;
    this.unsubs.push(
      ev.on('state:changed', ({ from, to }) => {
        if (to === 'gameOver') this.abort();
        else if (from === 'gameOver') this.resetPlayer();
      }),
      ev.on('game:loaded', () => this.restart()),
      ev.on('game:newGame', () => this.restart()),
    );
  }

  update(time: GameTime): void {
    const dt = time.dt;
    this.timeFx.update(time.realDt);
    this.motor.update(fighterOf(this.ctx.entities.player), dt);
    for (const e of this.director.participants) this.motor.update(fighterOf(e), dt);
    this.grabs.update(dt);
    this.weapons.update(time);
    this.bossTables.update(dt);
    this.gauge.update(dt, this.director.fighting);
    this.director.update(dt, time.realDt);
    this.random.update(dt);
    this.heatActions.update(dt);
    this.lock.update();
    this.renderFx.update(this.ctx.state.is('heatAction'), this.ctx.engine.timeScale < 0.5 && this.director.fighting);
    this.vfx.update(dt);
    this.flushDeath();
  }

  dispose(): void {
    for (const off of this.unsubs) off();
    this.unsubs.length = 0;
    this.director.abort();
    this.weapons.dispose();
    this.vfx.dispose();
  }

  // -------------------------------------------------------------------------
  // CombatHub

  playerDown(): void {
    this.deathPending = true;
  }

  // -------------------------------------------------------------------------
  // ICombatSystem

  get inCombat(): boolean {
    return this.director.encounterId !== null;
  }

  get encounterId(): EncounterId | null {
    return this.director.encounterId;
  }

  get lockTarget(): ICharacter | null {
    return this.lock.target;
  }

  get heat(): number {
    return this.gauge.value;
  }

  get heatActionAvailable(): { nameZh: string; nameEn: string } | null {
    return this.heatActions.available;
  }

  prepareEncounter(id: EncounterId): ICharacter[] {
    return this.director.prepare(id);
  }

  startEncounter(id: EncounterId): void {
    this.deathSent = false;
    this.director.start(id);
  }

  waitForEncounter(id: EncounterId): Promise<EncounterResult> {
    return this.director.wait(id);
  }

  requestAction(c: ICharacter, action: CombatAction): boolean {
    const f = fighterOf(c);
    if (!f.isPlayer || !c.isAlive()) return false;
    // The finisher's button prompt reads these buttons itself.
    if (this.heatActions.qtePending && action !== 'guardEnd') return false;
    if (FIGHT_ONLY.has(action) && !this.director.fighting) return false;
    switch (action) {
      case 'light':
      case 'heavy':
        return this.motor.playerAttack(f, action);
      case 'dodge':
        return this.motor.dodge(f);
      case 'guardStart':
        return this.motor.guardStart(f);
      case 'guardEnd':
        return this.motor.guardEnd(f);
      case 'grab':
        return this.grabs.tryGrab(f);
      case 'throwWeapon':
        return this.throwWeapon(f);
      case 'dropWeapon':
        return canAct(c) && this.weapons.drop(c);
      case 'heat':
        return this.heatActions.tryStart(f);
    }
  }

  toggleLockOn(): void {
    if (this.director.fighting) this.lock.toggle();
  }

  cycleLockTarget(): void {
    if (this.director.fighting) this.lock.cycle();
  }

  canMove(c: ICharacter): boolean {
    return canAct(c);
  }

  /** The live list (no copy: the HUD asks every frame). Don't mutate it. */
  getActiveEnemies(): ICharacter[] {
    return this.director.activeEnemies;
  }

  addHeat(amount: number): void {
    this.gauge.add(amount);
  }

  setRandomEncountersEnabled(enabled: boolean): void {
    this.random.enabled = enabled;
  }

  getWeapons(): readonly IWeaponProp[] {
    return this.weapons.list;
  }

  // -------------------------------------------------------------------------

  private throwWeapon(f: Fighter): boolean {
    if (!f.c.heldWeapon || !canAct(f.c)) return false;
    f.chain = 0;
    this.motor.startAttack(f, MOVES.thrownWeapon, this.weapons.throwTarget(f.c));
    return true;
  }

  /** 'player:died' goes out once, after everything this frame has settled. */
  private flushDeath(): void {
    if (!this.deathPending) return;
    this.deathPending = false;
    if (this.deathSent) return;
    this.deathSent = true;
    this.ctx.events.emit('player:died', {});
  }

  /**
   * Game over: enemies and ring, lock, time and effects, the player's combat
   * state, then the waiters (agreed order).
   */
  private abort(): void {
    this.heatActions.abort();
    this.random.cancel();
    const id = this.director.abort();
    this.lock.clear();
    this.grabs.clear();
    this.tokens.clear();
    this.timeFx.reset();
    this.renderFx.reset();
    this.resetPlayer();
    if (id) this.director.announce(id, false, 0);
  }

  private restart(): void {
    this.abort();
    this.weapons.reset();
    this.gauge.reset();
    this.deathSent = false;
    this.deathPending = false;
  }

  /** A knocked-out player stays down until the game reloads or leaves game over. */
  private resetPlayer(): void {
    const p = this.ctx.entities.player;
    if (!p.isAlive()) return;
    const f = fighterOf(p);
    this.motor.reset(f);
    this.deathSent = false;
  }
}
