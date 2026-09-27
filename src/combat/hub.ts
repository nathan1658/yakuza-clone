/**
 * What the combat pieces know about each other. CombatSystem implements it;
 * everything here is a type import, so there are no runtime cycles.
 */
import type { GameContext } from '../core/types';
import type { AttackTokens } from './rules';
import type { Motor } from './Motor';
import type { HitResolver } from './HitResolver';
import type { TimeFx } from './TimeFx';
import type { HeatGauge } from './HeatGauge';
import type { LockOn } from './LockOn';
import type { EncounterDirector } from './EncounterDirector';
import type { ImpactVfx } from './vfx/ImpactVfx';
import type { RenderFx } from './RenderFx';
import type { Grabs } from './Grabs';
import type { WeaponManager } from './weapons/WeaponManager';
import type { BossPhases } from './BossPhases';
import type { HeatActions } from './heat/HeatActions';

export interface CombatHub {
  readonly ctx: GameContext;
  readonly motor: Motor;
  readonly hits: HitResolver;
  readonly timeFx: TimeFx;
  readonly gauge: HeatGauge;
  readonly tokens: AttackTokens;
  readonly lock: LockOn;
  readonly director: EncounterDirector;
  readonly vfx: ImpactVfx;
  readonly renderFx: RenderFx;
  readonly grabs: Grabs;
  readonly weapons: WeaponManager;
  readonly boss: BossPhases;
  readonly heatActions: HeatActions;
  /** The player was knocked out: 'player:died' goes out once, after this frame's update. */
  playerDown(): void;
}
