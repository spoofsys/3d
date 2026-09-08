import fs from 'node:fs';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const atlas = JSON.parse(fs.readFileSync('./models/atlas.json', 'utf-8'));
console.log('Atlas loaded, parts:', atlas.parts.length, 'chunks:', atlas.chunks.length);

const chunk0Buffer = fs.readFileSync('./models/body-0.bin');
const ab = chunk0Buffer.buffer.slice(chunk0Buffer.byteOffset, chunk0Buffer.byteOffset + chunk0Buffer.byteLength);

const geometries = [];
let partCount = 0;

for (const p of atlas.parts) {
  if (p.chunk === 0) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ab, p.positions, p.vertexCount * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int16Array(ab, p.normals, p.vertexCount * 3), 3, true));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(ab, p.indices, p.indexCount), 1));
    geometries.push(g);
    partCount++;
  }
}

console.log(`Chunk 0: Created ${geometries.length} geometries`);
const merged = mergeGeometries(geometries, false);
console.log('Merged geometry vertex count:', merged.attributes.position.count, 'index count:', merged.index.count);
console.log('SUCCESS!');
