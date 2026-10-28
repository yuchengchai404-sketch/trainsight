// HTML builders for the per-session review page and the progress (archive) page.
const fs = require('fs');
const path = require('path');
const { grade } = require('../lib/metrics');

const CSS = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@700;900&family=Noto+Sans+SC:wght@400;500;700&family=JetBrains+Mono:wght@500;700&display=swap">';
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// allow **bold** in authored copy
const rich = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const TONE = { good: 'good-t', bad: 'bad-t', warn: 'warn-t', force: 'force-t' };
const SEV = { high: ['影响最大', 'bad-t'], mid: ['中等', 'warn-t'], low: ['小问题', 'warn-t'] };
const GRADE_TXT = { good: '达标', warn: '接近', bad: '未达标' };
const fmt = (v, unit) => (v == null ? '—' : `${v}${unit === '次' ? ' 次' : unit}`);

const SCRIPT = `<script>
const lb=document.getElementById('lb'),lbi=lb.querySelector('img');
document.querySelectorAll('.shot').forEach(f=>f.addEventListener('click',()=>{const im=f.querySelector('img');lbi.src=im.src;lbi.alt=im.alt;lb.showModal()}));
lb.addEventListener('click',()=>lb.close());
const links=[...document.querySelectorAll('nav.toc a[href^="#"]')];
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)links.forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+e.target.id))}),{rootMargin:'-40% 0px -55% 0px'});
document.querySelectorAll('header[id],section[id]').forEach(s=>io.observe(s));
</script>`;

function shot(m, tag, { maxW } = {}) {
  if (!m) return '';
  const style = maxW ? ` style="max-width:${maxW}px"` : '';
  return `<figure class="shot">${tag ? `<span class="tag">${esc(tag)}</span>` : ''}<img src="${m.src}" alt="${esc(m.alt || tag || '')}" width="${m.w}" height="${m.h}" loading="lazy"${style}></figure>`;
}

// grouped bars: concentric vs eccentric per rep, with the eccentric target band
function tempoChart(reps, eccTarget = [2, 3]) {
  const L = 44, R = 10, T = 12, B = 40, W = 760, H = 300;
  const max = Math.max(3, Math.ceil(Math.max(...reps.flatMap((r) => [r.con, r.ecc])) * 2) / 2);
  const iw = W - L - R, ih = H - T - B, y = (v) => T + ih * (1 - v / max), band = iw / reps.length, bw = Math.min(band * 0.3, 26);
  let s = `<rect x="${L}" y="${y(eccTarget[1])}" width="${iw}" height="${y(eccTarget[0]) - y(eccTarget[1])}" fill="var(--good-bg)"/>`;
  for (let v = 0; v <= max + 1e-9; v += 0.5)
    s += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-width="1"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(1)}s</text>`;
  const n = reps.length;
  reps.forEach((r, i) => {
    const x = L + band * i + band / 2, last = i === n - 1;
    s += `<rect x="${x - bw - 2}" y="${y(r.con)}" width="${bw}" height="${y(0) - y(r.con)}" rx="3" fill="var(--force)"/>`;
    const eCol = r.ecc < eccTarget[0] * 0.4 ? 'var(--bad)' : 'var(--warn)';
    s += `<rect x="${x + 2}" y="${y(r.ecc)}" width="${bw}" height="${y(0) - y(r.ecc)}" rx="3" fill="${eCol}"/>`;
    if (i >= n - 3) s += `<text x="${x - bw / 2 - 2}" y="${y(r.con) - 6}" text-anchor="middle" style="fill:var(--ink)">${r.con}</text>`;
    if (eCol === 'var(--bad)') s += `<text x="${x + bw / 2 + 2}" y="${y(r.ecc) - 6}" text-anchor="middle" style="fill:var(--bad)">${r.ecc}</text>`;
    s += `<text x="${x}" y="${H - B + 18}" text-anchor="middle">${i + 1}</text>`;
  });
  s += `<text x="${L + iw / 2}" y="${H - 4}" text-anchor="middle">第几次</text>`;
  return `<div class="chartbox"><div class="cl"><span style="--c:var(--force)">推起（向心）</span><span style="--c:var(--warn)">下放（离心）</span><span style="--c:var(--good-bg)">下放目标 ${eccTarget[0]}–${eccTarget[1]} 秒</span></div>
