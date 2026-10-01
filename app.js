/**
 * Polymer Statistical Mechanics Application Controller
 * Handles UI interactions, Chart.js integrations, mode switching,
 * microstate galleries, and pedagogical quiz.
 */

import {
  evaluatePolymerWalk,
  enumerate2DLattice,
  runMonteCarloSimulation,
  evaluateForceExtension,
  generateForceExtensionCurve,
  DIRECTIONS_2D,
  DIR_LOOKUP
} from './physics.js';

import { PolymerRenderer, renderThumbnail } from './renderer.js';

// Application State
const state = {
  activeMode: 'explorer', // 'explorer' | 'exhaustive' | 'montecarlo' | 'mechanics'
  linkLengthB: 1.0, // in nm
  
  // Current active polymer walk (default: Jacobs Fig 5.6)
  currentSteps: ['R', 'U', 'R', 'U', 'R', 'U', 'U', 'L', 'U'],
  walkEvaluation: null,

  // Mode 2: Exhaustive state
  exhaustiveN: 4,
  exhaustiveSawOnly: false,
  exhaustiveYVar: 'count', // 'count' | 'prob' | 'entropy'
  exhaustiveData: null,
  selectedRGroup: null,

  // Mode 3: Monte Carlo state
  mcN: 50,
  mcSamples: 5000,
  mcModel: '2d-lattice',
  mcData: null,

  // Mode 4: Mechanics state
  tensileForce: 0.5,
  temperatureK: 300,
  mechanicsCurve: null
};

// Chart.js references
let chartDensity = null;
let chartMc = null;
let chartForceExt = null;
let renderer = null;

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  initRenderer();
  initNavigation();
  initExplorerMode();
  initExhaustiveMode();
  initMonteCarloMode();
  initMechanicsMode();
  initModals();
  initQuiz();
  initExport();

  // Load textbook Figure 5.6 by default
  loadWalk(state.currentSteps);

  // Render initial KaTeX
  if (window.renderMathInElement) {
    window.renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '\\(', right: '\\)', display: false },
        { left: '$', right: '$', display: false }
      ]
    });
  }
});

/* ==========================================================================
   1. Canvas & Renderer Initialization
   ========================================================================== */
function initRenderer() {
  const canvas = document.getElementById('polymer-canvas');
  renderer = new PolymerRenderer(canvas);
  renderer.resize();

  // Toolbar toggles
  document.getElementById('chk-caliper').addEventListener('change', (e) => {
    renderer.showCaliper = e.target.checked;
    renderer.render();
  });

  document.getElementById('chk-components').addEventListener('change', (e) => {
    renderer.showComponents = e.target.checked;
    renderer.render();
  });

  document.getElementById('btn-zoom-in').addEventListener('click', () => {
    renderer.scale = Math.min(220, renderer.scale * 1.25);
    renderer.render();
  });

  document.getElementById('btn-zoom-out').addEventListener('click', () => {
    renderer.scale = Math.max(12, renderer.scale * 0.8);
    renderer.render();
  });

  document.getElementById('btn-center-view').addEventListener('click', () => {
    if (state.walkEvaluation) {
      renderer.centerOnPolymer(state.walkEvaluation);
    }
  });

  document.getElementById('btn-reset-default').addEventListener('click', () => {
    loadWalk(['R', 'U', 'R', 'U', 'R', 'U', 'U', 'L', 'U']);
  });
}

/* ==========================================================================
   2. Walk Loader & Metrics HUD Updater
   ========================================================================== */
