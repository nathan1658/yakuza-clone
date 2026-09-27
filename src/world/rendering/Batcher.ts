import { Mesh } from 'three';
import type { Material, Object3D } from 'three';
import { MeshBuilder } from './MeshBuilder';

/** How the meshes of one material are cut up and flagged. */
export interface BatchStyle {
  /** Cell edge (m). Bigger cells mean fewer draw calls but coarser frustum culling. */
  readonly cell: number;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  /** Also drawn by the planar reflection camera (layer 1). */
  readonly reflect: boolean;
  readonly renderOrder?: number;
}

/**
 * Static geometry merged by (material, grid cell): one draw call per pair.
 * A piece lands in the cell of the point it was requested at; bounding
 * spheres come from the real vertices, so culling stays correct either way.
 */
export class Batcher<K extends string> {
  private readonly cells = new Map<string, { key: K; builder: MeshBuilder }>();

  constructor(private readonly styles: Readonly<Record<K, BatchStyle>>) {}

  at(key: K, x: number, z: number): MeshBuilder {
    const size = this.styles[key].cell;
    const id = `${key}:${Math.floor(x / size)}:${Math.floor(z / size)}`;
    let entry = this.cells.get(id);
    if (!entry) {
      entry = { key, builder: new MeshBuilder() };
      this.cells.set(id, entry);
    }
    return entry.builder;
  }

  /** Turn every non-empty builder into a static mesh under `parent`. Returns the mesh count. */
  flush(parent: Object3D, materials: Readonly<Record<K, Material>>): number {
    let count = 0;
    for (const { key, builder } of this.cells.values()) {
      if (builder.vertexCount === 0) continue;
      const style = this.styles[key];
      const mesh = new Mesh(builder.build(), materials[key]);
      mesh.name = `world:${key}`;
      mesh.castShadow = style.castShadow;
      mesh.receiveShadow = style.receiveShadow;
      mesh.renderOrder = style.renderOrder ?? 0;
      if (style.reflect) mesh.layers.enable(1);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
      count++;
    }
    this.cells.clear();
    return count;
  }
}
