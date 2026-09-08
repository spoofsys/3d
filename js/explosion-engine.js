/**
 * Continuous GPU Explosion & Knolling Engine
 * DBCLS BodyParts3D 4.0 (2,234 Modeled Pieces)
 * Drives vertex displacement via 1D DataTexture on GPU
 */

import * as THREE from 'three';
import { EXCLUDED_PARTS } from './bodyparts3d-loader.js';

export class ExplosionEngine {
  constructor(parts, centers, bounds, pickers, partTexture, displacementData, selectionTexture, selectionData) {
    this.parts = parts;
    this.centers = centers;
    this.bounds = bounds;
    this.pickers = pickers;

    this.partTexture = partTexture;
    this.displacementData = displacementData;
    this.selectionTexture = selectionTexture;
    this.selectionData = selectionData;

    // Unique system IDs order for radial fanning
    this.systemsList = [
      'skeletal', 'muscular', 'cardiac', 'sensory', 'arterial',
      'venous', 'nervous', 'respiratory', 'digestive', 'urinary',
      'lymphatic', 'endocrine', 'reproductive', 'integumentary', 'connective'
    ];

    this.textureWidth = partTexture.image.width;

    // Knolling layout state
    this.offsets = new Array(parts.length);
    this.packingWidth = 1.0;
    this.packingHeight = 1.0;

    // Smooth animation amount
    this.currentAmount = 0.0;
    this.targetAmount = 0.0;

    // Precompute default knolling layout
    this.updateLayout(1.0);

    // Initial pass: populate displacementData so assembled body is 100% visible
    this.update({
      sliderAmount: 0.0,
      visibleSystems: new Set(this.systemsList),
      deltaTime: 0.016
    });
  }

  computeExplosionLayout(partsSubset, aspect = 1.0) {
    const cards = partsSubset.map(p => ({
      id: p.id,
      system: p.system,
      width: Math.max(0.035, p.bounds[1][0] - p.bounds[0][0]) + 0.04,
      height: Math.max(0.035, p.bounds[1][1] - p.bounds[0][1]) + 0.04
    }));

    const area = cards.reduce((sum, c) => sum + c.width * c.height, 0);
    const maxWidth = Math.max(0.3, ...cards.map(c => c.width));
    const targetWidth = Math.max(maxWidth, Math.sqrt(area * Math.max(0.5, Math.min(1.5, aspect))) * 1.18);

    // Sort by height descending
    cards.sort((a, b) => b.height - a.height || a.id.localeCompare(b.id));

    const cells = new Map();
    let x = 0, y = 0, row = 0, usedWidth = 0;

    for (const c of cards) {
      if (x > 0 && x + c.width > targetWidth) {
        x = 0;
        y += row;
        row = 0;
      }
      cells.set(c.id, {
        x: x + c.width / 2,
        y: -y - c.height / 2,
        width: c.width,
        height: c.height
      });
      x += c.width;
      usedWidth = Math.max(usedWidth, x);
      row = Math.max(row, c.height);
    }

    const totalHeight = y + row;
    cells.forEach(cell => {
      cell.x -= usedWidth / 2;
      cell.y += totalHeight / 2;
    });

    return { cells, width: usedWidth, height: totalHeight };
  }

  updateLayout(aspect = 1.0) {
    const layout = this.computeExplosionLayout(this.parts, aspect);
    this.packingWidth = layout.width;
    this.packingHeight = layout.height;

    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      const cell = layout.cells.get(p.id);
      if (cell) {
        this.offsets[i] = new THREE.Vector3(cell.x, cell.y + 0.85, 0);
      } else {
        this.offsets[i] = this.centers[i].clone();
      }
    }
  }

  update(params = {}) {
    const {
      sliderAmount = 0.0,
      visibleSystems = new Set(this.systemsList),
      selectedPartId = null,
      isIsolated = false,
      deltaTime = 0.016
    } = params;

    this.targetAmount = THREE.MathUtils.clamp(sliderAmount, 0, 1);
    this.currentAmount = THREE.MathUtils.damp(this.currentAmount, this.targetAmount, 8, deltaTime);

    const amount = this.currentAmount;
    const partsCount = this.parts.length;

    for (let i = 0; i < partsCount; i++) {
      const p = this.parts[i];
      const c = this.centers[i];
      const destination = this.offsets[i] || c;

      // Check modesty exclusions
      if (EXCLUDED_PARTS.has(p.id)) {
        this.displacementData[i * 4 + 3] = 0.0;
        this.selectionData[i * 4] = 0;
        continue;
      }

      let dx = 0, dy = 0, dz = 0;

      // Continuous dissection interpolation:
      // 0.0 -> 0.45: radial system fanning
      // 0.45 -> 1.0: smooth lerp into 2D knolling matrix
      if (amount <= 0.45) {
        const t = amount / 0.45;
        const group = this.systemsList.indexOf(p.system);
        const angle = (group >= 0 ? group : 0) / this.systemsList.length * Math.PI * 2;
        dx = Math.sin(angle) * t * 0.48;
        dy = (c.y - 0.85) * t * 0.28;
        dz = Math.cos(angle) * t * 0.48;
      } else {
        const t = (amount - 0.45) / 0.55;
        const group = this.systemsList.indexOf(p.system);
        const angle = (group >= 0 ? group : 0) / this.systemsList.length * Math.PI * 2;
        dx = THREE.MathUtils.lerp(Math.sin(angle) * 0.48, destination.x - c.x, t);
        dy = THREE.MathUtils.lerp((c.y - 0.85) * 0.28, destination.y - c.y, t);
        dz = THREE.MathUtils.lerp(Math.cos(angle) * 0.48, -c.z, t);
      }

      const isSelected = selectedPartId === p.id;
      let isVisible = true;

      if (isIsolated) {
        isVisible = isSelected;
      } else {
        isVisible = visibleSystems.has(p.system) || isSelected;
      }

      // Write GPU texture values
      this.displacementData[i * 4 + 0] = dx;
      this.displacementData[i * 4 + 1] = dy;
      this.displacementData[i * 4 + 2] = dz;
      this.displacementData[i * 4 + 3] = isVisible ? 1.0 : 0.0;

      this.selectionData[i * 4 + 0] = isSelected ? 255 : 0;

      // Update picker mesh translation for raycasting
      const picker = this.pickers[i];
      if (picker) {
        picker.position.set(dx, dy, dz);
        picker.updateMatrix();
        picker.updateMatrixWorld(true);
      }
    }

    this.partTexture.needsUpdate = true;
    this.selectionTexture.needsUpdate = true;

    return {
      amount: this.currentAmount,
      packingWidth: this.packingWidth,
      packingHeight: this.packingHeight
    };
  }
}