function loadWalk(steps) {
  state.currentSteps = [...steps];
  state.walkEvaluation = evaluatePolymerWalk(state.currentSteps, state.linkLengthB);

  // Update Canvas
  renderer.caliperLinkIndex = Math.min(6, Math.max(0, steps.length - 2));
  renderer.setPolymerWalk(state.walkEvaluation);
  renderer.centerOnPolymer(state.walkEvaluation);

  // Update HUD
  const evalData = state.walkEvaluation;
  document.getElementById('val-links-n').textContent = evalData.n;
  document.getElementById('val-link-b').innerHTML = `${evalData.b.toFixed(1)} <small style="font-size:0.75rem;">nm</small>`;
  document.getElementById('val-contour-l').innerHTML = `${evalData.contourLength.toFixed(1)} <small style="font-size:0.75rem;">nm</small>`;
  document.getElementById('val-end-to-end-r').innerHTML = `${evalData.endToEndLength.toFixed(2)} <small style="font-size:0.75rem;">nm</small>`;
  document.getElementById('val-ratio-rl').textContent = evalData.extensionRatio.toFixed(2);

  // Entropy estimation if known
  document.getElementById('val-entropy-s').textContent = (evalData.n <= 8)
    ? `${(evalData.n * Math.log(4)).toFixed(1)} (max)`
    : '&mdash;';

  // HUD bottom overlay
  const hudDispl = document.getElementById('hud-displacement');
  hudDispl.textContent = `ΔX = ${evalData.endX.toFixed(2)} b, ΔY = ${evalData.endY.toFixed(2)} b`;

  const hudSaw = document.getElementById('hud-saw-status');
  if (evalData.isSaw) {
    hudSaw.textContent = '• Self-Avoiding Walk (No Overlaps)';
    hudSaw.style.color = '#4ade80';
  } else {
    hudSaw.textContent = `⚠ Self-Intersecting (${evalData.selfIntersections.length} overlap${evalData.selfIntersections.length > 1 ? 's' : ''})`;
    hudSaw.style.color = '#f87171';
  }

  // Update Step history strip
  renderStepChips();
}

function renderStepChips() {
  const container = document.getElementById('step-history-strip');
  const counter = document.getElementById('step-counter-text');
  counter.textContent = `${state.currentSteps.length} links`;
  container.innerHTML = '';

  state.currentSteps.forEach((step, idx) => {
    const chip = document.createElement('span');
    chip.className = 'step-chip';
    chip.textContent = `${idx + 1}: ${DIR_LOOKUP[step].symbol} ${step}`;
    chip.title = `Step ${idx + 1}: ${step}`;
    container.appendChild(chip);
  });
}

/* ==========================================================================
   3. Mode Navigation Tabs
   ========================================================================== */
function initNavigation() {
  const tabBtns = document.querySelectorAll('.nav-tab-btn');
  const views = {
    explorer: document.getElementById('view-explorer'),
    exhaustive: document.getElementById('view-exhaustive'),
    montecarlo: document.getElementById('view-montecarlo'),
    mechanics: document.getElementById('view-mechanics')
  };

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      state.activeMode = mode;

      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      Object.entries(views).forEach(([k, el]) => {
        el.style.display = (k === mode) ? 'block' : 'none';
      });

      // Lazy render chart when tab opens
      if (mode === 'exhaustive' && !state.exhaustiveData) {
        updateExhaustiveMode();
      } else if (mode === 'montecarlo' && !state.mcData) {
        updateMonteCarloMode();
      } else if (mode === 'mechanics' && !state.mechanicsCurve) {
        updateMechanicsMode();
      }
    });
  });
}

/* ==========================================================================
   4. Mode 1: Explorer & Builder Controls
   ========================================================================== */
