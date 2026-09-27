import { Vector3 } from 'three';
import type { Object3D, PerspectiveCamera } from 'three';
import { CG } from './types';
import type {
  CameraMode,
  CameraShot,
  GameContext,
  GameEvents,
  GameModeId,
  GameSystem,
  GameTime,
  ICameraRig,
  Vec3Source,
} from './types';
import { clamp, damp, ease, lerp, yawTo } from './math';
import {
  COLLISION_MARGIN,
  allowedDistance,
  applyMousePitch,
  applyMouseYaw,
  dampAngle,
  nextCollisionDistance,
  orbitOffset,
  punchEnvelope,
  shakeNoise,
  yawOfDirection,
} from './cameraMath';

const BASE_FOV = 55;
const FOV_RATE = 4;
const MOUSE_SENSITIVITY = 0.0022; // rad per pixel
const DEFAULT_PITCH = 0.22;
const RECENTER_IDLE_SEC = 2.5;
const RECENTER_MIN_SPEED = 0.5; // m/s
const RECENTER_RATE = 1.2;
const PIVOT_XZ_RATE = 12;
const PIVOT_Y_RATE = 8;
const RIG_RATE = 5;

/** Camera mode each game state asks for. Cutscene / heatAction are driven by playSequence. */
const MODE_FOR_STATE: Partial<Record<GameModeId, CameraMode>> = {
  title: 'orbitShowcase',
  freeRoam: 'follow',
  combat: 'combat',
  dialogue: 'dialogue',
};
/** States in which the camera does not move at all (paused screens). */
const FROZEN_STATES: ReadonlySet<GameModeId> = new Set<GameModeId>(['menu', 'shop', 'gameOver']);
/** States in which the mouse steers the camera. */
const MOUSE_STATES: ReadonlySet<GameModeId> = new Set<GameModeId>(['freeRoam', 'combat']);

/** Real seconds to blend into a mode (0 = cut). */
const BLEND_SEC: Record<CameraMode, number> = {
  follow: 0.7,
  combat: 0.5,
  dialogue: 0.6,
  cinematic: 0,
  orbitShowcase: 0,
};
const MODE_FOV: Record<CameraMode, number> = {
  follow: BASE_FOV,
  combat: BASE_FOV,
  dialogue: 45,
  cinematic: BASE_FOV,
  orbitShowcase: 50,
};

interface OrbitParams {
  distance: number;
  /** Pivot height above the target's origin (feet). */
  height: number;
  /** Sideways offset to the camera's right. */
  shoulder: number;
  recenter: boolean;
}
const ORBIT: Record<'follow' | 'combat', OrbitParams> = {
  follow: { distance: 4.4, height: 1.55, shoulder: 0.3, recenter: true },
  combat: { distance: 5.6, height: 1.8, shoulder: 0.45, recenter: false },
};

/** Combat camera with a lock target. */
const LOCK = {
  shoulder: 0.8,
  distancePerMetre: 0.35,
  maxDistance: 8.5,
  yawRate: 3.5,
  headHeight: 1.5,
  /** Look point = lerp(player pivot, target head, lookBias). */
  lookBias: 0.3,
};

const DIALOGUE = {
  headHeight: 1.6,
  behind: 1.1,
  side: 0.55,
  up: 0.15,
  lookBias: 0.75,
  drift: 0.05,
};

const SHOWCASE = { location: 'sogo_crossing', angularSpeed: 0.06, radius: 34, height: 11, lookHeight: 14 } as const;

const SHAKE = { move: 0.3, roll: 0.05 };

/**
 * How the orbit yaw is chosen when follow/combat takes over from another mode:
 * snap behind the target, adopt the direction the camera currently looks, or keep it.
 */
const ORBIT_ENTRY: Record<CameraMode, 'snap' | 'adopt' | 'keep'> = {
  orbitShowcase: 'snap',
  cinematic: 'adopt',
  dialogue: 'adopt',
  follow: 'keep',
  combat: 'keep',
};

interface ActiveSequence {
  shots: readonly CameraShot[];
  index: number;
  time: number;
  resolve: () => void;
  /** Mode to fall back to if the current state doesn't name one. */
  returnMode: CameraMode;
}

function isOrbitMode(mode: CameraMode): boolean {
  return mode === 'follow' || mode === 'combat';
}

function evalSource(src: Vec3Source, out: Vector3): Vector3 {
  return out.copy(typeof src === 'function' ? src() : src);
}

/**
 * Third-person camera: follow / combat / dialogue / cinematic / title orbit,
 * with wall collision, blends between modes, trauma shake and FOV punches.
 * Everything moves in lateUpdate on real time, after gameplay has moved.
 */
