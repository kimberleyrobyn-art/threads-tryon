# Arvin batch upload tool

Automates the repetitive parts of running product photos through Arvin's
**AI Model** tool (`app.arvin.business`): uploading each file, clicking
Generate, and downloading/renaming the result. Runs on your own computer —
it drives a real Chrome browser window, it's not a headless scraper hitting
their servers directly.

**What's automated:** logging you in once and remembering it, navigating to
AI Model, picking the product type, uploading each photo, picking
Model/Pose/Background, clicking Generate, and downloading the result.
Kick off a batch and it runs start to finish without you touching it.

**How Model/Pose/Background picking works:** those are unlabeled image
tiles, so there's no text to click by name. Instead, the script clicks the
Nth tile under each heading — e.g. with `pose` set to "cycle", photo 1
gets the 1st pose tile, photo 2 gets the 2nd, and so on, wrapping around;
`model`/`background` default to "fixed" at tile 0 so the same model/backdrop
is used throughout (edit `config.json` to change any of these — see
"Configuring styling" below).

This was written without being able to see Arvin's actual page code (this
tool runs from an environment that can't reach `app.arvin.business`), so
tile-position guessing is the best I could do — **test on 1-2 photos
first** and watch the browser window to confirm it's clicking the right
tiles before trusting it on a full batch. Set `"autoStyling": false` in
`config.json` to fall back to picking them yourself each photo (the script
will pause and wait for Enter) if the automatic version misclicks.

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

1. Check `config.json`:
   - `productType` — must match one of Arvin's tile labels exactly
     (`Clothes`, `Necklaces`, `Earrings`, `Sunglasses`, `Shoes`, `Rings`,
     `Bracelets`, `Hats`, `Bags`, `Handheld items`, `Wigs`, `Pet wear`).
   - `aspectRatio` — `1:1`, `2:3`, or `3:2`.
   - `inputDir` / `outputDir` — where photos go in and results come out.
     See "Running from iPad" below if you want these to be a synced folder.
   - `watch` — `true` to keep running and pick up new photos as they
     arrive (see below); `false` to process what's currently in `input/`
     once and exit.
   - `watchIntervalMs` — how often to check `input/` for new photos, in
     watch mode.
   - `delayBetweenPhotosMs` — pause between photos, in milliseconds.
   - `generateTimeoutMs` — how long to wait for a single generation +
     download before giving up on that photo.
   - `autoStyling` / `styling` — see "Configuring styling" below.
2. Run it:
   ```bash
   npm start
   ```
3. A browser window opens. First run: log into Arvin manually, then press
   Enter in the terminal — your session is saved in `.browser-profile/`
   (gitignored) so you won't need to log in again on future runs.
4. Drop photos into `input/` (jpg/png/webp) — before starting, or any time
   while it's running in watch mode. Name them however's useful, e.g.
   `sundress-front.jpg`, `sundress-back.jpg`, `sundress-side.jpg`.
5. Results land in `output/`, named
   `<original-filename>__<arvin's-download-name>`. A photo is only ever
   processed once — `manifest.json` (gitignored) tracks what's done, so
   restarting the script won't redo old photos.

## Configuring styling

`config.json`'s `styling` block controls how Model / Pose / Background get
picked automatically:

```json
"styling": {
  "model":      { "mode": "fixed", "index": 0, "count": 9 },
  "pose":       { "mode": "cycle", "index": 0, "count": 6 },
  "background": { "mode": "fixed", "index": 0, "count": 9 }
}
```

- `"mode": "fixed"` always clicks the tile at `index` (0 = first tile).
- `"mode": "cycle"` rotates through tiles `0..count-1` across your batch —
  e.g. pose "cycle" with `count: 6` gives photo 1 pose #1, photo 2 pose #2,
  ... photo 7 wraps back to pose #1.
- `count` should match how many tiles are actually visible under that
  heading on Arvin's page without scrolling further — check in the
  browser and adjust if it seems off.

Set `"autoStyling": false` to skip all of this and pick Model/Pose/
Background yourself each photo instead (the script pauses and waits for
Enter).

## Running from iPad

Since this script needs a real Mac/PC to drive a browser, the way to use
it "from iPad" is to make the computer invisible: point `inputDir` and
`outputDir` at a folder that syncs between your iPad and that computer
(iCloud Drive, Dropbox, Google Drive — whatever you already have), leave
the script running on the computer with `"watch": true`, and just drop
photos into that folder from your iPad's Files app whenever. Results sync
back to the same place.

Example on a Mac using iCloud Drive — create a folder there, then point
the config at it with absolute paths:

```json
"inputDir": "/Users/<you>/Library/Mobile Documents/com~apple~CloudDocs/ArvinBatch/input",
"outputDir": "/Users/<you>/Library/Mobile Documents/com~apple~CloudDocs/ArvinBatch/output"
```

On the iPad, the same folder shows up in the Files app under
**iCloud Drive → ArvinBatch**. Use the Photos app's share sheet →
"Save to Files" → that folder to drop photos in.

The computer needs to stay on and `npm start` needs to keep running for
watch mode to pick anything up — it's not a background service that
survives a reboot on its own. If that becomes annoying, ask about setting
it up as a `launchd` service (Mac) so it starts automatically and keeps
running in the background.

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