function initExplorerMode() {
  // Step D-pad buttons
  document.querySelectorAll('.btn-step-dir').forEach(btn => {
    btn.addEventListener('click', () => {
      const dir = btn.dataset.dir;
      const nextSteps = [...state.currentSteps, dir];
      loadWalk(nextSteps);
    });
  });

  // Undo button
  document.getElementById('btn-undo-link').addEventListener('click', () => {
    if (state.currentSteps.length > 1) {
      loadWalk(state.currentSteps.slice(0, -1));
    }
  });

  // Clear button
  document.getElementById('btn-clear-chain').addEventListener('click', () => {
    loadWalk(['R']);
  });

  // Presets
  document.getElementById('preset-fig56').addEventListener('click', () => {
    loadWalk(['R', 'U', 'R', 'U', 'R', 'U', 'U', 'L', 'U']);
  });

  document.getElementById('preset-straight').addEventListener('click', () => {
    const len = Math.max(6, state.currentSteps.length);
    loadWalk(Array(len).fill('R'));
  });

  document.getElementById('preset-hairpin').addEventListener('click', () => {
    loadWalk(['R', 'R', 'U', 'L', 'L', 'D']);
  });

  document.getElementById('preset-staircase').addEventListener('click', () => {
    const steps = [];
    for (let i = 0; i < 5; i++) {
      steps.push('R', 'U');
    }
    loadWalk(steps);
  });

  document.getElementById('preset-random-walk').addEventListener('click', () => {
    const len = Math.max(8, state.currentSteps.length);
    const dirs = ['R', 'U', 'L', 'D'];
    const steps = [];
    for (let i = 0; i < len; i++) {
      steps.push(dirs[Math.floor(Math.random() * 4)]);
    }
    loadWalk(steps);
  });

  document.getElementById('preset-saw-walk').addEventListener('click', () => {
    const len = 10;
    const dirs = ['R', 'U', 'L', 'D'];
    let attempts = 0;
    while (attempts < 200) {
      attempts++;
      const steps = [];
      const visited = new Set(['0,0']);
      let x = 0, y = 0, ok = true;
      for (let i = 0; i < len; i++) {
        // filter valid steps
        const validDirs = dirs.filter(d => {
          const dl = DIR_LOOKUP[d];
          const k = `${x + dl.dx},${y + dl.dy}`;
          return !visited.has(k);
        });
        if (validDirs.length === 0) { ok = false; break; }
        const chosen = validDirs[Math.floor(Math.random() * validDirs.length)];
        steps.push(chosen);
        x += DIR_LOOKUP[chosen].dx;
        y += DIR_LOOKUP[chosen].dy;
        visited.add(`${x},${y}`);
      }
      if (ok) {
        loadWalk(steps);
        return;
      }
    }
    loadWalk(['R', 'U', 'R', 'U', 'L', 'U']);
  });
}

/* ==========================================================================
   5. Mode 2: Exhaustive Density of States
   ========================================================================== */
function initExhaustiveMode() {
  const sliderN = document.getElementById('slider-exhaustive-n');
  const badgeN = document.getElementById('badge-exhaustive-n');
  const chkSaw = document.getElementById('chk-exhaustive-saw');

  sliderN.addEventListener('input', (e) => {
    state.exhaustiveN = parseInt(e.target.value, 10);
    badgeN.textContent = state.exhaustiveN;
    updateExhaustiveMode();
  });

  chkSaw.addEventListener('change', (e) => {
    state.exhaustiveSawOnly = e.target.checked;
    updateExhaustiveMode();
  });

  // Y-axis toggle buttons
  document.querySelectorAll('#group-chart-y .btn-group-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#group-chart-y .btn-group-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.exhaustiveYVar = btn.dataset.y;
      renderExhaustiveChart();
    });
  });
}

function updateExhaustiveMode() {
  const n = state.exhaustiveN;
  const saw = state.exhaustiveSawOnly;

  state.exhaustiveData = enumerate2DLattice(n, state.linkLengthB, saw);

  const statusTag = document.getElementById('exhaustive-status-tag');
  if (saw) {
    statusTag.textContent = `${state.exhaustiveData.totalStates} Valid SAW States (n = ${n})`;
  } else {
    statusTag.textContent = `4^${n} = ${state.exhaustiveData.totalStates.toLocaleString()} Microstates`;
  }

  renderExhaustiveChart();

  // Select most probable R group by default
  const defaultGroup = state.exhaustiveData.densityOfStates.find(d => Math.abs(d.r - state.exhaustiveData.mostProbableR) < 1e-4) ||
    state.exhaustiveData.densityOfStates[0];
  selectRGroup(defaultGroup);
}