export class CameraRig implements ICameraRig, GameSystem {
  readonly name = 'cameraRig';

  private currentMode: CameraMode = 'orbitShowcase';
  private followTarget: Object3D | null = null;
  private lockTarget: Object3D | null = null;
  private speakerA: Object3D | null = null;
  private speakerB: Object3D | null = null;
  private sequence: ActiveSequence | null = null;
  private unsubscribe: (() => void) | null = null;

  // Orbit state.
  private yaw = 0;
  private pitch = DEFAULT_PITCH;
  private mouseIdle = 0;
  private readonly pivot = new Vector3();
  private readonly targetPos = new Vector3();
  private readonly lastTargetPos = new Vector3();
  private targetSpeed = 0;
  private pivotFresh = true;
  private rigDistance = ORBIT.follow.distance;
  private rigHeight = ORBIT.follow.height;
  private rigShoulder = ORBIT.follow.shoulder;
  private rigFresh = true;
  private collisionDist = Infinity;
  private showcaseCenter: Vector3 | null = null;
  private showcaseAngle = 0;

  // Pose pipeline: mode updater → desired → blend → out → camera (+ shake).
  private readonly desiredPos = new Vector3();
  private readonly desiredLook = new Vector3();
  private readonly outPos = new Vector3();
  private readonly outLook = new Vector3(0, 0, 1);
  private readonly blendFromPos = new Vector3();
  private readonly blendFromLook = new Vector3();
  private blendT = 0;
  private blendDur = 0;
  private posed = false;

  // Effects.
  private fovBase = BASE_FOV;
  private trauma = 0;
  private traumaDecay = 0;
  private punchDelta = 0;
  private punchT = 1;
  private punchDur = 1;

  // Scratch.
  private readonly anchor = new Vector3();
  private readonly right = new Vector3();
  private readonly offset = new Vector3();
  private readonly other = new Vector3();
  private readonly rayDir = new Vector3();
  private readonly scratch = new Vector3();

  private readonly updaters: Record<CameraMode, (time: GameTime) => void> = {
    follow: (t) => this.updateOrbit(ORBIT.follow, t.realDt),
    combat: (t) => this.updateCombat(t.realDt),
    dialogue: (t) => this.updateDialogue(t),
    cinematic: (t) => this.updateCinematic(t),
    orbitShowcase: (t) => this.updateShowcase(t.realDt),
  };

  constructor(private readonly ctx: GameContext) {}

  get camera(): PerspectiveCamera {
    return this.ctx.engine.camera;
  }

  get mode(): CameraMode {
    return this.currentMode;
  }

  init(): void {
    this.unsubscribe = this.ctx.events.on('state:changed', this.onStateChanged);
  }

  update(): void {
    // All camera motion happens in lateUpdate, after gameplay moved this frame.
  }

  lateUpdate(time: GameTime): void {
    if (FROZEN_STATES.has(this.ctx.state.mode)) return;
    this.readMouse(time.realDt);
    this.computeDesired(time);
    this.applyBlend(time.realDt);
    this.writeCamera(time);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.dropSequence();
  }

  // ---------------------------------------------------------------- public API

  setMode(mode: CameraMode): void {
    if (mode !== 'cinematic') this.dropSequence();
    this.enterMode(mode);
  }

  setFollowTarget(target: Object3D): void {
    this.followTarget = target;
    this.pivotFresh = true;
  }

  setLockTarget(target: Object3D | null): void {
    this.lockTarget = target;
  }

  setDialogueFraming(a: Object3D, b: Object3D): void {
    this.speakerA = a;
    this.speakerB = b;
    if (this.currentMode !== 'dialogue') return;
    this.collisionDist = Infinity;
    this.startBlend(BLEND_SEC.dialogue);
  }

