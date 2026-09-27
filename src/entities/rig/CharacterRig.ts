/**
 * One character's skeleton, skinned mesh and animator. One draw call
 * (two while outlined). The rig root is the character's object3d.
 */
import {
  Bone, Color, Group, MeshStandardMaterial, Object3D, Skeleton, SkinnedMesh, Sphere, Vector3, type BufferGeometry, type MeshBasicMaterial,
} from 'three';
import type { AnimClip, AnimClipDef, BoneName, ICharacterRig, PlayAnimOptions } from '../../core/types';
import { CLIP_LIBRARY } from '../anim/library';
import type { Look } from '../look/body';
import { buildCharacterGeometry } from '../look/build';
import { Animator } from './Animator';
import { createBodyMaterial, createOutlineMaterial } from './materials';
import { BONE_PARENT, BONES, boneIndex, REF_HEIGHT } from './skeleton';

const PALM_DROP = 0.06;

export class CharacterRig implements ICharacterRig {
  readonly root = new Group();
  readonly animator: Animator;
  readonly height: number;
  private readonly bones: Bone[];
  private readonly hipsBind = new Vector3();
  private readonly mesh: SkinnedMesh;
  private readonly material: MeshStandardMaterial;
  private outline: SkinnedMesh<BufferGeometry, MeshBasicMaterial> | null = null;
  private readonly sockets: Record<'left' | 'right', Object3D>;
  private readonly flashColor = new Color();
  private flashLeft = 0;
  private flashDur = 1;

  constructor(look: Look, initial: AnimClip = 'idle') {
    const { geometry, proportions: p } = buildCharacterGeometry(look);
    this.height = p.H;
    this.bones = BONES.map((name) => {
      const b = new Bone();
      b.name = name;
      b.position.fromArray(p.offsets[name]);
      return b;
    });
    for (const name of BONES) {
      const parent = BONE_PARENT[name];
      (parent ? this.bones[boneIndex(parent)] : this.root).add(this.bones[boneIndex(name)]);
    }
    this.hipsBind.copy(this.bones[0].position);
    const s = p.H / REF_HEIGHT;
    this.sockets = { left: this.socket('handL', s), right: this.socket('handR', s) };
    this.root.updateMatrixWorld(true);

    this.material = createBodyMaterial();
    this.mesh = new SkinnedMesh(geometry, this.material);
    this.mesh.castShadow = true;
    this.mesh.boundingSphere = new Sphere(new Vector3(0, p.H / 2, 0), p.H * 1.1);
    this.mesh.bind(new Skeleton(this.bones));
    this.root.add(this.mesh);

    this.animator = new Animator(CLIP_LIBRARY[initial], s);
    this.update(0);
  }

  get currentClip(): string {
    return this.animator.def.name;
  }

  get progress(): number {
    return this.animator.progress;
  }

  get finished(): boolean {
    return this.animator.finished;
  }

  play(clip: AnimClip | AnimClipDef, opts?: PlayAnimOptions): void {
    this.animator.play(typeof clip === 'string' ? CLIP_LIBRARY[clip] : clip, opts);
  }

  getClipDef(clip: AnimClip): AnimClipDef {
    return CLIP_LIBRARY[clip];
  }

  getBone(bone: BoneName): Object3D {
    return this.bones[boneIndex(bone)];
  }

  getBoneWorldPosition(bone: BoneName, out = new Vector3()): Vector3 {
    const b = this.bones[boneIndex(bone)];
    b.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(b.matrixWorld);
  }

  /**
   * Palm socket: +Y runs along the grip (out of the thumb side of the fist),
   * +Z points toward the fingertips. Model weapons with the handle at the
   * origin and the length along +Y. Attaching resets the object's local
   * transform; detaching (null) re-parents to the scene keeping world pose.
   */
  attachToHand(hand: 'left' | 'right', obj: Object3D | null): void {
    const socket = this.sockets[hand];
    for (const child of [...socket.children]) {
      if (child !== obj) this.release(child);
    }
    if (!obj || obj.parent === socket) return;
    socket.add(obj);
    obj.position.set(0, 0, 0);
    obj.quaternion.identity();
  }

  flash(color: number, duration: number): void {
    this.flashColor.set(color);
    this.flashDur = Math.max(1e-3, duration);
    this.flashLeft = this.flashDur;
  }

  setOutline(on: boolean, color = 0xff3030): void {
    if (!on && !this.outline) return;
    if (!this.outline) {
      this.outline = new SkinnedMesh(this.mesh.geometry, createOutlineMaterial(color));
      this.outline.boundingSphere = this.mesh.boundingSphere;
      this.outline.bind(this.mesh.skeleton, this.mesh.bindMatrix);
      this.root.add(this.outline);
    }
    this.outline.visible = on;
    this.outline.material.color.set(color);
  }

  get castShadow(): boolean {
    return this.mesh.castShadow;
  }

  setCastShadow(on: boolean): void {
    this.mesh.castShadow = on;
  }

  update(dt: number): void {
    const a = this.animator;
    a.update(dt);
    for (let i = 0; i < this.bones.length; i++) this.bones[i].quaternion.fromArray(a.pose, i * 4);
    this.bones[0].position.set(this.hipsBind.x + a.root[0], this.hipsBind.y + a.root[1], this.hipsBind.z + a.root[2]);
    if (this.flashLeft <= 0) return;
    this.flashLeft = Math.max(0, this.flashLeft - dt);
    this.material.emissive.copy(this.flashColor).multiplyScalar(this.flashLeft / this.flashDur);
  }

  dispose(): void {
    this.attachToHand('left', null);
    this.attachToHand('right', null);
    this.root.removeFromParent();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.outline?.material.dispose();
  }

  private socket(hand: BoneName, s: number): Object3D {
    const o = new Object3D();
    o.name = `${hand}Socket`;
    o.position.set(0, -PALM_DROP * s, 0);
    o.rotation.x = Math.PI / 2;
    this.bones[boneIndex(hand)].add(o);
    return o;
  }

  private release(child: Object3D): void {
    const scene = this.root.parent;
    if (scene) scene.attach(child);
    else child.removeFromParent();
  }
}