function renderExhaustiveChart() {
  if (!state.exhaustiveData) return;

  const ctx = document.getElementById('chart-density-states').getContext('2d');
  const dosList = state.exhaustiveData.densityOfStates;

  const labels = dosList.map(d => `${d.r.toFixed(2)} b`);
  let yData = [];
  let yLabel = '';

  if (state.exhaustiveYVar === 'count') {
    yData = dosList.map(d => d.count);
    yLabel = 'Microstates Ω(R)';
  } else if (state.exhaustiveYVar === 'prob') {
    yData = dosList.map(d => d.probability);
    yLabel = 'Probability P(R)';
  } else {
    yData = dosList.map(d => d.entropyOverKb);
    yLabel = 'Boltzmann Entropy S(R) / kB = ln Ω';
  }

  const bgColors = dosList.map(d => (state.selectedRGroup && Math.abs(d.r - state.selectedRGroup.r) < 1e-4)
    ? 'rgba(2, 132, 199, 1.0)'
    : 'rgba(14, 165, 233, 0.65)'
  );

  if (chartDensity) {
    chartDensity.destroy();
  }

  chartDensity = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: yLabel,
        data: yData,
        backgroundColor: bgColors,
        borderColor: '#0284c7',
        borderWidth: 1.5,
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick: (evt, elements) => {
        if (elements.length > 0) {
          const index = elements[0].index;
          selectRGroup(dosList[index]);
          renderExhaustiveChart(); // update highlight color
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `End-to-End Length R = ${items[0].label}`,
            label: (item) => {
              const d = dosList[item.dataIndex];
              return [
                `Microstates Ω: ${d.count}`,
                `Probability P: ${(d.probability * 100).toFixed(2)}%`,
                `Entropy S/kB: ${d.entropyOverKb.toFixed(2)}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'End-to-End Distance R (units of b)', font: { weight: '600', size: 11 } }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: yLabel, font: { weight: '600', size: 11 } }
        }
      }
    }
  });
}

function selectRGroup(rGroup) {
  state.selectedRGroup = rGroup;
  const grid = document.getElementById('gallery-grid');
  const countBadge = document.getElementById('gallery-count-badge');
  const subtitle = document.getElementById('gallery-subtitle');

  if (!rGroup) {
    grid.innerHTML = '<p style="font-size:0.8rem; color:var(--color-text-muted);">No group selected</p>';
    countBadge.textContent = '0 states';
    return;
  }

  countBadge.textContent = `${rGroup.count} state${rGroup.count > 1 ? 's' : ''}`;
  subtitle.textContent = `Showing sample microstates for R = ${rGroup.r.toFixed(2)} b (P = ${(rGroup.probability * 100).toFixed(1)}%, S/kB = ${rGroup.entropyOverKb.toFixed(2)})`;
  grid.innerHTML = '';

  const displayStates = rGroup.sampleStates || [];
  displayStates.forEach((st, idx) => {
    const card = document.createElement('div');
    card.className = 'microstate-card';
    card.title = `Microstate #${st.id + 1}: ${st.steps.join(' ')}`;

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.className = 'microstate-thumb-canvas';
    thumbCanvas.width = 80;
    thumbCanvas.height = 80;

    renderThumbnail(thumbCanvas, st.steps, state.linkLengthB, false);

    const meta = document.createElement('div');
    meta.className = 'microstate-meta';
    meta.textContent = `#${idx + 1} (${st.x},${st.y})`;

    card.appendChild(thumbCanvas);
    card.appendChild(meta);

    // Clicking a thumbnail loads it into the main canvas visualizer!
    card.addEventListener('click', () => {
      loadWalk(st.steps);
      document.querySelectorAll('.microstate-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });

    grid.appendChild(card);
  });
}

/* ==========================================================================
   6. Mode 3: Monte Carlo Simulation
   ========================================================================== */
function initMonteCarloMode() {
  const sliderN = document.getElementById('slider-mc-n');
  const badgeN = document.getElementById('badge-mc-n');
  const sliderSamples = document.getElementById('slider-mc-samples');
  const badgeSamples = document.getElementById('badge-mc-samples');
  const selectModel = document.getElementById('select-mc-model');
  const btnRun = document.getElementById('btn-run-mc');

  sliderN.addEventListener('input', (e) => {
    state.mcN = parseInt(e.target.value, 10);
    badgeN.textContent = state.mcN;
  });

  sliderSamples.addEventListener('input', (e) => {
    state.mcSamples = parseInt(e.target.value, 10);
    badgeSamples.textContent = state.mcSamples.toLocaleString();
  });

  selectModel.addEventListener('change', (e) => {
    state.mcModel = e.target.value;
  });

  btnRun.addEventListener('click', () => {
    updateMonteCarloMode();
  });
}

function updateMonteCarloMode() {
  state.mcData = runMonteCarloSimulation({
    n: state.mcN,
    b: state.linkLengthB,
    samples: state.mcSamples,
    model: state.mcModel
  });

  // Update convergence metrics
  document.getElementById('mc-metric-sim-rms').textContent = `${state.mcData.rmsR.toFixed(2)} nm`;
  document.getElementById('mc-metric-theory-rms').textContent = `${state.mcData.theoreticalIdealRms.toFixed(2)} nm`;
  
  const errEl = document.getElementById('mc-metric-error');
  const errVal = state.mcData.percentDifference;
  errEl.textContent = `${errVal >= 0 ? '+' : ''}${errVal.toFixed(1)}%`;
  errEl.style.color = Math.abs(errVal) < 5 ? 'var(--color-success)' : 'var(--color-warning)';

  // If last trajectory exists, show it on canvas
  if (state.mcData.lastTrajectory) {
    const steps = [];
    const traj = state.mcData.lastTrajectory;
    for (let i = 0; i < traj.length - 1; i++) {
      const dx = traj[i + 1].x - traj[i].x;
      const dy = traj[i + 1].y - traj[i].y;
      steps.push({ dx, dy });
    }
    // Set custom walk
    state.walkEvaluation = evaluatePolymerWalk(steps, state.linkLengthB);
    renderer.setPolymerWalk(state.walkEvaluation);
    renderer.centerOnPolymer(state.walkEvaluation);
  }

  renderMonteCarloChart();
}

function renderMonteCarloChart() {
  if (!state.mcData) return;

  const ctx = document.getElementById('chart-mc-histogram').getContext('2d');
  const bins = state.mcData.bins;

  const labels = bins.map(b => b.binCenter.toFixed(1));
  const simData = bins.map(b => b.frequency);
  const theoryData = bins.map(b => b.theoreticalPdf);

  if (chartMc) {
    chartMc.destroy();
  }

  const datasets = [
    {
      type: 'bar',
      label: 'Monte Carlo Sample Frequency',
      data: simData,
      backgroundColor: 'rgba(2, 132, 199, 0.65)',
      borderColor: '#0284c7',
      borderWidth: 1,
      borderRadius: 3
    }
  ];

  if (state.mcModel !== '2d-saw') {
    datasets.push({
      type: 'line',
      label: 'Theoretical Continuous PDF',
      data: theoryData,
      borderColor: '#ef4444',
      borderWidth: 2.2,
      fill: false,
      pointRadius: 0,
      tension: 0.3
    });
  }

  chartMc = new Chart(ctx, {
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: (items) => `End-to-End Length R ≈ ${items[0].label} nm`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'End-to-End Distance R (nm)', font: { weight: '600', size: 11 } }
        },
        y: {
          beginAtZero: true,
          title: { display: true, text: 'Probability Density P(R)', font: { weight: '600', size: 11 } }
        }
      }
    }
  });
}

/* ==========================================================================
   7. Mode 4: Entropic Elasticity & Mechanics
   ========================================================================== */
function initMechanicsMode() {
  const sliderForce = document.getElementById('slider-tensile-force');
  const badgeForce = document.getElementById('badge-tensile-force');
  const sliderTemp = document.getElementById('slider-temperature');
  const badgeTemp = document.getElementById('badge-temperature');

  sliderForce.addEventListener('input', (e) => {
    state.tensileForce = parseFloat(e.target.value);
    badgeForce.innerHTML = `${state.tensileForce.toFixed(1)} <small>k<sub>B</sub>T/b</small>`;
    updateMechanicsMode();
  });

  sliderTemp.addEventListener('input', (e) => {
    state.temperatureK = parseInt(e.target.value, 10);
    badgeTemp.textContent = `${state.temperatureK} K`;
    updateMechanicsMode();
  });
}

function updateMechanicsMode() {
  // Use small chain states for exact canonical ensemble
  const baseEnum = state.exhaustiveData || enumerate2DLattice(4, state.linkLengthB, false);
  state.mechanicsCurve = generateForceExtensionCurve(baseEnum.microstates, 6.0, 30);

  renderForceExtensionChart();
}

function renderForceExtensionChart() {
  if (!state.mechanicsCurve) return;

  const ctx = document.getElementById('chart-force-extension').getContext('2d');
  const labels = state.mechanicsCurve.map(pt => pt.force.toFixed(1));
  const extData = state.mechanicsCurve.map(pt => pt.relativeExtension);

  if (chartForceExt) {
    chartForceExt.destroy();
  }

  chartForceExt = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Relative Extension ⟨X⟩ / L',
          data: extData,
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.1)',
          fill: true,
          borderWidth: 2.5,
          tension: 0.2,
          pointRadius: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: (items) => `Tensile Force F = ${items[0].label} (kB T / b)`,
            label: (item) => `Relative Extension: ${(item.raw * 100).toFixed(1)}% of L`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Applied Tensile Force F / (k_B T / b)', font: { weight: '600', size: 11 } }
        },
        y: {
          min: 0,
          max: 1.05,
          title: { display: true, text: 'Normalized Extension ⟨X⟩ / L', font: { weight: '600', size: 11 } }
        }
      }
    }
  });
}

