# TrainSight (Fit) — training video form review

Users drop training videos into `inbox/`. Claude follows `.claude/skills/fit-review/SKILL.md` to review form, then summarizes into the local training archive under `site/` (optional remote URL in `fit.config.json`).

- Pipeline: `node tools/fit.js <new|sheet|frame|render|build|list>` (Node.js + ffmpeg-static + sharp; works on macOS / Linux / Windows)
- All analysis for a session lives in `sessions/<id>/review.json`; pages and images are generated from it — do not hand-edit files under `site/`
- Exercise standards and metric definitions live in `exercises/*.json`
- Talk to the user in Chinese unless they prefer another language

Project root is this repository (relative paths only; no machine-specific absolute paths).
