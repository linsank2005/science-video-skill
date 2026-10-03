// Same offline painting pipeline as render.mjs, configured for independent narration projects.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { positive, run, tool } from './lib.mjs';

function times(value, duration) {
  const result = String(value).split(',').map(Number);
  if (!result.length || result.some(t => !Number.isFinite(t) || t < 0 || t >= duration)) throw new Error(`Preview times must be within [0, ${duration}).`);
  return result;
}

function frameState(data) {
  return { signature: data.signature, width: data.project.width, height: data.project.height, fps: data.project.fps, duration: data.project.duration };
}

function checkFrameState(data, create = false) {
  const file = join(data.frames, 'render-state.json'), expected = frameState(data);
  if (!existsSync(file)) {
    if (!create) throw new Error('No rendered frame set for this project revision. Run render first.');
    mkdirSync(data.frames, { recursive: true });
    writeFileSync(file, JSON.stringify(expected, null, 2) + '\n');
  } else if (JSON.stringify(JSON.parse(readFileSync(file, 'utf8'))) !== JSON.stringify(expected)) throw new Error('Frame cache belongs to a different project revision.');
}

export async function renderVideo(data, mode, args = {}) {
  const { duration, width, height, fps } = data.project;
  const outputDir = dirname(data.entry), ffmpeg = tool('ffmpeg', args.ffmpeg);
  const count = Math.ceil(duration * fps - 1e-8);
  const out = resolve(args.out || join(outputDir, 'out', mode === 'sheet' ? 'sheet.jpg' : mode === 'clip' ? 'preview.mp4' : mode === 'stills' ? 'stills' : 'video.mp4'));
  if (out === resolve(data.audio) || out === resolve(data.entry)) throw new Error('Output cannot replace project input files.');
  if (mode === 'encode') {
    checkFrameState(data);
    for (let i = 0; i < count; i++) {
      const file = join(data.frames, `f${String(i).padStart(7, '0')}.jpg`);
      if (!existsSync(file) || statSync(file).size < 1000) throw new Error(`Missing/invalid frame ${i}/${count}; resume render before encoding.`);
    }
    mkdirSync(dirname(out), { recursive: true });
    await run(ffmpeg, ['-y', '-v', 'error', '-stats', '-framerate', String(fps), '-i', join(data.frames, 'f%07d.jpg'), '-i', data.audio,
      '-map', '0:v:0', '-map', '1:a:0', '-t', String(duration), '-vf', 'scale=in_range=full:out_range=limited,format=yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
    console.log(`Wrote ${out}`);
    return out;
  }

  const selectedTimes = ['sheet', 'stills'].includes(mode) ? times(args.times || data.project.scenes.map(scene => ((scene.start + scene.end) / 2).toFixed(4)).join(','), duration) : null;
  const workers = positive(args.workers ?? 2, 'workers', true);
  if (workers > 8) throw new Error('Use at most 8 workers. Start with 1 or 2 for large canvases.');
  let range = [0, duration];
  if (mode === 'clip') {
    range = String(args.range || `0:${Math.min(8, duration)}`).split(':').map(Number);
    if (range.length !== 2 || range.some(t => !Number.isFinite(t)) || range[0] < 0 || range[1] <= range[0] || range[1] > duration + 1e-6) throw new Error('Clip range must be start:end within the audio.');
  }
  const browser = await puppeteer.launch({ executablePath: tool('chrome', args.chrome), headless: true, protocolTimeout: 0,
    args: ['--allow-file-access-from-files', '--ignore-gpu-blocklist', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : []), '--enable-gpu-rasterization', `--window-size=${width},${height}`, '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
  try {
    async function openPage() {
      const page = await browser.newPage(), errors = [];
      let rejectSetup;
      const setupFailed = new Promise((_, reject) => { rejectSetup = reject; });
      setupFailed.catch(() => {});
      page.on('pageerror', error => { errors.push(error.message); rejectSetup(error); console.error(`Scene error: ${error.message}`); });
      await page.goto(pathToFileURL(data.entry).href + '?render', { waitUntil: 'load' });
      await Promise.race([page.waitForFunction('window.ready === true', { timeout: 60000 }), setupFailed]).catch(error => { throw new Error(errors.join('\n') || error.message); });
      if (errors.length) throw new Error(errors.join('\n'));
      page.renderErrors = errors;
      return page;
    }
    async function frame(page, t, type = 'image/jpeg') {
      if (page.renderErrors.length) throw new Error(page.renderErrors.join('\n'));
      const url = await page.evaluate((time, mime) => window.renderAt(time, mime, .94), t, type);
      if (page.renderErrors.length) throw new Error(page.renderErrors.join('\n'));
      return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
    }
    if (mode === 'sheet') {
      const page = await openPage();
      const cols = positive(args.cols ?? 3, 'cols', true), sheetWidth = positive(args['sheet-width'] ?? 640, 'sheet-width', true);
      const { url, ms } = await page.evaluate((ts, c, w) => window.renderSheet(ts, c, w), selectedTimes, cols, sheetWidth);
      mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      console.log(`${out}; ms/frame: ${ms.join(' ')}`);
    } else if (mode === 'stills') {
      const page = await openPage(); mkdirSync(out, { recursive: true });
      for (const t of selectedTimes) writeFileSync(join(out, `t${t.toFixed(3).replace('.', '_')}.png`), await frame(page, t, 'image/png'));
      console.log(`Wrote ${selectedTimes.length} stills to ${out}`);
    } else if (mode === 'frames') {
      checkFrameState(data, true);
      const todo = [];
      for (let i = 0; i < count; i++) { const file = join(data.frames, `f${String(i).padStart(7, '0')}.jpg`); if (!existsSync(file) || statSync(file).size < 1000) todo.push(i); }
      console.log(`${todo.length}/${count} frames to paint, ${workers} workers; ${data.frames}`);
      if (!todo.length) return data.frames;
      let next = 0, done = 0; const start = Date.now();
      const jobs = Array.from({ length: Math.min(workers, todo.length) }, async () => {
        const page = await openPage();
        while (next < todo.length) {
          const i = todo[next++], file = join(data.frames, `f${String(i).padStart(7, '0')}.jpg`);
          writeFileSync(file + '.tmp', await frame(page, i / fps)); renameSync(file + '.tmp', file);
          if (++done % 24 === 0 || done === todo.length) {
            const seconds = (Date.now() - start) / 1000;
            console.log(`frame ${done}/${todo.length}; ${(seconds * 1000 / done).toFixed(0)} ms/frame; ETA ${((todo.length - done) * seconds / done / 60).toFixed(1)} min`);
          }
        }
      });
      const results = await Promise.allSettled(jobs);
      const failed = results.find(result => result.status === 'rejected');
      if (failed) throw failed.reason;
      return data.frames;
    } else if (mode === 'clip') {
      const page = await openPage(), [a, b] = range;
      mkdirSync(dirname(out), { recursive: true });
      const ff = spawn(ffmpeg, ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
        '-ss', String(a), '-i', data.audio, '-map', '0:v:0', '-map', '1:a:0', '-t', String(b - a), '-vf', 'scale=in_range=full:out_range=limited,format=yuv420p', '-color_range', 'tv', '-c:v', 'libx264', '-preset', 'medium',
        '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'], windowsHide: true });
      ff.stdin.on('error', () => {});
      const completed = new Promise((ok, bad) => { ff.once('error', bad); ff.once('close', code => code === 0 ? ok() : bad(new Error(`FFmpeg exited ${code}`))); });
      completed.catch(() => {});
      try {
        const n = Math.ceil((b - a) * fps - 1e-8);
        for (let i = 0; i < n; i++) {
          const buffer = await frame(page, a + i / fps);
          if (ff.exitCode !== null || ff.stdin.destroyed) throw new Error('FFmpeg stopped before the clip finished.');
          await new Promise((ok, bad) => ff.stdin.write(buffer, error => error ? bad(error) : ok()));
          if ((i + 1) % 24 === 0 || i === n - 1) console.log(`preview frame ${i + 1}/${n}`);
        }
        ff.stdin.end(); await completed;
      } catch (error) { ff.stdin.destroy(); ff.kill(); await completed.catch(() => {}); throw error; }
      console.log(`Wrote preview ${out}`);
    } else throw new Error(`Unknown rendering mode: ${mode}`);
    return out;
  } finally { await browser.close(); }
}
