import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) { args._.push(arg); continue; }
    const equal = arg.indexOf('=');
    if (equal !== -1) args[arg.slice(2, equal)] = arg.slice(equal + 1);
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) args[arg.slice(2)] = argv[++i];
    else args[arg.slice(2)] = true;
  }
  return args;
}

export function positive(value, label, integer = false) {
  if (typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value) <= 0 || (integer && !Number.isInteger(Number(value)))) {
    throw new Error(`${label} must be a positive ${integer ? 'integer' : 'number'}.`);
  }
  return Number(value);
}

export function run(command, args, options = {}) {
  return new Promise((ok, bad) => {
    const child = spawn(command, args, { stdio: 'inherit', windowsHide: true, ...options });
    child.once('error', bad);
    child.once('close', (code, signal) => code === 0 ? ok() : bad(new Error(`${command} exited ${code ?? signal}`)));
  });
}

export function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || `${command}: ${result.stderr?.trim() || `exit ${result.status}`}`);
  return result.stdout;
}

export function tool(name, explicit) {
  const env = process.env[`VIDEO_${name.toUpperCase()}`];
  if (explicit || env) return String(explicit || env);
  const win = process.platform === 'win32';
  const candidates = name === 'chrome' ? (win ? [
    join(process.env.PROGRAMFILES || 'C:/Program Files', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)', 'Microsoft/Edge/Application/msedge.exe'),
    join(process.env.LOCALAPPDATA || 'C:/Users/Default/AppData/Local', 'Google/Chrome/Application/chrome.exe'),
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'])
    : name === 'python' ? [join(ROOT, '.venv', win ? 'Scripts/python.exe' : 'bin/python')]
      : [];
  const found = candidates.find(existsSync);
  if (found) return found;
  if (name === 'chrome') throw new Error('Chrome/Edge not found. Pass --chrome <path> or set VIDEO_CHROME.');
  return name === 'python' && !win ? 'python3' : name;
}

export function probe(file, ffprobe) {
  const data = JSON.parse(capture(tool('ffprobe', ffprobe), ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', resolve(file)]));
  if (!data.streams?.some(stream => stream.codec_type === 'audio')) throw new Error(`No audio stream: ${file}`);
  return { ...data, duration: positive(data.format?.duration, 'audio duration') };
}

export function inside(base, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path)) throw new Error(`Expected a relative project path: ${path}`);
  const full = resolve(base, path), rel = relative(base, full);
  if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel)) throw new Error(`Path leaves the project: ${path}`);
  return full;
}

export function filesUnder(directory, excluded = new Set()) {
  return readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path, excluded) : entry.isFile() ? [path] : [];
  });
}

export function fingerprint(files) {
  const hash = createHash('sha256');
  for (const file of [...new Set(files)].sort()) hash.update(file).update('\0').update(readFileSync(file)).update('\0');
  return hash.digest('hex');
}

export function srtTime(seconds) {
  const n = Math.round(seconds * 1000);
  return `${String(Math.floor(n / 3600000)).padStart(2, '0')}:${String(Math.floor(n / 60000) % 60).padStart(2, '0')}:${String(Math.floor(n / 1000) % 60).padStart(2, '0')},${String(n % 1000).padStart(3, '0')}`;
}

export function toSrt(segments) {
  return segments.map((cue, i) => `${i + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`).join('\n');
}

export function parseSrt(text) {
  const timestamp = '(\\d{2,}):(\\d{2}):(\\d{2})[,.](\\d{3})';
  const pattern = new RegExp(`^${timestamp}\\s+-->\\s+${timestamp}(?:\\s+.*)?$`);
  const seconds = parts => (Number(parts[0]) * 3600000 + Number(parts[1]) * 60000 + Number(parts[2]) * 1000 + Number(parts[3])) / 1000;
  return text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/).filter(Boolean).map((block, i) => {
    const lines = block.split('\n');
    if (/^\d+$/.test(lines[0])) lines.shift();
    const match = lines.shift()?.match(pattern);
    if (!match || !lines.join('\n').trim()) throw new Error(`Invalid SRT cue ${i + 1}.`);
    if ([match[2], match[3], match[6], match[7]].some(value => Number(value) >= 60)) throw new Error(`Invalid SRT timestamp in cue ${i + 1}.`);
    return { start: seconds(match.slice(1, 5)), end: seconds(match.slice(5, 9)), text: lines.join('\n').trim() };
  });
}
