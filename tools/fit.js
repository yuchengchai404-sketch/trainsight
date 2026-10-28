#!/usr/bin/env node
// Training-video review pipeline.
//   node fit.js new <video> [--exercise id] [--date YYYY-MM-DD]   create a session (moves files out of inbox/)
//   node fit.js sheet <id> [--start s --end s --fps n --cols n --rows n --thumb px]   timestamped contact sheet
//   node fit.js frame <id> <t> [<t> ...] [--grid]                  full-res frames (+ coordinate grid) into work/
//   node fit.js render <id>                                          annotated media + review page for one session
//   node fit.js build                                                render every session + the progress page
//   node fit.js list                                                 sessions and exercises
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { painter, svg } = require('./lib/draw');
const media = require('./lib/media');
const { compute } = require('./lib/metrics');
const { sessionPage, progressPage } = require('./templates/pages');

const ROOT = path.resolve(__dirname, '..');
const DIR = { inbox: path.join(ROOT, 'inbox'), sessions: path.join(ROOT, 'sessions'), ex: path.join(ROOT, 'exercises'), site: path.join(ROOT, 'site') };

const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJSON = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n', 'utf8');
const sessDir = (id) => path.join(DIR.sessions, id);
const workDir = (id) => { const d = path.join(sessDir(id), 'work'); fs.mkdirSync(d, { recursive: true }); return d; };
const loadReview = (id) => readJSON(path.join(sessDir(id), 'review.json'));
const loadEx = (id) => readJSON(path.join(DIR.ex, id + '.json'));
const allSessions = () => fs.existsSync(DIR.sessions)
  ? fs.readdirSync(DIR.sessions).filter((d) => fs.existsSync(path.join(sessDir(d), 'review.json'))).map(loadReview).sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id))
  : [];

