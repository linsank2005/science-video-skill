# 水彩场景绘画参考

本参考保留 PDoomVideo 的 p5.js / p5.brush 绘画、材质、镜头、角色与道具 API，供助手实现旁白视频场景。对应实现随 Skill 保存在 `assets/runtime/src/`，使用前按需核对。场景内容、时长与节奏由用户的真实旁白决定，原歌曲的固定时长、章节、节拍、字幕区和角标不适用于新视频。

## 场景与镜头

每个场景是任务中独立的 `scenes/*.js` 文件，用 IIFE 隔离私有函数；调用 `chapter(name, start, end, shots)` 注册。`name` 与项目场景 id 一致，时间使用全片秒数，首镜头从场景起点开始，后续镜头起点严格递增。

镜头函数接收 `draw(t, lt, dur)`：全片时间、距当前镜头开始的时间、当前镜头时长。每帧完整绘图，包括该帧需要的背景和主体；镜头按配置的起点切换。

帧支持并行和乱序渲染，运动应是时间的纯函数，不保留上一帧状态，不使用 `Math.random()`。对象随机变化用 `hash(i)`；手绘抖动可用 `jit(a)`，底层按当前时间重设随机种子，约每秒 12 次变化，形成手绘线条的轻微抖动。缺少私有辅助函数时在该场景 IIFE 中实现，避免污染其他场景。

## 画布与布局

- 通过 `W`、`H` 使用实际画幅，默认 1920×1080；原点在左上，y 向下。摄像机启用时使用世界坐标。
- 为底部约 18% 的字幕区域留空，主体动作、面孔、关键术语和数字保持可见。句子字幕由旁白时间线绘制，不套用歌曲卡拉 OK 的固定区域。
- 运行时为画面生成纸张纹理，并在合成时叠加纸纹和轻微暗角；不需要下载原歌曲素材。
- 转场由任务配置决定，可使用切换或笔刷擦除。不要自动加入原歌曲的 P(doom) 角标、固定章节转场或舞台背景。

## 绘画 API

`paint(pts, o)` 从点列表 `[[x, y], ...]` 绘制形状。

| 选项 | 含义与使用方式 |
|---|---|
| `wash, washOp` | 平涂颜色与透明度，透明度范围 0–255；用于角色或需要清晰实体感的形状 |
| `fill, fillOp, bleed, tex, border` | 水彩颜色、透明度、洇边、颜料纹理与边界；用于背景、柔光和阴影。可参考 `bleed` 约 .05–.3、`tex` 约 .3–.9、`border` 约 .2–.8 |
| `hatch: { d, a, o, b, c, w }` | 排线：距离、角度、随机与渐变设置、笔刷、颜色、线宽；可使用 charcoal 或 HB，少量用于干笔纹理 |
| `ink, sw, br` | 轮廓颜色、线宽与笔刷。线宽常用约 .4–2，默认 ink，也可用 inkfine；`ink: null` 表示无轮廓 |
| `curv` | 轮廓平滑度 0–1，替代直接连接的折线 |

几何函数：

- `rectPts(x, y, w, h, jitter)`：矩形。
- `ellPts(cx, cy, rx, ry, n, jitter, rot)`：椭圆。
- `rrPts(x, y, w, h, r, jitter)`：圆角矩形。
- `starPts(cx, cy, r, inner, n, rot)`：星形。
- `heartPts(cx, cy, r)`：心形。

线条使用 `inkLine(pts, sw, colour, brush, curvature)`。常用笔刷包括 ink、inkfine、dry，以及内置的 2B、HB、charcoal、marker、spray、rotring、cpencil、pen。`push()`、`pop()`、`translate()`、`rotate()`、`scale()` 可配合笔刷绘制，变换要成对恢复。

调色板 `PAL` 包含 `paper, ink, clay, clayDk, clayLt, night, indigo, rose, ochre, sap, teal, violet, cream, sky`。`mixCol(a, b, k)` 混合两个十六进制颜色。可使用其他颜色，但保持协调、柔和的水彩色感；深色和浅色可优先用 ink / night 和 cream。

## 时间与运动

