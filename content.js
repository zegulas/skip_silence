/* Auto-2×-on-Silence  ────────────────────────────────────────────
   Injected into every tab that matches.  Listens to any <video>
   element's audio; when volume is quiet for > GRACE_MS it sets
   playbackRate = FAST_RATE, else NATURAL_RATE.
*/

(async function main() {
    console.log('Auto-2x extension: Starting...');
    
    // Wait until a <video> tag appears (YouTube swaps them dynamically)
    const video = await new Promise(resolve => {
        const seek = () => {
            const v = document.querySelector('video');
            if (v) {
                console.log('Auto-2x extension: Video element found');
                resolve(v);
            } else {
                requestAnimationFrame(seek);
            }
        };
        seek();
    });

    // Read user prefs (or fall back)
    let settings = await chrome.storage.sync.get({
        SILENCE_THRESHOLD: 0.005,
        GRACE_MS: 400,
        FAST_RATE: 2.0,
        NATURAL_RATE: 1.0,
        enabled: true
    });

    if (!settings.enabled) {
        console.log('Auto-2x extension: Disabled by user');
        return;
    }

    let audioCtx = null;
    let analyser = null;
    let buf = null;
    let silentSince = null;
    let isAnalyzing = false;

    // Function to calculate RMS (Root Mean Square) for volume detection
    const rms = arr => Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);

    // Initialize audio analysis
    async function initAudioAnalysis() {
        try {
            // Create AudioContext - this might fail due to autoplay policies
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            
            // Resume context if it's suspended (required by modern browsers)
            if (audioCtx.state === 'suspended') {
                await audioCtx.resume();
            }

            const source = audioCtx.createMediaElementSource(video);
            analyser = audioCtx.createAnalyser();
            analyser.fftSize = 512;
            analyser.smoothingTimeConstant = 0.8;
            
            source.connect(analyser);
            analyser.connect(audioCtx.destination);

            buf = new Float32Array(analyser.frequencyBinCount);
            isAnalyzing = true;
            
            console.log('Auto-2x extension: Audio analysis initialized');
            return true;
        } catch (error) {
            console.warn('Auto-2x extension: Failed to initialize audio analysis:', error);
            return false;
        }
    }

    // Fallback method using video volume property (less accurate)
    function checkVideoVolume() {
        // This is a simple fallback - not as accurate as audio analysis
        // We'll use a simple heuristic based on video properties
        return video.volume > 0 && !video.muted;
    }

    // Listen for changes coming from the Options page
    chrome.storage.onChanged.addListener(changes => {
        console.log('Auto-2x extension: Settings changed', changes);
        
        if (changes.SILENCE_THRESHOLD) settings.SILENCE_THRESHOLD = changes.SILENCE_THRESHOLD.newValue;
        if (changes.GRACE_MS) settings.GRACE_MS = changes.GRACE_MS.newValue;
        if (changes.FAST_RATE) settings.FAST_RATE = changes.FAST_RATE.newValue;
        if (changes.NATURAL_RATE) settings.NATURAL_RATE = changes.NATURAL_RATE.newValue;
        if (changes.enabled) {
            settings.enabled = changes.enabled.newValue;
            if (!settings.enabled) {
                video.playbackRate = settings.NATURAL_RATE;
                console.log('Auto-2x extension: Disabled, reset to normal speed');
            }
        }
    });

    // Try to initialize audio analysis when user interacts with the page
    let audioInitialized = false;
    const tryInitAudio = async () => {
        if (!audioInitialized && settings.enabled) {
            audioInitialized = await initAudioAnalysis();
            if (audioInitialized) {
                document.removeEventListener('click', tryInitAudio);
                document.removeEventListener('keydown', tryInitAudio);
                video.removeEventListener('play', tryInitAudio);
            }
        }
    };

    // Add event listeners to try initializing audio on user interaction
    document.addEventListener('click', tryInitAudio);
    document.addEventListener('keydown', tryInitAudio);
    video.addEventListener('play', tryInitAudio);

    // Try to initialize immediately (might work on some sites)
    await tryInitAudio();

    function tick() {
        if (!settings.enabled) {
            requestAnimationFrame(tick);
            return;
        }

        let isQuiet = false;

        if (isAnalyzing && analyser && buf) {
            try {
                analyser.getFloatTimeDomainData(buf);
                const vol = rms(buf);
                isQuiet = vol < settings.SILENCE_THRESHOLD;
            } catch (error) {
                console.warn('Auto-2x extension: Audio analysis error:', error);
                isAnalyzing = false;
            }
        } else {
            // Fallback: assume it's not quiet if we can't analyze audio
            // This is conservative - we won't speed up unless we're sure it's quiet
            isQuiet = false;
        }

        if (isQuiet) {
            if (silentSince === null) {
                silentSince = performance.now();
            }
            if (performance.now() - silentSince > settings.GRACE_MS &&
                video.playbackRate !== settings.FAST_RATE) {
                video.playbackRate = settings.FAST_RATE;
                console.log('Auto-2x extension: Speeding up to', settings.FAST_RATE);
            }
        } else {
            silentSince = null;
            if (video.playbackRate !== settings.NATURAL_RATE) {
                video.playbackRate = settings.NATURAL_RATE;
                console.log('Auto-2x extension: Back to normal speed', settings.NATURAL_RATE);
            }
        }
        
        requestAnimationFrame(tick);
    }

    // Start the main loop
    tick();

    // Clean up when page unloads
    window.addEventListener('beforeunload', () => {
        if (audioCtx && audioCtx.state !== 'closed') {
            audioCtx.close();
        }
    });

    console.log('Auto-2x extension: Initialized successfully');
})().catch(error => {
    console.error('Auto-2x extension: Fatal error:', error);
});