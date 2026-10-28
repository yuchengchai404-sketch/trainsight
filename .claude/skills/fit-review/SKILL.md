---
name: fit-review
description: 复盘用户的训练视频：逐帧分析动作，产出带力线/问题标注的截图和 GIF、节奏图、和历史记录的对比，并更新在线「训练档案」。当用户发来训练视频、说"帮我看看这个动作""inbox 里有新视频""和上次比有没有进步"时使用。
---

# 训练视频复盘流程

用户是在健身房自己训练的人，用中文交流。他要的是**专业教练视角**的复盘：不只文字，要在画面上把力线、问题点、做得好的地方标出来，并且同一动作能看到进步趋势。交付要好看、顺滑。

## 目录约定（项目根目录，相对路径）

| 路径 | 作用 |
|---|---|
| `inbox/` | 用户放新视频的地方 |
| `sessions/<日期>_<动作id>/` | 一次训练：`video.*`、`review.json`（全部分析内容）、`metrics.json`（自动算）、`work/`（抽帧草稿） |
| `exercises/<动作id>.json` | 动作标准：关键点、必需截图、指标公式与目标区间、教练检查清单 |
| `tools/fit.js` | 流水线 CLI（ffmpeg + sharp，依赖已装在 `tools/node_modules`） |
| `site/` | 生成的网站：`index.html` 是训练档案总页，`s/<id>/` 是每次复盘页 |
| `fit.config.json` | 训练档案 Artifact 的 URL |

## 步骤

1. **登记视频**
   `node tools/fit.js new inbox/<文件> --exercise <动作id> --date <YYYY-MM-DD>`
   动作不确定时先用 `--exercise unknown`，看完概览图再把 `review.json` 里的 `exercise` 和文件夹名改对（文件夹名=id，二者一致）。日期默认取文件修改时间，用户说了就按用户的。inbox 里的文件会被移动进 session，别处的文件只复制。

2. **看概览**：Read `work/overview_*.jpg`（2fps，带时间戳）。确定动作、拍摄视角、这组的起止时间、大致次数。

3. **动作标准**：`exercises/` 里没有这个动作就新建一个 json，参照 `shoulder-press-machine.json` 的结构：
   - `keypoints`：这个动作需要标的关节（深蹲：ankle/knee/hip/shoulder；卧推：wrist/elbow/shoulder/bar；划船：hand/elbow/shoulder/hip …）
   - `requiredStills`：每次都要截的位置（通常是顶端和底部），`compareStills` 用于前后对比
   - `metrics`：`kind` 可用 `angle_vertical`（a→b 偏离铅垂）、`angle_horizontal_signed`（b 高于 a 为正）、`joint_angle`（a-b-c 在 b 处的夹角）、`tempo`（fn: reps/con_avg/ecc_avg/ecc_typical/ecc_min/velocity_loss_pct）、`manual`（来自 review.manual）。给出 `target` 区间、`tolerance`、`better`。
   - `checklist`：这个动作的教练检查要点，逐条对照视频。
   力线的定义按动作来：推举类是“负重点→前臂→肩关节”的连线是否竖直；深蹲/硬拉是杠铃垂线是否过足中；划船/下拉是拉力方向与上臂的关系。

4. **逐次拆解**：`node tools/fit.js sheet <id> --start <s> --end <e> --fps 4`，必要时对关键片段 `--fps 10`。记录每一次的 `t`（底部起推时刻）、`con`（向心秒数）、`ecc`（离心秒数）写进 `reps`。数字精确到 0.1s，并在页面注明 ±0.2s。

5. **取关键帧定坐标**：`node tools/fit.js frame <id> <t1> <t2> ... --grid`，Read `work/t*_grid.jpg`（50px 网格），读出关键点像素坐标写到对应 still 的 `keypoints`。要截的帧：`requiredStills` 每个一张 + 每个问题点一张（可用 `crop`+`zoom` 放大局部，`ui` 缩小标签）。挑清晰、不糊的帧。

6. **写 review.json**（结构见现有 session 的 review.json）：
   - `stills[].shapes`：line / hline / vline / dot / ring / arrow / label，坐标用关键点名或 `[x,y]`；label 文字里 `{指标id}` 会替换成算出来的数值。颜色语义：`force` 力线蓝、`good` 绿、`bad` 红、`warn` 黄（参考线）。标签编号 `num` 与正文对应。
   - `gifs`：普通片段（`phases` 按时间切换说明，`events` 在时间段内加箭头等，`speed:0.5` 慢放）；`type:"compare"` 左右并排对比两段。每个 GIF 控制在 2 秒内、约 1.3MB。
   - `sections`：`force`（力线分析，两张图）、`goods`（做得好，2–4 条）、`fixes`（按影响排序，每条有 `fix` 和 `media`）、`plan`（下次训练 3–5 条可执行要点）、`notes`（视角局限、估算说明）。
   - `headline` 一句话，用于档案卡片；`summary` 可用 `**加粗**`。
   - 有重量/组数就填 `load`（如 "40kg · 第3组"）。
   - **和上次比**：先 Read 同动作上一次的 `review.json` 和 `metrics.json`。改善的点要在 summary/goods 里明确说（“底部上臂角从 +25° 到 +5°”），退步的放进 fixes。页面会自动生成指标对比表和 top/bottom 前后对比图。

7. **渲染检查**：`node tools/fit.js render <id>`，Read 生成的每张 `site/s/<id>/media/*.jpg`，检查标注是否压住身体关键部位、文字是否出界，调整坐标后重渲。GIF 可用 ffmpeg 抽一帧看。

8. **生成并发布档案**：`node tools/fit.js build`（只重渲改动过的 session，加 `--all` 全部重渲），然后用 Artifact 工具发布：
   - `file_path`: 项目根下的 `site/index.html`；`url`: `fit.config.json` 里的 `archiveUrl`（可留空；若发布到 Artifact/静态托管，先 `action:"read"` 再发布）
   - `files`: 只需传**本次新增/改动**的 session 文件（`s/<id>/index.html` 和 `s/<id>/media/*`），路径一一映射到项目根 `site/` 下同名文件；旧 session 的文件会保留。单次最多 255 个文件、64MB；整个档案上限约 256MB（约 40–50 次复盘），接近时告诉用户，可以把旧记录归档到新 Artifact。

9. **回复用户**：中文，先给结论（做得好 / 要改 / 和上次比），再给档案链接，并指明本次复盘页（档案页里点卡片进入）。说明估算误差和视角局限。

## 教练原则

- 先肯定做得好的地方，再讲问题；问题按受伤风险 > 训练效果 > 细节排序。
- 每个问题都要给可执行的改法（座椅调几格、数几秒、什么提示语）。
- 只说视频里看得到的。单一视角看不到的（左右对称、肘外展、腕角度）明确说看不到，建议补拍角度。
- 数字都是像素估算，用“约”“≈”，不夸大精度。
- 不给医疗诊断；涉及疼痛建议停止并咨询专业人士。