- `seg(t, a, b)`：区间内 0–1 进度。
- `kf(t, [[t0, v0], [t1, v1], ...], easeFn)`：关键帧插值，值可以是数或数组。
- 缓动：`ease`、`easeOut`、`easeIn`、`backOut`、`elasticOut`。
- 辅助：`lerp`、`clamp`、`frac`、`wob(t, freq, phase)`、`hash(i)`、`TAU`。
- 上游还提供 `bpOf`、`beatN`、`pulse`、`pulse2` 等基于原歌曲 88 BPM 的节拍函数。旁白视频的动作由语义与实际时间点决定，不默认用这些函数驱动节奏；确需使用音乐节拍时先使节拍设置匹配实际音频。

用主体的可见变化解释内容，例如聚合与分散、数量比较、能量传递、先后关系；挤压拉伸、预备动作和适度过冲可辅助表达。每镜头保留清晰的焦点，运动与镜头长度服务于观众理解。

## 摄像机

`camBegin(cx, cy, zoom, rot)` 将世界坐标中的点放到屏幕中央，支持推近、平移、倾斜和拉远；`camEnd()` 恢复。摄像机只支持一层，每次开始都要配对结束。

`shakeXY(t, amount)` 返回稳定的 `[dx, dy]` 抖动，可叠加到摄像机中心。震动只用于有表达需要的冲击或事件。

## 文字与全屏效果

文字按当前摄像机自动变换，但不自动跟随自行设置的 `push()` / `translate()`；通常提供世界坐标，固定屏幕文字可设置 `screen: true`。使用当前环境可用的中文字体。

- `letter(txt, x, y, size, colour, { pop, rot, alpha, ink, stroke, font, align, screen })`：标签文字。`pop` 为 0–1 出现进度，可带过冲；`ink: false` 可关闭墨色阴影。
- `sfx(txt, x, y, size, colour, age, { life, rot })`：会出现、轻微摆动并淡出的漫画拟声标签，按需使用。
- `flushLetters()`：将排队文字合成到画面。运行时在镜头绘制后自动调用；如需用后续笔刷覆盖部分文字，可在镜头中提前调用。
- `flash(k, colour)`：强度为 k 的全屏色层。
- `iris(cx, cy, r, colour)`：圆形开口以外的遮罩。
- `irisShape(pts, colour)`：星形轮廓等形状开口以外的遮罩。

全屏效果使用屏幕坐标，在摄像机之外调用。

## 可选角色

角色只是可复用素材，科普画面可以完全由图形、过程示意或其他主体构成。

**Clawd** 使用 `clawd(x, y, u, o)`。坐标是两脚之间的地面点，u 是单位长度。身体宽 10u、高 6u，加腿总高约 8u。

- 姿态：`dy` 为身体单位的位移，负值向上；`sq` 为挤压，负值拉伸；另有 `rot`、`flip`、`sx` / `sy`、`aL` / `aR`、`walk`、`noLegs`、`noShadow`。手臂角度 0 表示向两侧伸展，正值抬起，负值放下。
- 眼睛 `eyes`：normal、look、happy、closed、wink、narrow、angry、scared、spark、red、heart、x、swirl、dot、shades；look 可配 `lookX` / `lookY`，范围 −1 到 1。
- 嘴型 `mouth`：o、O、smile、grin、flat、wobble、cat；可设置 `blush`。
- 颜色：`col` / `dk` / `lt` 覆盖身体及明暗色。
- 帽子：party、hard、crown、halo、wizard、hood、top、fedora、band、sweatband、cat、masq、mask、bowtie。
- `lid`：0–1，控制带牙齿的身体顶部开合。
- `draw(u, sw)`：在角色局部空间绘制配饰，身体范围约 x −5u 到 5u、y −8u 到 −2u。`armL(u, sw)` / `armR(u, sw)` 在手臂末端绘制道具，局部 +x 为向外。
- `emote` 与 `emoteK`：头部反应标记，可用 sweat、spark、heart、anger、music、swirl、zzz、!、?、!?、!!。
- `mood(t, [[t0, 'normal'], [t1, 'scared', 'sweat'], ...])` 返回 `eyes`、`squint`、`take`、`emote`、`emoteK`，可展开传给角色，用眨眼、挤压和出现动作衔接表情。
- `move(style, t, seed)` 返回动作姿态，样式包括 bounce、hop、roof、sway、spin、wave、walk、run、idle、stomp、shimmy、mix；`dancer(x, y, u, style, t, extra)` 合并角色与动作。上游动作可能受固定节拍驱动，使用前核对并按旁白调整。
- 尺寸参考：小角色 u≈6–10，普通 u≈16–22，主体或近景 u≈30–60；实际按画幅与构图调整。

