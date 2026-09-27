/**
 * Control hints during the first fight (後巷, prologue_alley). Key names come
 * from the input bindings, so rebinding never makes a hint lie.
 */
import type { InputAction } from '../../core/types';
import type { Rt } from './Env';

const TUTORIAL_FIGHT = 'prologue_alley';
const HINTS: ReadonlyArray<readonly [InputAction, string]> = [
  ['lightAttack', '輕擊（連按出連擊）'],
  ['heavyAttack', '重擊'],
  ['guard', '防守'],
  ['dodge', '閃避'],
  ['interact', '拾起摺凳'],
  ['lockOn', '鎖定'],
];
const HINT_GAP_SEC = 2.5;
const HEAT_HINT_AT = 33;

export class Tutorial {
  private fighting = false;
  private heatHinted = false;

  constructor(private readonly rt: Rt) {
    const { events } = rt.ctx;
    events.on('combat:start', (e) => {
      if (e.encounterId === TUTORIAL_FIGHT) void this.start();
    });
    events.on('combat:end', () => {
      this.fighting = false;
    });
    events.on('heat:changed', (e) => this.onHeat(e.heat));
  }

  private hint(action: InputAction, text: string): void {
    this.rt.ctx.ui.toast(`${this.rt.ctx.input.getLabel(action)}　${text}`, 'info');
  }

  private async start(): Promise<void> {
    this.fighting = true;
    this.heatHinted = false;
    const alive = this.rt.session.token();
    for (const [action, text] of HINTS) {
      await this.rt.clock.wait(HINT_GAP_SEC);
      if (!this.fighting || !alive()) return;
      this.hint(action, text);
    }
  }

  private onHeat(heat: number): void {
    if (!this.fighting || this.heatHinted || heat < HEAT_HINT_AT) return;
    this.heatHinted = true;
    this.hint('heatAction', '極道必殺技！');
  }
}
