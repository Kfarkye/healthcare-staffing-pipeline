# Nova Profile Capturer Chrome Extension

A Chrome extension that captures Nova profile pages as HTML files for processing.

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `nova-capturer` folder
5. The extension should now appear in your extensions list

## Usage

1. Navigate to any Nova profile page (https://nova.ayahealthcare.com)
2. Click the Nova Profile Capturer extension icon in your toolbar
3. The page will be automatically downloaded as an HTML file to your Downloads folder

## Files

- `manifest.json` - Extension configuration
- `background.js` - Service worker that handles downloads
- `content.js` - Script that captures page HTML
- `README.md` - This file

## Troubleshooting

If the extension doesn't work:
1. Check that you're on a Nova page
2. Refresh the extension by clicking the refresh icon on `chrome://extensions/`
3. Refresh the Nova page and try again
4. Check the browser console for any error messages

## Version History

- v1.1.0 - Fixed Manifest V3 compatibility and improved error handling
- v1.0.0 - Initial release