function args(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { const k = argv[i].slice(2); opt[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
    else pos.push(argv[i]);
  }
  return { pos, opt };
}

// ---------------- new ----------------
function cmdNew([video], opt) {
  if (!video) throw new Error('usage: fit.js new <video> [--exercise id] [--date YYYY-MM-DD]');
  const src = path.resolve(video);
  const meta = media.probe(src);
  const date = opt.date || new Date(fs.statSync(src).mtime).toISOString().slice(0, 10);
  const ex = opt.exercise || 'unknown';
  let id = `${date}_${ex}`, n = 2;
  while (fs.existsSync(sessDir(id))) id = `${date}_${ex}-${n++}`;
  fs.mkdirSync(sessDir(id), { recursive: true });
  const dest = path.join(sessDir(id), 'video' + path.extname(src).toLowerCase());
  // files dropped in inbox/ are moved; anything else is copied so the original stays put
  if (path.dirname(src).toLowerCase() === DIR.inbox.toLowerCase()) fs.renameSync(src, dest);
  else fs.copyFileSync(src, dest);
  writeJSON(path.join(sessDir(id), 'review.json'), {
    id, date, exercise: ex, video: path.basename(dest), source: path.basename(src),
    videoMeta: { width: meta.width, height: meta.height, fps: Math.round(meta.fps), duration: Math.round(meta.duration * 100) / 100 },
    load: null, headline: '', summary: '', facts: [], verdict: [], reps: [], stills: [], gifs: [], hero: {}, sections: {},
  });
  const out = path.join(workDir(id), 'overview_%02d.jpg');
  media.sheet(dest, out, { fps: 2, cols: 8, rows: 3, thumb: 240 });
  console.log(`session ${id}\n  video ${meta.width}x${meta.height} ${meta.duration.toFixed(1)}s\n  overview sheets in ${workDir(id)}`);
}

// ---------------- sheet / frame ----------------
function cmdSheet([id], opt) {
  const r = loadReview(id), v = path.join(sessDir(id), r.video);
  const o = { start: +(opt.start || 0), end: opt.end != null ? +opt.end : undefined, fps: +(opt.fps || 4), cols: +(opt.cols || 10), rows: +(opt.rows || 2), thumb: +(opt.thumb || 180) };
  const out = path.join(workDir(id), `sheet_${o.start}_${o.end ?? 'end'}_${o.fps}fps_%02d.jpg`);
  media.sheet(v, out, o);
  console.log(fs.readdirSync(workDir(id)).filter((f) => f.startsWith(`sheet_${o.start}_${o.end ?? 'end'}_${o.fps}fps`)).map((f) => path.join(workDir(id), f)).join('\n'));
}

async function cmdFrame([id, ...times], opt) {
  const r = loadReview(id), v = path.join(sessDir(id), r.video);
  const { width: W, height: H } = r.videoMeta;
  for (const t of times) {
    const f = path.join(workDir(id), `t${t}.jpg`);
    media.frame(v, t, f);
    if (opt.grid) {
      let s = '';
      for (let x = 0; x <= W; x += 50) s += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="${x % 100 ? '#0ff8' : '#ff0c'}"/><text x="${x + 2}" y="14" font-size="12" fill="#ff0">${x}</text>`;
      for (let y = 0; y <= H; y += 50) s += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="${y % 100 ? '#0ff8' : '#ff0c'}"/><text x="2" y="${y - 2}" font-size="12" fill="#ff0">${y}</text>`;
      await sharp(f).composite([{ input: svg(W, H, s) }]).jpeg({ quality: 85 }).toFile(path.join(workDir(id), `t${t}_grid.jpg`));
    }
    console.log(path.join(workDir(id), `t${t}${opt.grid ? '_grid' : ''}.jpg`));
  }
}

// ---------------- render ----------------
const fill = (text, metrics) => String(text).replace(/\{(\w+)\}/g, (_, k) => (metrics[k] ?? '?'));
const fillShapes = (shapes = [], metrics) => shapes.map((s) => (s.text ? { ...s, text: fill(s.text, metrics) } : s));

async function renderStill(st, ctx) {
  const { video, W, H, work, out, metrics } = ctx;
  const file = path.join(out, st.id + '.jpg');
  if (st.type === 'strip') {
    const [cx, cy, cw, ch] = st.crop || [0, 0, W, H];
    const tw = st.thumbWidth || 260, th = Math.round((tw * ch) / cw), gap = 6;
    const tiles = [];
    for (const [i, t] of st.times.entries()) {
      const f = path.join(work, `strip_${st.id}_${t}.jpg`);
      media.frame(video, t, f);
      const p = painter(tw / cw);
      const lab = st.labels?.[i] ?? `${(t - st.times[0]).toFixed(1)}s`;
      const body = p.label({ at: [24, 70], text: lab, color: i === 0 ? 'warn' : st.color || 'bad', size: 40 });
      tiles.push(await sharp(f).extract({ left: cx, top: cy, width: cw, height: ch }).resize(tw, th).composite([{ input: svg(tw, th, body) }]).png().toBuffer());
    }
    const w = tiles.length * (tw + gap) - gap;
    await sharp({ create: { width: w, height: th, channels: 3, background: '#0b0f17' } })
      .composite(tiles.map((t, i) => ({ input: t, left: i * (tw + gap), top: 0 }))).jpeg({ quality: 84 }).toFile(file);
    return { src: `media/${st.id}.jpg`, w, h: th, tag: st.tag, alt: st.alt, kind: 'img' };
  }
  const raw = path.join(work, `still_${st.id}.jpg`);
  media.frame(video, st.t, raw);
  const [cx, cy, cw, ch] = st.crop || [0, 0, W, H];
  const z = st.zoom || 1, ow = Math.round(cw * z), oh = Math.round(ch * z);
  const p = painter(z, st.keypoints, st.ui || 1);
  const body = `<g transform="translate(${-cx * z},${-cy * z})">${p.render(fillShapes(st.shapes, metrics), { W, H })}</g>`;
  await sharp(raw).extract({ left: cx, top: cy, width: cw, height: ch }).resize(ow, oh).composite([{ input: svg(ow, oh, body) }]).jpeg({ quality: 84 }).toFile(file);
  return { src: `media/${st.id}.jpg`, w: ow, h: oh, tag: st.tag, alt: st.alt, kind: 'img' };
}

async function overlayFrames(files, fn, w, h) {
  for (let i = 0; i < files.length; i++) {
    await sharp(files[i]).composite([{ input: svg(w, h, fn(i, files.length)) }]).toFile(files[i].replace(/f(\d+)\.png$/, 'o$1.png'));
  }
}

async function renderGif(g, ctx) {
  const { video, W, H, work, out, metrics } = ctx;
  const file = path.join(out, g.id + '.gif');
  const fps = g.fps || 12;
  if (g.type === 'compare') {
    const width = g.width || 300, k = width / W, h = Math.round(H * k / 2) * 2;
    const dirs = [];
    for (const [side, c] of [['l', g.left], ['r', g.right]]) {
      const dir = path.join(work, `gif_${g.id}_${side}`);
      const files = media.framesFor(video, dir, { start: c.start, end: c.end, fps, width });
      const p = painter(k);
      await overlayFrames(files, (i, n) => p.label({ at: [24, 80], text: c.title, color: c.color, size: 40 }) +
        p.label({ at: [24, 170], text: fill(c.sub, metrics), color: c.color, size: 32 }) + p.progress({ frac: i / Math.max(1, n - 1), color: c.color, W, H }), width, h);
      dirs.push({ dir, n: files.length });
    }
    const [L, R] = dirs, pad = Math.abs(L.n - R.n);
    media.ff(['-framerate', String(fps), '-i', path.join(L.dir, 'o%04d.png'), '-framerate', String(fps), '-i', path.join(R.dir, 'o%04d.png'), '-filter_complex',
      `[0]tpad=stop_mode=clone:stop=${L.n < R.n ? pad : 0}[a];[1]tpad=stop_mode=clone:stop=${R.n < L.n ? pad : 0}[b];[a][b]hstack=2,split[x][y];[x]palettegen=max_colors=144:stats_mode=diff[p];[y][p]paletteuse=dither=bayer:bayer_scale=4`,
      '-loop', '0', file]);
    return { src: `media/${g.id}.gif`, w: width * 2, h, tag: g.tag, alt: g.alt, kind: 'gif' };
  }
  const width = g.width || 360, k = width / W, h = Math.round(H * k / 2) * 2, speed = g.speed || 1;
  const dir = path.join(work, `gif_${g.id}`);
  const files = media.framesFor(video, dir, { start: g.start, end: g.end, fps, speed, width });
  const p = painter(k, g.keypoints);
  const guides = p.render(fillShapes(g.guides, metrics), { W, H });
  await overlayFrames(files, (i, n) => {
    const t = g.start + (i * speed) / fps;
    const ph = (g.phases || []).find((x) => t >= x.from && t < x.to) || g.phases?.[g.phases.length - 1];
    let b = guides;
    for (const ev of g.events || []) if (t >= ev.from && t < ev.to) b += p.render(fillShapes(ev.shapes, metrics), { W, H });
    if (ph) b += p.label({ at: [30, 70], text: fill(ph.text, metrics), color: ph.color, size: 30 });
    if (speed !== 1) b += p.label({ at: [30, H - 60], text: `慢放 ${speed}×`, size: 22 });
    return b + p.progress({ frac: i / Math.max(1, n - 1), color: ph?.color || 'force', W, H });
  }, width, h);
  media.encodeGif(path.join(dir, 'o%04d.png'), fps, file);
  return { src: `media/${g.id}.gif`, w: width, h, tag: g.tag, alt: g.alt, kind: 'gif' };
}

// side-by-side of the same annotated still from the previous session and this one
async function renderCompare(sid, prev, cur, out) {
  const a = path.join(DIR.site, 's', prev.id, 'media', sid + '.jpg'), b = path.join(out, sid + '.jpg');
  if (!fs.existsSync(a) || !fs.existsSync(b)) return null;
  const tw = 420, head = 54, gap = 8;
  const tile = async (f, date, col) => {
    const img = await sharp(f).resize(tw).toBuffer(), { height } = await sharp(img).metadata();
    const p = painter(1);
    const lab = svg(tw, head, p.label({ at: [12, head / 2], text: date, color: col, size: 22 }));
    return { buf: await sharp({ create: { width: tw, height: height + head, channels: 3, background: '#0b0f17' } })
      .composite([{ input: lab, left: 0, top: 0 }, { input: img, left: 0, top: head }]).png().toBuffer(), h: height + head };
  };
  const [ta, tb] = [await tile(a, '上次 ' + prev.date, 'line'), await tile(b, '本次 ' + cur.date, 'force')];
  const h = Math.max(ta.h, tb.h), w = tw * 2 + gap;
  const file = path.join(out, `cmp_${sid}.jpg`);
  await sharp({ create: { width: w, height: h, channels: 3, background: '#0b0f17' } })
    .composite([{ input: ta.buf, left: 0, top: 0 }, { input: tb.buf, left: tw + gap, top: 0 }]).jpeg({ quality: 84 }).toFile(file);
  return { src: `media/cmp_${sid}.jpg`, w, h, tag: `对比 · ${sid}`, alt: `${sid} 位置前后对比`, kind: 'img' };
}

async function cmdRender([id], { quiet } = {}) {
  const r = loadReview(id), exDef = loadEx(r.exercise);
  const video = path.join(sessDir(id), r.video);
  const W = r.videoMeta.width, H = r.videoMeta.height;
  const out = path.join(DIR.site, 's', id, 'media');
  fs.rmSync(path.join(DIR.site, 's', id), { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  const metrics = compute(exDef, r);
  const ctx = { video, W, H, work: workDir(id), out, metrics };
  const M = {};
  for (const st of r.stills || []) M[st.id] = await renderStill(st, ctx);
  for (const g of r.gifs || []) M[g.id] = await renderGif(g, ctx);

  const prevReview = allSessions().filter((s) => s.exercise === r.exercise && (s.date + s.id) < (r.date + r.id)).pop();
  let prev = null;
  r.compareMedia = [];
  if (prevReview) {
    prev = { review: prevReview, metrics: compute(exDef, prevReview) };
    for (const sid of exDef.compareStills || []) {
      const m = await renderCompare(sid, prevReview, r, out);
      if (m) { M['cmp_' + sid] = m; r.compareMedia.push('cmp_' + sid); }
    }
  }
  fs.writeFileSync(path.join(DIR.site, 's', id, 'index.html'), sessionPage({ review: r, exDef, metrics, media: M, prev }), 'utf8');
  writeJSON(path.join(sessDir(id), 'metrics.json'), metrics);
  if (!quiet) {
    console.log(`rendered ${id}`);
    for (const [k, m] of Object.entries(M)) console.log(`  ${k.padEnd(14)} ${m.src}  ${(fs.statSync(path.join(DIR.site, 's', id, m.src)).size / 1024).toFixed(0)}KB`);
    console.log('  metrics', JSON.stringify(metrics));
  }
  return { metrics, media: M };
}

// ---------------- build ----------------
async function cmdBuild(_, opt) {
  const sessions = allSessions();
  const exDefs = {}, groups = {};
  for (const r of sessions) {
    exDefs[r.exercise] ??= loadEx(r.exercise);
    const page = path.join(DIR.site, 's', r.id, 'index.html');
    const stale = opt.all || !fs.existsSync(page) || fs.statSync(path.join(sessDir(r.id), 'review.json')).mtimeMs > fs.statSync(page).mtimeMs;
    let metrics, M;
    if (stale) ({ metrics } = await cmdRender([r.id], { quiet: false }));
    else metrics = readJSON(path.join(sessDir(r.id), 'metrics.json'));
    const ex = exDefs[r.exercise];
    const thumbId = r.thumb || ex.thumbStill || r.stills?.[0]?.id;
    (groups[r.exercise] ??= { exercise: r.exercise, sessions: [] }).sessions.push({ review: r, metrics, thumb: thumbId + '.jpg' });
  }
  const order = Object.values(groups).sort((a, b) => b.sessions.at(-1).review.date.localeCompare(a.sessions.at(-1).review.date));
  fs.writeFileSync(path.join(DIR.site, 'index.html'), progressPage({ groups: order, exDefs }), 'utf8');
  // list of files to publish alongside the page
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : files.push(path.relative(DIR.site, path.join(d, e.name)).replace(/\\/g, '/'))));
  walk(path.join(DIR.site, 's'));
  writeJSON(path.join(DIR.site, 'files.json'), files);
  console.log(`progress page: ${path.join(DIR.site, 'index.html')}  (${sessions.length} sessions, ${files.length} files listed in site/files.json)`);
}

function cmdList() {
  for (const r of allSessions()) console.log(`${r.id.padEnd(40)} ${r.exercise.padEnd(26)} reps=${r.reps?.length ?? 0}`);
  console.log('\nexercises:', fs.readdirSync(DIR.ex).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).join(', '));
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opt } = args(rest);
  const table = { new: cmdNew, sheet: cmdSheet, frame: cmdFrame, render: cmdRender, build: cmdBuild, list: cmdList };
  if (!table[cmd]) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 8).join('\n')); process.exit(cmd ? 1 : 0); }
  await table[cmd](pos, opt);
})().catch((e) => { console.error(e.message); process.exit(1); });
