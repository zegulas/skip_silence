/* Auto-2×-on-Silence  ────────────────────────────────────────────
   Injected into every tab that matches.  Listens to any <video>
   element’s audio; when volume is quiet for > GRACE_MS it sets
   playbackRate = FAST_RATE, else NATURAL_RATE.
*/

(async function main() {
    // Wait until a <video> tag appears (YouTube swaps them dynamically)
    const video = await new Promise(resolve => {
        const seek = () => {
            const v = document.querySelector('video');
            v ? resolve(v) : requestAnimationFrame(seek);
        };
        seek();
    });

    // Read user prefs (or fall back)
    const {
        SILENCE_THRESHOLD = 0.005,
        GRACE_MS = 400,
        FAST_RATE = 2.0,
        NATURAL_RATE = 1.0,
        enabled = true
    } = await chrome.storage.sync.get({
        SILENCE_THRESHOLD: 0.005,
        GRACE_MS: 400,
        FAST_RATE: 2.0,
        NATURAL_RATE: 1.0,
        enabled: true
    });

    if (!enabled) return;                            // user disabled in popup

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(video);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    analyser.connect(audioCtx.destination);          // keep sound → speakers

    const buf = new Float32Array(analyser.fftSize);
    const rms = arr =>
        Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);

    let silentSince = null;

    // Listen for changes coming from the Options page
    chrome.storage.onChanged.addListener(changes => {
        if (changes.SILENCE_THRESHOLD) SILENCE_THRESHOLD = changes.SILENCE_THRESHOLD.newValue;
        if (changes.GRACE_MS) GRACE_MS = changes.GRACE_MS.newValue;
        if (changes.FAST_RATE) FAST_RATE = changes.FAST_RATE.newValue;
        if (changes.NATURAL_RATE) NATURAL_RATE = changes.NATURAL_RATE.newValue;
        if (changes.enabled) {
            if (!changes.enabled.newValue) video.playbackRate = NATURAL_RATE;
        }
    });

    function tick() {
        analyser.getFloatTimeDomainData(buf);
        const vol = rms(buf);

        if (vol < SILENCE_THRESHOLD) {
            if (silentSince === null) silentSince = performance.now();
            if (performance.now() - silentSince > GRACE_MS &&
                video.playbackRate !== FAST_RATE) {
                video.playbackRate = FAST_RATE;
            }
        } else {
            silentSince = null;
            if (video.playbackRate !== NATURAL_RATE) {
                video.playbackRate = NATURAL_RATE;
            }
        }
        requestAnimationFrame(tick);
    }
    tick();
})();
