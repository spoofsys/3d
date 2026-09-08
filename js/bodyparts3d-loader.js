/**
 * BodyParts3D 4.0 Real Anatomy Mesh Loader
 * Loads atlas.json and 15 binary chunks containing 2,234 authentic anatomical meshes
 * DBCLS BodyParts3D / FMA Ontology
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Modesty Safeguard: exclude external genitalia from geometry generation
export const EXCLUDED_PARTS = new Set([
  'FJ3132', // Corpus cavernosum of penis
  'FJ3133', // Corpus spongiosum of penis
  'FJ3134', // Glans penis
  'FJ3138', // Left testis
  'FJ3142', // Right testis
  'FJ2815'  // Pubic hair
]);

export class BodyParts3DLoader {
  constructor(options = {}) {
    this.atlasUrl = options.atlasUrl || 'models/atlas.json';
    this.chunksBaseUrl = options.chunksBaseUrl || 'models/body-';
    this.onProgress = options.onProgress || (() => {});
    this.onError = options.onError || console.error;

    this.atlas = null;
    this.parts = [];
    this.centers = [];
    this.bounds = [];
    this.pickers = [];
    this.systemChunkMeshes = [];
    this.totalChunks = 15;
    this.loadedChunks = 0;
  }

  async load(scene, materialsMap) {
    // 1. Fetch atlas manifest
    const atlasRes = await fetch(this.atlasUrl);
    if (!atlasRes.ok) throw new Error('Failed to fetch atlas: ' + atlasRes.statusText);
    this.atlas = await atlasRes.json();
    this.parts = this.atlas.parts;

    // Compute bounding boxes and centers for all 2,234 parts
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      const min = new THREE.Vector3(p.bounds[0][0], p.bounds[0][1], p.bounds[0][2]);
      const max = new THREE.Vector3(p.bounds[1][0], p.bounds[1][1], p.bounds[1][2]);
      this.bounds[i] = new THREE.Box3(min, max);
      this.centers[i] = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
    }

    // 2. Load all 15 chunks sequentially
    for (let ci = 0; ci < this.atlas.chunks.length; ci++) {
      await this.loadChunk(ci, scene, materialsMap);
    }

    return {
      atlas: this.atlas,
      parts: this.parts,
      centers: this.centers,
      bounds: this.bounds,
      pickers: this.pickers
    };
  }

  async loadChunk(ci, scene, materialsMap) {
    // Use .dat to avoid browser download-manager interception of .bin files
    const chunkUrl = this.chunksBaseUrl + ci + '.dat';
    const res = await fetch(chunkUrl);
    if (!res.ok) throw new Error('Failed to fetch chunk ' + ci + ': ' + res.statusText);
    const buffer = await res.arrayBuffer();

    const systemGeomGroups = new Map();

    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p.chunk !== ci) continue;

      // Modesty check: skip external private parts
      if (EXCLUDED_PARTS.has(p.id)) continue;

      // Unpack raw binary vertex data
      const positions = new Float32Array(buffer, p.positions, p.vertexCount * 3);
      const normals = new Int16Array(buffer, p.normals, p.vertexCount * 3);
      const indices = new Uint32Array(buffer, p.indices, p.indexCount);

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('normal', new THREE.BufferAttribute(normals, 3, true)); // normalized signed short
      geom.setIndex(new THREE.BufferAttribute(indices, 1));
      geom.setAttribute('partIndex', new THREE.BufferAttribute(new Float32Array(p.vertexCount).fill(i), 1));
      geom.boundingBox = this.bounds[i].clone();
      geom.computeBoundingSphere();

      // Picker mesh for fast individual raycasting
      const pickerMesh = new THREE.Mesh(geom);
      pickerMesh.matrixAutoUpdate = false;
      this.pickers[i] = pickerMesh;

      if (!systemGeomGroups.has(p.system)) {
        systemGeomGroups.set(p.system, []);
      }
      systemGeomGroups.get(p.system).push(geom);
    }

    // Merge geometries per system for this chunk
    for (const [system, geoms] of systemGeomGroups.entries()) {
      if (geoms.length === 0) continue;
      const mergedGeom = mergeGeometries(geoms, false);
      if (!mergedGeom) continue;

      const mat = materialsMap.get(system);
      const mesh = new THREE.Mesh(mergedGeom, mat);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      this.systemChunkMeshes.push(mesh);
    }

    this.loadedChunks++;
    const progress = Math.round((this.loadedChunks / this.totalChunks) * 100);
    this.onProgress(progress);
  }
}
