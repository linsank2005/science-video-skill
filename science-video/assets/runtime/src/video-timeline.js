// Narration timeline: scene modules use the original chapter(name, start, end, shots) API.
const CH = [];
const LOOPS = {};
function chapter(name, start, end, shots) {
  if (CH.some(item => item.name === name)) throw new Error(`Duplicate chapter: ${name}`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Array.isArray(shots) || !shots.length) throw new Error(`Invalid chapter: ${name}`);
  shots.forEach(([time, draw], i) => {
    if (!Number.isFinite(time) || typeof draw !== 'function' || time < start || time >= end || (i && time <= shots[i - 1][0])) throw new Error(`Invalid shot ${i} in ${name}`);
  });
  if (Math.abs(shots[0][0] - start) > .001) throw new Error(`First shot must start at ${start}: ${name}`);
  CH.push({ name, start, end, shots });
  CH.sort((a, b) => a.start - b.start);
}

window.validateTimeline = () => {
  const plan = window.VIDEO_PROJECT.scenes;
  if (CH.length !== plan.length) throw new Error('Registered chapters do not match project.json scenes.');
  plan.forEach((scene, i) => {
    const ch = CH[i];
    if (ch.name !== scene.id || Math.abs(ch.start - scene.start) > .001 || Math.abs(ch.end - scene.end) > .001) throw new Error(`Chapter timing does not match project.json: ${scene.id}`);
  });
};

function drawWorld(t) {
  const ch = CH.find(item => t >= item.start && t < item.end);
  if (!ch) throw new Error(`No chapter covers ${t.toFixed(3)}s.`);
  let i = 0;
  while (i + 1 < ch.shots.length && t >= ch.shots[i + 1][0]) i++;
  const start = ch.shots[i][0], end = ch.shots[i + 1]?.[0] ?? ch.end;
  ch.shots[i][1](t, t - start, end - start);
  if (CAM) throw new Error(`Unclosed camBegin() in ${ch.name}.`);
  flushLetters();
  window.VIDEO_PROJECT.scenes.forEach((scene, index) => {
    if (index && scene.transition === 'wipe' && Math.abs(t - scene.start) < .25) narrationWipe((t - scene.start + .25) / .5);
  });
  if (window.VIDEO_PROJECT.subtitles.enabled) KARAOKE = window.VIDEO_PROJECT.captions.find(cue => t >= cue.start && t < cue.end) || null;
}

function narrationWipe(progress) {
  const edge = progress < .5 ? lerp(-W * .2, W * 1.2, easeOut(progress * 2)) : lerp(-W * .2, W * 1.2, ease((progress - .5) * 2));
  for (let i = 0; i < 5; i++) {
    const x = progress < .5 ? -W * .2 : edge;
    const width = progress < .5 ? edge + W * .2 : W * 1.2 - edge;
    if (width > 1) paint(rectPts(x, i * H / 5 - 12, width, H / 5 + 26, 6), { wash: i % 2 ? PAL.teal : PAL.sky, ink: null });
  }
}

// Sentence captions, without estimating karaoke word timings. Subtitles are drawn above the paper grain.
function drawKaraokeText(c) {
  if (!KARAOKE) return;
  const config = window.VIDEO_PROJECT.subtitles, maxWidth = W * .88;
  const wrap = text => {
    const lines = [];
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (const character of Array.from(paragraph)) {
        if (line && c.measureText(line + character).width > maxWidth) { lines.push(line.trim()); line = ''; }
        line += character;
      }
      if (line.trim()) lines.push(line.trim());
    }
    return lines;
  };
  c.save();
  let size = config.fontSize, lines;
  do { c.font = `600 ${size}px ${config.font}`; lines = wrap(KARAOKE.text); if (lines.length <= config.maxLines) break; size -= 2; } while (size >= Math.max(20, config.fontSize * .6));
  if (lines.length > config.maxLines) { c.restore(); throw new Error(`Subtitle too long; split this cue in transcript.json: ${KARAOKE.text}`); }
  const lineHeight = size * 1.35, padding = size * .4;
  const width = Math.max(...lines.map(line => c.measureText(line).width)) + padding * 2;
  const height = lines.length * lineHeight + padding, x = (W - width) / 2, y = H - H * .035 - height;
  c.fillStyle = 'rgba(43,34,51,.9)'; c.beginPath(); c.roundRect(x, y, width, height, size * .18); c.fill();
  c.fillStyle = PAL.cream; c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((line, index) => c.fillText(line, W / 2, y + padding / 2 + lineHeight * (index + .5)));
  c.restore();
}
