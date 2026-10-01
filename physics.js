/**
 * Polymer Statistical Mechanics Engine
 * Jacobs, Huang, and Kwon - Chapter 5: Statistical Mechanics Primer
 * 
 * Provides:
 * 1. 2D Square Lattice polymer enumeration & metrics (Fig 5.6 model)
 * 2. 1D Polymer walk (Straight vs Hairpin / Forward vs Backward)
 * 3. Continuous 2D / 3D Freely Jointed Chain (FJC) Monte Carlo
 * 4. Self-Avoiding Walk (SAW) exclusion
 * 5. Density of States Omega(R), Probability P(R), Boltzmann Entropy S(R)
 * 6. Tensile force-extension & canonical ensemble Boltzmann weighting
 */

export const DIRECTIONS_2D = [
  { name: 'Right', symbol: '→', dx: 1, dy: 0, code: 'R' },
  { name: 'Up',    symbol: '↑', dx: 0, dy: 1, code: 'U' },
  { name: 'Left',  symbol: '←', dx: -1, dy: 0, code: 'L' },
  { name: 'Down',  symbol: '↓', dx: 0, dy: -1, code: 'D' }
];

export const DIR_LOOKUP = {
  'R': { dx: 1, dy: 0, symbol: '→' },
  'U': { dx: 0, dy: 1, symbol: '↑' },
  'L': { dx: -1, dy: 0, symbol: '←' },
  'D': { dx: 0, dy: -1, symbol: '↓' }
};

/**
 * Evaluates a single polymer walk configuration
 * @param {Array<string|object>} steps - Array of direction codes ('R','U','L','D') or objects with dx, dy
 * @param {number} b - Link length (nm or arbitrary units, default 1)
 * @returns {object} Geometric & topological metrics
 */
export function evaluatePolymerWalk(steps, b = 1.0) {
  const coords = [{ x: 0, y: 0 }];
  let curX = 0;
  let curY = 0;
  let isSaw = true;
  const visited = new Set(['0,0']);
  const selfIntersections = [];

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const dx = typeof s === 'string' ? DIR_LOOKUP[s].dx : s.dx;
    const dy = typeof s === 'string' ? DIR_LOOKUP[s].dy : s.dy;

    curX += dx * b;
    curY += dy * b;

    const key = `${Math.round(curX * 1e4) / 1e4},${Math.round(curY * 1e4) / 1e4}`;
    if (visited.has(key)) {
      isSaw = false;
      selfIntersections.push({ x: curX, y: curY, stepIndex: i + 1 });
    }
    visited.add(key);
    coords.push({ x: curX, y: curY });
  }

  const n = steps.length;
  const contourLength = n * b;
  const endX = curX;
  const endY = curY;
  const r2 = endX * endX + endY * endY;
  const endToEndLength = Math.sqrt(r2);
  const extensionRatio = contourLength > 0 ? endToEndLength / contourLength : 0;

  return {
    n,
    b,
    coords,
    contourLength,
    endX,
    endY,
    endToEndLength,
    r2,
    extensionRatio,
    isSaw,
    selfIntersections
  };
}

/**
 * Exhaustively enumerates all 4^n microstates for small 2D lattice polymer chains
 * @param {number} n - Number of links (typically 1 to 8)
 * @param {number} b - Link length
 * @param {boolean} filterSaw - If true, only include self-avoiding walks
 * @returns {object} Microstates array, Density of States histogram, and ensemble averages
 */
