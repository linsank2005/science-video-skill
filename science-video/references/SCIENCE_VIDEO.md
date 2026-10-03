# 科普视频制作与运行说明

本分享包沿用 PDoomVideo 的流程：实际旁白 → 带时间戳的转录 → 分镜 → p5.js / p5.brush 场景 → 无头浏览器逐帧绘制 → FFmpeg 合成。AI 助手负责理解和创作，运行工具负责重复执行。

## 运行工具与环境

随包工具位于 Skill 的 `assets/runtime/`。首次使用时将此目录完整复制到用户工作区的独立运行目录，再在该副本中安装依赖和创建视频任务。保留其中的文件层级，运行工具会从自身位置解析依赖和共享绘画代码。不要把任务文件或依赖安装到 Skill 安装目录。

已有兼容的 PDoomVideo 科普制作环境时可直接复用。上游歌曲示例不一定包含本地适配的科普工具，不能仅凭仓库名称就假定它支持本说明中的功能；检查实际文件和接口后决定。

| 资源 | 用途 |
|---|---|
| `package.json`、`package-lock.json` | Node 依赖及可复现版本，包含 p5.js、p5.brush、puppeteer-core |
| `scripts/video.mjs` | 制作入口与操作帮助，包含环境、项目、转录、预览、渲染和交付校验 |
| `scripts/lib.mjs` | 工具发现、实际媒体探测、路径、字幕和内容指纹 |
| `scripts/project.mjs` | 初始化、字幕导入、数据校验和生成预览页面 |
| `scripts/render-video.mjs` | 逐帧绘制、帧缓存、联系表、片段和 FFmpeg 合成 |
| `scripts/transcribe.py`、`requirements-transcribe.txt` | 可选的 faster-whisper 本地转录 |
| `src/` | 水彩绘画、可选角色、道具和旁白时间线 |

Node 版本应满足锁定依赖的运行要求。Chrome 或 Edge、FFmpeg、FFprobe 与中文字体使用接收者环境中可用的版本；FFmpeg 需支持 H.264 和 AAC。工具支持通过参数或对应的 `VIDEO_CHROME`、`VIDEO_FFMPEG`、`VIDEO_FFPROBE`、`VIDEO_PYTHON` 环境变量指定位置。优先采用单次调用的参数，避免修改全局环境。

仅有 MP3 时需要 Python 与 faster-whisper；转录默认 small 模型、中文、CPU / int8，带词时间戳，不需要付费转录服务或 OpenAI API Key。模型首次下载，缓存后可离线使用，也可配置已有模型目录与下载位置。已有 SRT 可直接导入，跳过 Python 转录依赖。

助手读取运行入口的帮助，根据实际操作系统与路径构造调用。以下保留工具接口名称和参数含义，不提供任何分享者电脑上的执行命令。

| 接口 | 作用与适用阶段 |
|---|---|
| `doctor` | 检查运行环境；已有 SRT 时不要求 Python 转录可用 |
| `init` | 探测实际音频时长，复制音频，创建任务；生成的场景是草稿 |
| `transcribe` | 对 MP3 转录，或导入现成 SRT，生成字幕权威来源 |
| `build` | 从项目与字幕源重新生成 SRT、文本、页面和页面数据 |
| `sheet`、`stills` | 按实际时间点绘制联系表或静帧，可检查草稿 |
| `clip` | 输出带原音频的编码片段，可检查草稿 |
| `preview` | 生成可拖动时间轴、带音频控件的本地预览页面 |
| `check` | 校验配置、字幕、场景状态和文件；浏览器执行由帧或片段预览检查 |
| `render` | 最终逐帧绘制、合成和媒体校验，拒绝草稿与空转录 |
| `encode` | 仅合成当前版本已经完整绘制的帧，拒绝草稿与缺帧 |
| `verify` | 重新检查最终 MP4 并保存媒体结构报告 |

任务选择使用 `name` 或 `dir`，路径取实际工作区位置。音频与字幕分别由 `audio`、`srt` 指定；画幅和帧率由 `width`、`height`、`fps` 配置；预览由 `times`、`range` 指定；并行数由 `workers` 指定。浏览器、FFmpeg、FFprobe、Python 可分别覆盖为实际路径。转录支持模型、模型目录、语言、计算设备与精度、字幕长度及真实术语提示；完整参数以运行入口为准。

## 一条视频的文件

默认在运行工作区的 `videos/` 下建立独立任务目录，也可指定其他任务位置。目录名根据本次任务确定。

