// SVG overlay primitives. All coordinates are in source-video pixels; `k` scales them to the output size.
// Shapes reference keypoints by name (e.g. "shoulder") or by literal [x, y].

const COLORS = { good: '#34d399', bad: '#f87171', warn: '#fbbf24', force: '#38bdf8', line: '#ffffff' };
const FONT = 'Microsoft YaHei, PingFang SC, Noto Sans SC, sans-serif';

const col = (c) => COLORS[c] || c || COLORS.line;
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// rough text width: CJK ≈ 1em, ASCII ≈ 0.58em
const textWidth = (text, size) => [...String(text)].reduce((a, ch) => a + (/[\x00-\xff]/.test(ch) ? 0.58 : 1.02), 0) * size;

function painter(k, kp = {}, ui = 1) {
  const s = (v) => v * k;
  const P = (p) => {
    const v = typeof p === 'string' ? kp[p] : p;
    if (!v) throw new Error(`unknown keypoint: ${JSON.stringify(p)}`);
    return v;
  };
  const dashAttr = (dash, w) => (dash ? `stroke-dasharray="${dash.split(',').map((d) => d * k * ui).join(',')}"` : '');
  const shadowed = (el, w) => el.replace('/>', ` stroke-opacity=".45" stroke="#000" stroke-width="${(w + 5) * k * ui}"/>`);

  const api = {
    line({ from, to, color, width = 6, dash = '' }) {
      const [x1, y1] = P(from), [x2, y2] = P(to);
      const base = `<line x1="${s(x1)}" y1="${s(y1)}" x2="${s(x2)}" y2="${s(y2)}" stroke-linecap="round" ${dashAttr(dash)}/>`;
      return shadowed(base, width) + base.replace('/>', ` stroke="${col(color)}" stroke-width="${width * k * ui}"/>`);
    },
    // horizontal reference line through a keypoint (or y)
    hline({ at, x1 = 0, x2, color = 'warn', width = 3, dash = '14,10', W }) {
      const y = typeof at === 'number' ? at : P(at)[1];
      return api.line({ from: [x1, y], to: [x2 ?? W, y], color, width, dash });
    },
    // vertical plumb line through a keypoint
    vline({ at, y1, y2, color = 'line', width = 3, dash = '10,10' }) {
      const x = typeof at === 'number' ? at : P(at)[0];
      return api.line({ from: [x, y1], to: [x, y2], color, width, dash });
    },
    dot({ at, color = 'force', r = 11 }) {
      const [x, y] = P(at);
      return `<circle cx="${s(x)}" cy="${s(y)}" r="${s(r + 4) * ui}" fill="#000" fill-opacity=".45"/>` +
        `<circle cx="${s(x)}" cy="${s(y)}" r="${s(r) * ui}" fill="${col(color)}" stroke="#fff" stroke-width="${3 * k * ui}"/>`;
    },
    ring({ at, r = 34, color = 'bad', dash = '' }) {
      const [x, y] = P(at);
      return `<circle cx="${s(x)}" cy="${s(y)}" r="${s(r)}" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="${9 * k * ui}"/>` +
        `<circle cx="${s(x)}" cy="${s(y)}" r="${s(r)}" fill="none" stroke="${col(color)}" stroke-width="${5 * k * ui}" ${dashAttr(dash)}/>`;
    },
    arrow({ from, to, color = 'bad', width = 6, head = 22 }) {
      const [x1, y1] = P(from), [x2, y2] = P(to);
      const a = Math.atan2(y2 - y1, x2 - x1), h = head * ui;
      const pt = (da) => `${s(x2 - h * Math.cos(a + da))},${s(y2 - h * Math.sin(a + da))}`;
      return api.line({ from, to: [x2 - h * 0.6 * Math.cos(a), y2 - h * 0.6 * Math.sin(a)], color, width }) +
        `<polygon points="${s(x2)},${s(y2)} ${pt(0.5)} ${pt(-0.5)}" fill="${col(color)}" stroke="#000" stroke-opacity=".4" stroke-width="${2 * k}"/>`;
    },
    // pill label with optional number badge; anchor: start | end
    label({ at, text, color = 'line', size = 26, num = null, anchor = 'start' }) {
      const [x, y] = P(at);
      const fs = size * k * ui, padX = 14 * k * ui, h = fs + 18 * k * ui;
      const w = textWidth(text, fs) + padX * 2 + (num != null ? h : 0);
      const x0 = anchor === 'end' ? s(x) - w : s(x), y0 = s(y) - h / 2;
      let g = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" rx="${h / 2}" fill="#0b0f17" fill-opacity=".82" stroke="${col(color)}" stroke-width="${2.5 * k * ui}"/>`;
      let tx = x0 + padX;
      if (num != null) {
        g += `<circle cx="${x0 + h / 2}" cy="${s(y)}" r="${h / 2 - 5 * k * ui}" fill="${col(color)}"/>` +
          `<text x="${x0 + h / 2}" y="${s(y) + fs * 0.36}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${fs * 0.85}" fill="#0b0f17">${esc(num)}</text>`;
        tx = x0 + h + 4 * k * ui;
      }
      return g + `<text x="${tx}" y="${s(y) + fs * 0.36}" font-family="${FONT}" font-weight="600" font-size="${fs}" fill="#fff">${esc(text)}</text>`;
    },
    progress({ frac, color = 'force', W, H }) {
      const h = Math.max(4, 12 * k);
      return `<rect x="0" y="${s(H) - h}" width="${s(W)}" height="${h}" fill="#000" fill-opacity=".5"/>` +
        `<rect x="0" y="${s(H) - h}" width="${s(W) * frac}" height="${h}" fill="${col(color)}"/>`;
    },
  };
  // render a list of shape specs: [{type:'line', ...}, ...]
  api.render = (shapes = [], ctx = {}) =>
    shapes.map((sh) => {
      const fn = api[sh.type];
      if (!fn) throw new Error(`unknown shape type: ${sh.type}`);
      return fn({ ...ctx, ...sh });
    }).join('');
  return api;
}

const svg = (w, h, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${body}</svg>`);

module.exports = { painter, svg, COLORS, esc };