export function enumerate2DLattice(n, b = 1.0, filterSaw = false) {
  const microstates = [];
  const rGroupMap = new Map(); // key: rounded R -> array of states
  const r2GroupMap = new Map();

  function recurse(currentSteps, currentX, currentY, visitedCoords) {
    if (currentSteps.length === n) {
      const r2 = currentX * currentX + currentY * currentY;
      const r = Math.sqrt(r2);
      const roundedR = Math.round(r * 1e4) / 1e4;
      const roundedR2 = Math.round(r2 * 1e4) / 1e4;

      const state = {
        id: microstates.length,
        steps: [...currentSteps],
        x: currentX,
        y: currentY,
        r,
        r2,
        roundedR,
        roundedR2,
        isSaw: visitedCoords.size === n + 1
      };

      if (!filterSaw || state.isSaw) {
        microstates.push(state);

        if (!rGroupMap.has(roundedR)) {
          rGroupMap.set(roundedR, []);
        }
        rGroupMap.get(roundedR).push(state);

        if (!r2GroupMap.has(roundedR2)) {
          r2GroupMap.set(roundedR2, []);
        }
        r2GroupMap.get(roundedR2).push(state);
      }
      return;
    }

    for (let d = 0; d < DIRECTIONS_2D.length; d++) {
      const dir = DIRECTIONS_2D[d];
      const nextX = currentX + dir.dx * b;
      const nextY = currentY + dir.dy * b;
      const key = `${Math.round(nextX * 1e4) / 1e4},${Math.round(nextY * 1e4) / 1e4}`;

      if (filterSaw && visitedCoords.has(key)) {
        continue; // Prune non-self-avoiding branches early for speed
      }

      const nextVisited = new Set(visitedCoords);
      nextVisited.add(key);

      currentSteps.push(dir.code);
      recurse(currentSteps, nextX, nextY, nextVisited);
      currentSteps.pop();
    }
  }

  const initialVisited = new Set(['0,0']);
  recurse([], 0, 0, initialVisited);

  const totalStates = microstates.length;

  // Build sorted Density of States (DOS) array
  const sortedRValues = Array.from(rGroupMap.keys()).sort((a, b) => a - b);
  const densityOfStates = sortedRValues.map(rVal => {
    const states = rGroupMap.get(rVal);
    const count = states.length;
    const probability = totalStates > 0 ? count / totalStates : 0;
    const entropyOverKb = count > 0 ? Math.log(count) : 0; // S / k_B = ln(Omega)

    return {
      r: rVal,
      count, // Omega(R)
      probability,
      entropyOverKb,
      sampleStates: states.slice(0, 24), // store first 24 samples for gallery
      allStates: states
    };
  });

  // Calculate ensemble averages
  let sumR = 0;
  let sumR2 = 0;
  let maxEntropy = 0;
  let mostProbableR = 0;
  let maxCount = 0;

  for (const dos of densityOfStates) {
    sumR += dos.r * dos.count;
    sumR2 += dos.r * dos.r * dos.count;
    if (dos.count > maxCount) {
      maxCount = dos.count;
      mostProbableR = dos.r;
      maxEntropy = dos.entropyOverKb;
    }
  }

  const meanR = totalStates > 0 ? sumR / totalStates : 0;
  const meanR2 = totalStates > 0 ? sumR2 / totalStates : 0;
  const rmsR = Math.sqrt(meanR2);
  const varianceR = meanR2 - meanR * meanR;
  const stdDevR = Math.sqrt(Math.max(0, varianceR));
  const theoreticalIdealRms = Math.sqrt(n) * b;

  return {
    n,
    b,
    filterSaw,
    totalStates, // Omega_total
    densityOfStates, // Array of { r, count, probability, entropyOverKb, sampleStates }
    meanR,
    meanR2,
    rmsR,
    stdDevR,
    theoreticalIdealRms,
    mostProbableR,
    maxCount,
    maxEntropy,
    contourLength: n * b,
    microstates
  };
}

/**
 * Exhaustive enumeration for 1D polymer model (Jacobs Slide 14)
 * Links either point right (+b) or left (-b) [Straight vs Hairpin]
 * @param {number} n - Number of links
 * @param {number} b - Link length
 */
export function enumerate1DPolymer(n, b = 1.0) {
  const densityOfStates = [];
  const totalStates = Math.pow(2, n);
  let sumR = 0;
  let sumR2 = 0;

  // Binomial: k steps forward (+b), (n-k) steps backward (-b)
  // End-to-end position X = (2k - n)*b, R = |X|
  const rMap = new Map();

  for (let k = 0; k <= n; k++) {
    const ways = binomialCoeff(n, k);
    const x = (2 * k - n) * b;
    const r = Math.abs(x);
    const roundedR = Math.round(r * 1e4) / 1e4;

    if (!rMap.has(roundedR)) {
      rMap.set(roundedR, { count: 0, xValues: [] });
    }
    const entry = rMap.get(roundedR);
    entry.count += ways;
    entry.xValues.push({ k, ways, x });
  }

  const sortedR = Array.from(rMap.keys()).sort((a, b) => a - b);
  for (const r of sortedR) {
    const entry = rMap.get(r);
    const count = entry.count;
    const prob = count / totalStates;
    const entropy = Math.log(count);
    sumR += r * count;
    sumR2 += r * r * count;

    densityOfStates.push({
      r,
      count,
      probability: prob,
      entropyOverKb: entropy,
      xValues: entry.xValues
    });
  }

  const meanR = sumR / totalStates;
  const meanR2 = sumR2 / totalStates;
  const rmsR = Math.sqrt(meanR2);
  const theoreticalIdealRms = Math.sqrt(n) * b;

  return {
    n,
    b,
    totalStates,
    densityOfStates,
    meanR,
    meanR2,
    rmsR,
    theoreticalIdealRms,
    contourLength: n * b
  };
}

