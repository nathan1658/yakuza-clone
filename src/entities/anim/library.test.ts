import { describe, expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import type { AnimClip, BoneName } from '../../core/types';
import { Animator } from '../rig/Animator';
import { BONES, BONE_PARENT, REF_HEIGHT, boneIndex, proportions } from '../rig/skeleton';
import { ATTACK_CLIPS, CLIP_LIBRARY } from './library';

/** Exhaustive by construction: the compiler rejects a missing or unknown clip. */
const EVERY_CLIP: Record<AnimClip, true> = {
  idle: true, walk: true, run: true, sprint: true,
  combatIdle: true, combatWalkF: true, combatWalkB: true, combatWalkL: true, combatWalkR: true,
  talk: true, talkAngry: true, listen: true, nod: true, shrug: true, point: true, bow: true, crossArms: true,
  eat: true, drink: true, phone: true, cheer: true, cower: true, flee: true, lean: true, smoke: true,
  vendorIdle: true, taunt: true, sitGround: true,
  jab: true, cross: true, hook: true, uppercut: true, frontKick: true, roundhouse: true, spinKick: true,
  heavyPunch: true, rushPunch: true, stomp: true, dropKick: true,
  weaponSwing: true, weaponSwing2: true, weaponOverhead: true, weaponThrow: true,
  grabHold: true, grabPunch: true, throwToss: true,
  guard: true, guardHit: true, dodgeF: true, dodgeB: true, dodgeL: true, dodgeR: true,
  hitLight: true, hitHeavy: true, hitBack: true, stagger: true, knockdown: true, downed: true, getUp: true,
  ko: true, grabbed: true, thrown: true,
  pickup: true, victory: true,
};
const NAMES = Object.keys(EVERY_CLIP) as AnimClip[];

/** The limb that lands the blow at impactAt (the first blow for rushPunch). */
const STRIKER: Record<string, readonly BoneName[]> = {
  jab: ['handL'], hook: ['handL'], rushPunch: ['handL'], grabHold: ['handL'],
  cross: ['handR'], uppercut: ['handR'], heavyPunch: ['handR'], grabPunch: ['handR'],
  weaponSwing: ['handR'], weaponSwing2: ['handR'], weaponOverhead: ['handR'], weaponThrow: ['handR'],
  throwToss: ['handL', 'handR'],
  frontKick: ['footR'], roundhouse: ['footR'], spinKick: ['footR'], stomp: ['footR'],
  dropKick: ['footL', 'footR'],
};

/** Character-space position of a bone for the animator's current pose. */
function boneAt(a: Animator, bone: BoneName): Vector3 {
  const p = proportions({ height: REF_HEIGHT, build: 'normal' });
  const nodes = BONES.map(() => new Object3D());
  BONES.forEach((b, i) => {
    const parent = BONE_PARENT[b];
    if (parent) nodes[boneIndex(parent)].add(nodes[i]);
    nodes[i].position.fromArray(p.offsets[b]);
    nodes[i].quaternion.fromArray(a.pose, i * 4);
  });
  nodes[0].position.x += a.root[0];
  nodes[0].position.y += a.root[1];
  nodes[0].position.z += a.root[2];
  nodes[0].updateMatrixWorld(true);
  return nodes[boneIndex(bone)].getWorldPosition(new Vector3());
}

describe('clip library', () => {
  it('defines every AnimClip under its own name and nothing else', () => {
    for (const n of NAMES) expect(CLIP_LIBRARY[n]?.name, n).toBe(n);
    expect(Object.keys(CLIP_LIBRARY).sort()).toEqual([...NAMES].sort());
  });

  it('has well-formed keys: t in [0, 1], sorted, starting at 0, finite values', () => {
    for (const n of NAMES) {
      const d = CLIP_LIBRARY[n];
      expect(d.duration, n).toBeGreaterThan(0);
      expect(d.keys[0].t, n).toBe(0);
      d.keys.forEach((k, i) => {
        expect(k.t, n).toBeGreaterThanOrEqual(i ? d.keys[i - 1].t : 0);
        expect(k.t, n).toBeLessThanOrEqual(1);
        for (const v of Object.values(k.pose).flat()) expect(Number.isFinite(v), `${n}@${k.t}`).toBe(true);
      });
    }
  });

  it('gives every attack an impactAt inside the clip, and nothing else one', () => {
    for (const n of NAMES) {
      const at = CLIP_LIBRARY[n].impactAt;
      if (!ATTACK_CLIPS.includes(n)) {
        expect(at, n).toBeUndefined();
        continue;
      }
      expect(at, n).toBeGreaterThan(0);
      expect(at, n).toBeLessThan(1);
    }
    expect([...ATTACK_CLIPS].sort()).toEqual(Object.keys(STRIKER).sort());
  });

  it('puts the striking limb in front of the body at a plausible height at impact', () => {
    for (const n of ATTACK_CLIPS) {
      const d = CLIP_LIBRARY[n];
      const a = new Animator(d, 1);
      a.update(d.impactAt! * d.duration);
      for (const bone of STRIKER[n]) {
        const p = boneAt(a, bone);
        expect(p.z, `${n} ${bone} reach`).toBeGreaterThan(0.3);
        expect(p.y, `${n} ${bone} height`).toBeGreaterThan(0.1);
        expect(p.y, `${n} ${bone} height`).toBeLessThan(1.9);
      }
    }
  });

  it('stands on the ground: the weight-bearing ankle sits at ankle height, the other barely lifts', () => {
    for (const n of ['idle', 'combatIdle', 'talk', 'listen', 'guard', 'jab', 'smoke'] as const) {
      const a = new Animator(CLIP_LIBRARY[n], 1);
      const [lo, hi] = [boneAt(a, 'footL').y, boneAt(a, 'footR').y].sort((x, y) => x - y);
      expect(lo, n).toBeCloseTo(0.071, 2);
      expect(hi, n).toBeLessThan(0.11);
    }
  });
});
