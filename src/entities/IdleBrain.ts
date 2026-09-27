/**
 * Default brain for npc/vendor roles: stand at the spawn spot (the Character
 * plays idleClip), acknowledge a nearby player in freeRoam, and turn back
 * afterwards. Outside freeRoam it leaves facing alone so dialogue and
 * cutscene staging stay in charge.
 */
import { turnTowards } from '../core/math';
import type { GameContext, GameTime, ICharacter, ICharacterBrain } from '../core/types';

const NOTICE_RANGE_SQ = 3.5 * 3.5;
const TURN_RATE = 2;

export class IdleBrain implements ICharacterBrain {
  private readonly homeYaw: number;

  constructor(
    private readonly ctx: GameContext,
    private readonly c: ICharacter,
  ) {
    this.homeYaw = c.facing;
  }

  update(time: GameTime): void {
    if (!this.ctx.state.is('freeRoam')) return;
    const { c } = this;
    const p = this.ctx.entities.player.position;
    const dx = p.x - c.position.x;
    const dz = p.z - c.position.z;
    const target = dx * dx + dz * dz < NOTICE_RANGE_SQ ? Math.atan2(dx, dz) : this.homeYaw;
    c.facing = turnTowards(c.facing, target, TURN_RATE * time.dt);
  }
}
