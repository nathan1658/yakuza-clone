/**
 * The 'player' saveable: {position, yaw, hp}. Loading also revives: the
 * game-over retry calls save.load() while the player lies in 'ko'.
 */
import { Vector3 } from 'three';
import type { GameContext, ISaveable } from '../core/types';
import type { Character } from './Character';

interface PlayerSave {
  position: [number, number, number];
  yaw: number;
  hp: number;
}

const ZERO = new Vector3();

function isPlayerSave(d: unknown): d is PlayerSave {
  const s = d as Partial<PlayerSave> | null;
  return !!s && Array.isArray(s.position) && s.position.length === 3 && typeof s.yaw === 'number' && typeof s.hp === 'number';
}

export function playerSaveable(ctx: GameContext, player: Character): ISaveable {
  const foot = new Vector3();
  const revive = (yaw: number, hp: number): void => {
    player.teleport(foot, yaw);
    player.setDesiredVelocity(ZERO);
    player.combatState = 'idle';
    player.stateTime = 0;
    player.stance = 'normal';
    player.hp = hp;
    ctx.cameraRig.snapBehindTarget();
  };
  const reset = (): void => {
    const start = ctx.world.getLocation('player_start');
    foot.copy(start.position);
    revive(start.yaw, player.maxHp);
  };
  return {
    saveKey: 'player',
    serialize: (): PlayerSave => ({ position: player.body.position.toArray(), yaw: player.facing, hp: player.hp }),
    deserialize(data: unknown): void {
      if (!isPlayerSave(data)) return reset();
      foot.fromArray(data.position);
      revive(data.yaw, Math.max(1, data.hp));
    },
    reset,
  };
}
