# Context Library: desktop app

A live window onto the context library one level up: `raw/`, `personal-wiki/`
and `outputs/`, held against each other and kept current while Claude works.

```bash
npm install && npm start
```

Or double-click **Launch Context Library.command** (macOS) / **.cmd** (Windows).

In this repo the folder one level up is the demo library, so that is what
opens. See [Which library it opens](#which-library-it-opens) to point it
somewhere else.

## Installing it to the Dock

```bash
npm run install:app
```

Builds `Context Library.app`, installs it to `/Applications`, and points it at
this library. Launch it once, then right-click the Dock icon → **Options** →
**Keep in Dock**.

The installed app is **not a frozen snapshot**. `electron-builder` normally
seals the renderer into `Resources/app.asar`, which would leave a Dock-pinned
copy drifting behind the source after every edit. Electron looks for
`app.asar` first and falls back to an `app/` directory, so the install step
replaces the archive with a symlink to this project. Edit a file, relaunch from
the Dock, and the change is there. No rebuild.

The trade is that the installed app depends on this folder staying where it is.
Move or delete the project and the Dock icon breaks, and the bundle won't work
on another machine. Right for a personal tool; for something you actually ship,
drop the symlink step and re-run the build per release.

Re-run `npm run install:app` only after an Electron version bump, an icon
change, or an edit to the `build` block in `package.json`. Ordinary source
edits need nothing.

## What it does that a Finder window does not

- **Shows what Claude has not read yet.** Every file in `raw/` carries a
  status (new, changed since ingest, or ingested) computed from the same
  content hash `scripts/scan-raw.sh` uses, so the app and the script never
  disagree.
- **Makes traceability clickable.** A wiki page lists the raw files it came
  from; each one opens that file. A raw file lists the wiki pages that cite it.
  A `raw/` pointer that no longer resolves is flagged in red, as is a page with
  no pointer at all: the two failures `scripts/check-sources.sh` reports.
- **Updates while you watch.** The three folders are watched; a page Claude
  writes in a terminal appears here, the row flashes, and the activity feed
  logs it. An open file re-reads itself when it changes on disk.
- **Resolves `[[wikilinks]]`.** Links to a real page are clickable; links to a
  page that does not exist yet render dashed, which is how CLAUDE.md intends
  dangling links to be read.

## Adding to raw

Two ways, both of them Carter's action. The app is his hand here, not a third
writer, so the ownership rule in `CLAUDE.md` still holds.

- **Drag files onto the window.** Copied into `raw/`, never moved.
- **Add** captures anything that isn't a file: a link, a tweet, a note.

For a link, the app fetches the page and stores the readable text *next to* the
URL. A bare URL is a bad source: it rots, it paywalls, and by the time an ingest
fetches it the page may be gone or changed. Snapshotting at capture time makes
the raw file self-contained.

The fetch preview runs while you type and reports what it actually got, so a
page that came back empty is visible before you save rather than at ingest
time. Most paywalled sites render in the browser and yield nothing; that's what
the paste field is for.

Captured files carry frontmatter (`kind`, `url`, `site`, `title`, `captured`)
and split the body into `## My take` and `## Captured page text`. That split is
load-bearing: `CLAUDE.md` reads the first as Carter's own view, bound for
`ideas/`, and the second as the source, bound for `sources/`.

### X posts, and their pictures

An x.com status URL doesn't go through `WebFetch`, because it answers `402`. It
goes through X's syndication endpoint, the one that renders embedded tweets on
any website: no account, no cookies, no third party, and a token derived from
the post id rather than issued to anyone.

What comes back is the point. Photos download at full size; a video downloads
as an `.mp4` **and** gets sliced into six stills with `ffmpeg`, sampled evenly
through the clip. Nothing downstream can watch a video, so the frames are what
make it readable, and for a UI demo the change between frames is the content.

All of it lands in **`raw/_media/`**, which `scan-raw.sh` and the app's scanner
both prune. That directory is the reason a six-frame video doesn't post seven
"new raw file" rows and bury the drops Carter actually made: the capture `.md`
is the unit of ingestion, and the media are its attachments.

`ffmpeg` is found at its usual Homebrew or `/usr/local` path. Without it the
video is still saved, just without stills.

### Resync

**Resync** on a raw file re-ingests that one file: same pre-flight, same model
picker, but a different prompt. It tells Claude the file has been processed
before and to *revise the pages it already fed in place*. Writing a
near-duplicate beside an existing page is the failure `CLAUDE.md` warns about
by name. It also asks for the ingest-log row to be corrected and for anything
the new pass resolves to be closed in `_open-questions.md`.

Use it when a capture predates a capability the app has since grown, which is
exactly what happened to every X link saved before media capture existed.

The extractor is a small readability pass, not a parser. It prefers
`<article>`, then `<main>`, then `<body>`, drops the tags that never carry
prose, and flattens the rest.

## Sync

The **Sync** button ingests everything new in `raw/` into the wiki. Along with
Chat's **Remember** and **Apply**, it is the only way the app causes a write to
the wiki, and it does not do the writing itself. It runs Claude Code headless
inside the library folder:

```
claude -p "<the ingest prompt>" \
  --output-format stream-json --verbose \
  --permission-mode acceptEdits \
  --allowedTools "Read,Write,Edit,Glob,Grep,Bash(./scripts/scan-raw.sh),Bash(./scripts/check-sources.sh),…"
```

That means the ingest rules stay in `CLAUDE.md`, where `scan-raw.sh` and every
Claude Code session already read them, instead of being reimplemented as a
prompt inside an Electron app where the two copies would drift apart.

`WebFetch` and `WebSearch` are in the list because nearly everything that lands
in `raw/` is a link or a screenshot of one. Without them an ingest can only
transcribe what it can see and never confirm it. The library's own
[`.claude/settings.json`](../.claude/settings.json) grants the same tools and
adds the `deny` rules a CLI flag cannot express: no writes into `raw/`, no
`curl` or `wget`. Both lists exist because project `allow` rules only apply
once the workspace is trusted, and Sync must not depend on that prompt having
been answered. Add a script to the workflow and it has to go in both.

Clicking Sync opens a pre-flight rather than starting: it lists the files that
would be ingested and lets you choose the model, because a sync writes to the
wiki and that is the moment to look. Start is focused, so the common path stays
Sync then Enter.

Once running, the dock streams each step as it happens, then shows the run's
summary and cost. Cancel sends `SIGTERM`, which makes Claude Code abort the
turn cleanly; anything already written stays. Meanwhile the file watcher is
doing its usual job behind the dock, so pages appear in the rail as they land.

Three behaviours worth knowing:

- If nothing in `raw/` is new or changed, Sync says so and never starts a run.
- If Claude Code is not installed, the dock explains it and offers the install
  command rather than failing quietly. The binary is located by checking the
  usual install paths and then asking a login shell, because a GUI app launched
  from Finder does not inherit your shell's `PATH`.
- `--bare` is deliberately *not* used: it would skip `CLAUDE.md` entirely and
  require an API key instead of your subscription login.

Requires a one-time `npm i -g @anthropic-ai/claude-code` **and a sign-in**.
Installing is not enough. Run `claude` in a terminal, then `/login`. Until you
do, every run stops immediately with `Not logged in`; the dock detects that
specific case and says so instead of showing an error code.

Point `CONTEXT_LIBRARY_CLAUDE_BIN` at a binary to override discovery.

### The model, and that dollar figure

The dock header shows both, because neither is obvious from the outside.

**Model.** Picked in the dock before each run. Sync opens a pre-flight showing
the files about to be ingested and a model dropdown; the choice is remembered
for next time.

The list is not hardcoded. The app asks the CLI (`claude -p "/model"`, handled
locally, no API call) so it stays right as models are added or renamed, and
falls back to a static list if that fails. **Default** passes no `--model` at
all, which is not the same as naming today's default: it means the run keeps
inheriting whatever `/model` is set to. `CONTEXT_LIBRARY_SYNC_MODEL` still
works as a pin and applies when nothing is picked in the window.

**Cost.** It is **not a charge** on a subscription login. Claude Code computes
it locally from token counts at API list prices; a Pro/Max subscription bills
by usage limits, not per run. The app reads `apiKeySource` from the
`system/init` event and renders `≈$0.041` on a subscription versus `$0.041`
when an API key is actually paying per token, with the distinction spelled out
in the tooltip. A bare dollar amount would read as a bill, which on a
subscription it is not.

### Reading the exit status

Do not trust the process exit code alone, and do not trust `subtype`. A
not-logged-in run exits **1**, writes **nothing to stderr**, sets
`subtype: "success"`, and puts the real story in the `result` message with
`is_error: true`. So `main.js` reports a process-level failure only when the
stream produced no `result` at all. Otherwise the exit code would overwrite a
useful message with a bare number.

## Chat

The Chat tab asks the library questions. Same engine as Sync: Claude Code, run
in the library folder, so `CLAUDE.md` and the wiki are simply there. Every
result carries a `session_id`, and handing it back with `--resume` on the next
turn keeps one thread going. The thread is saved to a file in the app's user
data folder, so it survives a restart; **New thread** drops it.

Reading and writing get different permissions:

- **Send** can't write at all: `Read`, `Glob` and `Grep` only. On the first
  turn the wiki rides along in the system prompt: a catalogue of every page
  built from frontmatter, then full text in priority order (`INDEX.md`,
  `ideas/`, open questions, `topics/`, `sources/`) up to about 80k tokens.
  Most answers then need no tool calls at all. When a reply should change the
  wiki, it ends with a `wiki-update` block naming each edit, and the app turns
  that into an **Apply** button.
- **Apply** makes exactly the listed edits and nothing else.
- **Remember** records what you typed as your own view on an `ideas/` page,
  cited to `conversation YYYY-MM-DD`.

`CONTEXT_LIBRARY_CHAT_MODEL` pins a model for chat.
`CONTEXT_LIBRARY_NO_DIGEST=1` skips the up-front wiki and goes back to
searching.

## Keyboard

| Key | Does |
| --- | --- |
| `⌘1` to `⌘5` | Overview / Chat / Raw / Wiki / Outputs |
| `/` | Focus search |
| `Esc` | Clear search |

## Layout

```
main.js              window, file watching, scanning, all filesystem access
preload.js           the only bridge: forwards IPC calls, holds no logic
renderer/
  index.html         app shell + CSP
  styles.css         design tokens and every component
  app.js             one Vue root; no build step
  assets/, fonts/    favicon and the one webfont
  vendor/            vue + marked, copied from node_modules by tools/vendor.js
tools/               dev-only: vendoring, dev-shell rename, icon source + render
build/               generated: the rendered icon (npm run icon); not committed
```

There is no bundler. The renderer loads Vue's global build and `marked` as
plain files, which is why `tools/vendor.js` copies them out of `node_modules`
on postinstall. A CDN `<script>` would be blocked by the CSP, not just slow.

## Which library it opens

In order: `CONTEXT_LIBRARY_ROOT`, the last folder you picked, then the parent
of this directory. If none of those hold `raw/`, `personal-wiki/` and
`outputs/`, the app asks. It only ever reads, except for the Add button, drag
and drop, Sync, and Chat's Remember and Apply.

The remembered folder beats the parent directory, so if you have picked a
different library before, set the variable to get back to this one:

```bash
CONTEXT_LIBRARY_ROOT="$(cd .. && pwd)" npm start
```

## Screenshots during development

The app can drive and photograph itself, which is how the UI gets checked
without a human at the keyboard:

```bash
CONTEXT_LIBRARY_SHOTS='[{"js":"__app.go(\"wiki\")","out":"/tmp/wiki.png"}]' npm start
```

Each entry runs `js` in the renderer, waits, captures, and writes `out`; the
app quits when the list is done. Renderer errors and the return value of `js`
are printed, so a shot that silently did nothing is visible rather than
mysterious.

## Known noise

A dev run logs an Electron security warning about `unsafe-eval`. Vue's global
build compiles templates at runtime with `new Function`, so the CSP has to
allow it. With `default-src 'self'` and `connect-src 'self'` alongside it, eval
can only ever run code that already shipped inside the app. The warning does
not appear in a packaged build.
