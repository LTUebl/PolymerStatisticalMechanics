/**
 * Polymer Visual Canvas Renderer
 * Faithfully reproduces the aesthetic of Jacobs, Huang & Kwon Fig 5.6
 * Supports interactive zoom/pan, hinge dragging, calipers, and microstate thumbnails
 */

export class PolymerRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    // View transform state
    this.panX = 0;
    this.panY = 0;
    this.scale = 40; // pixels per unit b
    this.dpr = window.devicePixelRatio || 1;

    // Visual configuration
    this.showGrid = true;
    this.showAxes = true;
    this.showNodeIndices = true;
    this.showComponents = true;
    this.showCaliper = true;
    this.caliperLinkIndex = 6; // default on link 7 (0-indexed 6), like Fig 5.6
    this.highlightIntersections = true;

    // Palette matching Fig 5.6
    this.colors = {
      bg: '#ffffff',
      grid: '#f1f5f9',
      gridMajor: '#e2e8f0',
      axis: '#94a3b8',
      link: '#0284c7', // vibrant textbook blue
      linkHover: '#38bdf8',
      hingeFill: '#ffffff',
      hingeStroke: '#1e293b',
      originFixture: '#64748b',
      vectorR: '#475569', // grey/slate dimension arrow
      vectorArrow: '#334155',
      caliper: '#334155',
      text: '#0f172a',
      textSecondary: '#64748b',
      clashHalo: '#ef4444'
    };

    // Interaction state
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.hoveredNodeIndex = -1;
    this.currentWalk = null;

    this.initEvents();
  }

  initEvents() {
    this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', () => this.onMouseUp());
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });

    // Touch support for tablets/smartphones
    let lastTouchDist = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        this.isDragging = true;
        this.dragStart = { x: touch.clientX - rect.left - this.panX, y: touch.clientY - rect.top - this.panY };
      } else if (e.touches.length === 2) {
        lastTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });

    this.canvas.addEventListener('touchmove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      if (e.touches.length === 1 && this.isDragging) {
        const touch = e.touches[0];
        this.panX = touch.clientX - rect.left - this.dragStart.x;
        this.panY = touch.clientY - rect.top - this.dragStart.y;
        this.render();
      } else if (e.touches.length === 2) {
        const dist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (lastTouchDist > 0) {
          const factor = dist / lastTouchDist;
          this.scale = Math.max(10, Math.min(180, this.scale * factor));
          this.render();
        }
        lastTouchDist = dist;
      }
    }, { passive: true });

    this.canvas.addEventListener('touchend', () => {
      this.isDragging = false;
      lastTouchDist = 0;
    });

    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * this.dpr;
    this.canvas.height = rect.height * this.dpr;
    this.render();
  }

  onMouseDown(e) {
    if (e.button === 0) { // left button
      this.isDragging = true;
      this.dragStart = { x: e.offsetX - this.panX, y: e.offsetY - this.panY };
    }
  }

  onMouseMove(e) {
    if (this.isDragging) {
      this.panX = e.offsetX - this.dragStart.x;
      this.panY = e.offsetY - this.dragStart.y;
      this.render();
    } else {
      this.checkNodeHover(e.offsetX, e.offsetY);
    }
  }

  onMouseUp() {
    this.isDragging = false;
  }

  onWheel(e) {
    e.preventDefault();
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    // Zoom into mouse position
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.max(12, Math.min(220, this.scale * zoomFactor));

    // Adjust pan so point under cursor stays stationary
    this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
    this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
    this.scale = newScale;

    this.render();
  }

  checkNodeHover(mx, my) {
    if (!this.currentWalk || !this.currentWalk.coords) return;
    let hovered = -1;
    const radiusThreshold = 14;

    for (let i = 0; i < this.currentWalk.coords.length; i++) {
      const pt = this.worldToScreen(this.currentWalk.coords[i].x, this.currentWalk.coords[i].y);
      const dist = Math.hypot(mx - pt.x, my - pt.y);
      if (dist <= radiusThreshold) {
        hovered = i;
        break;
      }
    }

    if (hovered !== this.hoveredNodeIndex) {
      this.hoveredNodeIndex = hovered;
      this.canvas.style.cursor = hovered >= 0 ? 'pointer' : 'grab';
      this.render();
    }
  }

  worldToScreen(wx, wy) {
    // Canvas coordinate system: math Y points up, canvas Y points down
    return {
      x: this.panX + wx * this.scale,
      y: this.panY - wy * this.scale
    };
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.panX) / this.scale,
      y: -(sy - this.panY) / this.scale
    };
  }

  centerOnPolymer(walk, paddingFactor = 0.25) {
    if (!walk || !walk.coords || walk.coords.length === 0) return;

    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const pt of walk.coords) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }

    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const canvasW = this.canvas.width / this.dpr;
    const canvasH = this.canvas.height / this.dpr;

    const availW = canvasW * (1 - paddingFactor * 2);
    const availH = canvasH * (1 - paddingFactor * 2);

    const fitScaleX = availW / (spanX + 1.5);
    const fitScaleY = availH / (spanY + 1.5);

    this.scale = Math.max(15, Math.min(100, Math.min(fitScaleX, fitScaleY)));
    this.panX = canvasW / 2 - centerX * this.scale;
    this.panY = canvasH / 2 + centerY * this.scale;

    this.render();
  }

  setPolymerWalk(walk) {
    this.currentWalk = walk;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const dpr = this.dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    const cssW = w / dpr;
    const cssH = h / dpr;

    // Clear background
    ctx.fillStyle = this.colors.bg;
    ctx.fillRect(0, 0, cssW, cssH);

    // Draw Grid
    if (this.showGrid) {
      this.drawGrid(ctx, cssW, cssH);
    }

    if (!this.currentWalk || !this.currentWalk.coords || this.currentWalk.coords.length === 0) {
      ctx.restore();
      return;
    }

    const coords = this.currentWalk.coords;
    const b = this.currentWalk.b || 1.0;

    // 1. Draw Cartesian components of R (dashed lines)
    if (this.showComponents && coords.length > 1) {
      this.drawRComponents(ctx, coords);
    }

    // 2. Draw End-to-End Vector R (arrow + badge)
    if (coords.length > 1) {
      this.drawEndToEndVector(ctx, coords);
    }

    // 3. Draw Links (cyan/blue rods)
    this.drawLinks(ctx, coords);

    // 4. Draw Caliper Bracket for link size b (Fig 5.6 style)
    if (this.showCaliper && coords.length > 1) {
      this.drawCaliper(ctx, coords, b);
    }

    // 5. Draw Hinges / Nodes (white discs with dark borders)
    this.drawHinges(ctx, coords);

    // 6. Draw Origin / Fixed Anchor Symbol at (0,0)
    this.drawOriginAnchor(ctx);

    ctx.restore();
  }

  drawGrid(ctx, w, h) {
    ctx.save();
    const step = this.scale; // grid spacing equals 1 link length b
    const offsetX = this.panX % step;
    const offsetY = this.panY % step;

    ctx.lineWidth = 1;
    ctx.strokeStyle = this.colors.grid;

    ctx.beginPath();
    for (let x = offsetX; x < w; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, h);
    }
    for (let y = offsetY; y < h; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(w, Math.round(y) + 0.5);
    }
    ctx.stroke();

    // Major Axes (X = 0, Y = 0)
    if (this.showAxes) {
      const originScreen = this.worldToScreen(0, 0);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = this.colors.axis;

      // X-axis
      ctx.beginPath();
      ctx.moveTo(0, originScreen.y);
      ctx.lineTo(w, originScreen.y);
      ctx.stroke();

      // Y-axis
      ctx.beginPath();
      ctx.moveTo(originScreen.x, 0);
      ctx.lineTo(originScreen.x, h);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLinks(ctx, coords) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(4, this.scale * 0.14);
    ctx.strokeStyle = this.colors.link;

    ctx.beginPath();
    const p0 = this.worldToScreen(coords[0].x, coords[0].y);
    ctx.moveTo(p0.x, p0.y);

    for (let i = 1; i < coords.length; i++) {
      const p = this.worldToScreen(coords[i].x, coords[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawHinges(ctx, coords) {
    ctx.save();
    const hingeRadius = Math.max(5, Math.min(10, this.scale * 0.15));

    for (let i = 0; i < coords.length; i++) {
      const pt = this.worldToScreen(coords[i].x, coords[i].y);
      const isHovered = (i === this.hoveredNodeIndex);
      const isOrigin = (i === 0);
      const isEnd = (i === coords.length - 1);

      // Check if node is part of a self-intersection
      const isClashing = this.currentWalk.selfIntersections &&
        this.currentWalk.selfIntersections.some(c => Math.abs(c.x - coords[i].x) < 1e-4 && Math.abs(c.y - coords[i].y) < 1e-4);

      if (isClashing && this.highlightIntersections) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, hingeRadius + 6, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(pt.x, pt.y, hingeRadius, 0, 2 * Math.PI);
      ctx.fillStyle = isOrigin ? '#10b981' : (isEnd ? '#6366f1' : (isHovered ? this.colors.linkHover : this.colors.hingeFill));
      ctx.fill();

      ctx.lineWidth = Math.max(1.8, hingeRadius * 0.25);
      ctx.strokeStyle = this.colors.hingeStroke;
      ctx.stroke();

      // Node Index label
      if (this.showNodeIndices) {
        ctx.font = '600 10px Inter, sans-serif';
        ctx.fillStyle = this.colors.textSecondary;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i.toString(), pt.x + hingeRadius + 9, pt.y - hingeRadius - 4);
      }
    }
    ctx.restore();
  }

  drawOriginAnchor(ctx) {
    ctx.save();
    const p0 = this.worldToScreen(0, 0);

    // Anchor base triangle/fixture
    const sz = 10;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y + 4);
    ctx.lineTo(p0.x - sz, p0.y + sz + 6);
    ctx.lineTo(p0.x + sz, p0.y + sz + 6);
    ctx.closePath();
    ctx.fillStyle = '#e2e8f0';
    ctx.fill();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Ground hatch lines
    ctx.beginPath();
    ctx.moveTo(p0.x - sz - 4, p0.y + sz + 6);
    ctx.lineTo(p0.x + sz + 4, p0.y + sz + 6);
    ctx.stroke();

    ctx.restore();
  }

  drawEndToEndVector(ctx, coords) {
    ctx.save();
    const pStart = this.worldToScreen(coords[0].x, coords[0].y);
    const pEnd = this.worldToScreen(coords[coords.length - 1].x, coords[coords.length - 1].y);

    const dx = pEnd.x - pStart.x;
    const dy = pEnd.y - pStart.y;
    const screenDist = Math.hypot(dx, dy);

    if (screenDist < 5) {
      // Loop closed (R ≈ 0)
      ctx.font = '700 13px Inter, sans-serif';
      ctx.fillStyle = '#dc2626';
      ctx.textAlign = 'center';
      ctx.fillText('R = 0 (Closed Loop)', pStart.x, pStart.y - 18);
      ctx.restore();
      return;
    }

    // Offset vector line slightly parallel so it doesn't overlap polymer links if overlapping
    const perpX = -dy / screenDist;
    const perpY = dx / screenDist;
    const offsetDist = 18;

    const v1 = { x: pStart.x + perpX * offsetDist, y: pStart.y + perpY * offsetDist };
    const v2 = { x: pEnd.x + perpX * offsetDist, y: pEnd.y + perpY * offsetDist };

    // Leader lines from nodes to measurement line
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pStart.x, pStart.y);
    ctx.lineTo(v1.x, v1.y);
    ctx.moveTo(pEnd.x, pEnd.y);
    ctx.lineTo(v2.x, v2.y);
    ctx.stroke();

    // Main dimension arrow line
    ctx.setLineDash([]);
    ctx.strokeStyle = this.colors.vectorR;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(v1.x, v1.y);
    ctx.lineTo(v2.x, v2.y);
    ctx.stroke();

    // Arrows at both ends (like textbook dimension arrows)
    this.drawArrowHead(ctx, v2, Math.atan2(v2.y - v1.y, v2.x - v1.x), 10);
    this.drawArrowHead(ctx, v1, Math.atan2(v1.y - v2.y, v1.x - v2.x), 10);

    // Center Badge with text "R"
    const midX = (v1.x + v2.x) / 2;
    const midY = (v1.y + v2.y) / 2;

    const rVal = this.currentWalk.endToEndLength.toFixed(2);
    const lVal = this.currentWalk.contourLength.toFixed(1);
    const badgeText = `R = ${rVal} b`;

    ctx.font = 'italic 700 14px "Times New Roman", Times, serif';
    const textWidth = ctx.measureText(badgeText).width;

    // Badge pill background
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.1)';
    ctx.shadowBlur = 4;
    ctx.fillRect(midX - textWidth / 2 - 8, midY - 11, textWidth + 16, 22);
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.strokeRect(midX - textWidth / 2 - 8, midY - 11, textWidth + 16, 22);

    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(badgeText, midX, midY);

    ctx.restore();
  }

  drawRComponents(ctx, coords) {
    ctx.save();
    const pStart = this.worldToScreen(coords[0].x, coords[0].y);
    const pEnd = this.worldToScreen(coords[coords.length - 1].x, coords[coords.length - 1].y);
    const corner = { x: pEnd.x, y: pStart.y };

    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(pStart.x, pStart.y);
    ctx.lineTo(corner.x, corner.y);
    ctx.lineTo(pEnd.x, pEnd.y);
    ctx.stroke();

    ctx.restore();
  }

  drawCaliper(ctx, coords, b) {
    // Choose segment to highlight with caliper bracket (default link 7, or fallback to first link)
    let idx = this.caliperLinkIndex;
    if (idx >= coords.length - 1) idx = coords.length - 2;
    if (idx < 0) return;

    const p1 = this.worldToScreen(coords[idx].x, coords[idx].y);
    const p2 = this.worldToScreen(coords[idx + 1].x, coords[idx + 1].y);

    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    if (len < 5) return;

    // Normal vector
    const nx = -dy / len;
    const ny = dx / len;
    const dist = 16;
    const bracketLen = 6;

    const b1 = { x: p1.x + nx * dist, y: p1.y + ny * dist };
    const b2 = { x: p2.x + nx * dist, y: p2.y + ny * dist };

    ctx.save();
    ctx.strokeStyle = this.colors.caliper;
    ctx.lineWidth = 1.6;

    // Leader ticks
    ctx.beginPath();
    ctx.moveTo(b1.x - nx * bracketLen, b1.y - ny * bracketLen);
    ctx.lineTo(b1.x + nx * bracketLen, b1.y + ny * bracketLen);
    ctx.moveTo(b2.x - nx * bracketLen, b2.y - ny * bracketLen);
    ctx.lineTo(b2.x + nx * bracketLen, b2.y + ny * bracketLen);

    // Dimension line
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.stroke();

    // Arrows
    this.drawArrowHead(ctx, b1, Math.atan2(b1.y - b2.y, b1.x - b2.x), 7);
    this.drawArrowHead(ctx, b2, Math.atan2(b2.y - b1.y, b2.x - b1.x), 7);

    // Text "b"
    const midX = (b1.x + b2.x) / 2 + nx * 10;
    const midY = (b1.y + b2.y) / 2 + ny * 10;

    ctx.font = 'italic 700 15px "Times New Roman", Times, serif';
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('b', midX, midY);

    ctx.restore();
  }

  drawArrowHead(ctx, pt, angle, size = 9) {
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-size, -size * 0.45);
    ctx.lineTo(-size * 0.7, 0);
    ctx.lineTo(-size, size * 0.45);
    ctx.closePath();
    ctx.fillStyle = this.colors.vectorArrow;
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Helper to render miniature thumbnail previews of a walk on small canvases (e.g. 100x100)
 */