/**
 * Fast Monte Carlo Ensemble Simulation for large n (e.g. n = 5 to 500)
 * @param {object} options - Simulation parameters
 * @returns {object} Empirical distribution and statistical metrics
 */
export function runMonteCarloSimulation({
  n = 20,
  b = 1.0,
  samples = 5000,
  model = '2d-lattice', // '2d-lattice' | '2d-continuous' | '3d-continuous' | '2d-saw'
  numBins = 30
}) {
  const rValues = new Float64Array(samples);
  const xValues = new Float64Array(samples);
  const yValues = new Float64Array(samples);
  let validSamples = 0;
  let attempts = 0;
  const maxAttempts = model === '2d-saw' ? samples * 20 : samples;

  let sumR = 0;
  let sumR2 = 0;
  let maxR = 0;
  let minR = Infinity;

  // Single sample trajectory storage for live animation display
  let lastTrajectory = null;

  while (validSamples < samples && attempts < maxAttempts) {
    attempts++;
    let curX = 0;
    let curY = 0;
    let curZ = 0;
    const trajectory = [{ x: 0, y: 0, z: 0 }];
    let isSaw = true;
    const visited = model === '2d-saw' ? new Set(['0,0']) : null;

    for (let step = 0; step < n; step++) {
      let dx = 0;
      let dy = 0;
      let dz = 0;

      if (model === '2d-lattice' || model === '2d-saw') {
        const dir = DIRECTIONS_2D[Math.floor(Math.random() * 4)];
        dx = dir.dx * b;
        dy = dir.dy * b;
      } else if (model === '2d-continuous') {
        const theta = Math.random() * 2 * Math.PI;
        dx = b * Math.cos(theta);
        dy = b * Math.sin(theta);
      } else if (model === '3d-continuous') {
        // Uniform sphere sampling
        const u = Math.random() * 2 - 1;
        const phi = Math.random() * 2 * Math.PI;
        const sqrt1u2 = Math.sqrt(1 - u * u);
        dx = b * sqrt1u2 * Math.cos(phi);
        dy = b * sqrt1u2 * Math.sin(phi);
        dz = b * u;
      }

      curX += dx;
      curY += dy;
      curZ += dz;

      if (model === '2d-saw') {
        const key = `${Math.round(curX * 1e4) / 1e4},${Math.round(curY * 1e4) / 1e4}`;
        if (visited.has(key)) {
          isSaw = false;
          break;
        }
        visited.add(key);
      }

      trajectory.push({ x: curX, y: curY, z: curZ });
    }

    if (model === '2d-saw' && !isSaw) {
      continue; // Discard non-SAW walk
    }

    const r2 = curX * curX + curY * curY + curZ * curZ;
    const r = Math.sqrt(r2);

    rValues[validSamples] = r;
    xValues[validSamples] = curX;
    yValues[validSamples] = curY;

    sumR += r;
    sumR2 += r2;
    if (r > maxR) maxR = r;
    if (r < minR) minR = r;

    lastTrajectory = trajectory;
    validSamples++;
  }

  const effectiveSamples = validSamples;
  const meanR = effectiveSamples > 0 ? sumR / effectiveSamples : 0;
  const meanR2 = effectiveSamples > 0 ? sumR2 / effectiveSamples : 0;
  const rmsR = Math.sqrt(meanR2);
  const theoreticalIdealRms = Math.sqrt(n) * b;

  // Build histogram
  const contourLength = n * b;
  const binMax = Math.min(contourLength, Math.max(maxR * 1.05, theoreticalIdealRms * 2.2));
  const binWidth = binMax / numBins;
  const bins = [];

  for (let i = 0; i < numBins; i++) {
    bins.push({
      binStart: i * binWidth,
      binEnd: (i + 1) * binWidth,
      binCenter: (i + 0.5) * binWidth,
      count: 0,
      frequency: 0,
      theoreticalPdf: 0
    });
  }

  for (let s = 0; s < effectiveSamples; s++) {
    const r = rValues[s];
    let binIdx = Math.floor(r / binWidth);
    if (binIdx >= numBins) binIdx = numBins - 1;
    if (binIdx >= 0) bins[binIdx].count++;
  }

  // Calculate frequencies and theoretical 2D Rayleigh or 3D Maxwell-Boltzmann distribution
  for (let i = 0; i < numBins; i++) {
    const bCenter = bins[i].binCenter;
    bins[i].frequency = effectiveSamples > 0 ? bins[i].count / effectiveSamples : 0;

    if (model === '2d-lattice' || model === '2d-continuous') {
      // 2D Rayleigh distribution: P(R) = (2R / (n*b^2)) * exp(-R^2 / (n*b^2))
      const scale = n * b * b;
      bins[i].theoreticalPdf = (2 * bCenter / scale) * Math.exp(-(bCenter * bCenter) / scale) * binWidth;
    } else if (model === '3d-continuous') {
      // 3D Maxwell-like distribution for end-to-end vector magnitude:
      // P(R) dR = 4*pi*R^2 * (3 / (2*pi*n*b^2))^(3/2) * exp(-3*R^2 / (2*n*b^2)) dR
      const coeff = Math.pow(3 / (2 * Math.PI * n * b * b), 1.5) * 4 * Math.PI;
      bins[i].theoreticalPdf = coeff * (bCenter * bCenter) * Math.exp(-3 * bCenter * bCenter / (2 * n * b * b)) * binWidth;
    } else {
      // SAW has Flory exponent nu ≈ 0.75 in 2D
      bins[i].theoreticalPdf = null;
    }
  }

  return {
    n,
    b,
    model,
    samplesRequested: samples,
    samplesCompleted: effectiveSamples,
    meanR,
    meanR2,
    rmsR,
    minR,
    maxR,
    theoreticalIdealRms,
    percentDifference: ((rmsR - theoreticalIdealRms) / theoreticalIdealRms) * 100,
    bins,
    binWidth,
    lastTrajectory
  };
}

