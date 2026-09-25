/* Context Library: renderer.
 *
 * A read-only window onto the library. Every byte it shows arrives over the
 * preload bridge; nothing here touches the filesystem, and nothing here
 * writes. The one thing it does that a folder in Finder does not is hold the
 * three folders against each other (a wiki page next to the raw file it came
 * from, a raw file next to the pages that cite it) and keep doing it while
 * Claude edits the library underneath.
 */

const { createApp } = Vue;

/* ---------- icons (24x24 stroke, inherit currentColor) ---------- */
const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  inbox: '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h4l1.5 2.5h7L17 13h4"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2z"/><path d="M8 3v18"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="m21 16-5-5L5 20"/>',
  bulb: '<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .9 1.6h5.2c.1-.6.4-1.2.9-1.6A6 6 0 0 0 12 3z"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18z"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5"/><path d="M12 16.5v.01"/>',
  activity: '<path d="M3 12h4l3 8 4-16 3 8h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sync: '<path d="M21 12a9 9 0 0 1-9 9 9 9 0 0 1-7.5-4"/><path d="M3 12a9 9 0 0 1 9-9 9 9 0 0 1 7.5 4"/><path d="M19.5 3v4H15"/><path d="M4.5 21v-4H9"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};

/* Markdown out of the library is written by Claude and by Carter, so this is
   not a hostile-input problem. But v-html is v-html. The CSP already stops
   an inline handler or a remote script from running; this removes them
   anyway, so the two defences do not depend on each other. */
function sanitize(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  t.content.querySelectorAll('script,iframe,object,embed,form,link,meta,style').forEach((n) => n.remove());
  for (const el of t.content.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
      if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    }
  }
  return t.innerHTML;
}