<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="每次动作的推起和下放用时">${s}</svg></div>`;
}

function metricRows(exDef, metrics, prevMetrics) {
  return exDef.metrics.filter((m) => !m.hidden).map((m) => {
    const v = metrics[m.id], g = grade(m, v);
    let d = '';
    if (prevMetrics && prevMetrics[m.id] != null && v != null) {
      const diff = Math.round((v - prevMetrics[m.id]) * 10) / 10;
      const better = m.better === 'lower' ? diff < 0 : m.better === 'higher' ? diff > 0 : null;
      const c = diff === 0 || better == null ? 'var(--muted)' : better ? 'var(--good)' : 'var(--bad)';
      d = `<span class="delta" style="color:${c}">${diff > 0 ? '+' : ''}${diff}${m.unit === '次' ? '' : m.unit}</span>`;
    }
    return `<tr><td>${esc(m.label)}</td><td class="num">${fmt(v, m.unit)}</td><td class="num">${m.target ? `${m.target[0]}–${m.target[1]}${m.unit}` : '—'}</td>
<td>${g ? `<span class="pill ${TONE[g]}">${GRADE_TXT[g]}</span>` : ''}</td>${prevMetrics ? `<td>${d || '—'}</td>` : ''}</tr>`;
  }).join('');
}

function sessionPage({ review: r, exDef, metrics, media, prev }) {
  const S = r.sections || {};
  const M = (id) => media[id];
  const nav = [['#overview', '总评'], S.force && ['#force', '力线'], S.goods?.length && ['#good', '做得好'], S.fixes?.length && ['#fix', '要改进'],
    r.reps?.length && ['#tempo', '节奏'], ['#data', prev ? '数据与对比' : '数据'], S.plan?.length && ['#plan', '下次怎么练']].filter(Boolean);
  const hero = r.hero || {};
  const legend = `<div class="legend"><span><i style="border-color:var(--force)"></i>力线</span><span><i class="dash" style="border-color:var(--muted)"></i>铅垂参考</span>
<span><i class="dash" style="border-color:var(--warn)"></i>关节高度参考</span><span><i style="border-color:var(--good)"></i>做得好</span><span><i style="border-color:var(--bad)"></i>需要改</span></div>`;

  const body = `
<nav class="toc"><div class="in"><a class="back" href="../../index.html">← 训练档案</a>${nav.map(([h, t]) => `<a href="${h}">${t}</a>`).join('')}</div></nav>
<div class="wrap">
<header class="hero" id="overview">
  <div class="txt">
    <span class="eyebrow">训练复盘 · ${esc(exDef.view || '侧面')}视角 · ${esc(r.date)}</span>
    <h1>${esc(exDef.name)}</h1>
    <p class="lead">${rich(r.summary)}</p>
    <div class="facts">${(r.facts || []).map((f) => `<span><b>${esc(f.v)}</b>${esc(f.k)}</span>`).join('')}</div>
    <div class="verdict">${(r.verdict || []).map((v) => `<div class="chip ${TONE[v.tone]}"><span class="k">${esc(v.label)}</span><span class="v">${esc(v.value)}</span></div>`).join('')}</div>
  </div>
  <figure>${shot(M(hero.media), hero.tag)}${hero.caption ? `<figcaption>${rich(hero.caption)}</figcaption>` : ''}</figure>
</header>
${S.force ? `<section id="force"><div class="head"><span class="eyebrow">力线分析</span><h2>${esc(S.force.title)}</h2><p class="muted">${rich(S.force.intro)}</p></div>${legend}
<div class="duo">${S.force.items.map((it) => `<div>${shot(M(it.media), it.tag)}<p>${rich(it.text)}</p></div>`).join('')}</div></section>` : ''}
${S.goods?.length ? `<section id="good"><div class="head"><span class="eyebrow">做得好的地方</span><h2>${esc(S.goodsTitle || '这些保持住')}</h2></div>
<div class="goods">${S.goods.map((g) => `<div class="good"><h3>${esc(g.title)}</h3><p>${rich(g.text)}</p></div>`).join('')}</div></section>` : ''}
${S.fixes?.length ? `<section id="fix"><div class="head"><span class="eyebrow">需要改进</span><h2>按影响大小排序</h2></div>
${S.fixes.map((f) => {
    const [sevTxt, sevCls] = SEV[f.severity] || SEV.mid;
    return `<article class="find"><div class="body"><span class="sev ${sevCls}">${esc(f.severityText || sevTxt)}</span><h3>${esc(f.title)}</h3><p>${rich(f.text)}</p>
<div class="fix"><b>怎么改</b>${rich(f.fix)}</div></div><div class="stack">${(f.media || []).map((id) => shot(M(id), M(id)?.tag, { maxW: M(id)?.kind === 'gif' && M(id).w < 400 ? M(id).w : null })).join('')}</div></article>`;
  }).join('')}</section>` : ''}