/**
 * Canonical Ensemble Tensile Force-Extension Simulation
 * Applies external tensile force Fx along the x-axis with thermal energy k_B * T
 * Probability of microstate i: P_i = exp(Fx * X_i / (k_B * T)) / Z
 * @param {Array<object>} microstates - Precomputed microstates from enumerate2DLattice
 * @param {number} forceUnits - Force in units of (k_B * T / b)
 * @param {number} tempK - Temperature in Kelvin (default 300K, sets energy scale)
 * @param {number} b - Link length
 */
export function evaluateForceExtension(microstates, forceUnits, tempK = 300, b = 1.0) {
  if (!microstates || microstates.length === 0) return null;

  // Boltzman constant in J/K (not strictly needed if force is in units of k_B*T/b)
  let sumWeights = 0;
  let sumWeightedX = 0;
  let sumWeightedR = 0;

  // For numerical stability with large forces, find max exponent
  let maxExp = -Infinity;
  for (let i = 0; i < microstates.length; i++) {
    const exponent = forceUnits * (microstates[i].x / b);
    if (exponent > maxExp) maxExp = exponent;
  }

  for (let i = 0; i < microstates.length; i++) {
    const st = microstates[i];
    const weight = Math.exp(forceUnits * (st.x / b) - maxExp);
    sumWeights += weight;
    sumWeightedX += st.x * weight;
    sumWeightedR += st.r * weight;
  }

  const avgExtensionX = sumWeightedX / sumWeights;
  const avgR = sumWeightedR / sumWeights;
  const contourLength = microstates[0].steps.length * b;
  const relativeExtension = contourLength > 0 ? avgExtensionX / contourLength : 0;

  // Theoretical small-force linear spring constant in 2D:
  // <X> = (n * b^2 / (2 * k_B * T)) * F  =>  F = (2 * k_B * T / (n * b^2)) * <X>
  const n = microstates[0].steps.length;
  const entropicSpringConstant = 2 / (n * b); // in units of (k_B T / b) per b

  return {
    forceUnits,
    tempK,
    avgExtensionX,
    avgR,
    relativeExtension,
    contourLength,
    n,
    entropicSpringConstant
  };
}

/**
 * Evaluates the full force-extension curve across multiple forces
 * @param {Array<object>} microstates - Precomputed states
 * @param {number} maxForce - Maximum force in units of k_B*T/b
 * @param {number} steps - Number of curve points
 */
export function generateForceExtensionCurve(microstates, maxForce = 5.0, steps = 25) {
  const curve = [];
  const deltaF = maxForce / steps;

  for (let i = 0; i <= steps; i++) {
    const f = i * deltaF;
    const res = evaluateForceExtension(microstates, f);
    if (res) {
      curve.push({
        force: f,
        extensionX: res.avgExtensionX,
        relativeExtension: res.relativeExtension,
        avgR: res.avgR
      });
    }
  }

  return curve;
}

/**
 * Binomial coefficient helper: n choose k
 */
function binomialCoeff(n, k) {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let c = 1;
  for (let i = 1; i <= k; i++) {
    c = (c * (n - (k - i))) / i;
  }
  return c;
}
