/**
 * 烏鴉's fight in three acts. Each HP threshold is a phase change (a roar, a
 * line, 'boss:phase' for the HUD and the music, armour from phase 2), and at
 * the very end he drops to one knee and waits for the finisher. This only
 * reacts to damage; his AI reads the phase off his Fighter.
 */
import type { ICharacter } from '../core/types';
import type { CombatHub } from './hub';
import { fighterOf, setState, type Fighter } from './Fighter';
import { KNEEL } from './clips';
import { bossPhaseFor, finisherFailHp, finisherReady } from './rules';
import { BOSS_LINES, BOSS_PHASES } from './tables';

const LINE_SEC = 3.5;

export class BossPhases {
  constructor(private readonly hub: CombatHub) {}

  /** The fight starts: phase 1 and a full bar. */
  begin(c: ICharacter): void {
    const f = fighterOf(c);
    f.kneeling = false;
    this.setPhase(f, 1);
  }

  /** After damage lands on him: into the next phase, or down on one knee. */
  afterHit(f: Fighter): void {
    if (f.phase === 0 || f.kneeling || !f.c.isAlive()) return;
    const next = bossPhaseFor(f.c.hp / f.c.maxHp);
    if (next > f.phase) this.escalate(f, next);
    if (finisherReady(f.phase, f.c.hp, f.c.maxHp)) this.kneel(f);
  }

  /** The finisher's prompt was missed: he gets back up with a second wind. */
  recover(f: Fighter): void {
    f.kneeling = false;
    f.c.hp = finisherFailHp(f.c.hp, f.c.maxHp);
    this.hub.ctx.events.emit('boss:hp', { bossId: f.c.id, hp: f.c.hp, maxHp: f.c.maxHp });
  }

  private setPhase(f: Fighter, phase: number): void {
    f.phase = phase;
    f.armored = BOSS_PHASES[phase - 1].armor;
    const { events } = this.hub.ctx;
    events.emit('boss:phase', { bossId: f.c.id, phase });
    events.emit('boss:hp', { bossId: f.c.id, hp: f.c.hp, maxHp: f.c.maxHp });
  }

  private escalate(f: Fighter, phase: number): void {
    const { ctx } = this.hub;
    this.setPhase(f, phase);
    ctx.ui.showSubtitle(phase === 2 ? BOSS_LINES.phase2 : BOSS_LINES.phase3, BOSS_LINES.speaker, LINE_SEC);
    ctx.audio.playSfx('boss_roar', { position: f.c.position });
    ctx.cameraRig.shake(0.5, 0.6);
  }

  private kneel(f: Fighter): void {
    const { ctx } = this.hub;
    this.hub.motor.interrupt(f);
    f.kneeling = true;
    f.slideDur = 0;
    // No timer: he stays down until the finisher lands or is missed. Blows pass through him meanwhile.
    setState(f, 'staggered');
    f.c.invulnerable = true;
    f.c.rig.play(KNEEL, { restart: true });
    ctx.ui.showSubtitle(BOSS_LINES.kneel, BOSS_LINES.speaker, LINE_SEC);
    ctx.ui.toast(`按 [${ctx.input.getLabel('heatAction')}] 了結佢！`, 'info');
  }
}
