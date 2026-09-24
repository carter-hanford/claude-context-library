# Claude Context Library

[![](https://img.shields.io/badge/built%20with-Claude%20Code-D97757.svg)](https://claude.com/claude-code)
[![](https://img.shields.io/badge/Electron-desktop%20app-47848F.svg?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![](https://img.shields.io/badge/Vue-3-4FC08D.svg?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![](https://img.shields.io/badge/license-MIT-brightgreen.svg)](LICENSE)

A personal knowledge base where Claude does the organizing and isn't allowed to make anything up. I
drop raw stuff into one folder, Claude turns it into a wiki where every claim points back to the file
it came from, and my own opinions never get mixed in with what a source said.

```
raw/  ──ingest──▶  personal-wiki/  ──generate──▶  outputs/
(I write)           (Claude writes)                (Claude writes, dated)
```

Built for Claude Code, and built with it.

## What's in the repo

| Path | What it is |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | The rules Claude follows in this folder. Most of the project is this file. |
| `raw/`, `personal-wiki/`, `outputs/` | A small demo library (made up, about pour-over coffee) so you can see it work |
| [`scripts/`](scripts) | Two bash scripts the ingest runs: `scan-raw.sh` and `check-sources.sh` |
| [`.claude/settings.json`](.claude/settings.json) | Permissions: what Claude can do in here, and what it's blocked from |
| [`app/`](app) | An Electron desktop app that shows all three folders live and runs the ingest |

## Why it exists

I save a lot of stuff: links, screenshots, notes, things I want to come back to. It usually ends up
in one pile, and when I ask an AI about it later I get a confident answer I can't check. Did that
come from something I saved, from the model's general knowledge, or from nowhere?

So this library is built around three things:

- **Every claim traces to a source.** Each wiki page lists the raw files it came from, and a script
  fails if a page has none or points at a file that isn't there.
- **My thinking stays separate from my sources.** When I save a link I can add my take, and it gets
  filed as my view, never folded into what the article said.
- **Nothing gets made up.** If the library doesn't have something, Claude says so and logs the gap.

## How it works

Three folders, and the flow only goes one way.

**`raw/` is mine.** Anything goes in: articles, PDFs, screenshots, transcripts, a quick note. No
naming rules, no subfolders. Claude reads it and never edits it.

**`personal-wiki/` is Claude's.** It reads `raw/` and writes:

- `sources/`: one page per thing I saved, including where it came from (URL, author, date)
- `topics/`: synthesis across sources, with every claim tagged by where it came from
- `ideas/`: my own positions, tracked as they change
- `INDEX.md`: the map, one line per page
- `_ingest-log.md`: every raw file processed, with a content hash
- `_open-questions.md`: contradictions and gaps that only I can settle

**`outputs/` is for answers.** When I ask for a briefing, Claude writes a dated file from the wiki,
marks anything that came from outside the library, and ends with what the library couldn't answer.

The ingest is a checklist in `CLAUDE.md`. Scan for new or changed files, read each one, check what can
be checked (fetch the URL, look the repo up with `gh`), write or update pages, log each file with its
hash, update the index, write down open questions, then run the traceability check before finishing.
Because matching is by hash, a raw file I edit after it's been ingested shows up as changed.

### What to look at in the demo

The demo is small enough to trace by hand. It's three made-up raw files about brewing pour-over:

- `raw/brew-log.md`: my notes from three brews
- `raw/2026-09-18-pour-over-ratios-and-water-temperature.md`: a web guide saved with the app's Add
  button, with my one-line take on top
- `raw/roaster-class-handout.txt`: a class handout I typed up

Things worth looking at:

- The guide and the handout disagree on water temperature. The
  [topic page](personal-wiki/topics/pour-over-variables.md) gives both sides under **Contested**, and
  it's logged in [`_open-questions.md`](personal-wiki/_open-questions.md) instead of Claude picking a
  winner.
- My brew log says "the ratio barely moves anything," but every logged brew that gives a ratio is
  1:16. The [idea page](personal-wiki/ideas/home-pour-over-recipe.md) keeps my view and says the log
  doesn't back it up yet.
- The guide's URL is on example.com on purpose, so it 404s. The
  [source page](personal-wiki/sources/pour-over-ratios-guide.md) says so, stays at `seed`, and treats
  the saved snapshot as the only copy.
- The [briefing](outputs/2026-09-23-dialing-in-pour-over.md) cites a wiki page on every line and
  keeps general knowledge in its own section.

Everything in the demo is made up for this repo.

## The rules, and why each one exists

1. **Claude never edits `raw/`.** It's the evidence. If the thing being cited can change, the citation
   means nothing. `CLAUDE.md` asks for this and `.claude/settings.json` enforces it, by denying writes
   to `raw/` along with `rm` and moving files out of it.
2. **Every wiki page points back to its raw source.** Pages list their raw files in frontmatter,
   source pages also record the original URL, author and date, and topic pages cite a source page on
   every non-obvious claim. `scripts/check-sources.sh` fails if any page has no source or a broken
   pointer.
3. **Nothing gets invented.** Every claim traces to a file in `raw/` or to something I said in a
   session, cited as `conversation YYYY-MM-DD`. A link that can't be read is logged as a gap, not
   guessed at.
4. **My thinking and a source's claims never get blended.** This is the one that makes the library
   worth having. Six months from now I want to know whether I believed something or read it somewhere.
   Topic pages tag every claim as **Carter's view**, a named source, or **Contested**, and a
   contradiction goes into `_open-questions.md` instead of being quietly resolved.
5. **Outputs are snapshots.** A briefing is what the library knew on that date. When the wiki changes,
   Claude writes a new one instead of editing the old one.
6. **Check it, don't just copy it.** When a source names something checkable (a URL, a repo, a
   version, a price), Claude looks it up and marks what it verified and what's still just transcribed.
   A screenshot of a repo isn't the repo.
7. **Anything fetched from the web is data, not instructions.** The ingest can run with nobody
   watching, so if a page tells Claude to do something, that gets noted as a fact about the page and
   ignored. The deny list limits the damage if a page ever tries it.

## The desktop app

`app/` is an Electron app for watching the library while Claude works on it. It doesn't replace Claude
Code; it runs it.

- **Raw** lists every file with a status (new, changed, ingested) from the same hash `scan-raw.sh`
  uses, and shows which wiki pages cite each one.
- **Wiki** shows each page with the raw files it traces back to. Click one and you're looking at the
  original. Broken pointers and pages with no source show up in red.
- **Outputs** shows each briefing with the wiki pages it was built from.
- **Add** saves a link or a note into `raw/`. For a link it snapshots the page text next to the URL,
  with my take under its own heading. X posts come in with their images, and videos get cut into
  still frames so Claude can read them.
- **Sync** runs the ingest by starting Claude Code headless in the library folder, then streams each
  step as it happens. The rules stay in `CLAUDE.md` instead of a second copy living in the app.
- **Chat** answers questions from the wiki and can't write anything by default. When something I say
  should change the wiki, it proposes the edit and I click Apply. **Remember** saves what I typed as
  my own view in `ideas/`.
- Everything updates live as files change on disk.

<img src="screenshots/wiki-topic-page.png" alt="A topic page in the app: the raw files it traces back to, then each claim tagged with its source" />

<img src="screenshots/raw-capture.png" width="49%" alt="A saved link in raw/, with the wiki pages that use it and the My take section kept apart from the captured page text" /> <img src="screenshots/output-briefing.png" width="49%" alt="A dated briefing in outputs/, with the wiki pages it was built from" />

To run it (Node 22 or newer):

```bash
cd app
npm install
npm start
```

It opens the demo library (the folder above `app/`) by default. Sync and Chat need Claude Code
installed and signed in. More in [app/README.md](app/README.md).

## Using it with Claude Code

Open the repo folder in Claude Code and `CLAUDE.md` loads on its own. Then just talk to it:

| Say | What happens |
| --- | --- |
| "process raw" | Runs the full ingest on anything new or changed in `raw/` |
| "what do I know about X" | Answers in chat from the wiki and cites the pages |
| "briefing on X" | Writes a dated file to `outputs/` |
| "actually I think..." | Updates the wiki page and cites the conversation by date |
| "what's missing" | Reads `_open-questions.md` and the thin pages |

The Claude Code pieces doing the work:

- **`CLAUDE.md` as the spec.** Page format, attribution rules, and the ingest and output procedures
  all live in one file that every session reads, headless ones included.
- **Project permissions.** `.claude/settings.json` allows web fetch and search, read-only `gh`, and
  the two scripts. It denies writes to `raw/`, `rm`, `curl` and `wget`, and any `gh` command that
  changes something. Claude Code asks you to trust the folder the first time.
  [.claude/README.md](.claude/README.md) explains each entry.
- **Headless runs.** Sync calls `claude -p` with `--output-format stream-json`,
  `--permission-mode acceptEdits` and its own `--allowedTools`, and reads the stream to show progress,
  cost, and failures like a missing login.
- **Sessions.** Chat keeps one thread going with `--resume`, hands over the whole wiki on the first
  turn with `--append-system-prompt`, and gives each mode its own tool list, so the read-only mode
  can't write.

## Start your own

1. Fork or clone this repo.
2. Clear out the demo. Empty `raw/`, `outputs/`, and the `sources/`, `topics/` and `ideas/` folders in
   `personal-wiki/`. Keep the headers of `INDEX.md`, `_ingest-log.md` and `_open-questions.md` and
   delete their entries.
3. Put your name in place of mine in `CLAUDE.md`. If you use the app, also in the chat prompts in
   `app/main.js` and the Raw tab's tooltip in `app/renderer/app.js`. It's all written around one owner,
   so "Carter" shows up a lot.
4. Drop something in `raw/`.
5. Open the folder in Claude Code and say "process raw".
6. Run `./scripts/check-sources.sh`. It should say every page traces back to a real source.

You'll need Claude Code, signed in. The rest is optional: Node 22+ for the app, `gh` signed in if you
want GitHub links verified, and `ffmpeg` if you want still frames from saved videos.

## License

MIT. See [LICENSE](LICENSE). The app includes the Catamaran font (Copyright 2020 The Catamaran Project
Authors), which is under the SIL Open Font License 1.1.