/* ==========================================================================
   8. Modals & Guided Experience
   ========================================================================== */
function initModals() {
  const modalTheory = document.getElementById('modal-theory');
  const modalQuiz = document.getElementById('modal-quiz');

  document.getElementById('btn-open-theory').addEventListener('click', () => {
    modalTheory.classList.add('active');
    if (window.renderMathInElement) {
      window.renderMathInElement(modalTheory, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false },
          { left: '$', right: '$', display: false }
        ]
      });
    }
  });

  document.getElementById('btn-open-quiz').addEventListener('click', () => {
    modalQuiz.classList.add('active');
  });

  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.close;
      document.getElementById(targetId).classList.remove('active');
    });
  });

  // Close modal when clicking backdrop
  [modalTheory, modalQuiz].forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.remove('active');
    });
  });
}

/* ==========================================================================
   9. Chapter 5 Practice Quiz
   ========================================================================== */
const QUIZ_QUESTIONS = [
  {
    title: "1. Contour Length (L) vs. End-to-End Length (R)",
    question: "According to Jacobs, Huang & Kwon Figure 5.6, what is the fundamental difference between contour length L and end-to-end length R?",
    options: [
      { text: "L depends on the current folding configuration, whereas R is a fixed constant.", correct: false },
      { text: "L is the length if the polymer were completely straight (L = n·b), while R is the straight-line distance between the two ends and depends on configuration.", correct: true },
      { text: "R is always strictly greater than L due to thermal fluctuations.", correct: false },
      { text: "L and R are identical in all thermodynamic ensembles.", correct: false }
    ],
    explanation: "Correct! The contour length L = n·b is the maximum possible theoretical length when stretched fully straight. End-to-end length R is the vector distance between chain ends, which fluctuates with microstate."
  },
  {
    title: "2. Density of States for n = 2 Bonds",
    question: "For a 2D polymer on a square lattice with n = 2 links (each link of length b), how many total microstates exist, and how many have R = 0 (hairpin fold)?",
    options: [
      { text: "Total = 8 states; 2 states have R = 0.", correct: false },
      { text: "Total = 16 states; 4 states have R = 0 (Right-Left, Left-Right, Up-Down, Down-Up).", correct: true },
      { text: "Total = 16 states; 8 states have R = 0.", correct: false },
      { text: "Total = 4 states; 0 states have R = 0.", correct: false }
    ],
    explanation: "Correct! There are 4^2 = 16 possible walks. The 4 reverse folds (RL, LR, UD, DU) return to the origin (R = 0). The 8 perpendicular turns yield R = √2 b, and the 4 straight paths yield R = 2b."
  },
  {
    title: "3. Maximum Entropy State",
    question: "Why does a polymer in solution spontaneously tend toward coiled conformations rather than remaining fully extended?",
    options: [
      { text: "Chemical bonds prefer to minimize their kinetic energy at low temperatures.", correct: false },
      { text: "Coiled states possess vastly more microstates (Ω), meaning higher Boltzmann entropy S = kB·ln(Ω). Thermodynamics favors states of maximum entropy.", correct: true },
      { text: "The surrounding water molecules exert compressive hydrostatic pressure pushing the ends together.", correct: false },
      { text: "The straight state has negative entropy.", correct: false }
    ],
    explanation: "Correct! For a polymer, the fully straight state has only 4 microstates, whereas coiled states have thousands or millions of possible configurations. Maximum entropy drives spontaneous coiling (entropic elasticity)."
  },
  {
    title: "4. Random Walk Scaling Theorem",
    question: "For an ideal unrestricted freely jointed polymer chain of n = 100 links with link size b = 2 nm, what is the root-mean-square (RMS) end-to-end length?",
    options: [
      { text: "200 nm (the full contour length)", correct: false },
      { text: "20 nm (R_rms = √n · b = √100 · 2 nm = 10 · 2 nm)", correct: true },
      { text: "10 nm", correct: false },
      { text: "2 nm", correct: false }
    ],
    explanation: "Correct! Under the Central Limit Theorem for random walks, ⟨R²⟩ = n·b², so R_rms = √n · b. For n = 100 and b = 2 nm, R_rms = 10 · 2 nm = 20 nm, which is one-tenth of its 200 nm contour length!"
  },
  {
    title: "5. Temperature Dependence of Entropic Springs",
    question: "Unlike a conventional metal spring that weakens when heated, what happens to the stiffness of a biological entropic spring (e.g., titin or elastin) as temperature T increases?",
    options: [
      { text: "Its spring constant increases linearly with temperature: k_entropic = (2 kB T) / (n b²).", correct: true },
      { text: "Its spring constant drops to zero immediately.", correct: false },
      { text: "Its stiffness is strictly independent of temperature.", correct: false },
      { text: "It denatures into a rigid ceramic structure.", correct: false }
    ],
    explanation: "Correct! Because entropic force arises from thermal kinetic agitation resisting alignment (f = T · ∂S/∂R), increasing temperature increases the entropic restoring force and stiffness!"
  }
];