export function renderThumbnail(canvas, steps, b = 1.0, isSelected = false) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = isSelected ? '#eff6ff' : '#f8fafc';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = isSelected ? '#3b82f6' : '#e2e8f0';
  ctx.lineWidth = isSelected ? 2 : 1;
  ctx.strokeRect(0, 0, w, h);

  // Trace coordinates
  const DIR_LOOKUP = {
    'R': { dx: 1, dy: 0 },
    'U': { dx: 0, dy: 1 },
    'L': { dx: -1, dy: 0 },
    'D': { dx: 0, dy: -1 }
  };

  const coords = [{ x: 0, y: 0 }];
  let curX = 0, curY = 0;
  let minX = 0, maxX = 0, minY = 0, maxY = 0;

  for (const s of steps) {
    const dir = DIR_LOOKUP[s];
    curX += dir.dx;
    curY += dir.dy;
    if (curX < minX) minX = curX;
    if (curX > maxX) maxX = curX;
    if (curY < minY) minY = curY;
    if (curY > maxY) maxY = curY;
    coords.push({ x: curX, y: curY });
  }

  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const padding = 12;
  const scale = Math.min((w - padding * 2) / (spanX || 1), (h - padding * 2) / (spanY || 1));

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const toScreen = (x, y) => ({
    x: w / 2 + (x - centerX) * scale,
    y: h / 2 - (y - centerY) * scale
  });

  // End-to-end vector (subtle dashed line)
  const p0 = toScreen(0, 0);
  const pEnd = toScreen(curX, curY);
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(pEnd.x, pEnd.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Polymer links
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#0284c7';
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < coords.length; i++) {
    const p = toScreen(coords[i].x, coords[i].y);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  // Nodes
  for (let i = 0; i < coords.length; i++) {
    const p = toScreen(coords[i].x, coords[i].y);
    ctx.beginPath();
    ctx.arc(p.x, p.y, i === 0 ? 3.5 : (i === coords.length - 1 ? 3.5 : 2.5), 0, 2 * Math.PI);
    ctx.fillStyle = i === 0 ? '#10b981' : (i === coords.length - 1 ? '#6366f1' : '#ffffff');
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}
