# Arvin batch upload tool

Automates the repetitive parts of running product photos through Arvin's
**AI Model** tool (`app.arvin.business`): uploading each file, clicking
Generate, and downloading/renaming the result. Runs on your own computer —
it drives a real Chrome browser window, it's not a headless scraper hitting
their servers directly.

**What's automated:** logging you in once and remembering it, navigating to
AI Model, picking the product type, uploading each photo, clicking
Generate, and downloading the result.

**How Model/Pose/Background picking works** — controlled by `styleMode` in
`config.json`:

- `"once"` (the default): you pick Model/Pose/Background yourself for the
  **first** photo only. Every photo after that skips straight to Generate,
  relying on Arvin remembering your last picks — so one choice applies to
  the whole batch. This is the "upload a batch, pick one model/pose/
  background, apply it to all of them" mode.
- `"auto"`: the script picks for you, by clicking the Nth tile under each
  heading (since the tiles have no text labels to click by name) — e.g.
  with `styling.pose.mode` set to `"cycle"`, photo 1 gets the 1st pose
  tile, photo 2 gets the 2nd, wrapping around, giving variety without you
  touching anything. See "Configuring auto mode" below.
- `"manual"`: pauses and asks you to pick every single photo.

**Important caveat on `"once"`:** it assumes Arvin keeps your last
Model/Pose/Background selection when you upload the next photo. Watch the
first 2-3 photos of a run to confirm that's actually true before trusting
it on a big batch — if Arvin resets the picks on every upload instead,
tell me and I'll switch you to `"auto"` mode instead.

This was written without being able to see Arvin's actual page code (this
tool runs from an environment that can't reach `app.arvin.business`), so
some of this — especially `"auto"` mode's tile-position guessing — is
best-effort. Test on a couple of photos first.

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
   - `aspectRatio` — currently unused (see note below); Arvin seems to
     default to `1:1` on its own. Pick a different one yourself during the
     manual styling step if you need it.
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
   - `styleMode` — `"once"`, `"auto"`, or `"manual"` (see above).
   - `styling` — only used when `styleMode` is `"auto"`, see "Configuring
     auto mode" below.
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

## Configuring auto mode

Only relevant when `"styleMode": "auto"`. `config.json`'s `styling` block
controls how Model / Pose / Background get picked automatically:

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

Set `"styleMode": "once"` or `"manual"` to go back to picking Model/Pose/
Background yourself instead (see above).

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
