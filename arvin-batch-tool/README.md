# Arvin batch upload tool

Automates the repetitive parts of running product photos through Arvin's
**AI Model** tool (`app.arvin.business`): uploading each file, clicking
Generate, and downloading/renaming the result. Runs on your own computer —
it drives a real Chrome browser window, it's not a headless scraper hitting
their servers directly.

**What's automated:** logging you in once and remembering it, navigating to
AI Model, picking the product type, uploading each photo, clicking
Generate, and downloading the result.

**What's still manual, per photo:** clicking Model / Pose / Background.
Those are unlabeled image tiles, so there's nothing reliable to click by
text. If Arvin remembers your last picks between photos, this is just
pressing Enter each time. If it doesn't, you'll re-pick them each round —
still faster than doing the whole upload/download dance by hand for every
photo.

Note: this is *not* an official Arvin feature — it automates your own
account through a normal browser. Read `app.arvin.business`'s Terms before
relying on this for anything beyond casual personal use, and keep the
`delayBetweenPhotosMs` setting reasonable (don't crank it to 0) so it
behaves like a person clicking through, not a bot hammering their site.

## Setup (one-time)

You need [Node.js](https://nodejs.org) installed (v18+).

```bash
cd arvin-batch-tool
npm install
npx playwright install chromium
```

## Usage

1. Drop your product photos into `input/` (jpg/png/webp). Name them
   however's useful to you — e.g. `sundress-front.jpg`,
   `sundress-back.jpg`, `sundress-side.jpg`.
2. Check `config.json`:
   - `productType` — must match one of Arvin's tile labels exactly
     (`Clothes`, `Necklaces`, `Earrings`, `Sunglasses`, `Shoes`, `Rings`,
     `Bracelets`, `Hats`, `Bags`, `Handheld items`, `Wigs`, `Pet wear`).
   - `aspectRatio` — `1:1`, `2:3`, or `3:2`.
   - `delayBetweenPhotosMs` — pause between photos, in milliseconds.
   - `generateTimeoutMs` — how long to wait for a single generation +
     download before giving up on that photo.
3. Run it:
   ```bash
   npm start
   ```
4. A browser window opens. First run: log into Arvin manually, then press
   Enter in the terminal — your session is saved in `.browser-profile/`
   (gitignored) so you won't need to log in again on future runs.
5. For each photo: the script uploads it and pauses. Pick Model / Pose /
   Background in the browser, then press Enter in the terminal to
   Generate. Type `s` + Enter instead to skip that photo.
6. Results land in `output/`, named
   `<original-filename>__<arvin's-download-name>`.

## If a step stops working

Arvin's page layout can change and break a selector. To see exactly what
the script is doing and pick new selectors interactively:

```bash
PWDEBUG=1 npm start
```

This opens Playwright Inspector alongside the browser, where you can step
through each action and use the selector picker to find working text/roles
for anything that broke. The parts most likely to need adjusting live in
`upload-batch.js`:

- `goToUploadScreen()` — clicking the "AI Model" nav item and the product
  type tile.
- `uploadImage()` — the "Upload Image" button and "Preferences" panel.
- `generateAndDownload()` — the "Generate" button, the "Processing..."
  overlay text, and the download button candidates.

## Troubleshooting

- **"Not logged in yet" every run**: Arvin's session cookie may be
  short-lived, or `.browser-profile/` got deleted. Just log in again when
  prompted.
- **Script can't find the Download button**: it still listens for the
  browser's download event regardless, so click Download yourself in the
  window when prompted in the terminal — the file will still be captured
  and saved to `output/`.
- **A photo times out**: bump `generateTimeoutMs` in `config.json` if
  Arvin is just slow, or check the browser window for an error on that
  specific photo.
