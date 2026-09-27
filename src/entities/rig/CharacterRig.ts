/**
 * One character's skeleton, skinned mesh, animator and soft contact shadow.
 * Two draw calls (three while outlined). The rig root is the character's
 * object3d.
 */
import {
  Bone, Color, DataTexture, Group, LinearFilter, LinearMipmapLinearFilter, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D,
  PlaneGeometry, Skeleton, SkinnedMesh, Sphere, Vector3, type BufferGeometry,
} from 'three';
import type { AnimClip, AnimClipDef, BoneName, ICharacterRig, PlayAnimOptions } from '../../core/types';
import { CLIP_LIBRARY } from '../anim/library';
import type { Look } from '../look/body';
import { buildCharacterGeometry } from '../look/build';
import { Animator } from './Animator';
import { createBodyMaterial, createOutlineMaterial } from './materials';
import { BONE_PARENT, BONES, boneIndex, REF_HEIGHT } from './skeleton';

const PALM_DROP = 0.06;
/** Contact shadow: darkness, radius (m, scaled by height) and how far the body's length stretches it. */
const BLOB_OPACITY = 0.62;
const BLOB_R = 0.42;
const BLOB_STRETCH = 1.1;

let blobTexture: DataTexture | null = null;
const blobGeometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/** A soft black disc, darkest in the middle; no DOM needed, so it builds in tests too. */
function blobMap(): DataTexture {
  if (blobTexture) return blobTexture;
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2);
      const t = Math.min(1, Math.max(0, (d - 0.15) / 0.85));
      data[(y * n + x) * 4 + 3] = Math.round(255 * (1 - t * t * (3 - 2 * t)) ** 1.5);
    }
  }
  blobTexture = new DataTexture(data, n, n);
  blobTexture.magFilter = LinearFilter;
  blobTexture.minFilter = LinearMipmapLinearFilter;
  blobTexture.generateMipmaps = true;
  blobTexture.needsUpdate = true;
  return blobTexture;
}

const _head = new Vector3();

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
  private readonly blob: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private readonly scale: number;
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

    this.scale = s;
    const blob = new MeshBasicMaterial({
      color: 0x000000, map: blobMap(), transparent: true, depthWrite: false, opacity: BLOB_OPACITY,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.blob = new Mesh(blobGeometry, blob);
    this.blob.name = 'contactShadow';
    this.blob.renderOrder = -1;
    this.root.add(this.blob);

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
    this.placeBlob();
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
    this.blob.material.dispose();
    this.outline?.material.dispose();
  }

  /** Under the body between hips and head, stretched when lying down, fading as the body leaves the ground. */
  private placeBlob(): void {
    const hips = this.bones[0].position;
    this.getBoneWorldPosition('head', _head);
    this.root.worldToLocal(_head);
    const dx = _head.x - hips.x;
    const dz = _head.z - hips.z;
    const along = Math.hypot(dx, dz);
    const r = BLOB_R * this.scale * 2;
    this.blob.position.set(hips.x + dx * 0.5, 0.012, hips.z + dz * 0.5);
    this.blob.rotation.y = Math.atan2(dx, dz);
    this.blob.scale.set(r, 1, r + along * BLOB_STRETCH);
    const lift = Math.max(0, hips.y - this.hipsBind.y);
    this.blob.material.opacity = BLOB_OPACITY * Math.max(0, 1 - lift / (0.9 * this.scale));
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