${r.reps?.length ? `<section id="tempo"><div class="head"><span class="eyebrow">节奏</span><h2>每次的推起和下放用时</h2>${S.tempoNote ? `<p class="muted">${rich(S.tempoNote)}</p>` : ''}</div>
${tempoChart(r.reps, exDef.metrics.find((m) => m.id === 'ecc_typical')?.target)}
<p class="muted small">逐帧读取，每个数字误差约 ±0.2 秒。第 1 次从静止起推，通常偏慢。</p></section>` : ''}
<section id="data"><div class="head"><span class="eyebrow">关键数据</span><h2>${prev ? `和 ${esc(prev.review.date)} 比` : '本次基线'}</h2>
<p class="muted">${prev ? '同一动作、同一视角的上一次记录。角度由关键点计算，不受拍摄距离影响。' : '这是这个动作的第一条记录，之后的训练都会和它对比。'}</p></div>
<div class="mtwrap"><table class="mt"><thead><tr><th>指标</th><th>本次</th><th>目标</th><th>评估</th>${prev ? '<th>较上次</th>' : ''}</tr></thead>
<tbody>${metricRows(exDef, metrics, prev?.metrics)}</tbody></table></div>
${(r.compareMedia || []).map((id) => shot(M(id), M(id)?.tag)).join('')}
</section>
${S.plan?.length ? `<section id="plan"><div class="head"><span class="eyebrow">下次训练</span><h2>上机前对照这几条</h2></div>
<div class="plan">${S.plan.map((p) => `<div class="step"><h3>${esc(p.title)}</h3><p>${rich(p.text)}</p></div>`).join('')}</div>
${S.notes?.length ? `<div class="note">${S.notes.map((n) => `<span>${rich(n)}</span>`).join('')}</div>` : ''}</section>` : ''}
</div>
<dialog id="lb" aria-label="放大查看"><img alt=""></dialog>${SCRIPT}`;

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(exDef.short || exDef.name)} ${esc(r.date)}</title>${FONTS}<style>${CSS}</style></head><body>${body}</body></html>`;
}

// small line chart for one metric across sessions
function trendChart(points, m) {
  const W = 300, H = 110, L = 30, R = 10, T = 10, B = 22;
  const vals = points.map((p) => p.v);
  let lo = Math.min(...vals, ...(m.target || [])), hi = Math.max(...vals, ...(m.target || []));
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const n = points.length, x = (i) => (n === 1 ? L + (W - L - R) / 2 : L + ((W - L - R) * i) / (n - 1)), y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let s = '';
  if (m.target) s += `<rect x="${L}" y="${y(m.target[1])}" width="${W - L - R}" height="${Math.max(1, y(m.target[0]) - y(m.target[1]))}" fill="var(--good-bg)"/>`;
  [lo + pad, hi - pad].forEach((v) => (s += `<text x="${L - 4}" y="${y(v) + 3}" text-anchor="end">${Math.round(v * 10) / 10}</text>`));
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.v)}`).join('');
  if (n > 1) s += `<path d="${d}" fill="none" stroke="var(--force)" stroke-width="2.5" stroke-linejoin="round"/>`;
  points.forEach((p, i) => {
    const last = i === n - 1;
    s += `<circle cx="${x(i)}" cy="${y(p.v)}" r="${last ? 5 : 3.5}" fill="${last ? 'var(--force)' : 'var(--panel)'}" stroke="var(--force)" stroke-width="2"/>`;
  });
  s += `<text x="${x(0)}" y="${H - 6}" text-anchor="${n === 1 ? 'middle' : 'start'}">${points[0].date.slice(5)}</text>`;
  if (n > 1) s += `<text x="${x(n - 1)}" y="${H - 6}" text-anchor="end">${points[n - 1].date.slice(5)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(m.label)}趋势">${s}</svg>`;
}

