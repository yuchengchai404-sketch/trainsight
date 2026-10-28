# TrainSight

**TrainSight** is a Claude Code skill pack for AI-assisted gym form review: drop a training video in `inbox/`, follow the `fit-review` skill, and get annotated stills, force-line overlays, tempo metrics, GIFs, and a browsable local archive under `site/`.

> Sample stills / GIFs / `review.json` in this repo come from real gym sessions and are included for demo only (no raw videos).

**License:** MIT (see [LICENSE](./LICENSE)).

---

## 中文简介

**TrainSight**（原 Fit 方法包）是给 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 用的健身视频动作复盘技能包：把训练视频放进 `inbox/`，按 `.claude/skills/fit-review/SKILL.md` 流程分析，产出带力线标注的截图、节奏指标、对比 GIF，并生成 `site/` 下的本地训练档案页。

> 仓库中的样例静帧 / GIF / `review.json` 来自真实健身房训练，仅作演示（不含原始视频）。

**许可证：** MIT（见 [LICENSE](./LICENSE)）。

---

## Requirements / 环境要求

- [Node.js](https://nodejs.org/) 18+ (recommended)
- Claude Code (or another agent that can follow the skill + run the CLI)
- Native deps pulled via npm: **`ffmpeg-static`**, **`ffprobe-static`**, **`sharp`** (no system ffmpeg required)

```bash
cd tools && npm ci
```

---

## Quick start / 快速开始

1. Clone this repo and install tools deps (`cd tools && npm ci`).
2. Open the project root in Claude Code so it loads `CLAUDE.md` and `.claude/skills/fit-review/`.
3. Put a training video in `inbox/` (e.g. `inbox/set1.mp4`).
4. Ask Claude to review it (skill triggers on “inbox 有新视频 / 帮我看看这个动作”).
5. Pipeline CLI (also used by the skill):

```bash
node tools/fit.js new inbox/<file> --exercise <id> --date YYYY-MM-DD
node tools/fit.js sheet <session-id> --start <s> --end <e> --fps 4
node tools/fit.js frame <session-id> <t1> <t2> ... --grid
node tools/fit.js render <session-id>
node tools/fit.js build
```

Open `site/index.html` for the demo archive (shoulder / chest / incline press sessions).

Optional: set `archiveUrl` in `fit.config.json` if you publish `site/` somewhere; leave it empty for local-only use. `archiveFile` is the relative path `site/index.html`.

---

## Layout / 目录

| Path | Role |
|---|---|
| `inbox/` | Drop new videos here |
| `sessions/<date>_<exercise-id>/` | Per-set `review.json`, `metrics.json`, example `work/` stills |
| `exercises/*.json` | Exercise standards, required stills, metrics, checklist |
| `tools/fit.js` | CLI (ffmpeg-static + sharp) |
| `site/` | Generated archive + demo session pages |
| `推肩复盘/` | Standalone shoulder-press sample review page |
| `.claude/skills/fit-review/SKILL.md` | Full review workflow for Claude |

---

## Included demos / 自带样例

- `site/s/2026-10-27_shoulder-press-machine/`
- `site/s/2026-10-27_chest-press-machine/`
- `site/s/2026-10-27_incline-chest-press-machine/`
- Matching `sessions/*/review.json`, `metrics.json`, and key `work/still_*.jpg` / `overview_*.jpg` (no `video.*`)

See [MANIFEST.txt](./MANIFEST.txt) for a file inventory.
