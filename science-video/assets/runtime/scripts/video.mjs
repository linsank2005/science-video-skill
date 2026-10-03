import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, capture, parseArgs, probe, run, tool } from './lib.mjs';
import { buildProject, importSrt, initProject, loadProject, saveJson, validateCaptions } from './project.mjs';
import { renderVideo } from './render-video.mjs';

const HELP = `Portable science video runtime

Entry: scripts/video.mjs. The first argument selects an action:
  doctor     Inspect Node, painting dependencies, browser, media tools and optional Python.
  init       Create a task from --audio; optionally import --srt.
  transcribe Recognize speech or import --srt; default model small, language zh.
  build      Rebuild subtitles, text and the preview page from authoritative sources.
  check      Validate project data and final-ready scene status.
  sheet      Paint a contact sheet at --times; defaults to scene midpoints.
  stills     Paint PNG frames at --times.
  clip       Encode an audio-backed preview at --range start:end.
  preview    Build the interactive preview page.
  render     Paint all frames, encode and verify; --frames-only skips encoding.
  encode     Encode a complete frame set from the current project revision.
  verify     Inspect the final video; --file can override its location.

Task selector: --dir (actual task directory) or --name (directory under runtime videos).
Input: --audio, --srt, --title. Layout: --width, --height, --fps; default 1920x1080, 24 fps.
Transcription: --model, --model-dir, --language, --device, --compute-type, --max-chars, --prompt.
Preview: --times, --range, --cols, --sheet-width. Rendering: --workers, --out.
Use --draft only to inspect unfinished projects; final render and encode reject drafts.
Tool locations: --chrome, --ffmpeg, --ffprobe, --python, or VIDEO_<TOOL> environment variables.
Resolve all paths in the recipient's actual environment; spaces and Chinese are supported.
The assistant authors the storyboard and animation; scaffolds are not finished videos.
`;

function projectDir(args) {
  if (typeof args.dir === 'string') return resolve(args.dir);
  if (typeof args.name !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u.test(args.name) || /[. ]$/.test(args.name) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(args.name)) throw new Error('Provide --name <single directory name> or --dir <project path>.');
  return join(ROOT, 'videos', args.name);
}

function doctor(args) {
  const checks = { node: { status: 'ok', version: process.version } };
  for (const name of ['chrome', 'ffmpeg', 'ffprobe', 'python']) {
    try {
      const path = tool(name, args[name]);
      const info = name === 'chrome' ? (existsSync(path) ? 'browser executable found' : (() => { throw new Error('Browser executable missing.'); })())
        : capture(path, name === 'python' ? ['-c', 'import faster_whisper; import importlib.metadata; print("faster-whisper " + importlib.metadata.version("faster-whisper"))'] : ['-version']).trim().split('\n')[0];
      checks[name] = { status: 'ok', path, info };
    } catch (error) { checks[name] = { status: 'missing', error: error.message }; }
  }
  checks.dependencies = { status: existsSync(join(ROOT, 'node_modules/p5/lib/p5.min.js')) && existsSync(join(ROOT, 'node_modules/p5.brush/dist/p5.brush.js')) ? 'ok' : 'missing' };
  console.log(JSON.stringify(checks, null, 2));
  if (checks.python.status === 'missing') console.log('MP3-only input requires faster-whisper from requirements-transcribe.txt in an isolated Python environment. Discover its interpreter for the current OS and supply --python if needed. An existing SRT skips speech recognition.');
  if (['chrome', 'ffmpeg', 'ffprobe', 'dependencies'].some(name => checks[name].status === 'missing')) process.exitCode = 1;
}

