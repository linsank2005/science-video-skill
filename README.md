# science-video Skill

把已经录好的 MP3 旁白，制作成水彩手绘风格的科普动画。

这个 Skill 供具备文件读写、程序执行和媒体查看能力的 AI 编程助手使用。助手根据真实旁白编写分镜与场景动画，工具完成本地转录、逐帧绘制、视频合成和媒体校验。默认 1920×1080、24 fps，也可按需求制作竖屏或其他画幅。

**[下载完整 Skill 包](downloads/science-video.zip)** · **[查看 Skill 内容](science-video/SKILL.md)**

## 怎么使用

1. 下载上面的完整包，解压后保留整个 `science-video/` 文件夹。
2. 将该文件夹放入所用 AI 编程助手的 Skill 目录，或让助手直接读取其中的 `SKILL.md`。
3. 提供已录好的 MP3 附件或助手可访问的文件路径，发送下面的请求。

> 使用 science-video，将我提供的 MP3 旁白制作成科普动画。保留水彩手绘风格，1920×1080、24 fps，交付成片、独立字幕、分镜和可编辑源码。

可以同时提供 SRT、原稿、视频标题、画幅、参考风格。需要先审分镜时，在请求中说明。使用现有旁白，不重新写旁白或生成配音。

## 原理与运行环境

流程是：**MP3 旁白 → 带时间戳的字幕 → 分镜 → p5.js / p5.brush 水彩场景 → 无头浏览器逐帧绘制 → FFmpeg 合成**。

分享包附有参考文档、运行脚本和依赖锁定文件，不依赖分享者电脑上的路径。首次使用由助手检查环境，复用兼容的工具，或将随包运行工具复制到用户工作区后配置依赖。

- 必需环境：满足依赖版本要求的 Node.js、p5.js、p5.brush、Puppeteer、Chrome 或 Edge、FFmpeg、FFprobe，以及可用的中文字体。
- 仅提供 MP3 时：使用 Python 与 faster-whisper 本地转录，首次需要下载模型；模型已缓存后可离线转录。本地转录不需要 OpenAI API Key。
- 同时提供 SRT 时：直接导入字幕，可跳过 Python 转录环境。

运行环境和模型需要实际安装或下载；Skill 包不内置 Node.js、浏览器、FFmpeg 二进制或转录模型。具体由助手根据接收者的操作系统和实际路径配置。

## 交付内容

每条视频单独保存项目，输出包含：

- `out/video.mp4`：最终成片。
- `subtitles.srt`：独立、可编辑字幕。
- `STORYBOARD.md`：分镜与讲解目标。
- `scenes/`：可编辑动画场景代码。
- `project.json`、`transcript.json`：项目配置与字幕源。
- `out/verification.json`：媒体结构校验报告。

原 MP3 仅复制；时间线以实际音频时长为依据。静帧用于检查构图、中文和字幕，编码片段用于检查连续运动、声音与音画对应。默认输出位于工作区运行工具的独立 `videos/` 任务目录，也可指定其他任务位置。

## 包内结构

```text
science-video/
  SKILL.md                 完整制作要求与工作流程
  agents/openai.yaml       Codex Skill 界面信息
  references/              制作说明与绘画 API
  assets/runtime/          项目、转录、预览、渲染与合成工具
downloads/
  science-video.zip         完整 Skill 下载包
```

基础绘画与渲染代码来自 [JohnHeibel/PDoomVideo](https://github.com/JohnHeibel/PDoomVideo) 的本地科普视频适配；运行包保留依赖声明和锁定文件。Skill 正文使用可迁移的环境说明，保留转录、分镜、动画、预览、渲染与交付要求。

本版本已检查 Skill 格式、文件引用、脚本语法和下载包完整性，尚未在其他电脑上完成全流程运行验证。