```text
视频任务目录/
  narration.mp3         原音频的完整副本
  project.json          画幅、帧率、音频实际时长、场景与字幕设置
  transcript.json       字幕权威来源；自动转录另存词时间戳
  transcript.txt        从 JSON 导出的文本
  subtitles.srt         独立、可编辑字幕
  STORYBOARD.md         AI 助手编写的分镜
  scenes/               AI 助手编写的场景代码
  project-data.js       构建生成的页面数据
  studio.html           可拖动时间轴、有音频控件的预览页面
  out/
    sheet.jpg           联系表
    preview.mp4         带原音频的片段
    frames/             按内容指纹区分的可续渲帧缓存
    video.mp4           最终 MP4，默认包含画面字幕
    verification.json   分辨率、编码、帧率、时长与音视频流检查
```

视频修改只编辑该任务的 `project.json`、`transcript.json`、`STORYBOARD.md` 和 `scenes/`。生成文件由构建操作更新。原音频与上游示例分别保存；备份整个任务目录可以保留后续编辑依据。

默认 16:9、1920×1080、24 fps、水彩手绘；竖屏可配置为 1080×1920。`subtitles.enabled` 可关闭画面字幕，独立 SRT 仍然导出。`font` 和 `subtitles.font` 使用本地 CSS 字体列表，例如系统中的微软雅黑、Noto Sans CJK 或苹方；不依赖在线字体请求。

## 场景配置与绘画

`project.json` 使用 `version: 1`，包含非空的 `title`、相对任务目录的 `audio`、实际 `duration`、正整数 `width` / `height` / `fps`、本地 `font` 字体列表、`subtitles` 和 `scenes`。字幕设置包含 `enabled`、`font`、`fontSize`、`maxLines`；尺寸与字号需符合工具校验和实际可读性要求。

`transcript.json` 包含 `source`、`language` 和 `segments`；每条字幕包含 `start`、`end`、`text`，自动转录可另带 `words`。字幕顺序有序、起止时间有效、不重叠，不超出实际音频时长。

场景按时间排序，首场从 0 开始，最后一场到音频实际时长，中间不留空白或重叠。每个场景使用唯一 id，并由同名 `chapter` 注册，可包含多个镜头。下面是数据和 API 示例，时间与内容必须按本次旁白重新设计。

```json
{
  "id": "molecules",
  "start": 0,
  "end": 8.2,
  "module": "scenes/molecules.js",
  "transition": "cut",
  "status": "ready"
}
```

```javascript
(() => {
  function molecules(t, lt, dur) {
    paint(ellPts(W * .5, H * .43, W * .3, H * .27, 28, 4),
      { wash: PAL.sky, fill: PAL.teal, fillOp: 30, ink: null });
    for (let i = 0; i < 8; i++) {
      const phase = hash(i) * TAU + lt * (1 + i * .08);
      const x = W * .5 + Math.cos(phase) * W * .2;
      const y = H * .43 + Math.sin(phase) * H * .17;
      paint(ellPts(x, y, H * .025, H * .025, 16, 1),
        { wash: PAL.ochre, ink: PAL.ink, sw: .7 });
    }
    letter('粒子的运动', W * .5, H * .12, W * .035, PAL.ink, { ink: false });
  }
  chapter('molecules', 0, 8.2, [[0, molecules]]);
})();
```

镜头起点使用全片时间，首镜头与场景起点一致。`draw(t, lt, dur)` 中 `lt` 从当前镜头起点计算，`dur` 到下一个镜头或场景终点为止。每帧从时间计算完整画面，支持并行与乱序绘制。

转场支持 `cut` 或 `wipe`，表示进入当前场景的方式。正文标签保留必要的术语与单位，用图形表达主要关系，并为底部约 18% 的字幕区域留空。没有引用数据时，不绘制像真实测量结果的精确曲线。

详细绘画、角色和材质 API 见 [绘画参考](ANIMATION_GUIDE.md)。Clawd、研究者和舞台道具均为可选素材，不默认加入每条视频；原歌曲的固定节拍与章节不决定旁白视频的时间线。

## 渲染与检查

初始化生成的场景处于 `draft` 状态，仅用于搭建与预览。实际实现并检查后才能设为 `ready`。全片渲染和单独合成均要求完整转录与所有场景就绪；不能用草稿选项放行最终成片。

帧缓存按输入、源码、字幕、配置及渲染工具的内容指纹隔离；同版本可续渲，新版本使用新的缓存。旧缓存不自动删除。只绘帧模式可分开绘制与合成，但编码时仍需确认当前版本的所有帧齐全。

实时页面预览受绘画速度影响，最终节奏、连续运动和音画对应需用编码片段判断。帧检查覆盖镜头起止、主要动作中间时刻、字幕和关键转场；采样时间必须小于音频时长。结构校验检查最终流、时长、帧数、分辨率、编码和独立 SRT；不能代替科学准确性、视觉质量、声音语义和同步检查。

保留 MP4、SRT、分镜、项目配置、字幕源、场景代码和校验报告。交付时按实际检查覆盖说明结果，无法查看或试听的部分明确标为尚未检查。