**研究者** 使用 `researcher(x, y, s, o)`，是白大褂、圆眼镜和手绘头发的人物，总高约 13.2s；s≈0.75u 时，其头部约与 Clawd 眼睛齐平。

- 姿态：`dy`、`sq`、`rot`、`flip`、`spin`、`aL` / `aR`、`walk`、`run`、`sit`、`back`；手臂约 −1.25 表示下垂。
- 眼睛：dot、wide、star、swirl、closed、sad、x、heart、look。眉毛 `brows`：worried、angry、up。嘴型：smile、o、O、flat、wobble、grin。
- 其他：`hairUp` 0–1、`glassesTilt`、`bowtie`、`blush`、`squint`、`emote` / `emoteK`。
- `draw(s, sw)`、`handL(s, sw)`、`handR(s, sw)` 用于配饰与手持道具。
- `researcherDancer(x, y, s, style, t, extra)` 合并人物与动作，使用前同样检查节拍依赖。

多名 Clawd 可通过多次调用并更换帽子实现。自定义角色可在场景私有函数中绘制；确需多个场景复用时可注册到 `CAST`，不强制添加原歌曲角色。

## 可选道具

- `stageBack(t, o)`：舞台背景与地板。`o.a` / `o.b` 控制默认水彩放射背景，`o.backdrop(t)` 可替换，`o.spots = [[x, colour], ...]` 添加聚光灯。上游地板使用固定坐标，其他画幅使用前适配布局。
- `stageFront(t, o)`：侧幕和檐幕，最后绘制；`o.curtain` 为 0–1 闭合程度，`o.alarm` 为 0–1 红色警报色层。
- `meterProp(x, y, s, v, o)`：温度计形仪表，s=1 时高约 560 像素；支持 `o.cracked` 与 `o.glow`。数值 v 应由实际内容提供，不调用歌曲专用的 P(doom) 时间序列。
- `pumpProp(x, y, s, h, hoseTo)`：打气筒，h 为 0–1 手柄高度。`pumpH(t)` 是原节拍驱动的辅助函数；旁白动画可直接从实际过程计算 h。
- `sunburst(cx, cy, a, b, rot, n, r, op)`：放射色纹。
- `spotlight(x, colour)`：聚光灯。

## 风格与绘制成本

画面保持绘本式水彩与墨线。角色或实体用平涂加轮廓，常见轮廓线宽约 .8–1.6；背景用柔和水彩填充，无轮廓或细轮廓；柔光采用低透明度。材质主要来自水彩填充与少量排线。

每个场景在分镜中确定协调的调色板，主体与背景保持清晰对比。镜头长度由实际讲解决定，不套用歌曲固定节拍或固定切镜间隔。

离线渲染可优先画面质量，但仍需根据实际日志中的每帧耗时控制成本。水彩填充和笔画数量会增加绘制时间，优先使用更少、更大的有效形状，避免无意义的数千个笔画。先以 1–2 个 worker 预览并观察表现，再调整并行数。

## 检查画面

使用随包运行工具生成联系表和编码片段，通过当前环境的图片、视频和音频查看能力检查。

- 抽查每镜头第一帧、最后有效帧和中间动作；动作关键点可采样相邻时间，确认构图与姿态变化。
- 检查场景进出转场、中文字体、尺寸、对比、遮挡和字幕区域。
- 用编码片段判断连续运动、节奏、原声和音画对应；相邻静帧仍不足以证明完整运动质量。
- 修改有问题的场景后重新预览，再输出当前版本的全片，保留实际检查覆盖与尚未检查的内容。
