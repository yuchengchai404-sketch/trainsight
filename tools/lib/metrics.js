// Turn keypoints and rep timings into comparable numbers.
// Angles are camera-distance invariant, so they compare across videos as long as the view is the same side.

const deg = (r) => (r * 180) / Math.PI;
const round1 = (v) => Math.round(v * 10) / 10;

const KINDS = {
  // angle of segment a->b away from vertical, 0 = perfectly stacked
  angle_vertical: ([ax, ay], [bx, by]) => deg(Math.atan2(Math.abs(bx - ax), Math.abs(by - ay))),
  // signed angle of segment a->b vs horizontal; positive when b is ABOVE a (image y grows downward)
  angle_horizontal_signed: ([ax, ay], [bx, by]) => deg(Math.atan2(ay - by, Math.abs(bx - ax))),
  // inner joint angle at b formed by a-b-c
  joint_angle: (a, b, c) => {
    const v1 = [a[0] - b[0], a[1] - b[1]], v2 = [c[0] - b[0], c[1] - b[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2));
    return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
  },
};

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const TEMPO = {
  reps: (reps) => reps.length,
  con_avg: (reps) => avg(reps.map((r) => r.con)),
  ecc_avg: (reps) => avg(reps.map((r) => r.ecc)),
  // ecc of all but a final dropped rep — the typical lowering speed
  ecc_typical: (reps) => avg(reps.slice(0, -1).map((r) => r.ecc)),
  ecc_min: (reps) => Math.min(...reps.map((r) => r.ecc)),
  // last concentric vs. mean of reps 2-4 (rep 1 starts from a dead stop)
  velocity_loss_pct: (reps) => {
    const base = avg(reps.slice(1, 4).map((r) => r.con));
    return base ? (1 - base / reps[reps.length - 1].con) * 100 : null;
  },
};

// exerciseDef.metrics: [{id, kind, still, points:[...]} | {id, kind:'tempo', fn}]
function compute(exerciseDef, review) {
  const out = {};
  for (const m of exerciseDef.metrics) {
    let v = null;
    if (m.kind === 'tempo') v = review.reps?.length ? TEMPO[m.fn](review.reps) : null;
    else if (m.kind === 'manual') v = review.manual?.[m.id] ?? null;
    else {
      const st = review.stills.find((s) => s.id === m.still);
      const pts = st && m.points.map((p) => st.keypoints?.[p]);
      if (pts && pts.every(Boolean)) v = KINDS[m.kind](...pts);
    }
    out[m.id] = v == null || Number.isNaN(v) ? null : round1(v);
  }
  return out;
}

// grade a value against a metric's target → 'good' | 'warn' | 'bad'
function grade(m, v) {
  if (v == null || !m.target) return null;
  const [lo, hi] = m.target;
  if (v >= lo && v <= hi) return 'good';
  const tol = m.tolerance ?? (hi - lo) * 0.5;
  return v >= lo - tol && v <= hi + tol ? 'warn' : 'bad';
}

module.exports = { compute, grade, KINDS };