  playSequence(shots: CameraShot[]): Promise<void> {
    const returnMode = this.sequence?.returnMode ?? this.currentMode;
    this.dropSequence();
    if (shots.length === 0) {
      this.restoreMode(returnMode);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.sequence = { shots: shots.slice(), index: 0, time: 0, resolve, returnMode };
      this.enterMode('cinematic');
    });
  }

  stopSequence(): void {
    if (this.sequence) this.finishSequence();
  }

  shake(intensity: number, duration: number): void {
    const amount = clamp(intensity, 0, 1);
    if (amount === 0) return;
    // Never shorten or weaken a shake already running.
    const remaining = this.trauma > 0 ? this.trauma / this.traumaDecay : 0;
    this.trauma = Math.max(this.trauma, amount);
    this.traumaDecay = this.trauma / Math.max(remaining, duration, 0.01);
  }

  punch(fovDelta: number, duration: number): void {
    this.punchDelta = fovDelta;
    this.punchDur = Math.max(duration, 0.01);
    this.punchT = 0;
  }

  /** Yaw of the direction the camera actually looks (unshaken), so movement matches the screen. */
  getYaw(): number {
    const dx = this.outLook.x - this.outPos.x;
    const dz = this.outLook.z - this.outPos.z;
    if (dx * dx + dz * dz < 1e-8) return this.yaw;
    return yawOfDirection(dx, dz);
  }

  snapBehindTarget(): void {
    const target = this.resolveTarget();
    if (target) this.yaw = target.rotation.y;
    this.pitch = DEFAULT_PITCH;
    this.mouseIdle = 0;
    this.pivotFresh = true;
    this.rigFresh = true;
    this.collisionDist = Infinity;
    if (isOrbitMode(this.currentMode)) this.blendDur = 0;
  }

  // ------------------------------------------------------------- mode control

  private readonly onStateChanged = ({ to }: GameEvents['state:changed']): void => {
    if (this.sequence) return; // the sequence restores the right mode when it ends
    const mode = MODE_FOR_STATE[to];
    if (mode) this.enterMode(mode);
  };

  private enterMode(mode: CameraMode): void {
    const from = this.currentMode;
    if (mode === from) return;
    this.currentMode = mode;
    this.collisionDist = Infinity;
    this.startBlend(BLEND_SEC[mode]);
    if (isOrbitMode(mode)) this.enterOrbit(this.posed ? ORBIT_ENTRY[from] : 'snap');
  }

  private enterOrbit(entry: 'snap' | 'adopt' | 'keep'): void {
    if (entry === 'snap') return this.snapBehindTarget();
    if (entry === 'keep') return;
    this.yaw = this.getYaw();
    this.pitch = DEFAULT_PITCH;
    this.pivotFresh = true;
  }

  private restoreMode(fallback: CameraMode): void {
    this.enterMode(MODE_FOR_STATE[this.ctx.state.mode] ?? fallback);
  }

  /** Sequence ended (naturally or via stopSequence): return to the state's camera, then resolve. */
  private finishSequence(): void {
    const seq = this.sequence;
    if (!seq) return;
    this.sequence = null;
    this.restoreMode(seq.returnMode);
    seq.resolve();
  }

  /** Sequence superseded (new sequence or explicit setMode): resolve without touching the mode. */
  private dropSequence(): void {
    const seq = this.sequence;
    this.sequence = null;
    seq?.resolve();
  }

  // ------------------------------------------------------------ frame pipeline

  private readMouse(dt: number): void {
    this.mouseIdle += dt;
    const input = this.ctx.input;
    if (!input.pointerLocked || !MOUSE_STATES.has(this.ctx.state.mode)) return;
    const d = input.getLookDelta();
    if (d.x === 0 && d.y === 0) return;
    this.mouseIdle = 0;
    if (!this.activeLock()) this.yaw = applyMouseYaw(this.yaw, d.x, MOUSE_SENSITIVITY);
    this.pitch = applyMousePitch(this.pitch, d.y, MOUSE_SENSITIVITY);
  }

  private computeDesired(time: GameTime): void {
    const mode = this.currentMode;
    this.updaters[mode](time);
    // A finishing sequence switches mode mid-update: give the new mode its first pose now.
    if (this.currentMode !== mode) this.updaters[this.currentMode](time);
  }

  private startBlend(duration: number): void {
    this.blendT = 0;
    this.blendDur = this.posed ? duration : 0;
    this.blendFromPos.copy(this.outPos);
    this.blendFromLook.copy(this.outLook);
  }

  private applyBlend(dt: number): void {
    if (this.blendT >= this.blendDur) {
      this.outPos.copy(this.desiredPos);
      this.outLook.copy(this.desiredLook);
      return;
    }
    const t = ease('inOutCubic', this.blendT / this.blendDur);
    this.blendT += dt;
    this.outPos.lerpVectors(this.blendFromPos, this.desiredPos, t);
    this.outLook.lerpVectors(this.blendFromLook, this.desiredLook, t);
  }

  private writeCamera(time: GameTime): void {
    const cam = this.camera;
    cam.position.copy(this.outPos);
    cam.lookAt(this.outLook);
    this.applyShake(time.realDt, time.realElapsed);
    this.applyFov(time.realDt);
    this.posed = true;
  }

  private holdPose(): void {
    this.desiredPos.copy(this.outPos);
    this.desiredLook.copy(this.outLook);
  }

  // -------------------------------------------------------------- mode updaters

  private updateOrbit(p: OrbitParams, dt: number): void {
    const target = this.resolveTarget();
    if (!target) return this.holdPose();
    this.trackTarget(target, dt);
    this.dampRig(p.distance, p.height, p.shoulder, dt);
    if (p.recenter) this.autoRecenter(target, dt);
    this.placeOrbit(dt);
  }

  private updateCombat(dt: number): void {
    const lock = this.activeLock();
    const target = this.resolveTarget();
    if (!lock || !target) return this.updateOrbit(ORBIT.combat, dt);
    this.trackTarget(target, dt);
    const lockPos = lock.getWorldPosition(this.other);
    const separation = Math.hypot(lockPos.x - this.pivot.x, lockPos.z - this.pivot.z);
    if (separation > 0.01) this.yaw = dampAngle(this.yaw, yawTo(this.pivot, lockPos), LOCK.yawRate, dt);
    const distance = clamp(ORBIT.combat.distance + separation * LOCK.distancePerMetre, ORBIT.combat.distance, LOCK.maxDistance);
    this.dampRig(distance, ORBIT.combat.height, LOCK.shoulder, dt);
    this.placeOrbit(dt);
    lockPos.y += LOCK.headHeight;
    this.desiredLook.lerpVectors(this.anchor, lockPos, LOCK.lookBias);
  }

  private updateDialogue(time: GameTime): void {
    const a = this.speakerA;
    const b = this.speakerB;
    if (!a?.parent || !b?.parent) return this.updateOrbit(ORBIT.follow, time.realDt);
    const headA = a.getWorldPosition(this.anchor);
    const headB = b.getWorldPosition(this.other);
    headA.y += DIALOGUE.headHeight;
    headB.y += DIALOGUE.headHeight;
    const dir = this.offset.subVectors(headB, headA).setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(Math.sin(a.rotation.y), 0, Math.cos(a.rotation.y));
    dir.normalize();
    const right = this.right.set(-dir.z, 0, dir.x);
    const t = time.realElapsed;
    this.desiredPos
      .copy(headA)
      .addScaledVector(dir, -DIALOGUE.behind)
      .addScaledVector(right, DIALOGUE.side + DIALOGUE.drift * Math.sin(t * 0.41));
    this.desiredPos.y += DIALOGUE.up + DIALOGUE.drift * 0.6 * Math.sin(t * 0.29);
    this.desiredLook.lerpVectors(headA, headB, DIALOGUE.lookBias);
    this.resolveCollision(headA, time.realDt);
  }

  private updateCinematic(time: GameTime): void {
    const seq = this.sequence;
    if (!seq) return this.holdPose();
    const shot = this.advanceSequence(seq, time);
    if (!shot) return this.finishSequence();
    const t = ease(shot.ease, shot.duration > 0 ? seq.time / shot.duration : 1);
    this.evalShotPoint(shot.position, shot.toPosition, t, this.desiredPos);
    this.evalShotPoint(shot.lookAt, shot.toLookAt, t, this.desiredLook);
    this.fovBase = shot.fov ?? BASE_FOV;
  }

  private updateShowcase(dt: number): void {
    this.showcaseCenter ??= this.ctx.world.getLocation(SHOWCASE.location).position.clone();
    const c = this.showcaseCenter;
    this.showcaseAngle += SHOWCASE.angularSpeed * dt;
    const a = this.showcaseAngle;
    this.desiredPos.set(c.x + Math.sin(a) * SHOWCASE.radius, c.y + SHOWCASE.height, c.z + Math.cos(a) * SHOWCASE.radius);
    this.desiredLook.set(c.x, c.y + SHOWCASE.lookHeight, c.z);
  }

  // ------------------------------------------------------------------ helpers

  private resolveTarget(): Object3D | null {
    this.followTarget ??= this.ctx.entities?.player?.object3d ?? null;
    return this.followTarget;
  }

  private activeLock(): Object3D | null {
    const lock = this.lockTarget;
    return this.currentMode === 'combat' && lock?.parent ? lock : null;
  }

  /** Smoothly follow the target's world position; also measures its horizontal speed. */
  private trackTarget(target: Object3D, dt: number): void {
    const p = target.getWorldPosition(this.targetPos);
    if (this.pivotFresh) {
      this.pivot.copy(p);
      this.lastTargetPos.copy(p);
      this.pivotFresh = false;
    }
    this.targetSpeed = dt > 0 ? Math.hypot(p.x - this.lastTargetPos.x, p.z - this.lastTargetPos.z) / dt : 0;
    this.lastTargetPos.copy(p);
    this.pivot.x = damp(this.pivot.x, p.x, PIVOT_XZ_RATE, dt);
    this.pivot.z = damp(this.pivot.z, p.z, PIVOT_XZ_RATE, dt);
    this.pivot.y = damp(this.pivot.y, p.y, PIVOT_Y_RATE, dt);
  }

  private dampRig(distance: number, height: number, shoulder: number, dt: number): void {
    const k = this.rigFresh ? 1 : 1 - Math.exp(-RIG_RATE * dt);
    this.rigDistance = lerp(this.rigDistance, distance, k);
    this.rigHeight = lerp(this.rigHeight, height, k);
    this.rigShoulder = lerp(this.rigShoulder, shoulder, k);
    this.rigFresh = false;
  }

  /**
   * After a while without mouse input, swing back behind a target running away from the camera.
   * Weighted by how directly away it runs: movement is camera-relative, so chasing a strafing
   * target would walk it in circles, and chasing one that runs at the camera would spin the view.
   */
  private autoRecenter(target: Object3D, dt: number): void {
    if (this.mouseIdle < RECENTER_IDLE_SEC || this.targetSpeed < RECENTER_MIN_SPEED) return;
    const away = Math.cos(target.rotation.y - this.yaw);
    if (away <= 0) return;
    this.yaw = dampAngle(this.yaw, target.rotation.y, RECENTER_RATE * away, dt);
  }

  /** Over-the-shoulder orbit around the pivot; writes desired pose (anchor = pivot + height). */
  private placeOrbit(dt: number): void {
    const anchor = this.anchor.copy(this.pivot);
    anchor.y += this.rigHeight;
    const right = this.right.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)).multiplyScalar(this.rigShoulder);
    this.desiredLook.copy(anchor).add(right);
    orbitOffset(this.yaw, this.pitch, this.rigDistance, this.offset);
    this.desiredPos.copy(anchor).add(this.offset).add(right);
    this.resolveCollision(anchor, dt);
  }

  /** Pull the desired position in front of static geometry between `origin` and it. */
  private resolveCollision(origin: Vector3, dt: number): void {
    const dir = this.rayDir.subVectors(this.desiredPos, origin);
    const full = dir.length();
    if (full < 1e-4) return;
    const hit = this.ctx.physics.raycast(origin, dir, full + COLLISION_MARGIN, CG.STATIC);
    this.collisionDist = nextCollisionDistance(this.collisionDist, allowedDistance(hit ? hit.distance : null, full), dt);
    if (this.collisionDist >= full) return;
    this.desiredPos.copy(origin).addScaledVector(dir, this.collisionDist / full);
  }

  /** Advance the active sequence; returns the shot to show, or null when it has ended. */
  private advanceSequence(seq: ActiveSequence, time: GameTime): CameraShot | null {
    let shot = seq.shots[seq.index];
    seq.time += shot.realTime === false ? time.dt : time.realDt;
    while (seq.time >= shot.duration) {
      seq.time -= Math.max(shot.duration, 0);
      seq.index++;
      if (seq.index >= seq.shots.length) return null;
      shot = seq.shots[seq.index];
    }
    return shot;
  }

  private evalShotPoint(from: Vec3Source, to: Vec3Source | undefined, t: number, out: Vector3): void {
    evalSource(from, out);
    if (to) out.lerp(evalSource(to, this.scratch), t);
  }

  private applyShake(dt: number, elapsed: number): void {
    if (this.trauma <= 0) return;
    const cam = this.camera;
    const amount = this.trauma * this.trauma;
    cam.translateX(shakeNoise(elapsed, 1) * SHAKE.move * amount);
    cam.translateY(shakeNoise(elapsed, 2) * SHAKE.move * amount);
    cam.rotateZ(shakeNoise(elapsed, 3) * SHAKE.roll * amount);
    this.trauma = Math.max(0, this.trauma - this.traumaDecay * dt);
  }

  private applyFov(dt: number): void {
    if (this.currentMode !== 'cinematic') this.fovBase = this.dampFov(MODE_FOV[this.currentMode], dt);
    this.punchT += dt;
    const fov = this.fovBase + this.punchDelta * punchEnvelope(this.punchT / this.punchDur);
    const cam = this.camera;
    if (Math.abs(fov - cam.fov) < 1e-4) return;
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }

  private dampFov(target: number, dt: number): number {
    const fov = damp(this.fovBase, target, FOV_RATE, dt);
    return Math.abs(fov - target) < 0.01 ? target : fov;
  }
}