function progressPage({ groups, exDefs }) {
  const total = groups.reduce((a, g) => a + g.sessions.length, 0);
  const nav = groups.map((g) => `<a href="#ex-${g.exercise}">${esc(exDefs[g.exercise].short || exDefs[g.exercise].name)}</a>`).join('');
  const blocks = groups.map((g) => {
    const ex = exDefs[g.exercise], ss = g.sessions, latest = ss[ss.length - 1];
    const trends = ex.metrics.filter((m) => !m.hidden && m.trend !== false).map((m) => {
      const pts = ss.filter((s) => s.metrics[m.id] != null).map((s) => ({ date: s.review.date, v: s.metrics[m.id] }));
      if (!pts.length) return '';
      const v = pts[pts.length - 1].v, gr = grade(m, v);
      return `<div class="trend"><div class="top"><span class="small">${esc(m.label)}</span>${gr ? `<span class="pill ${TONE[gr]}">${GRADE_TXT[gr]}</span>` : ''}</div>
<span class="val">${fmt(v, m.unit)}</span>${trendChart(pts, m)}${m.target ? `<span class="small muted">目标 ${m.target[0]}–${m.target[1]}${m.unit}</span>` : ''}</div>`;
    }).join('');
    const cards = [...ss].reverse().map((s) => `<a class="sess" href="s/${s.review.id}/index.html"><img src="s/${s.review.id}/media/${s.thumb}" alt="${esc(s.review.date)} 训练截图" loading="lazy">
<div class="meta"><b>${esc(s.review.date)}</b><span>${s.metrics.reps != null ? `${s.metrics.reps} 次` : ''}${s.review.load ? ` · ${esc(s.review.load)}` : ''}</span><span>${esc(s.review.headline || '')}</span></div></a>`).join('');
    return `<section class="ex" id="ex-${g.exercise}"><div class="head"><span class="eyebrow">${ss.length} 次记录 · 最近 ${esc(latest.review.date)}</span><h2>${esc(ex.name)}</h2>
${latest.review.headline ? `<p class="muted">最近一次：${esc(latest.review.headline)}</p>` : ''}</div>
<div class="trends">${trends}</div>${ss.length === 1 ? '<p class="muted small">只有一条记录，趋势线会在下一次训练后出现。</p>' : ''}
<div class="sessions">${cards}</div></section>`;
  }).join('');

  return `<title>训练档案</title>
<meta name="claude:viewport-fit-sides" content="cover">
${FONTS}<style>${CSS}</style>
<nav class="toc"><div class="in"><a href="#overview">总览</a>${nav}<a href="#filming">拍摄指南</a></div></nav>
<div class="wrap">
<header id="overview" class="head" style="gap:16px">
  <span class="eyebrow">个人训练档案 · ${total} 条复盘</span>
  <h1>训练档案</h1>
  <p class="lead">每条训练视频都会逐帧复盘，标出力线、问题和做得好的地方。同一个动作的关键角度和节奏会连成趋势线，进步是看得见的。</p>
</header>
${blocks || '<div class="empty">还没有记录。把训练视频放进 inbox 文件夹，然后让 Claude 复盘。</div>'}
<section id="filming"><div class="head"><span class="eyebrow">拍摄指南</span><h2>怎么拍，对比才准</h2>
<p class="muted">趋势对比靠的是角度。机位越一致，前后两次越有可比性。</p></div>
<div class="guide">
<div><b>固定机位</b>手机放稳（三脚架或架在器械上），整组不要移动。</div>
<div><b>正侧面</b>镜头垂直于身体侧面，同一个动作每次拍同一侧。</div>
<div><b>齐肩高度</b>镜头大约在肩到髋之间，人和器械完整入画。</div>
<div><b>多拍一个角度</b>想看左右对称、肘部外展，加一段正面或 45° 视频。</div>
<div><b>报重量</b>发视频时顺便说重量和第几组，档案会一起记录。</div>
</div></section>
</div>
<dialog id="lb" aria-label="放大查看"><img alt=""></dialog>${SCRIPT}`;
}

module.exports = { sessionPage, progressPage };