function initQuiz() {
  const container = document.getElementById('quiz-container');
  container.innerHTML = '';

  QUIZ_QUESTIONS.forEach((q, qIdx) => {
    const card = document.createElement('div');
    card.className = 'quiz-question-card';

    const title = document.createElement('div');
    title.className = 'quiz-question-title';
    title.textContent = q.title;

    const text = document.createElement('p');
    text.style.fontSize = '0.88rem';
    text.style.marginBottom = '0.75rem';
    text.textContent = q.question;

    const list = document.createElement('div');
    list.className = 'quiz-options-list';

    const feedback = document.createElement('div');
    feedback.className = 'quiz-feedback';

    q.options.forEach((opt, optIdx) => {
      const label = document.createElement('label');
      label.className = 'quiz-option-label';

      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = `quiz-q-${qIdx}`;
      radio.value = optIdx;

      radio.addEventListener('change', () => {
        if (opt.correct) {
          feedback.className = 'quiz-feedback correct';
          feedback.textContent = `✔ ${q.explanation}`;
        } else {
          feedback.className = 'quiz-feedback incorrect';
          feedback.textContent = `✖ Incorrect. Try again! Hint: review Chapter 5 statistical mechanics primer.`;
        }
      });

      label.appendChild(radio);
      const span = document.createElement('span');
      span.textContent = opt.text;
      label.appendChild(span);
      list.appendChild(label);
    });

    card.appendChild(title);
    card.appendChild(text);
    card.appendChild(list);
    card.appendChild(feedback);
    container.appendChild(card);
  });
}

