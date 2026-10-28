// ffmpeg / ffprobe wrappers.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const FF = require('ffmpeg-static');
const FP = require('ffprobe-static').path;
const FONTFILE = process.platform === 'win32'
  ? 'C\\:/Windows/Fonts/arial.ttf'
  : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

const ff = (args) => execFileSync(FF, ['-v', 'error', '-y', ...args], { maxBuffer: 1 << 26 });

function probe(video) {
  const out = execFileSync(FP, ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,r_frame_rate:stream_tags=rotate:format=duration', '-of', 'json', video]).toString();
  const j = JSON.parse(out), st = j.streams[0];
  const rot = Math.abs(+(st.tags?.rotate || 0));
  const [w, h] = rot === 90 || rot === 270 ? [st.height, st.width] : [st.width, st.height];
  const [n, d] = st.r_frame_rate.split('/').map(Number);
  return { width: w, height: h, fps: d ? n / d : 30, duration: +j.format.duration };
}

// one full-res frame
const frame = (video, t, out) => ff(['-ss', String(t), '-i', video, '-frames:v', '1', '-q:v', '2', out]);

// timestamped contact sheet(s): fps samples/second, tiles cols x rows, thumbs `thumb` px wide
function sheet(video, out, { start = 0, end, fps = 2, cols = 8, rows = 3, thumb = 240 } = {}) {
  const range = end != null ? ['-ss', String(start), '-to', String(end)] : start ? ['-ss', String(start)] : [];
  const fsz = Math.round(thumb / 12);
  ff([...range, '-i', video, '-vf',
    `fps=${fps},scale=${thumb}:-2,drawtext=fontfile='${FONTFILE}':text='%{pts\\:flt\\:${start}}':x=4:y=4:fontsize=${fsz}:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=${cols}x${rows}`,
    out]);
}

// extract frames for a gif as PNGs
function framesFor(video, dir, { start, end, fps, speed = 1, width }) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  ff(['-ss', String(start), '-to', String(end), '-i', video, '-vf', `fps=${fps / speed},scale=${width}:-2`, path.join(dir, 'f%04d.png')]);
  return fs.readdirSync(dir).filter((f) => /^f\d+\.png$/.test(f)).sort().map((f) => path.join(dir, f));
}

// encode a numbered PNG sequence (pattern like dir/o%04d.png) into an optimised looping gif
function encodeGif(pattern, fps, out, extraFilter = '') {
  const pre = extraFilter ? extraFilter + ',' : '';
  ff(['-framerate', String(fps), '-i', pattern, '-filter_complex',
    `[0]${pre}split[a][b];[a]palettegen=max_colors=144:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    '-loop', '0', out]);
}

module.exports = { ff, probe, frame, sheet, framesFor, encodeGif };
