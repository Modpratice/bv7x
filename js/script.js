/**
 * BV-7X | Agentic Predictions
 * Vanilla JavaScript Canvas 3D Particle Sphere & Interactive UI
 * No external libraries or frameworks.
 */

(function () {
  'use strict';

  // --- Constants and Celestial Sphere Configuration ---
  const POINT_COLORS = [
    [242, 251, 255],
    [191, 239, 255],
    [79, 192, 255],
    [61, 123, 255],
    [61, 85, 232],
    [107, 47, 196],
    [85, 35, 153],
    [46, 19, 84]
  ];

  const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
  const TOTAL_POINTS = 1400;
  const POINT_SIZES = [2.3, 1.8, 1.5, 1.3, 1.1];
  const POINT_ALPHAS = [1.0, 0.78, 0.58, 0.42, 0.26];
  const ROTATION_CYCLE_MS = 45000;
  const PULSE_INTERVAL_MS = 7000;
  const PULSE_DURATION_MS = 2400;
  const STREAM_DURATION_MS = 560;
  const MAX_ACTIVE_STREAMS = 3;
  const STREAM_NODES = 24;
  const STREAM_FADE_RATIO = 0.72;
  const TWO_PI = Math.PI * 2;

  // Normalized rotation axis vector [0.62, 0.55, 0.44]
  const AXIS_VECTOR = (() => {
    const v = [0.62, 0.55, 0.44];
    const len = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / len, v[1] / len, v[2] / len];
  })();

  const ARC_PALETTES = [
    [[234, 242, 255], [61, 123, 255], [61, 85, 232]],
    [[243, 238, 255], [143, 123, 255], [107, 47, 196]],
    [[234, 249, 255], [79, 192, 255], [61, 123, 255]]
  ];

  // Initialize Canvas & Sphere
  function initCelestialCanvas() {
    const canvas = document.getElementById('celestial-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Generate Fibonacci sphere points
    const basePoints = [];
    const sizeIndices = [];
    const variations = [];
    let beaconIndex = 0;
    let maxDot = -2;

    for (let i = 0; i < TOTAL_POINTS; i++) {
      const y = 1 - 2 * (i + 0.5) / TOTAL_POINTS;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = GOLDEN_ANGLE * i;
      const pt = [radius * Math.cos(theta), y, radius * Math.sin(theta)];
      basePoints.push(pt);

      const hash = (i * 2654435761) >>> 0;
      sizeIndices.push([0, 1, 1, 2, 2, 2, 3, 3][hash % 8]);
      variations.push(((hash >>> 8) % 3) - 1);

      // Dot product to locate primary beacon point
      const dot = pt[0] * AXIS_VECTOR[0] + pt[1] * AXIS_VECTOR[1] + pt[2] * AXIS_VECTOR[2];
      if (dot > maxDot) {
        maxDot = dot;
        beaconIndex = i;
      }
    }

    // Vector operations
    const crossProduct = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];

    const normalize = (v) => {
      const len = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / len, v[1] / len, v[2] / len];
    };

    const perp1 = normalize(
      crossProduct(AXIS_VECTOR, Math.abs(AXIS_VECTOR[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])
    );
    const perp2 = crossProduct(AXIS_VECTOR, perp1);

    // Spokes / satellite points
    const spokeIndices = [];
    const NUM_SPOKES = 0; // Default landing has 0 or few spokes
    const arcPoints = [];

    // Eligible nodes for incoming particle streams
    const eligibleStreamNodes = [];
    for (let i = 0; i < TOTAL_POINTS; i++) {
      if (sizeIndices[i] <= 1 && i !== beaconIndex) {
        eligibleStreamNodes.push(i);
      }
    }

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let sphereRadius = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Landing screen responsive positioning
      if (width >= 1024) {
        centerX = width * 0.61;
        centerY = height * 0.44;
        sphereRadius = Math.min(width, height) * 0.44;
      } else {
        centerX = width * 0.5;
        centerY = height * 0.44;
        sphereRadius = Math.min(width, height) * 0.42;
      }
    }

    resize();
    window.addEventListener('resize', resize);

    // Rodrigues' rotation formula around AXIS_VECTOR
    function rotatePoint(pt, angle) {
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const u = AXIS_VECTOR;
      const dot = u[0] * pt[0] + u[1] * pt[1] + u[2] * pt[2];
      const cross = [
        u[1] * pt[2] - u[2] * pt[1],
        u[2] * pt[0] - u[0] * pt[2],
        u[0] * pt[1] - u[1] * pt[0]
      ];

      return [
        pt[0] * cosA + cross[0] * sinA + u[0] * dot * (1 - cosA),
        pt[1] * cosA + cross[1] * sinA + u[1] * dot * (1 - cosA),
        pt[2] * cosA + cross[2] * sinA + u[2] * dot * (1 - cosA)
      ];
    }

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const rotatedPoints = new Array(TOTAL_POINTS);
    const renderOrder = Array.from({ length: TOTAL_POINTS }, (_, i) => i);
    let activeStreams = [];
    let nextStreamTime = 0;
    let lastPulseSlot = -1;
    let impactTimes = [];

    // Spawn a shooting beam towards the beacon
    function spawnStream(time) {
      if (!eligibleStreamNodes.length) return;
      const node = eligibleStreamNodes[(Math.random() * eligibleStreamNodes.length) | 0];
      if (node !== undefined) {
        activeStreams.push({ node, startTime: time, landed: false });
      }
    }

    function updateStreams(time) {
      if (eligibleStreamNodes.length < 2) return;
      activeStreams = activeStreams.filter((s) => time - s.startTime < STREAM_DURATION_MS);

      const pulseSlot = Math.floor(time / PULSE_INTERVAL_MS);
      if (time % PULSE_INTERVAL_MS >= PULSE_INTERVAL_MS - 620 && pulseSlot !== lastPulseSlot) {
        lastPulseSlot = pulseSlot;
        spawnStream(time);
        spawnStream(time);
        spawnStream(time);
        return;
      }

      if (time >= nextStreamTime && activeStreams.length < MAX_ACTIVE_STREAMS) {
        nextStreamTime = time + 800 + Math.random() * 700;
        spawnStream(time);
      }
    }

    function renderStreams(time) {
      const beaconPos = rotatedPoints[beaconIndex];
      for (let idx = activeStreams.length - 1; idx >= 0; idx--) {
        const stream = activeStreams[idx];
        const elapsed = time - stream.startTime;
        if (elapsed >= STREAM_DURATION_MS) {
          activeStreams.splice(idx, 1);
          continue;
        }

        const nodePos = rotatedPoints[stream.node];
        if (nodePos[2] < -0.8 && beaconPos[2] < -0.8) continue;

        const screenX = [];
        const screenY = [];
        const depth = [];

        for (let step = 0; step < STREAM_NODES; step++) {
          const t = step / (STREAM_NODES - 1);
          const invT = 1 - t;
          const px = invT * invT * nodePos[0] + t * t * beaconPos[0];
          const py = invT * invT * nodePos[1] + t * t * beaconPos[1];
          const pz = invT * invT * nodePos[2] + t * t * beaconPos[2];

          screenX.push(centerX + px * sphereRadius);
          screenY.push(centerY - py * sphereRadius);
          depth.push((pz + 1) * 0.5);
        }

        const progress = elapsed / STREAM_DURATION_MS;
        let headFrac, alphaMultiplier;

        if (progress < STREAM_FADE_RATIO) {
          const norm = progress / STREAM_FADE_RATIO;
          headFrac = 1 - (1 - norm) * (1 - norm);
          alphaMultiplier = 1;
        } else {
          headFrac = 1;
          alphaMultiplier = 1 - (progress - STREAM_FADE_RATIO) / (1 - STREAM_FADE_RATIO);
          if (!stream.landed) {
            stream.landed = true;
            impactTimes.push(time);
          }
        }

        const headIndex = headFrac * (STREAM_NODES - 1);
        const tailIndex = Math.max(0, headIndex - 0.32 * (STREAM_NODES - 1));
        const segSpan = Math.max(0.001, headIndex - tailIndex);
        const maxI = Math.floor(headIndex);
        const minI = Math.floor(tailIndex);

        for (let s = minI; s <= maxI && s + 1 < STREAM_NODES; s++) {
          const midT = s + 0.5;
          if (midT > headIndex) continue;
          const tailProgress = Math.max(0, (midT - tailIndex) / segSpan);
          const intensity = tailProgress * tailProgress;
          const avgDepth = (depth[s] + depth[s + 1]) * 0.5;
          const finalOpacity = intensity * (avgDepth < 0.5 ? 0.4 + avgDepth * 1.2 : 1) * alphaMultiplier;

          if (finalOpacity < 0.01) continue;

          // Triple-layer glowing tracer beam
          ctx.strokeStyle = `rgba(79, 192, 255, ${(0.35 * finalOpacity).toFixed(3)})`;
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.moveTo(screenX[s], screenY[s]);
          ctx.lineTo(screenX[s + 1], screenY[s + 1]);
          ctx.stroke();

          ctx.strokeStyle = `rgba(191, 239, 255, ${(0.6 * finalOpacity).toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(screenX[s], screenY[s]);
          ctx.lineTo(screenX[s + 1], screenY[s + 1]);
          ctx.stroke();

          ctx.strokeStyle = `rgba(255, 255, 255, ${(0.95 * finalOpacity).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(screenX[s], screenY[s]);
          ctx.lineTo(screenX[s + 1], screenY[s + 1]);
          ctx.stroke();
        }

        // Glowing tracer head
        const baseIndex = Math.min(STREAM_NODES - 2, Math.max(0, Math.floor(headIndex)));
        const segFrac = headIndex - baseIndex;
        const headX = screenX[baseIndex] + (screenX[baseIndex + 1] - screenX[baseIndex]) * segFrac;
        const headY = screenY[baseIndex] + (screenY[baseIndex + 1] - screenY[baseIndex]) * segFrac;
        const headZ = depth[baseIndex] + (depth[baseIndex + 1] - depth[baseIndex]) * segFrac;
        const headAlpha = (headZ < 0.5 ? 0.4 + headZ * 1.2 : 1) * alphaMultiplier;

        if (headAlpha > 0.02) {
          ctx.fillStyle = `rgba(79, 192, 255, ${(0.35 * headAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(headX, headY, 8, 0, TWO_PI);
          ctx.fill();

          ctx.fillStyle = `rgba(224, 247, 255, ${(0.75 * headAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(headX, headY, 3.5, 0, TWO_PI);
          ctx.fill();

          ctx.fillStyle = `rgba(255, 255, 255, ${(0.98 * headAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(headX, headY, 1.5, 0, TWO_PI);
          ctx.fill();
        }
      }
    }

    // Main Render Loop
    function renderFrame(time) {
      ctx.clearRect(0, 0, width, height);

      const angle = prefersReducedMotion ? 0 : (TWO_PI * time) / ROTATION_CYCLE_MS;

      // Soft ambient blue glow centered on beacon projection
      const ambientX = centerX + AXIS_VECTOR[0] * sphereRadius * 0.35;
      const ambientY = centerY - AXIS_VECTOR[1] * sphereRadius * 0.35;
      const ambientGrad = ctx.createRadialGradient(ambientX, ambientY, 0, ambientX, ambientY, sphereRadius * 1.25);
      ambientGrad.addColorStop(0, 'rgba(61, 123, 255, 0.11)');
      ambientGrad.addColorStop(0.55, 'rgba(61, 123, 255, 0.05)');
      ambientGrad.addColorStop(1, 'rgba(61, 123, 255, 0)');
      ctx.fillStyle = ambientGrad;
      ctx.fillRect(0, 0, width, height);

      // Periodic ripple pulse
      let hasRipple = false;
      let rippleAngle = 0;
      if (!prefersReducedMotion) {
        const pulseProgress = time % PULSE_INTERVAL_MS;
        if (pulseProgress < PULSE_DURATION_MS) {
          hasRipple = true;
          rippleAngle = easeOutCubic(pulseProgress / PULSE_DURATION_MS) * Math.PI;
        }
      }

      // Rotate all points
      for (let i = 0; i < TOTAL_POINTS; i++) {
        rotatedPoints[i] = rotatePoint(basePoints[i], angle);
      }

      // Sort by Z for proper depth rendering
      renderOrder.sort((a, b) => rotatedPoints[a][2] - rotatedPoints[b][2]);

      const beaconPos = rotatedPoints[beaconIndex];

      // Draw all sphere points
      for (let i = 0; i < TOTAL_POINTS; i++) {
        const idx = renderOrder[i];
        if (idx === beaconIndex) continue;

        const pt = rotatedPoints[idx];
        const dotAxis = pt[0] * AXIS_VECTOR[0] + pt[1] * AXIS_VECTOR[1] + pt[2] * AXIS_VECTOR[2];
        let colorIdx = Math.min(7, Math.max(0, Math.floor(((1 - dotAxis) / 2) * 7.999) + variations[idx]));
        const sizeLevel = sizeIndices[idx];
        const axisShade = 0.55 + 0.45 * ((dotAxis + 1) / 2);
        let alpha = POINT_ALPHAS[sizeLevel] * 0.95 * axisShade;
        const depthShade = 0.72 + 0.28 * ((pt[2] + 1) / 2);
        let radius = POINT_SIZES[sizeLevel] * depthShade * (sphereRadius / 360);

        if (hasRipple) {
          const angularDist = Math.acos(
            Math.max(-1, Math.min(1, pt[0] * beaconPos[0] + pt[1] * beaconPos[1] + pt[2] * beaconPos[2]))
          );
          const diff = Math.abs(angularDist - rippleAngle);
          if (diff < 0.28) {
            const rippleEffect = 1 - diff / 0.28;
            colorIdx = Math.max(0, colorIdx - 1);
            alpha = Math.min(1, alpha + 0.35 * rippleEffect);
            radius *= 1 + 0.15 * rippleEffect;
          }
        }

        if (alpha < 0.02 || radius < 0.3) continue;

        const col = POINT_COLORS[colorIdx];
        const sx = centerX + pt[0] * sphereRadius;
        const sy = centerY - pt[1] * sphereRadius;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = `rgb(${col[0]}, ${col[1]}, ${col[2]})`;
        ctx.beginPath();
        ctx.arc(sx, sy, radius, 0, TWO_PI);
        ctx.fill();

        // Subtle specular highlight on prominent foreground points
        if (radius >= 1.9 && alpha >= 0.5 && pt[2] > 0) {
          ctx.globalAlpha = alpha * 0.65;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.beginPath();
          ctx.arc(sx + radius * 0.3, sy - radius * 0.34, radius * 0.32, 0, TWO_PI);
          ctx.fill();
        }
      }

      ctx.globalAlpha = 1;

      // Handle particle stream updates and rendering
      if (!prefersReducedMotion) {
        updateStreams(time);
        renderStreams(time);
      }

      // --- Draw Glowing Beacon (Golden Star / Sun Node) ---
      const bx = centerX + beaconPos[0] * sphereRadius;
      const by = centerY - beaconPos[1] * sphereRadius;
      let pulseBreath = 0.4 + 0.5 * (0.5 + 0.5 * Math.sin((TWO_PI * time) / 2800 - Math.PI / 2));

      // Flash boost when streams impact beacon
      let impactBoost = 0;
      impactTimes = impactTimes.filter((t) => time - t <= 500);
      for (const it of impactTimes) {
        impactBoost += (1 - (time - it) / 500) * 0.3;
      }
      impactBoost = Math.min(0.5, impactBoost);
      pulseBreath = Math.min(1.15, pulseBreath + impactBoost);

      // Outer golden solar corona
      const outerGlowRadius = sphereRadius * 0.28;
      const coronaGrad = ctx.createRadialGradient(bx, by, 0, bx, by, outerGlowRadius);
      coronaGrad.addColorStop(0, `rgba(255, 248, 218, ${0.9 * pulseBreath})`);
      coronaGrad.addColorStop(0.14, `rgba(255, 210, 63, ${0.6 * pulseBreath})`);
      coronaGrad.addColorStop(0.4, `rgba(255, 176, 58, ${0.28 * pulseBreath})`);
      coronaGrad.addColorStop(0.72, `rgba(255, 106, 58, ${0.11 * pulseBreath})`);
      coronaGrad.addColorStop(1, 'rgba(255, 106, 58, 0)');
      ctx.fillStyle = coronaGrad;
      ctx.beginPath();
      ctx.arc(bx, by, outerGlowRadius, 0, TWO_PI);
      ctx.fill();

      // Mid aura
      const midAuraRadius = sphereRadius * 0.055 * (1 + 0.4 * impactBoost);
      const midAuraGrad = ctx.createRadialGradient(bx, by, 0, bx, by, midAuraRadius);
      midAuraGrad.addColorStop(0, `rgba(255, 248, 218, ${0.95 * pulseBreath})`);
      midAuraGrad.addColorStop(0.5, `rgba(255, 210, 63, ${0.55 * pulseBreath})`);
      midAuraGrad.addColorStop(1, 'rgba(255, 210, 63, 0)');
      ctx.fillStyle = midAuraGrad;
      ctx.beginPath();
      ctx.arc(bx, by, midAuraRadius, 0, TWO_PI);
      ctx.fill();

      // Beacon solid high-light core
      const coreRadius = Math.max(5.5, POINT_SIZES[0] * 1.6 * (sphereRadius / 420) * 2);
      const coreGrad = ctx.createRadialGradient(
        bx - coreRadius * 0.25,
        by - coreRadius * 0.28,
        coreRadius * 0.1,
        bx,
        by,
        coreRadius
      );
      coreGrad.addColorStop(0, '#FFF8DA');
      coreGrad.addColorStop(0.55, '#FFD23F');
      coreGrad.addColorStop(1, '#C77E12');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(bx, by, coreRadius, 0, TWO_PI);
      ctx.fill();
    }

    // Animation runner
    const startTime = performance.now();
    function animate(currentTime) {
      renderFrame(currentTime - startTime);
      requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  // --- UI Interactions, Modals & Handlers ---
  function initUIInteractions() {
    const STORAGE_KEY = 'bv7x_home_beta_popup_dismissed';

    // Elements
    const betaModal = document.getElementById('beta-modal');
    const betaClose = document.getElementById('beta-close');
    const betaScrim = document.getElementById('beta-scrim');
    const betaLater = document.getElementById('beta-later');
    const stakeBtn = document.getElementById('btn-stake-live');

    const walletModal = document.getElementById('wallet-modal');
    const walletClose = document.getElementById('wallet-close');
    const walletScrim = document.getElementById('wallet-scrim');
    const connectBtns = document.querySelectorAll('.action-connect');

    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileOverlay = document.getElementById('mobile-nav-overlay');
    const mobileClose = document.getElementById('mobile-nav-close');

    // Beta Modal Handlers
    function closeBetaModal() {
      if (betaModal) {
        betaModal.classList.remove('open');
        try {
          localStorage.setItem(STORAGE_KEY, '1');
        } catch (e) {}
      }
    }

    function openBetaModal() {
      if (betaModal) {
        betaModal.classList.add('open');
      }
    }

    // Auto show beta modal if not previously dismissed
    try {
      if (localStorage.getItem(STORAGE_KEY) !== '1') {
        // Show after a gentle 1.2s delay for pleasant arrival
        setTimeout(() => {
          openBetaModal();
        }, 1200);
      }
    } catch (e) {}

    if (betaClose) betaClose.addEventListener('click', closeBetaModal);
    if (betaScrim) betaScrim.addEventListener('click', closeBetaModal);
    if (betaLater) betaLater.addEventListener('click', closeBetaModal);
    if (stakeBtn) {
      stakeBtn.addEventListener('click', (e) => {
        // Allow user to trigger modal or view beta info
        if (e.shiftKey) {
          e.preventDefault();
          openBetaModal();
        }
      });
    }

    // Wallet Modal Handlers
    function openWalletModal() {
      if (walletModal) walletModal.classList.add('open');
      if (mobileOverlay) mobileOverlay.classList.remove('open');
    }

    function closeWalletModal() {
      if (walletModal) walletModal.classList.remove('open');
    }

    connectBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = btn.getAttribute('href') || 'Grah/index.html';
      });
    });

    if (walletClose) walletClose.addEventListener('click', closeWalletModal);
    if (walletScrim) walletScrim.addEventListener('click', closeWalletModal);

    // Wallet option selection
    const walletItems = document.querySelectorAll('.wallet-item');
    walletItems.forEach((item) => {
      item.addEventListener('click', () => {
        const name = item.dataset.wallet || 'Wallet';
        const tag = item.querySelector('.wallet-tag');
        if (tag) tag.textContent = 'Connecting...';
        setTimeout(() => {
          if (tag) tag.textContent = 'Connected';
          setTimeout(() => {
            closeWalletModal();
            connectBtns.forEach((btn) => {
              btn.textContent = '0x8a72...F91C';
              btn.style.fontFamily = 'var(--font-data)';
              btn.style.fontSize = '12px';
            });
          }, 600);
        }, 800);
      });
    });

    // Mobile Menu Handlers
    if (mobileMenuBtn && mobileOverlay) {
      mobileMenuBtn.addEventListener('click', () => {
        mobileOverlay.classList.add('open');
      });
    }

    if (mobileClose && mobileOverlay) {
      mobileClose.addEventListener('click', () => {
        mobileOverlay.classList.remove('open');
      });
    }

    // Escape key closes open modals
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeBetaModal();
        closeWalletModal();
        if (mobileOverlay) mobileOverlay.classList.remove('open');
      }
    });
  }

  // Bootstrap when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initCelestialCanvas();
      initUIInteractions();
    });
  } else {
    initCelestialCanvas();
    initUIInteractions();
  }
})();