/* ==========================================================================
   10. CSV Data Export
   ========================================================================== */
function initExport() {
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    exportDatasetToCsv();
  });
}

function exportDatasetToCsv() {
  const evalData = state.walkEvaluation;
  let csv = '=== CURRENT POLYMER CONFIGURATION (FIG 5.6 MODEL) ===\n';
  csv += `Links (n),Link Length b (nm),Contour Length L (nm),End-to-End Length R (nm),Ratio R/L,Self-Avoiding\n`;
  csv += `${evalData.n},${evalData.b},${evalData.contourLength},${evalData.endToEndLength.toFixed(4)},${evalData.extensionRatio.toFixed(4)},${evalData.isSaw}\n\n`;

  csv += '=== HINGE NODE COORDINATES ===\n';
  csv += 'Node,X (b),Y (b)\n';
  evalData.coords.forEach((pt, i) => {
    csv += `${i},${pt.x},${pt.y}\n`;
  });
  csv += '\n';

  if (state.exhaustiveData) {
    csv += `=== EXHAUSTIVE DENSITY OF STATES (n = ${state.exhaustiveData.n}) ===\n`;
    csv += 'R (b),Microstates Omega(R),Probability P(R),Entropy S(R)/kB\n';
    state.exhaustiveData.densityOfStates.forEach(d => {
      csv += `${d.r.toFixed(4)},${d.count},${d.probability.toFixed(6)},${d.entropyOverKb.toFixed(4)}\n`;
    });
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Polymer_Statistical_Mechanics_n${evalData.n}_data.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