export function verifyVideo(dir, file, args = {}) {
  const { project } = loadProject(dir, { ffprobe: args.ffprobe });
  const media = probe(file, args.ffprobe), video = media.streams.find(stream => stream.codec_type === 'video'), audio = media.streams.find(stream => stream.codec_type === 'audio');
  if (!video || !audio) throw new Error('Export must contain video and audio streams.');
  const ratio = String(video.avg_frame_rate).split('/').map(Number), actualFps = ratio[0] / ratio[1];
  const tolerance = Math.max(.1, 2 / project.fps);
  const checks = {
    resolution: video.width === project.width && video.height === project.height,
    codecs: video.codec_name === 'h264' && video.pix_fmt === 'yuv420p' && audio.codec_name === 'aac',
    fps: Math.abs(actualFps - project.fps) < .01,
    duration: Math.abs(media.duration - project.duration) <= tolerance,
    audioDuration: Number.isFinite(Number(audio.duration)) && Math.abs(Number(audio.duration) - project.duration) <= tolerance,
    videoDuration: Number.isFinite(Number(video.duration)) && Math.abs(Number(video.duration) - project.duration) <= tolerance,
    frameCount: Number.isFinite(Number(video.nb_frames)) && Math.abs(Number(video.nb_frames) - Math.ceil(project.duration * project.fps - 1e-8)) <= 1,
    editableSubtitles: existsSync(join(dir, 'subtitles.srt')) && readFileSync(join(dir, 'subtitles.srt'), 'utf8').trim().length > 0,
  };
  const report = { status: Object.values(checks).every(Boolean) ? 'passed' : 'failed', checkedAt: new Date().toISOString(), file: resolve(file),
    expected: { width: project.width, height: project.height, fps: project.fps, duration: project.duration },
    actual: { width: video.width, height: video.height, fps: actualFps, duration: media.duration, audioDuration: audio.duration, videoDuration: video.duration, frames: video.nb_frames },
    checks, visualAndSemanticReview: 'Review the contact sheets and encoded playback separately; these checks only verify media structure.' };
  mkdirSync(join(dir, 'out'), { recursive: true }); saveJson(join(dir, 'out', 'verification.json'), report);
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'passed') throw new Error('Export verification failed; see out/verification.json.');
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv), command = args._[0];
  if (!command || args.help || command === 'help') { console.log(HELP); return; }
  if (command === 'doctor') { doctor(args); return; }
  const commands = ['init', 'transcribe', 'build', 'check', 'sheet', 'stills', 'clip', 'preview', 'render', 'encode', 'verify'];
  if (!commands.includes(command)) throw new Error(`Unknown command: ${command}. Use --help.`);
  const dir = projectDir(args);
  if (command === 'init') {
    const project = initProject(dir, args);
    console.log(`Created ${dir}\nAudio: ${project.duration.toFixed(3)}s, ${project.width}x${project.height}, ${project.fps}fps\nNext: transcribe, then author STORYBOARD.md, project.json and scenes/*.js.`);
    return;
  }
  if (command === 'transcribe') {
    const { project, audio } = loadProject(dir, { draft: true, ffprobe: args.ffprobe });
    if (args.srt) importSrt(dir, resolve(args.srt));
    else {
      const temp = join(dir, 'out', 'transcript.pending.json');
      const params = [join(ROOT, 'scripts', 'transcribe.py'), '--audio', audio, '--out', temp, '--model', args.model || 'small', '--language', args.language || 'zh'];
      for (const option of ['model-dir', 'device', 'compute-type', 'max-chars', 'prompt']) if (args[option]) params.push(`--${option}`, String(args[option]));
      try {
        await run(tool('python', args.python), params, { env: { ...process.env, PYTHONUTF8: '1' } });
        const transcript = JSON.parse(readFileSync(temp, 'utf8'));
        validateCaptions(transcript.segments, project.duration);
        renameSync(temp, join(dir, 'transcript.json'));
      } finally { rmSync(temp, { force: true }); }
    }
    buildProject(dir, { draft: true, ffprobe: args.ffprobe });
    console.log(`Transcript and editable SRT written in ${dir}; check scientific terms before storyboarding.`);
    return;
  }
  if (command === 'check') {
    const data = loadProject(dir, { draft: !!args.draft, ffprobe: args.ffprobe });
    console.log(`Valid ${args.draft ? 'draft' : 'final-ready'} project: ${data.project.scenes.length} scenes, ${data.transcript.segments.length} timed cues, ${data.project.duration}s. Browser execution is checked when rendering a sheet/clip.`);
    return;
  }
  if (command === 'verify') { verifyVideo(dir, resolve(args.file || join(dir, 'out', 'video.mp4')), args); return; }
  const draft = !!args.draft || ['sheet', 'stills', 'clip', 'preview'].includes(command);
  const data = buildProject(dir, { draft, ffprobe: args.ffprobe });
  if (command === 'build' || command === 'preview') {
    console.log(`${draft ? 'DRAFT' : 'Built'} preview: ${pathToFileURL(data.entry).href}`);
    return;
  }
  if (draft) console.log('DRAFT preview; unfinished scenes may be present.');
  if (command === 'render') {
    if (args.draft) throw new Error('Final render does not accept --draft. Use sheet/clip to preview unfinished scenes.');
    await renderVideo(data, 'frames', args);
    if (!args['frames-only']) { const file = await renderVideo(data, 'encode', args); verifyVideo(dir, file, args); }
  } else if (command === 'encode') {
    if (args.draft) throw new Error('Final encode does not accept --draft.');
    const file = await renderVideo(data, 'encode', args); verifyVideo(dir, file, args);
  } else await renderVideo(data, command, args);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main().catch(error => { console.error(`video: ${error.message}`); process.exitCode = 1; });
}
