# Study Cards for Android

The phone version of Study Cards. It's the same app as the PC version, rebuilt to run entirely on
your phone: **no server, no Node.js**. Your sets, study progress and API key are stored on the phone.
Once it's installed it works offline, except for the AI feature, which needs internet.

## One-time setup (about 10 minutes)

A phone can only install a web app from a secure (https) web address, so the app files need to live
somewhere online. **GitHub Pages** is free and works well for this. It only hosts the app's code:
your notes, cards and API key never leave your phone.

### 1. Put the app online (on your PC)

1. Create a free account at <https://github.com> (or sign in).
2. Click **+** (top right) → **New repository**.
   - Repository name: `study-cards`
   - Choose **Public** (free GitHub Pages needs this; it only contains the app's code)
   - Leave everything else as is → **Create repository**
3. On the next page, click the link **"uploading an existing file"**.
4. Open this folder (`Quizlet Clone Android`) in File Explorer, select **everything inside it**
   (Ctrl+A) and drag it into the browser. Drag the contents, not the folder itself.
   Wait for the upload to finish, then click **Commit changes**.
5. Go to the repository's **Settings** → **Pages** (left menu).
   Under **Branch**, choose `main` and `/ (root)` → **Save**.
6. Wait a minute or two, then refresh that page. It shows your app's address, like
   `https://YOUR-USERNAME.github.io/study-cards/`

### 2. Install it on your phone

1. Open that address in **Chrome** on your Android phone.
2. Tap **⋮** (top right) → **Add to Home screen** (or **Install app**) → **Install**.
3. Open **Study Cards** from your home screen. It runs full screen like any other app.

### 3. Connect AI (optional)

In the app: **⚙ → Anthropic API key** and paste your key. You can reuse your PC key, or create a
separate one called "phone" at <https://platform.claude.com/settings/keys> so you can turn it off
on its own if you ever lose your phone. Budget and spending limits are set separately on each device.

### 4. Bring over your sets from the PC

1. On the PC app: **⚙ Settings → Backup & transfer → Export all sets**. This saves a `.json` file.
2. Get that file onto your phone (Google Drive, email it to yourself, or a USB cable).
3. On the phone: **⚙ → Import from file** and pick it.

This works the other way round too. Identical sets are skipped, so importing again is safe.
Study progress stays on each device.

## Using it

- **Flashcards:** tap to flip. **Swipe right** if you know it, **swipe left** if you're still learning.
- **✨ From notes:** tap **Choose files** and select several `.txt` files at once (Android can't pick a
  whole folder). Numbered files like `1.1 …`, `2.3 …` are grouped into chapters automatically. Give
  the course a name, like "CompTIA A+", and each chapter becomes its own set.
  Keep the app open while it converts.
- Everything else (Learn, Spaced review, editing sets, the AI budget) works just like on the PC.

## Updating the app

When there's a new version, upload the changed files to the same GitHub repository
(**Add file → Upload files**, then commit; files with the same name are replaced). Phones pick up the
new version the next time the app is opened with internet. Your data isn't affected.

## Your data

- Everything is stored in the app's storage on the phone. **Uninstalling the app or clearing Chrome's
  site data for it deletes your sets**, so export a backup first.
- The app asks Android to keep its storage permanently, so it isn't cleared when space runs low.
- Your API key is stored only on the phone and is only ever sent to Anthropic.

## How it differs from the PC version (for later tinkering)

The pages (`js/pages`), study modes (`js/modes`) and shared logic (`js/lib`) are the same code as the
PC version's `public/js`. What changed:

| PC version                         | Android version                                   |
|------------------------------------|---------------------------------------------------|
| `server/` (Node.js + SQLite)       | `js/local/` (runs in the phone's browser, IndexedDB storage) |
| `js/api.js` sends requests to the server | `js/api.js` calls `js/local/*` directly     |
| Server calls Claude                | The phone calls Claude directly                  |
| `start.bat`                        | `manifest.webmanifest` + `sw.js` (installable, works offline) |

If you add a file, also add it to the `FILES` list in `sw.js` and bump `VERSION` there, so it works offline.
