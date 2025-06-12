/* Auto-2×-on-Silence ─────────────────────────────────────────────
   content.js  (2025-06-12)

   – Speeds video to FAST_RATE when audio is below a moving average
     threshold for > GRACE_MS.
   – Returns to NATURAL_RATE as soon as volume rises again.
   – Works even if the <video> is already wired to another
     Web-Audio graph (uses captureStream() in that case).
   – First-run “autotune” chooses a sane SILENCE_THRESHOLD.
*/

(async function main () {
  /*────────────────────────────
   *  0.  One-shot guard
   *───────────────────────────*/
  if (window.auto2xLoaded) return;
  window.auto2xLoaded = true;
  console.log('Auto-2×: boot');

  /*────────────────────────────
   *  1.  Find (or wait for) a <video>
   *───────────────────────────*/
  const video = await new Promise(res => {
    const seek = () => {
      const v = document.querySelector('video');
      v ? res(v) : requestAnimationFrame(seek);
    };
    seek();
  });

  /*────────────────────────────
   *  2.  Load / init settings
   *───────────────────────────*/
  const defaults = {
    SILENCE_THRESHOLD : 0.005,   // will be autocalibrated on first run
    GRACE_MS          : 400,
    FAST_RATE         : 2.0,
    NATURAL_RATE      : 1.0,
    enabled           : true,
    _calibrated       : false
  };

  let cfg = Object.assign(
      {}, defaults,
      await chrome.storage.sync.get(defaults)
  );

  /*────────────────────────────
   *  3.  Build audio analyser
   *───────────────────────────*/
  let ctx, source, analyser, buf;
  let usingCaptureStream = false;

  async function makeAnalyser () {
    if (ctx) return true;                 // already good

    ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();

    try {
      // 👉 *normal* path
      source   = ctx.createMediaElementSource(video);
    } catch (e) {
      console.warn('Auto-2×: element already tapped, falling back:', e?.message);
      // 👉 existing node –> fall back to captureStream()
      if (!video.captureStream) {
        console.error('Auto-2×: captureStream() unsupported, giving up');
        return false;
      }
      const stream = video.captureStream();
      source       = ctx.createMediaStreamSource(stream);
      usingCaptureStream = true;
    }

    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.8;

    source.connect(analyser);           // **do NOT connect to destination**
    buf = new Float32Array(analyser.frequencyBinCount);

    return true;
  }

  if (!(await makeAnalyser())) return;

  /*────────────────────────────
   *  4.  Helpers
   *───────────────────────────*/
  const rms = arr => {
    let sum = 0;
    for (let v of arr) sum += v * v;
    return Math.sqrt(sum / arr.length);
  };

  // Moving average for smoother detection
  const hist = [];
  const HIST_SIZE = 10;
  const updateHist = v => {
    hist.push(v);
    if (hist.length > HIST_SIZE) hist.shift();
    return hist.reduce((a,b)=>a+b,0) / hist.length;
  };

  /*────────────────────────────
   *  5.  First-run auto calibration
   *     – sample 1 s of “normal” audio
   *───────────────────────────*/
  if (!cfg._calibrated) {
    console.log('Auto-2×: calibrating threshold …');
    const samples = [];
    const until = performance.now() + 1000;
    while (performance.now() < until) {
      analyser.getFloatTimeDomainData(buf);
      samples.push(rms(buf));
      await new Promise(r => setTimeout(r, 50));
    }
    const median = samples.sort()[Math.floor(samples.length/2)];
    cfg.SILENCE_THRESHOLD = +(median * 0.6).toFixed(4); // 60 % of median
    cfg._calibrated = true;
    chrome.storage.sync.set(cfg);
    console.log('Auto-2×: threshold =>', cfg.SILENCE_THRESHOLD);
  }

  /*────────────────────────────
   *  6.  Main loop
   *───────────────────────────*/
  let silentSince = 0;

  function tick () {
    if (!cfg.enabled) return requestAnimationFrame(tick);

    analyser.getFloatTimeDomainData(buf);
    const avgVol    = updateHist(rms(buf));
    const now       = performance.now();
    const isQuiet   = avgVol < cfg.SILENCE_THRESHOLD;

    // Debug log every 2 s
    if ((now|0) % 2000 < 16)
      console.log('Auto-2× vol', avgVol.toFixed(4), 'quiet', isQuiet);

    if (isQuiet) {
      if (!silentSince) silentSince = now;
      if (now - silentSince > cfg.GRACE_MS && video.playbackRate !== cfg.FAST_RATE) {
        video.playbackRate = cfg.FAST_RATE;
        console.log('Auto-2× →', cfg.FAST_RATE, '×');
      }
    } else {
      silentSince = 0;
      if (video.playbackRate !== cfg.NATURAL_RATE) {
        video.playbackRate = cfg.NATURAL_RATE;
        console.log('Auto-2× ←', cfg.NATURAL_RATE, '×');
      }
    }

    requestAnimationFrame(tick);
  }
  tick();

  /*────────────────────────────
   *  7.  Hot settings updates
   *───────────────────────────*/
  chrome.storage.onChanged.addListener(ch => {
    for (const [k,v] of Object.entries(ch)) cfg[k] = v.newValue;
    if (!cfg.enabled) video.playbackRate = cfg.NATURAL_RATE;
  });

  /*────────────────────────────
   *  8.  Clean-up on unload
   *───────────────────────────*/
  addEventListener('beforeunload', () => ctx?.close());
})();
