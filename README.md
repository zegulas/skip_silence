# Auto-2× on Silence

A Chrome extension that automatically speeds up videos during silent moments, perfect for educational content where instructors spend time writing on boards or during other non-verbal activities.

## Features

- **Smart Audio Detection**: Monitors audio levels in real-time to detect silent moments
- **Customizable Settings**: Adjust silence threshold, grace period, and playback speeds
- **Universal Compatibility**: Works on any website with video content (YouTube, Vimeo, etc.)
- **User-Friendly**: Simple popup interface with one-click enable/disable

## How It Works

The extension analyzes the audio track of videos in real-time. When the audio level drops below a configurable threshold for a specified grace period, it automatically increases the playback speed. When audio returns, it reverts to normal speed.

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The extension icon should appear in your toolbar

## Usage

1. **Enable the extension**: Click the extension icon and toggle "Enable extension"
2. **Navigate to a video**: Go to any website with video content
3. **Click on the video**: Due to browser security policies, you may need to interact with the page first
4. **Watch it work**: The extension will automatically speed up during silent moments

## Settings

Access settings by right-clicking the extension icon and selecting "Options":

- **Silence Threshold** (0.003-0.010): How quiet audio needs to be to trigger speed-up
- **Grace Period** (400ms): How long to wait before speeding up
- **Normal Speed** (1.0x): Regular playback speed
- **Fast-forward Speed** (2.0x): Speed during silent moments
- **Enable/Disable**: Master switch for the extension

## Troubleshooting

### Extension Not Working?

1. **Click on the video first** - Browser security requires user interaction
2. **Check the console** - Press F12 and look for "Auto-2x extension" messages
3. **Try different settings** - Lower the silence threshold if it's not detecting quiet moments
4. **Refresh the page** - Sometimes a reload helps

### Common Issues

- **No effect on video**: Make sure you've clicked on the video or page first
- **Too sensitive**: Increase the silence threshold or grace period
- **Not sensitive enough**: Decrease the silence threshold
- **Choppy playback**: Increase the grace period to reduce speed changes

### Browser Compatibility

- **Chrome**: Fully supported
- **Edge**: Should work (Chromium-based)
- **Firefox**: Not supported (different extension format)
- **Safari**: Not supported

## Technical Details

The extension uses the Web Audio API to analyze audio in real-time:

1. Creates an AudioContext and connects it to the video element
2. Uses an AnalyserNode to get frequency domain data
3. Calculates RMS (Root Mean Square) to determine volume levels
4. Adjusts playback rate based on volume and timing thresholds

## Privacy

This extension:
- ✅ Only analyzes audio locally in your browser
- ✅ Does not send any data to external servers
- ✅ Does not collect or store personal information
- ✅ Only accesses the current tab when explicitly activated

## Development

### File Structure
```
├── manifest.json          # Extension configuration
├── content.js            # Main logic injected into web pages
├── popup.html/js         # Extension popup interface
├── options.html/js/css   # Settings page
└── icon.png             # Extension icon
```

### Building
No build process required - this is a vanilla JavaScript extension.

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Changelog

### v0.1.1
- Fixed variable reassignment issues
- Added better error handling
- Improved AudioContext initialization
- Added user interaction requirements
- Enhanced debugging and logging
- Improved UI with status indicators
- Added troubleshooting guide

### v0.1.0
- Initial release
- Basic audio analysis and speed control
- Settings page and popup interface