const AppRoot = {
  data() {
    return {
      data: { ok: false, stats: {}, raw: [], wiki: [], outputs: [] },
      view: 'overview',
      // Selection and filter are remembered per view, so switching tabs and
      // coming back does not lose your place.
      sel: { raw: null, wiki: null, outputs: null },
      filt: { raw: 'all', wiki: 'all', outputs: 'all' },
      q: '',
      content: {},
      dark: false,
      toast: '',
      toastTimer: null,
      feed: [],
      recent: new Set(),
      pulsing: false,
      pulseTimer: null,
      icons,

      sync: {
        open: false,
        running: false,
        state: 'idle', // idle | running | done | error | cancelled | no-cli
        cliOk: null,   // null until probed
        log: [],
        summary: '',
        costUsd: null,
        startedAt: 0,
        model: '',
        billed: false, // true only when an API key is paying per token
        pick: 'default',      // what the picker is set to for the next run
        models: null,         // what this CLI offers, asked for once
        target: null,         // set for a resync: the one raw file to redo
      },
      now: Date.now(), // ticks only while a sync runs, for the elapsed clock
      tick: null,

      chat: {
        turns: [],        // { role: 'you' | 'library', text, steps[], pending, error }
        draft: '',
        busy: false,
        sessionId: null,  // what makes consecutive turns one conversation
      },

      cap: { open: false, url: '', note: '', text: '', fetching: false, fetched: null, saving: false },
      capTimer: null,
      dragging: false,
      dragDepth: 0, // dragleave fires for every child, so a boolean flickers
    };
  },

  computed: {
    selected: {
      get() { return this.sel[this.view] || null; },
      set(v) { this.sel[this.view] = v; },
    },
    filter: {
      get() { return this.filt[this.view] || 'all'; },
      set(v) { this.filt[this.view] = v; },
    },

    // The full path is a tooltip; the bar shows the short form. An absolute
    // path under a scratch directory is otherwise the widest thing on screen.
    shortRoot() {
      const r = this.data.root || '';
      const home = (r.match(/^\/Users\/[^/]+/) || [])[0];
      return home ? r.replace(home, '~') : r;
    },

    rootName() { return (this.data.root || '').split('/').filter(Boolean).pop() || 'the library'; },

    // Openers built from what is actually in the library, so an empty one
    // never offers a question it cannot answer.
    chatSeeds() {
      const s = this.data.stats || {};
      const seeds = [];
      const topic = this.data.wiki.find((p) => p.section === 'topics');
      if (topic) seeds.push(`What do I know about ${topic.title.toLowerCase()}?`);
      if (s.untraced) seeds.push('Which pages can\'t be verified, and why?');
      if (s.outputsTotal) seeds.push('Summarise my most recent briefing.');
      seeds.push('What\'s in here, and what are the biggest gaps?');
      return seeds.slice(0, 3);
    },

    canSaveCapture() {
      return !!(this.cap.url.trim() || this.cap.note.trim() || this.cap.text.trim());
    },

    /* Platforms that will not answer an anonymous read, so the paste field is
       the only way the content ever reaches the library. Said before the fetch
       runs rather than after it fails, because the fix is manual and the user
       is right here with the text on their clipboard. */
    walledHost() {
      const m = this.cap.url.trim().match(/^https?:\/\/(?:www\.)?([^/]+)/i);
      if (!m) return '';
      const host = m[1].toLowerCase().replace(/^m\./, '');
      // x.com is deliberately absent: a status URL goes through the embed
      // endpoint in main.js and comes back with text and pictures.
      const walled = {
        'reddit.com': 'Reddit', 'instagram.com': 'Instagram',
        'tiktok.com': 'TikTok', 'threads.net': 'Threads',
        'facebook.com': 'Facebook', 'linkedin.com': 'LinkedIn',
        'xiaohongshu.com': 'XiaoHongShu',
      };
      return walled[host] || walled[host.split('.').slice(-2).join('.')] || '';
    },

    // What a sync would actually have to do. Also the badge on the button.
    pendingCount() {
      const s = this.data.stats || {};
      return (s.rawNew || 0) + (s.rawChanged || 0);
    },

    // The files a sync would actually touch, so you can see the work before
    // agreeing to it rather than after.
    pending() {
      if (this.sync.target) return this.data.raw.filter((f) => f.path === this.sync.target);
      return this.data.raw.filter((f) => f.status === 'new' || f.status === 'changed');
    },

    // A short, honest gloss per model. Anything the CLI offers that isn't
    // listed here still appears, unlabelled rather than mislabelled.
    modelOptions() {
      const notes = {
        default: 'Whatever Claude Code is set to',
        opus: 'Strongest judgement, best for attribution calls',
        sonnet: 'Balanced; noticeably lighter on your usage limits',
        haiku: 'Fastest and lightest, fine for bulk, plain material',
        fable: '',
        best: 'Let Claude Code pick per request',
        opusplan: 'Opus to plan, then a lighter model to execute',
      };
      const list = (this.sync.models && this.sync.models.available) || ['default'];
      return list.map((id) => {
        const base = id.replace(/\[1m\]$/, '');
        const wide = /\[1m\]$/.test(id);
        const label = base === 'default'
          ? 'Default'
          : base[0].toUpperCase() + base.slice(1) + (wide ? ' (1M context)' : '');
        return { id, label, note: wide ? 'Larger context window' : (notes[base] ?? '') };
      });
    },

    // The CLI reports "Opus 5 (1M context) (default)"; the trailing marker is
    // redundant next to an option already labelled Default.
    currentModelName() {
      const c = (this.sync.models && this.sync.models.current) || '';
      return c.replace(/\s*\(default\)\s*$/i, '').trim();
    },

    capMedia() {
      const f = this.cap.fetched;
      return f && f.ok && Array.isArray(f.media) ? f.media.length : 0;
    },
    // A post whose whole point is the picture is not "thin" for having ten
    // words of text, so media counts against the same bar.
    capThin() {
      const f = this.cap.fetched;
      if (!f || !f.ok) return false;
      return !this.capMedia && (f.chars || 0) < 400;
    },

    pickedNote() {
      const o = this.modelOptions.find((m) => m.id === this.sync.pick);
      return o ? o.note : '';
    },

    dockTitle() {
      if (this.sync.state === 'no-cli') return 'Claude Code required';
      if (this.sync.state === 'no-auth') return 'Claude Code needs a sign-in';
      if (this.sync.state === 'ready') {
        if (this.sync.target) return 'Ready to re-ingest one file';
        const n = this.pending.length;
        return `Ready to ingest ${n} file${n === 1 ? '' : 's'}`;
      }
      if (this.sync.state === 'running') return this.sync.target ? 'Re-ingesting' : 'Syncing the library';
      if (this.sync.state === 'cancelled') return 'Sync cancelled';
      if (this.sync.state === 'error') return 'Sync failed';
      if (this.sync.state === 'done') return 'Sync complete';
      return 'Sync';
    },

    // "claude-opus-5[1m]" is an id, not a label.
    modelLabel() {
      const m = this.sync.model || '';
      if (!m) return '';
      const wide = /\[1m\]/.test(m) ? ' (1M)' : '';
      const name = m.replace(/\[1m\]/, '').replace(/^claude-/, '').replace(/-\d{8}$/, '');

      // Version digits are hyphen-separated in an id and dotted in a name, so
      // haiku-4-5 has to come back as "Haiku 4.5", not "Haiku 4 5".
      const out = [];
      for (const part of name.split('-')) {
        const prev = out[out.length - 1];
        if (/^\d+$/.test(part) && /^\d+(\.\d+)*$/.test(prev || '')) out[out.length - 1] = `${prev}.${part}`;
        else out.push(/^[a-z]/.test(part) ? part[0].toUpperCase() + part.slice(1) : part);
      }
      return out.join(' ') + wide;
    },

    /* What the dollar figure actually is. Claude Code computes it locally from
       token counts at API list prices. On a subscription login that is not a
       charge (usage draws against plan limits), so the app must not print a
       bare dollar amount and let it read as a bill. */
    costLabel() {
      if (!this.sync.costUsd) return '';
      const n = `$${this.sync.costUsd.toFixed(3)}`;
      return this.sync.billed ? n : `≈${n}`;
    },
    costTitle() {
      return this.sync.billed
        ? 'Billed per token to the API key in use. Estimated locally at list prices; check the Console for the authoritative figure.'
        : 'Not a charge. Claude Code estimates this locally at API list prices. Your subscription bills by usage limits, not per run.';
    },

    elapsed() {
      const s = Math.max(0, Math.round((this.now - this.sync.startedAt) / 1000));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    },

    sections() {
      const s = this.data.stats || {};
      return [
        { id: 'overview', label: 'Overview', icon: 'grid', count: 0, hint: 'What needs attention' },
        { id: 'chat', label: 'Chat', icon: 'chat', count: 0, hint: 'Ask the library, or tell it what you think' },
        { id: 'raw', label: 'Raw', icon: 'inbox', count: s.rawNew || 0, hint: 'The junk drawer: Carter writes, Claude reads' },
        { id: 'wiki', label: 'Wiki', icon: 'book', count: 0, hint: 'The organized, cited version' },
        { id: 'outputs', label: 'Outputs', icon: 'doc', count: 0, hint: 'Briefings and reports' },
      ];
    },

    // The rail's header and its filter chips, per view. Each chip carries its
    // own count so the legend and the filter stay one control.
    current() {
      const n = (arr, f) => arr.filter(f).length;
      if (this.view === 'raw') {
        const r = this.data.raw.filter((f) => f.status !== 'ignored');
        return {
          label: 'Raw',
          filters: [
            { id: 'all', label: 'All', count: r.length },
            { id: 'new', label: 'New', count: n(r, (f) => f.status === 'new'), color: 'var(--blue)' },
            { id: 'changed', label: 'Changed', count: n(r, (f) => f.status === 'changed'), color: 'var(--orange)' },
            { id: 'ingested', label: 'Ingested', count: n(r, (f) => f.status === 'ingested'), color: 'var(--ok)' },
          ],
        };
      }
      if (this.view === 'wiki') {
        const w = this.data.wiki;
        return {
          label: 'Wiki',
          filters: [
            { id: 'all', label: 'All', count: w.length },
            { id: 'sources', label: 'Sources', count: n(w, (p) => p.section === 'sources') },
            { id: 'topics', label: 'Topics', count: n(w, (p) => p.section === 'topics') },
            { id: 'ideas', label: 'Ideas', count: n(w, (p) => p.section === 'ideas') },
            { id: 'untraced', label: 'No source', count: n(w, (p) => !p.traced) },
          ],
        };
      }
      return { label: 'Outputs', filters: [{ id: 'all', label: 'All', count: this.data.outputs.length }] };
    },

    // Everything in the current view, before filtering: what `active` is
    // looked up in, so a selection survives a filter change.
    pool() {
      if (this.view === 'raw') return this.data.raw.filter((f) => f.status !== 'ignored');
      if (this.view === 'wiki') return this.data.wiki;
      if (this.view === 'outputs') return this.data.outputs;
      return [];
    },

    list() {
      const q = this.q.trim().toLowerCase();
      const f = this.filter;
      return this.pool.filter((it) => {
        if (f !== 'all') {
          if (this.view === 'raw' && it.status !== f) return false;
          if (this.view === 'wiki') {
            if (f === 'untraced' ? it.traced : it.section !== f) return false;
          }
        }
        if (!q) return true;
        const hay = [it.name, it.path, it.title, it.question, it.type, ...(it.tags || [])]
          .filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    },

    active() {
      return this.pool.find((it) => it.path === this.selected) || null;
    },

    // Reverse traceability: which wiki pages cite the raw file on screen.
    backlinks() {
      if (this.view !== 'raw' || !this.active) return [];
      return this.data.wiki.filter((p) => p.sources.includes(this.active.path));
    },

    rendered() {
      if (this.content.kind !== 'text' || typeof this.content.text !== 'string') return '';
      let src = this.content.text;

      // Frontmatter is already shown as chips and cards above the body;
      // repeating it as a code block would be noise.
      src = src.replace(/^---\n[\s\S]*?\n---\n?/, '');

      // [[wikilink]] → a real link when the page exists, a dashed hint when it
      // does not. CLAUDE.md tells Claude to link liberally and let dangling
      // links mark pages worth writing, so both states are on purpose.
      src = src.replace(/\[\[([^\]|]+)\]\]/g, (m, slug) => {
        const s = slug.trim();
        const page = this.data.wiki.find((p) => p.slug === s || p.title === s);
        return page
          ? `<a class="wikilink" data-path="${page.path}">${s}</a>`
          : `<span class="wikilink dangling" title="No page yet">${s}</span>`;
      });

      try {
        return sanitize(marked.parse(src, { breaks: false, gfm: true }));
      } catch (e) {
        return '<p>Could not render this file.</p>';
      }
    },
  },

  watch: {
    selected() { this.loadContent(); },
    view() { this.loadContent(); },
    // Choosing a filter is a statement about what you want to look at, so the
    // document has to follow it. Without this, clicking "Pages missing a
    // source" narrows the rail but leaves a fully-sourced page on screen.
    filter() { this.syncSelection(); },
  },

  methods: {
    async refresh() {
      const d = await window.library.scan();
      if (d && d.ok) this.data = d;
      return d;
    },

    go(view, filter) {
      this.view = view;
      this.q = '';
      if (filter) {
        this.filt[view] = filter;
        this.$nextTick(() => this.syncSelection());
      }
    },

    // Keep the open document inside the current rail. Deliberately not tied to
    // the search box: re-selecting on every keystroke would yank the document
    // around while you are still typing.
    syncSelection() {
      if (!this.list.length) { this.selected = null; return; }
      if (!this.list.some((it) => it.path === this.selected)) this.selected = this.list[0].path;
    },

    select(path) {
      this.selected = path;
    },

    // The cross-folder jump: a source pointer on a wiki page, a backlink on a
    // raw file, a [[wikilink]] in prose. All of them land here.
    openPath(path) {
      const view = path.startsWith('raw/') ? 'raw'
        : path.startsWith('personal-wiki/') ? 'wiki'
        : path.startsWith('outputs/') ? 'outputs' : null;
      if (!view) return;

      const pool = view === 'raw' ? this.data.raw : view === 'wiki' ? this.data.wiki : this.data.outputs;
      if (!pool.some((it) => it.path === path)) {
        this.say('That file is not in the library any more');
        return;
      }

      this.view = view;
      this.filt[view] = 'all'; // or the target could be filtered out of its own rail
      this.q = '';
      this.sel[view] = path;
      this.$nextTick(() => {
        if (this.$refs.docPane) this.$refs.docPane.scrollTop = 0;
      });
    },

    async loadContent() {
      if (!this.active) { this.content = {}; return; }
      const res = await window.library.read(this.active.path);
      this.content = res && res.ok ? res : { kind: 'other' };
    },

    onProseClick(e) {
      const link = e.target.closest('a');
      if (!link) return;
      e.preventDefault();

      if (link.dataset.path) { this.openPath(link.dataset.path); return; }
      const href = link.getAttribute('href') || '';
      if (/^https?:\/\//.test(href)) { this.openUrl(href); return; }
      // A relative link inside the library, e.g. INDEX.md pointing at a page.
      if (href && !href.startsWith('#')) {
        const base = this.active.path.split('/').slice(0, -1).join('/');
        this.openPath(new URL(href, `app:/${base}/`).pathname.replace(/^\//, ''));
      }
    },

    /* ---- chat ---- */

    async sendChat(mode) {
      const text = this.chat.draft.trim();
      if (!text || this.chat.busy) return;

      this.chat.turns.push({ role: 'you', text });
      this.chat.turns.push({ role: 'library', text: '', steps: [], pending: true, error: '' });
      this.chat.draft = '';
      this.chat.busy = true;
      this.$nextTick(() => { this.growComposer(); this.scrollChat(); });

      const res = await window.chat.send(text, this.chat.sessionId, mode);
      if (!res.ok) {
        const turn = this.chat.turns[this.chat.turns.length - 1];
        turn.pending = false;
        turn.error = res.reason === 'no-cli'
          ? 'Claude Code is not installed. See the Sync panel.'
          : res.reason === 'busy' ? 'Still answering the last one.' : 'Could not start.';
        this.chat.busy = false;
      }
    },

    stopChat() { window.chat.stop(); },

    /* Claude Code keeps the session on disk and --resume finds it anywhere on
       the machine, so the only thing that was lost on quit was this app's
       memory of the id. Storing it (with the visible transcript, since a
       resumed thread showing an empty scrollback is worse than no thread)
       makes "New thread" a decision rather than something that happens to you. */
    saveThread() {
      // Plain objects: reactive Proxies do not survive structured clone.
      window.chat.saveThread({
        sessionId: this.chat.sessionId,
        turns: this.chat.turns.slice(-60).map((t) => ({
          role: String(t.role),
          text: String(t.text || ''),
          error: String(t.error || ''),
          steps: (t.steps || []).map((s) => ({ tool: String(s.tool || ''), target: String(s.target || '') })),
          proposal: t.proposal
            ? { items: t.proposal.items.map(String), applied: !!t.proposal.applied, running: false }
            : null,
        })),
      });
    },

    async restoreThread() {
      const saved = await window.chat.loadThread();
      if (!saved || !Array.isArray(saved.turns) || !saved.turns.length) return;
      this.chat.sessionId = saved.sessionId || null;
      // Anything mid-flight when the app died is not coming back.
      this.chat.turns = saved.turns.map((t) => ({ ...t, pending: false }));
    },

    // A new thread drops the session id, so the next message starts clean
    // rather than carrying the old conversation's context along.
    newThread() {
      this.chat.turns = [];
      this.chat.sessionId = null;
      this.chat.draft = '';
      window.chat.saveThread({ sessionId: null, turns: [] }); // clears the file
      this.$nextTick(() => this.$refs.chatBox && this.$refs.chatBox.focus());
    },

    onChatEvent(e) {
      const turn = this.chat.turns[this.chat.turns.length - 1];
      if (!turn || turn.role !== 'library') return;

      if (e.kind === 'delta') {
        turn.pending = false;
        turn.text += e.text;
        this.scrollChat();
      } else if (e.kind === 'step') {
        turn.steps.push({ tool: e.tool, target: e.target });
        this.scrollChat();
      } else if (e.kind === 'done') {
        turn.pending = false;
        // Partial deltas usually already built the text; the result is the
        // authority when they didn't arrive.
        if (!turn.text && e.text) turn.text = e.text;
        if (e.isError) turn.error = e.text || 'That turn failed.';
        if (e.sessionId) this.chat.sessionId = e.sessionId;
        turn.proposal = this.parseProposal(turn.text);
      } else if (e.kind === 'failed') {
        turn.pending = false;
        turn.error = e.text;
      } else if (e.kind === 'stopped') {
        turn.pending = false;
        if (!turn.text) turn.error = 'Stopped.';
      } else if (e.kind === 'closed') {
        this.chat.busy = false;
        turn.pending = false;
        this.saveThread();
        this.$nextTick(() => this.scrollChat());
        // A remember turn writes a page; the watcher will catch it, but a
        // refresh closes the gap left by the debounce.
        this.refresh();
      }
    },

    scrollChat() {
      this.$nextTick(() => {
        const el = this.$refs.chatScroll;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },

    growComposer() {
      const el = this.$refs.chatBox;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    },

    /* A read-only turn cannot write, but it can say what it would write. The
       agent ends such a reply with a ```wiki-update block; that gets lifted
       out of the prose and rendered as something you press, so the proposal
       and the approval are one click apart instead of a retyped instruction. */
    parseProposal(text) {
      const m = String(text).match(/```wiki-update\s*\n([\s\S]*?)```/);
      if (!m) return null;
      const items = m[1].split('\n')
        .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
        .filter(Boolean);
      return items.length ? { items, applied: false, running: false } : null;
    },

    renderChat(text) {
      try {
        // The block is shown as a card above, so strip it from the prose.
        const body = String(text).replace(/```wiki-update\s*\n[\s\S]*?```/g, '').trim();
        return sanitize(marked.parse(body, { gfm: true, breaks: true }));
      } catch (e) {
        return '';
      }
    },

    async applyProposal(turn) {
      if (!turn.proposal || turn.proposal.applied || this.chat.busy) return;
      turn.proposal.running = true;

      const instruction = `Apply these changes:\n${turn.proposal.items.map((i) => `- ${i}`).join('\n')}`;
      this.chat.turns.push({ role: 'library', text: '', steps: [], pending: true, error: '' });
      this.chat.busy = true;
      this.scrollChat();

      const res = await window.chat.send(instruction, this.chat.sessionId, 'apply');
      turn.proposal.running = false;
      if (!res.ok) {
        const t = this.chat.turns[this.chat.turns.length - 1];
        t.pending = false;
        t.error = res.reason === 'busy' ? 'Still working on the last one.' : 'Could not start.';
        this.chat.busy = false;
        return;
      }
      turn.proposal.applied = true;
    },

    /* ---- capture ---- */

    openCapture() {
      this.cap = { open: true, url: '', note: '', text: '', fetching: false, fetched: null, saving: false };
      this.$nextTick(() => this.$refs.capUrl && this.$refs.capUrl.focus());
    },

    // Fetch while you type, but only once you've stopped, and only for
    // something that actually looks like a URL, so a half-typed host does not
    // fire off requests.
    onUrlInput() {
      this.cap.fetched = null;
      clearTimeout(this.capTimer);
      const url = this.cap.url.trim();
      if (!/^https?:\/\/[^\s.]+\.[^\s]{2,}/i.test(url)) { this.cap.fetching = false; return; }
      // No point spending a request on a host that is going to refuse it.
      if (this.walledHost) { this.cap.fetching = false; return; }

      this.capTimer = setTimeout(async () => {
        this.cap.fetching = true;
        const res = await window.capture.preview(url);
        // The field may have moved on while the request was in flight.
        if (this.cap.url.trim() !== url) return;
        this.cap.fetching = false;
        this.cap.fetched = res;
      }, 600);
    },

    async saveCapture() {
      if (!this.canSaveCapture) return;
      const f = this.cap.fetched;
      this.cap.saving = true;
      const res = await window.capture.save({
        url: this.cap.url.trim(),
        site: f && f.ok ? f.site : '',
        title: f && f.ok ? f.title : '',
        author: f && f.ok ? f.author : '',
        posted: f && f.ok ? f.posted : '',
        // Rebuilt as plain objects on purpose: f.media is a Vue reactive
        // Proxy, and structured clone across the IPC boundary cannot copy a
        // Proxy. It fails with "An object could not be cloned".
        media: f && f.ok && Array.isArray(f.media)
          ? f.media.map((m) => ({
            type: String(m.type || ''),
            url: String(m.url || ''),
            // Carried explicitly: this flag is what tells main.js to slice the
            // clip into frames, and rebuilding the object silently dropped it.
            isVideo: !!m.isVideo,
            seconds: Number(m.seconds || 0),
          }))
          : [],
        note: this.cap.note,
        // Anything pasted by hand wins over the fetch: it is there precisely
        // because the fetch came up short.
        text: this.cap.text.trim() || (f && f.ok ? f.text : ''),
      });
      this.cap.saving = false;

      if (!res.ok) { this.say(res.reason || 'Could not save that'); return; }
      this.cap.open = false;
      const n = (res.media || []).length;
      this.say(n ? `Saved to raw with ${n} image${n === 1 ? '' : 's'}` : 'Saved to raw');
      // The watcher will bring it in, but going straight to it is the point.
      await this.refresh();
      this.openPath(res.path);
    },

    async dropFiles(fileList) {
      const paths = [];
      for (const file of fileList) {
        try { paths.push(window.capture.pathFor(file)); } catch (e) { /* not a real file */ }
      }
      if (!paths.length) { this.say('Nothing droppable there. Try the Add button for a link.'); return; }

      const res = await window.capture.addFiles(paths.filter(Boolean));
      if (!res.ok) { this.say(res.reason || 'Could not add those'); return; }

      const n = res.added.length;
      this.say(n ? `Added ${n} file${n === 1 ? '' : 's'} to raw` : 'Nothing was added');
      if (res.skipped.length) console.warn('skipped:', res.skipped);
      await this.refresh();
      if (n) this.openPath(res.added[0]);
    },

    /* ---- sync ---- */

    // The button opens the dock; it no longer starts the run. A sync writes to
    // the wiki, so seeing which files are about to be read (and on which
    // model) before agreeing is worth one extra click.
    //
    // With `target`, this is a resync: one already-ingested file, re-read and
    // its existing pages revised. That path skips the pending check, since the
    // whole point is reprocessing something already logged as done.
    async startSync(target) {
      if (this.sync.running) { this.sync.open = true; return; }

      // Only a string is a target. `@click="startSync"` without parentheses
      // hands Vue's MouseEvent in as the first argument, which turned every
      // press of the Sync button into a resync of a file that does not exist.
      // The run died instantly on a bad target. The call sites pass `()`
      // now; this makes the mistake harmless if it comes back.
      this.sync.target = typeof target === 'string' && target ? target : null;
      target = this.sync.target;

      // Spawning Claude Code to be told there is nothing to do is a slow way
      // to learn something the scan already knows.
      if (!target && !this.pendingCount) {
        this.say('Nothing new in raw/, already in sync');
        return;
      }

      const probe = await window.sync.probe();
      this.sync.cliOk = probe.ok;
      if (!probe.ok) {
        this.sync.state = 'no-cli';
        this.sync.open = true;
        return;
      }

      this.sync.state = 'ready';
      this.sync.open = true;
      this.sync.summary = '';
      this.sync.log = [];

      if (!this.sync.models) {
        const m = await window.sync.models();
        this.sync.models = m;
        // A remembered pick this CLI no longer offers would silently fail at
        // spawn time, so fall back rather than carry it forward.
        if (!m.available.includes(this.sync.pick)) this.sync.pick = 'default';
      }

      // Focus Start so the common path stays keyboard-only: Sync, Enter.
      this.$nextTick(() => this.$refs.goBtn && this.$refs.goBtn.focus());
    },

    async runSync() {
      this.sync.log = [];
      this.sync.summary = '';
      this.sync.costUsd = null;
      this.sync.state = 'running';
      this.sync.running = true;
      this.sync.open = true;
      this.sync.startedAt = Date.now();
      this.now = Date.now();
      clearInterval(this.tick);
      this.tick = setInterval(() => { this.now = Date.now(); }, 1000);

      try { localStorage.setItem('syncModel', this.sync.pick); } catch (e) { /* private mode */ }

      const res = await window.sync.start(this.sync.pick, this.sync.target || undefined);
      if (!res.ok) {
        this.sync.running = false;
        clearInterval(this.tick);
        this.sync.state = res.reason === 'no-cli' ? 'no-cli' : 'error';
        this.sync.summary = res.reason === 'already-running'
          ? 'A sync is already running.'
          : res.reason === 'no-library' ? 'No library is open.' : '';
      }
    },

    cancelSync() { window.sync.cancel(); },

    async recheckCli() {
      const res = await window.sync.recheck();
      this.sync.cliOk = res.ok;
      if (res.ok) { this.sync.state = 'idle'; this.sync.models = null; this.startSync(); }
      else this.say('Still not finding the claude command');
    },

    onSyncEvent(e) {
      const push = (row) => {
        this.sync.log.push(row);
        if (this.sync.log.length > 300) this.sync.log.shift();
        this.$nextTick(() => {
          const el = this.$refs.dockLog;
          if (el) el.scrollTop = el.scrollHeight;
        });
      };

      if (e.kind === 'start') {
        this.sync.model = e.model || '';
        this.sync.billed = !!e.apiKeySource && e.apiKeySource !== 'none';
      }
      else if (e.kind === 'step') push({ kind: 'step', tool: e.tool, target: e.target });
      else if (e.kind === 'text') push({ kind: 'text', text: e.text });
      else if (e.kind === 'log') push({ kind: 'log', text: e.text });
      else if (e.kind === 'failed') { this.sync.state = 'error'; this.sync.summary = e.text; }
      else if (e.kind === 'cancelled') { this.sync.state = 'cancelled'; this.sync.summary = 'Stopped. Anything already written stays.'; }
      else if (e.kind === 'done') {
        // Claude Code reports a missing login as the *result*, with exit code
        // 0, so the process closing cleanly says nothing about whether the
        // run worked. It is also the likeliest first-run failure, and "Please
        // run /login" is not something you can do from inside this app.
        const noAuth = e.isError && /not logged in|please run \/login|authentication_failed|invalid api key/i.test(e.text || '');
        this.sync.state = noAuth ? 'no-auth' : e.isError ? 'error' : 'done';
        this.sync.summary = noAuth ? '' : e.text;
        this.sync.costUsd = typeof e.costUsd === 'number' ? e.costUsd : null;
      } else if (e.kind === 'closed') {
        this.sync.running = false;
        clearInterval(this.tick);
        // The watcher has been updating the rest of the UI throughout, but a
        // final scan closes any gap left by the debounce.
        this.refresh();
      }
    },

    reveal(path) { window.library.reveal(path); },
    async openUrl(url) {
      const ok = await window.library.openExternal(url);
      if (!ok) this.say('Only http and https links can be opened');
    },

    async pickRoot() {
      const d = await window.library.pickRoot();
      if (d && d.ok) this.data = d;
      else if (d && d.reason === 'not-a-library') this.say('That folder has no raw/, personal-wiki/ and outputs/');
    },

    toggleTheme() {
      this.dark = !this.dark;
      document.documentElement.classList.toggle('dark-mode', this.dark);
      try { localStorage.setItem('theme', this.dark ? 'dark' : 'light'); } catch (e) { /* private mode */ }
    },

    say(msg) {
      this.toast = msg;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => { this.toast = ''; }, 2600);
    },

    /* ---- formatting ---- */
    bytes(n) {
      if (!n && n !== 0) return '';
      if (n < 1024) return `${n} B`;
      if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
      return `${(n / 1024 / 1024).toFixed(1)} MB`;
    },
    ago(ms) {
      if (!ms) return '';
      const s = Math.max(0, (Date.now() - ms) / 1000);
      if (s < 45) return 'just now';
      if (s < 3600) return `${Math.round(s / 60)}m ago`;
      if (s < 86400) return `${Math.round(s / 3600)}h ago`;
      return `${Math.round(s / 86400)}d ago`;
    },
    clock(ms) {
      return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    },
    iconFor(f) {
      if (this.view === 'raw') return f.kind === 'image' ? 'image' : 'file';
      if (this.view === 'wiki') {
        return f.section === 'ideas' ? 'bulb' : f.section === 'topics' ? 'layers' : 'book';
      }
      return 'doc';
    },
  },

  async mounted() {
    if (/Macintosh/.test(navigator.userAgent)) document.documentElement.classList.add('is-mac');

    // Follow the OS until the user says otherwise, then remember that choice.
    try {
      const m = localStorage.getItem('syncModel');
      if (m) this.sync.pick = m;
    } catch (e) { /* private mode */ }

    let stored = null;
    try { stored = localStorage.getItem('theme'); } catch (e) { /* private mode */ }
    this.dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark-mode', this.dark);

    await this.refresh();

    /* The live part. A watcher event in main.js arrives with a fresh scan and
       the paths that moved; the rail flashes them, the feed logs them, and an
       open file re-reads itself so what is on screen is never stale. */
    window.library.onChanged(({ data, changed }) => {
      this.data = data;

      const at = Date.now();
      for (const p of changed) {
        this.recent.add(p);
        setTimeout(() => this.recent.delete(p), 2400); // matches the CSS flash
        this.feed.unshift({
          path: p, at,
          kind: p.startsWith('raw/') ? 'raw' : p.startsWith('outputs/') ? 'output' : 'wiki',
        });
      }
      this.feed = this.feed.slice(0, 40);

      this.pulsing = true;
      clearTimeout(this.pulseTimer);
      this.pulseTimer = setTimeout(() => { this.pulsing = false; }, 1400);

      if (this.active && changed.includes(this.active.path)) this.loadContent();
    });

    /* Drag and drop, on the window rather than a target: dropping a file
       anywhere should mean the same thing. The default handlers have to be
       killed or Chromium navigates the window to the dropped file. */
    window.addEventListener('dragover', (e) => { e.preventDefault(); });
    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (!Array.from(e.dataTransfer.types || []).includes('Files')) return;
      this.dragDepth++;
      this.dragging = true;
    });
    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      // One dragleave per child element crossed; only the last one counts.
      if (--this.dragDepth <= 0) { this.dragDepth = 0; this.dragging = false; }
    });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      this.dragDepth = 0;
      this.dragging = false;
      if (e.dataTransfer.files && e.dataTransfer.files.length) this.dropFiles(e.dataTransfer.files);
    });

    this.restoreThread();
    window.chat.onEvent((e) => this.onChatEvent(e));
    window.sync.onEvent((e) => this.onSyncEvent(e));
    window.sync.probe().then((p) => { this.sync.cliOk = p.ok; });

    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '5') {
        e.preventDefault();
        this.go(['overview', 'chat', 'raw', 'wiki', 'outputs'][+e.key - 1]);
        if (this.view === 'chat') this.$nextTick(() => this.$refs.chatBox && this.$refs.chatBox.focus());
        return;
      }
      const typing = /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        if (this.$refs.searchBox) this.$refs.searchBox.focus();
      }
      if (e.key === 'Escape') {
        this.q = '';
        if (document.activeElement.blur) document.activeElement.blur();
      }
    });
  },
};

// Exposed so a dev run can drive the UI from outside. See the capture hook
// in main.js. Harmless in a packaged build: the renderer is already the only
// thing that can reach it, and it can only do what the UI itself can do.
window.__app = createApp(AppRoot).mount('#app');

