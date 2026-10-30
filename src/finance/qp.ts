/**
 * A small dense solver for convex quadratic programs, minimise ½x′Px + q′x subject to l ≤ Ax ≤ u, by the alternating
 * direction method of multipliers as OSQP runs it (Stellato et al., 2020): one Cholesky factor of P + σI + A′ρA per
 * problem, then cheap iterations; equality rows get a larger step ρ. Meant for the back-test's daily problems of a few
 * dozen variables, warm-started from the day before.
 */

export interface QP {
  /** n × n, symmetric positive semidefinite. */
  P: number[][];
  q: number[];
  /** m × n. */
  A: number[][];
  l: number[];
  u: number[];
}

export interface QPResult {
  x: number[];
  /** Ax at the solution (the constraint values). */
  z: number[];
  /** Multipliers of the constraints. */
  y: number[];
  iterations: number;
  status: 'solved' | 'max-iterations' | 'infeasible';
}

export interface QPOptions {
  epsAbs?: number;
  epsRel?: number;
  maxIter?: number;
  rho?: number;
  sigma?: number;
  alpha?: number;
  warm?: { x: number[]; z: number[]; y: number[] };
}

/** Cholesky factor L (lower) of a symmetric positive definite matrix; null when it is not. */
export function cholesky(m: number[][]): number[][] | null {
  const n = m.length;
  const L = m.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = m[i][j];
      for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
      if (i === j) {
        if (!(s > 0)) return null;
        L[i][i] = Math.sqrt(s);
      } else L[i][j] = s / L[j][j];
    }
  }
  return L;
}

/** Solves L·L′·x = b. */
export function cholSolve(L: number[][], b: number[]): number[] {
  const n = b.length;
  const y = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    let s = b[i];
    for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
    y[i] = s / L[i][i];
  }
  const x = new Array<number>(n);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i];
    for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
    x[i] = s / L[i][i];
  }
  return x;
}

const inf = (v: number[]) => v.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

export function solveQP(p: QP, o: QPOptions = {}): QPResult {
  const n = p.q.length;
  const m = p.l.length;
  const epsAbs = o.epsAbs ?? 1e-8;
  const epsRel = o.epsRel ?? 1e-8;
  const maxIter = o.maxIter ?? 20000;
  const sigma = o.sigma ?? 1e-6;
  const alpha = o.alpha ?? 1.6;
  let rho0 = o.rho ?? 0.1;
  // OSQP's rule: a thousand times the step on equality rows, a tiny one on rows with no bounds.
  const rhoOf = (base: number) => p.l.map((lo, i) => (lo === p.u[i] ? base * 1e3 : lo === -Infinity && p.u[i] === Infinity ? 1e-6 : base));
  let rho = rhoOf(rho0);
  const factor = () => {
    const K = p.P.map((row, i) => row.map((v, j) => v + (i === j ? sigma : 0)));
    for (let r = 0; r < m; r++) {
      const a = p.A[r];
      for (let i = 0; i < n; i++) {
        if (!a[i]) continue;
        for (let j = 0; j < n; j++) if (a[j]) K[i][j] += rho[r] * a[i] * a[j];
      }
    }
    return cholesky(K);
  };
  let L = factor();
  if (!L) return { x: new Array(n).fill(NaN), z: new Array(m).fill(NaN), y: new Array(m).fill(NaN), iterations: 0, status: 'infeasible' };
  let x = o.warm?.x.length === n ? [...o.warm.x] : new Array<number>(n).fill(0);
  let z = o.warm?.z.length === m ? [...o.warm.z] : new Array<number>(m).fill(0);
  let y = o.warm?.y.length === m ? [...o.warm.y] : new Array<number>(m).fill(0);
  const Ax = (v: number[]) => p.A.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
  const ATy = (v: number[]) => {
    const out = new Array<number>(n).fill(0);
    for (let r = 0; r < m; r++) if (v[r]) for (let j = 0; j < n; j++) out[j] += p.A[r][j] * v[r];
    return out;
  };
  const Px = (v: number[]) => p.P.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
  for (let it = 1; it <= maxIter; it++) {
    const rhs = ATy(z.map((zi, r) => rho[r] * zi - y[r])).map((v, j) => v + sigma * x[j] - p.q[j]);
    const xt = cholSolve(L, rhs);
    const zt = Ax(xt);
    const xn = xt.map((v, j) => alpha * v + (1 - alpha) * x[j]);
    const zr = zt.map((v, r) => alpha * v + (1 - alpha) * z[r]);
    const zn = zr.map((v, r) => Math.min(p.u[r], Math.max(p.l[r], v + y[r] / rho[r])));
    y = y.map((v, r) => v + rho[r] * (zr[r] - zn[r]));
    x = xn;
    z = zn;
    if (it % 25 === 0 || it === maxIter) {
      const ax = Ax(x);
      const px = Px(x);
      const aty = ATy(y);
      const prim = inf(ax.map((v, r) => v - z[r]));
      const dual = inf(px.map((v, j) => v + p.q[j] + aty[j]));
      const primScale = Math.max(inf(ax), inf(z));
      const dualScale = Math.max(inf(px), inf(aty), inf(p.q));
      if (prim <= epsAbs + epsRel * primScale && dual <= epsAbs + epsRel * dualScale) return { x, z, y, iterations: it, status: 'solved' };
      // OSQP's adaptive step: balance the two residuals, refactoring only when the step moves five-fold.
      const next = Math.min(1e6, Math.max(1e-6, rho0 * Math.sqrt((prim / Math.max(primScale, 1e-30)) / Math.max(dual / Math.max(dualScale, 1e-30), 1e-30))));
      if (Number.isFinite(next) && (next > 5 * rho0 || next < rho0 / 5)) {
        rho0 = next;
        rho = rhoOf(rho0);
        L = factor() ?? L;
      }
    }
  }
  return { x, z, y, iterations: maxIter, status: 'max-iterations' };
}
