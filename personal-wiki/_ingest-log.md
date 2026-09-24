# Ingest Log

Every file processed out of `raw/`. `scripts/scan-raw.sh` reads the hash column to decide what's new.
Never remove a row, and never edit a hash.

Status: `ingested` (folded into the wiki) · `skipped` (trivial or duplicate, reason noted) ·
`UNREAD` (couldn't be parsed; needs Carter).

| date | hash | raw file | status | pages written |
| --- | --- | --- | --- | --- |
| 2026-09-21 | 9bedc7ae | raw/2026-09-18-pour-over-ratios-and-water-temperature.md | ingested (source unverified) | sources/pour-over-ratios-guide.md, topics/pour-over-variables.md, ideas/home-pour-over-recipe.md. A link capture from the Add button. `WebFetch` on the URL returned 404, so the source page is transcription from the capture and stays `seed`. The `## My take` line went to the idea page and the topic page as Carter's view, not onto the source page. |
| 2026-09-21 | 01dcc384 | raw/brew-log.md | ingested | ideas/home-pour-over-recipe.md, topics/pour-over-variables.md. Carter's own notes, so no `sources/` page. Two of his conclusions go further than the logged brews show; both logged in `_open-questions.md`. |
| 2026-09-21 | ae991bae | raw/roaster-class-handout.txt | ingested | sources/roaster-class-handout.md, topics/pour-over-variables.md. No URL, nothing checkable. Disagrees with the web guide on water temperature (logged in `_open-questions.md`). Also asked there whether the typed-up text is word for word. |
