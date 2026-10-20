// LitVault — static front-end (GitHub Pages) talking directly to Supabase.
import { supabase, configured, SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-client.js";

/* ============================ helpers ============================ */
const CATEGORIES = [
  "Fiction", "Non-Fiction", "Science", "Technology", "Philosophy", "Religion & Spirituality",
  "History", "Biography", "Self-Help", "Education", "Art & Design", "Business", "Other",
];
const MAX_PDF = 50 * 1024 * 1024;
const MAX_COVER = 5 * 1024 * 1024;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtSize = (n) =>
  !n ? "—" : n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : n >= 1024 ? (n / 1024).toFixed(0) + " KB" : n + " B";
const baseUrl = () => location.origin + location.pathname;

const ICONS = {
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M21 5h-4M5 17v4M7 19H3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
};
const icon = (name, cls = "w-4 h-4") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;

function toast(msg, kind = "info") {
  const colors = {
    success: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    error: "border-red-300 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    info: "border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
  };
  const el = document.createElement("div");
  el.className = `toast max-w-xs rounded-lg border px-4 py-3 text-sm shadow-lg ${colors[kind] || colors.info}`;
  el.textContent = msg;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

/* ============================ state ============================ */
const state = { session: null, user: null, profile: null, books: null };
let routeId = 0;
const isAdmin = () => state.profile?.role === "admin";
const canManage = (b) => !!state.user && (isAdmin() || b.uploaded_by === state.user.id);

async function loadProfile() {
  if (!state.user) { state.profile = null; return; }
  const { data } = await supabase
    .from("profiles").select("id,full_name,avatar_url,role").eq("id", state.user.id).maybeSingle();
  state.profile = data;
}

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/* ============================ routing ============================ */
const PROTECTED = new Set(["/upload", "/assistant"]);
const currentPath = () => (location.hash.startsWith("#/") ? location.hash.slice(1).split("?")[0] : "/");
const hashQuery = () => {
  const i = location.hash.indexOf("?");
  return new URLSearchParams(i > -1 ? location.hash.slice(i + 1) : "");
};
const safeRoute = (r) => (["/", "/library", "/upload", "/assistant"].includes(r) ? r : "/library");

const ROUTES = {
  "/": viewHome,
  "/library": viewLibrary,
  "/upload": viewUpload,
  "/assistant": viewAssistant,
  "/login": viewAuth,
};

async function route() {
  const id = ++routeId;
  let path = currentPath();
  if (!ROUTES[path]) path = "/";

  if (!configured) { viewSetup(); renderNav(); return; }
  if (PROTECTED.has(path) && !state.user) {
    location.replace(`#/login?next=${encodeURIComponent(path)}`);
    return;
  }
  if (path === "/login" && state.user) {
    location.replace("#" + safeRoute(hashQuery().get("next") || "/library"));
    return;
  }

  closePdf();
  renderNav();
  syncFloatingChat();
  const el = $("#app");
  window.scrollTo(0, 0);
  document.title = { "/": "LitVault — community digital library", "/library": "Library · LitVault",
    "/upload": "Upload · LitVault", "/assistant": "AI Librarian · LitVault", "/login": "Sign in · LitVault" }[path];
  await ROUTES[path](el, id);
}

/* ============================ navbar ============================ */
function renderNav() {
  const path = currentPath();
  const links = [["#/", "Home", "/"], ["#/library", "Library", "/library"], ["#/upload", "Upload", "/upload"], ["#/assistant", "AI Assistant", "/assistant"]];
  const active = (p) => (p === "/" ? path === "/" : path.startsWith(p));
  const name = state.profile?.full_name || state.user?.email?.split("@")[0] || "";
  const initials = esc(name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase());

  $("#nav").innerHTML = `
  <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
    <a href="#/" class="flex items-center gap-2 font-semibold tracking-tight">
      <span class="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">${icon("book")}</span>LitVault
    </a>
    <nav class="hidden items-center gap-1 md:flex">
      ${links.map(([h, l, p]) => `
        <a href="${h}" class="relative rounded-md px-3 py-2 text-sm transition ${active(p) ? "font-medium text-slate-900 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}">
          ${l}${active(p) ? '<span class="absolute inset-x-3 -bottom-[17px] h-0.5 rounded bg-indigo-500"></span>' : ""}
        </a>`).join("")}
    </nav>
    <div class="flex items-center gap-2">
      <button data-action="theme" aria-label="Toggle theme" class="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-100 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800">
        <span class="dark:hidden">${icon("moon")}</span><span class="hidden dark:inline">${icon("sun")}</span>
      </button>
      ${state.user ? `
        <details class="relative" id="user-menu">
          <summary class="grid h-9 w-9 cursor-pointer list-none place-items-center overflow-hidden rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-xs font-semibold text-white">
            ${state.profile?.avatar_url ? `<img src="${esc(state.profile.avatar_url)}" alt="" class="h-full w-full object-cover" referrerpolicy="no-referrer">` : initials}
          </summary>
          <div class="card absolute right-0 z-50 mt-2 w-64 p-2">
            <div class="px-3 py-2">
              <p class="truncate text-sm font-medium">${esc(name)}</p>
              <p class="truncate text-xs text-slate-500">${esc(state.user.email)}</p>
              <span class="tag mt-2 inline-block capitalize">${esc(state.profile?.role || "user")}</span>
            </div>
            <div class="my-1 h-px bg-slate-200 dark:bg-slate-800"></div>
            <a href="#/library?mine=1" class="block rounded-md px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">My uploads</a>
            <button data-action="signout" class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10">${icon("logout", "w-3.5 h-3.5")} Sign out</button>
          </div>
        </details>` : `<a href="#/login" class="btn-primary hidden sm:inline-flex">Sign in</a>`}
      <button data-action="menu" aria-label="Menu" class="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 md:hidden dark:border-slate-800">${icon("menu")}</button>
    </div>
  </div>
  <nav id="mobile-nav" class="hidden border-t border-slate-200 md:hidden dark:border-slate-800">
    <div class="flex flex-col gap-1 p-3">
      ${links.map(([h, l]) => `<a href="${h}" class="rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">${l}</a>`).join("")}
      ${state.user ? "" : '<a href="#/login" class="btn-primary mt-1">Sign in</a>'}
    </div>
  </nav>`;
}

/* ============================ views ============================ */
function viewSetup() {
  $("#app").innerHTML = `
  <div class="mx-auto max-w-xl py-16 text-center">
    <h1 class="text-2xl font-semibold">Almost there — connect Supabase</h1>
    <p class="mt-3 text-slate-600 dark:text-slate-400">Open <code class="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">config.js</code> and paste your Supabase <b>Project URL</b> and <b>anon key</b>
    (Supabase Dashboard → Project Settings → API). Then reload this page. Full steps are in <code class="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">README.md</code>.</p>
  </div>`;
}

async function viewHome(el, id) {
  let count = 0;
  const { count: c } = await supabase.from("books").select("id", { count: "exact", head: true });
  if (id !== routeId) return;
  count = c ?? 0;
  const features = [
    ["upload", "Share a PDF", "Upload books with a cover, category and description in seconds."],
    ["search", "Instant search", "Filter by title, author or keyword as you type."],
    ["download", "Secure downloads", "Private storage — only signed-in members can preview or download."],
    ["sparkles", "AI Librarian", "Ask Gemini-powered questions about what's on the shelves."],
  ];
  el.innerHTML = `
  <div class="space-y-20 py-8 sm:py-16">
    <section class="mx-auto max-w-3xl text-center">
      <span class="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500 dark:border-slate-800">${count} ${count === 1 ? "book" : "books"} and growing</span>
      <h1 class="mt-6 bg-gradient-to-b from-slate-900 to-slate-600 bg-clip-text text-4xl font-semibold tracking-tight text-transparent sm:text-6xl dark:from-white dark:to-slate-400">A community library for every reader.</h1>
      <p class="mx-auto mt-5 max-w-xl text-slate-600 dark:text-slate-400">Upload, discover, preview and download PDF books — with an AI librarian that helps you find your next read.</p>
      <div class="mt-8 flex flex-wrap justify-center gap-3">
        <a href="#/library" class="btn-primary">Browse the library</a>
        <a href="#/upload" class="btn-ghost">Upload a book</a>
      </div>
    </section>
    <section class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      ${features.map(([ic, t, d]) => `
        <div class="card p-5 transition hover:-translate-y-1">
          <span class="grid h-9 w-9 place-items-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">${icon(ic, "w-5 h-5")}</span>
          <h3 class="mt-4 font-semibold">${t}</h3><p class="mt-1 text-sm text-slate-500">${d}</p>
        </div>`).join("")}
    </section>
  </div>`;
}

/* ---------------- library ---------------- */
const skeletonCards = (n = 8) =>
  Array.from({ length: n }).map(() => `
    <div class="card overflow-hidden"><div class="skel aspect-[3/4]"></div>
      <div class="space-y-2 p-4"><div class="skel h-4 w-3/4 rounded"></div><div class="skel h-3 w-1/2 rounded"></div><div class="skel h-8 w-full rounded-lg"></div></div></div>`).join("");

async function fetchBooks() {
  const { data, error } = await supabase
    .from("books")
    .select("id,title,author,category,description,file_path,cover_path,file_size,uploaded_by,created_at,uploader:profiles(full_name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  state.books = (data ?? []).map((b) => ({
    ...b,
    cover_url: b.cover_path ? supabase.storage.from("covers").getPublicUrl(b.cover_path).data.publicUrl : null,
  }));
  return state.books;
}

function bookCard(b) {
  const search = `${b.title} ${b.author} ${b.category} ${b.description}`.toLowerCase();
  return `
  <article class="book card group flex flex-col overflow-hidden transition hover:-translate-y-1"
    data-id="${esc(b.id)}" data-category="${esc(b.category)}" data-owner="${esc(b.uploaded_by)}" data-search="${esc(search)}">
    <div class="cover relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-950 dark:to-violet-950">
      ${b.cover_url
        ? `<img src="${esc(b.cover_url)}" alt="Cover of ${esc(b.title)}" loading="lazy" class="h-full w-full object-cover">`
        : `<div class="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center"><span class="text-indigo-400">${icon("book", "w-7 h-7")}</span><span class="line-clamp-3 text-xs font-medium text-indigo-900/70 dark:text-indigo-200/70">${esc(b.title)}</span></div>`}
    </div>
    <div class="flex flex-1 flex-col gap-1 p-4">
      <span class="tag w-fit">${esc(b.category)}</span>
      <h3 class="mt-1 line-clamp-2 text-sm font-semibold leading-snug">${esc(b.title)}</h3>
      <p class="truncate text-xs text-slate-500">${esc(b.author)} · ${fmtSize(b.file_size)}</p>
      <p class="desc line-clamp-2 text-sm text-slate-600 dark:text-slate-400">${esc(b.description)}</p>
      <div class="mt-auto flex gap-2 pt-3">
        <button data-action="preview" class="btn-ghost flex-1 !px-3 !py-1.5 text-xs">${icon("eye", "w-3.5 h-3.5")} Preview</button>
        <button data-action="download" class="btn-primary flex-1 !px-3 !py-1.5 text-xs">${icon("download", "w-3.5 h-3.5")} PDF</button>
        ${canManage(b) ? `<button data-action="delete" aria-label="Delete ${esc(b.title)}" class="btn-ghost !px-2.5 !py-1.5 text-red-600 hover:!bg-red-50 dark:text-red-400 dark:hover:!bg-red-500/10">${icon("trash", "w-3.5 h-3.5")}</button>` : ""}
      </div>
    </div>
  </article>`;
}

async function viewLibrary(el, id) {
  const wantMine = hashQuery().get("mine") === "1" && !!state.user;
  el.innerHTML = `
  <div class="space-y-6">
    <div><h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Library</h1>
      <p class="mt-1 text-sm text-slate-500">Browse everything the community has shared.</p></div>
    <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div class="relative flex-1">
        <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">${icon("search")}</span>
        <input id="q" type="search" placeholder="Search by title, author or keyword…" aria-label="Search books" class="input !pl-9">
      </div>
      <select id="cat" class="input lg:w-56" aria-label="Category">
        <option value="all">All categories</option>${CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join("")}
      </select>
      ${state.user ? `<label class="btn-ghost cursor-pointer select-none"><input id="mine" type="checkbox" class="accent-indigo-600" ${wantMine ? "checked" : ""}> My uploads</label>` : ""}
      <div class="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-800">
        <button data-view="grid" aria-label="Grid view" class="view-btn grid h-8 w-9 place-items-center rounded-md transition">${icon("grid")}</button>
        <button data-view="list" aria-label="List view" class="view-btn grid h-8 w-9 place-items-center rounded-md transition">${icon("list")}</button>
      </div>
    </div>
    <p id="count" class="text-sm text-slate-500" aria-live="polite"></p>
    <div id="books" class="grid-view">${skeletonCards()}</div>
    <div id="empty" class="card hidden flex-col items-center gap-3 px-6 py-16 text-center"></div>
  </div>`;

  const booksEl = $("#books");
  let view = "grid";
  try { view = localStorage.getItem("view") || "grid"; } catch {}
  const setView = (v) => {
    booksEl.classList.remove("grid-view", "list-view");
    booksEl.classList.add(v === "list" ? "list-view" : "grid-view");
    $$(".view-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    try { localStorage.setItem("view", v); } catch {}
  };
  setView(view);
  $$(".view-btn").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));

  let books;
  try {
    books = await fetchBooks();
  } catch (e) {
    if (id !== routeId) return;
    booksEl.className = "hidden";
    const empty = $("#empty");
    empty.classList.remove("hidden"); empty.classList.add("flex");
    empty.innerHTML = `<p class="font-medium">Couldn't load the library.</p><p class="text-sm text-slate-500">${esc(e.message || "Check your Supabase setup.")}</p>
      <button class="btn-primary" onclick="location.reload()">Retry</button>`;
    return;
  }
  if (id !== routeId) return;

  booksEl.innerHTML = books.map(bookCard).join("");
  const q = $("#q"), cat = $("#cat"), mine = $("#mine"), count = $("#count"), empty = $("#empty");

  function apply() {
    const terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    let n = 0;
    $$(".book", booksEl).forEach((c) => {
      const ok =
        terms.every((t) => c.dataset.search.includes(t)) &&
        (cat.value === "all" || c.dataset.category === cat.value) &&
        (!mine || !mine.checked || c.dataset.owner === state.user?.id);
      c.classList.toggle("hidden", !ok);
      if (ok) n++;
    });
    count.textContent = `${n} ${n === 1 ? "book" : "books"}` + (q.value.trim() ? ` matching “${q.value.trim()}”` : "");
    booksEl.classList.toggle("hidden", n === 0);
    empty.classList.toggle("hidden", n !== 0);
    empty.classList.toggle("flex", n === 0);
    empty.innerHTML = books.length === 0
      ? `<p class="font-medium">The shelves are empty.</p><p class="text-sm text-slate-500">Be the first to share a book with the community.</p><a href="#/upload" class="btn-primary">Upload a book</a>`
      : `<p class="font-medium">No books match your filters.</p><p class="text-sm text-slate-500">Try a different keyword or category.</p>`;
  }
  [q, cat, mine].forEach((x) => x && x.addEventListener("input", apply));
  apply();

  booksEl.onclick = async (e) => {
    const btn = e.target.closest("[data-action]");
    const card = e.target.closest(".book");
    if (!btn || !card) return;
    const book = state.books.find((b) => b.id === card.dataset.id);
    if (!book) return;
    if (btn.dataset.action === "preview") openPdf(book);
    if (btn.dataset.action === "download") downloadBook(book, btn);
    if (btn.dataset.action === "delete") {
      if (!confirm(`Delete “${book.title}”? This can't be undone.`)) return;
      const { data, error } = await supabase.from("books").delete().eq("id", book.id).select("id");
      if (error || !data?.length) return toast("You can only delete your own books.", "error");
      await supabase.storage.from("books").remove([book.file_path]);
      if (book.cover_path) await supabase.storage.from("covers").remove([book.cover_path]);
      state.books = state.books.filter((b) => b.id !== book.id);
      books = state.books;
      card.remove();
      apply();
      toast("Book deleted.", "success");
    }
  };
}

async function downloadBook(book, btn) {
  if (!state.user) { toast("Sign in to download books.", "info"); location.hash = "#/login?next=/library"; return; }
  if (btn) btn.disabled = true;
  const fname = (book.title.replace(/[^\w\- ]+/g, "").trim() || "book") + ".pdf";
  const { data, error } = await supabase.storage.from("books").createSignedUrl(book.file_path, 300, { download: fname });
  if (btn) btn.disabled = false;
  if (error || !data) return toast("Couldn't create a download link. Try again.", "error");
  const a = document.createElement("a");
  a.href = data.signedUrl; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  toast(`Downloading “${book.title}”`, "success");
}

/* ---------------- PDF viewer (pdf.js → canvas) ---------------- */
const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
let pdfjsPromise = null;
function loadPdfJs() {
  pdfjsPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = PDFJS + "pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.js"; resolve(window.pdfjsLib); };
    s.onerror = () => { pdfjsPromise = null; reject(new Error("Couldn't load the PDF viewer.")); };
    document.head.appendChild(s);
  });
  return pdfjsPromise;
}

const viewer = { doc: null, book: null, scale: 1.2, token: 0, observer: null };

function closePdf() {
  const modal = $("#pdf-modal");
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden"); modal.classList.remove("flex");
  document.body.style.overflow = "";
  viewer.token++; viewer.observer?.disconnect();
  viewer.doc?.destroy?.(); viewer.doc = null; viewer.book = null;
  $("#pdf-pages").innerHTML = "";
}

async function openPdf(book) {
  if (!state.user) { toast("Sign in to preview books.", "info"); location.hash = "#/login?next=/library"; return; }
  const modal = $("#pdf-modal"), pages = $("#pdf-pages"), status = $("#pdf-status");
  const myToken = ++viewer.token;
  viewer.book = book;
  $("#pdf-title").textContent = book.title;
  $("#pdf-sub").textContent = book.author;
  pages.innerHTML = `<div class="grid h-full place-items-center text-sm text-slate-500">Loading PDF…</div>`;
  status.classList.add("hidden");
  modal.classList.remove("hidden"); modal.classList.add("flex");
  document.body.style.overflow = "hidden";

  try {
    const { data, error } = await supabase.storage.from("books").createSignedUrl(book.file_path, 300);
    if (error || !data) throw new Error("Couldn't open this book.");
    const [pdfjs, res] = await Promise.all([loadPdfJs(), fetch(data.signedUrl)]);
    if (!res.ok) throw new Error("Couldn't download the PDF for preview.");
    const buf = await res.arrayBuffer();
    if (myToken !== viewer.token) return;
    viewer.doc = await pdfjs.getDocument({ data: buf }).promise;
    if (myToken !== viewer.token) return;
    await buildPages();
  } catch (e) {
    if (myToken !== viewer.token) return;
    pages.innerHTML = `<div class="grid h-full place-items-center p-6 text-center text-sm text-red-600">${esc(e.message || "Preview failed.")}</div>`;
  }
}

async function buildPages() {
  const doc = viewer.doc, pages = $("#pdf-pages"), status = $("#pdf-status");
  const myToken = ++viewer.token;
  viewer.observer?.disconnect();
  pages.innerHTML = "";
  const first = await doc.getPage(1);
  if (myToken !== viewer.token) return;
  const vp = first.getViewport({ scale: viewer.scale });

  viewer.observer = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting && !en.target.dataset.done) {
        en.target.dataset.done = "1";
        renderPage(en.target, myToken);
      }
    });
  }, { root: pages, rootMargin: "800px 0px" });

  for (let n = 1; n <= doc.numPages; n++) {
    const d = document.createElement("div");
    d.className = "pdf-page";
    d.dataset.page = n;
    d.style.width = vp.width + "px";
    d.style.height = vp.height + "px";
    d.textContent = `Page ${n}`;
    pages.appendChild(d);
    viewer.observer.observe(d);
  }
  status.classList.remove("hidden");
  status.textContent = `Page 1 of ${doc.numPages}`;
  pages.onscroll = () => {
    const mid = pages.scrollTop + pages.clientHeight / 2;
    for (const d of pages.children) {
      if (d.offsetTop + d.offsetHeight > mid) { status.textContent = `Page ${d.dataset.page} of ${doc.numPages}`; break; }
    }
  };
}

async function renderPage(div, token) {
  try {
    const page = await viewer.doc.getPage(Number(div.dataset.page));
    if (token !== viewer.token) return;
    const vp = page.getViewport({ scale: viewer.scale });
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width * dpr); canvas.height = Math.floor(vp.height * dpr);
    canvas.style.width = vp.width + "px"; canvas.style.height = vp.height + "px";
    await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] }).promise;
    if (token !== viewer.token) return;
    div.style.width = vp.width + "px"; div.style.height = vp.height + "px";
    div.textContent = ""; div.appendChild(canvas);
  } catch { /* page render cancelled or failed */ }
}

/* ---------------- upload ---------------- */
async function viewUpload(el) {
  el.innerHTML = `
  <div class="mx-auto max-w-3xl space-y-6">
    <div><h1 class="text-2xl font-semibold tracking-tight sm:text-3xl">Upload a book</h1>
      <p class="mt-1 text-sm text-slate-500">Share a PDF with the community. Only upload works you have the right to distribute.</p></div>
    <form id="upload-form" class="card grid gap-6 p-5 sm:p-8 md:grid-cols-[1fr_220px]" novalidate>
      <div class="space-y-5">
        <div class="space-y-1.5">
          <span class="text-sm font-medium">PDF file *</span>
          <div id="drop" role="button" tabindex="0" class="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-center transition hover:border-indigo-400 dark:border-slate-700">
            <span class="text-slate-400">${icon("upload", "w-6 h-6")}</span>
            <p id="drop-text" class="text-sm"><span class="font-medium text-indigo-600">Click to browse</span> or drag a PDF here</p>
            <p id="drop-sub" class="text-xs text-slate-500">PDF only · up to 50 MB</p>
            <input id="pdf" type="file" accept="application/pdf,.pdf" hidden>
          </div>
          <p class="text-xs text-red-500" data-err="pdf"></p>
        </div>
        <div class="grid gap-5 sm:grid-cols-2">
          <div class="space-y-1.5"><label for="title" class="text-sm font-medium">Title *</label>
            <input id="title" maxlength="200" class="input" placeholder="e.g. Meditations"><p class="text-xs text-red-500" data-err="title"></p></div>
          <div class="space-y-1.5"><label for="author" class="text-sm font-medium">Author *</label>
            <input id="author" maxlength="120" class="input" placeholder="e.g. Marcus Aurelius"><p class="text-xs text-red-500" data-err="author"></p></div>
        </div>
        <div class="space-y-1.5"><label for="category" class="text-sm font-medium">Category *</label>
          <select id="category" class="input"><option value="" disabled selected>Select a category…</option>${CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join("")}</select>
          <p class="text-xs text-red-500" data-err="category"></p></div>
        <div class="space-y-1.5"><label for="description" class="text-sm font-medium">Description</label>
          <textarea id="description" rows="5" maxlength="4000" class="input resize-y" placeholder="What is this book about? A good description also helps the AI Librarian recommend it."></textarea></div>
        <div>
          <div id="progress-wrap" class="mb-3 hidden">
            <div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div id="progress" class="h-full w-0 bg-indigo-600 transition-all"></div></div>
            <p id="progress-text" class="mt-1 text-xs text-slate-500"></p>
          </div>
          <button id="submit" type="submit" class="btn-primary w-full sm:w-auto">${icon("upload")} Upload book</button>
        </div>
      </div>
      <div class="space-y-1.5">
        <span class="text-sm font-medium">Cover (optional)</span>
        <label class="relative flex aspect-[3/4] cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-indigo-400 dark:border-slate-700 dark:bg-slate-900">
          <img id="cover-preview" alt="Cover preview" class="absolute inset-0 hidden h-full w-full object-cover">
          <div id="cover-ph" class="flex flex-col items-center gap-2 text-slate-400">${icon("image", "w-6 h-6")}<span class="text-xs">JPG, PNG, WebP</span></div>
          <input id="cover" type="file" accept="image/jpeg,image/png,image/webp" hidden>
        </label>
        <button type="button" id="cover-remove" class="hidden text-xs text-slate-500 hover:text-red-500">Remove cover</button>
        <p class="text-xs text-red-500" data-err="cover"></p>
      </div>
    </form>
  </div>`;

  const setErr = (k, m) => { const x = $(`[data-err="${k}"]`); if (x) x.textContent = m || ""; };
  const drop = $("#drop"), pdfIn = $("#pdf"), coverIn = $("#cover");
  let pdfFile = null, coverFile = null;

  async function pickPdf(f) {
    if (!f) return;
    if (f.type !== "application/pdf" || !f.name.toLowerCase().endsWith(".pdf")) return setErr("pdf", "Only PDF files are allowed.");
    if (f.size > MAX_PDF) return setErr("pdf", `File is ${fmtSize(f.size)} — the limit is 50 MB.`);
    if ((await f.slice(0, 5).text()) !== "%PDF-") return setErr("pdf", "That file doesn't look like a real PDF.");
    setErr("pdf", ""); pdfFile = f;
    $("#drop-text").textContent = f.name; $("#drop-sub").textContent = fmtSize(f.size);
    const t = $("#title"); if (!t.value) t.value = f.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ");
  }
  drop.addEventListener("click", () => pdfIn.click());
  drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pdfIn.click(); } });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("border-indigo-500"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("border-indigo-500"));
  drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("border-indigo-500"); pickPdf(e.dataTransfer.files[0]); });
  pdfIn.addEventListener("change", () => pickPdf(pdfIn.files[0]));

  coverIn.addEventListener("change", () => {
    const f = coverIn.files[0]; if (!f) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return setErr("cover", "Use a JPG, PNG or WebP image.");
    if (f.size > MAX_COVER) return setErr("cover", "Cover must be under 5 MB.");
    setErr("cover", ""); coverFile = f;
    const img = $("#cover-preview"); img.src = URL.createObjectURL(f); img.classList.remove("hidden");
    $("#cover-ph").classList.add("hidden"); $("#cover-remove").classList.remove("hidden");
  });
  $("#cover-remove").addEventListener("click", () => {
    coverFile = null; coverIn.value = "";
    $("#cover-preview").classList.add("hidden"); $("#cover-ph").classList.remove("hidden"); $("#cover-remove").classList.add("hidden");
  });

  $("#upload-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#title").value.trim(), author = $("#author").value.trim();
    const category = $("#category").value, description = $("#description").value.trim();
    setErr("pdf", pdfFile ? "" : "Choose a PDF to upload.");
    setErr("title", title ? "" : "Title is required.");
    setErr("author", author ? "" : "Author is required.");
    setErr("category", category ? "" : "Pick a category.");
    if (!pdfFile || !title || !author || !category) return;

    const btn = $("#submit"); btn.disabled = true;
    const wrap = $("#progress-wrap"), bar = $("#progress"), txt = $("#progress-text");
    wrap.classList.remove("hidden"); bar.style.width = "0%"; txt.textContent = "Uploading…";

    const uid = state.user.id, fid = crypto.randomUUID();
    const filePath = `${uid}/${fid}.pdf`;
    let coverPath = null, pdfUploaded = false;
    try {
      const token = await accessToken();
      if (!token) throw new Error("Your session expired. Please sign in again.");
      await uploadPdf(filePath, pdfFile, token, (pct) => { bar.style.width = pct + "%"; txt.textContent = `Uploading… ${pct}%`; });
      pdfUploaded = true;

      if (coverFile) {
        txt.textContent = "Uploading cover…";
        const ext = coverFile.type === "image/png" ? "png" : coverFile.type === "image/webp" ? "webp" : "jpg";
        coverPath = `${uid}/${fid}.${ext}`;
        const { error } = await supabase.storage.from("covers").upload(coverPath, coverFile, { contentType: coverFile.type });
        if (error) { coverPath = null; throw new Error("Cover upload failed: " + error.message); }
      }

      txt.textContent = "Saving details…";
      const { error } = await supabase.from("books").insert({
        title, author, category, description, file_path: filePath, cover_path: coverPath,
      });
      if (error) throw new Error(error.message.includes("PDF") ? error.message : "Could not save the book. Please try again.");

      toast("Book uploaded — thank you for sharing!", "success");
      location.hash = "#/library?mine=1";
    } catch (err) {
      if (pdfUploaded) await supabase.storage.from("books").remove([filePath]).catch(() => {});
      if (coverPath) await supabase.storage.from("covers").remove([coverPath]).catch(() => {});
      toast(err.message || "Upload failed.", "error");
      btn.disabled = false; wrap.classList.add("hidden");
    }
  });
}

// XHR (not fetch) so we get real upload-progress events.
function uploadPdf(path, file, token, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/books/${encoded}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.upload.onprogress = (ev) => ev.lengthComputable && onProgress(Math.round((ev.loaded / ev.total) * 100));
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let msg = "PDF upload failed.";
      try { msg = JSON.parse(xhr.responseText).message || msg; } catch {}
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Network error during upload."));
    xhr.send(file);
  });
}

/* ---------------- assistant / chat ---------------- */
function chatMarkup() {
  const suggestions = ["What books do you have on philosophy?", "Recommend something short to read this weekend", "Summarize the newest book in the library"];
  return `
  <div class="flex min-h-0 flex-1 flex-col" data-chat>
    <div class="flex-1 space-y-4 overflow-y-auto p-4" data-log role="log" aria-live="polite">
      <div data-empty class="flex h-full flex-col items-center justify-center gap-4 text-center">
        <span class="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white">${icon("sparkles", "w-6 h-6")}</span>
        <div><p class="font-semibold">Hi, I’m your AI Librarian</p><p class="mt-1 text-sm text-slate-500">Ask about books in the library or request recommendations.</p></div>
        <div class="flex flex-wrap justify-center gap-2">
          ${suggestions.map((s) => `<button type="button" data-suggest class="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:text-slate-300">${esc(s)}</button>`).join("")}
        </div>
      </div>
    </div>
    <form data-form class="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
      <textarea data-input rows="1" maxlength="1000" placeholder="Ask the librarian…" aria-label="Message" class="input max-h-32 min-h-[40px] resize-none"></textarea>
      <button type="submit" data-send class="btn-primary h-10 w-10 !p-0" aria-label="Send">${icon("send")}</button>
    </form>
  </div>`;
}

function renderRich(text) {
  return esc(text).split("\n").map((line) => {
    if (!line.trim()) return '<div class="h-2"></div>';
    const bullet = /^\s*[-*•]\s+/.test(line);
    const body = line.replace(/^\s*[-*•]\s+/, "").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return bullet ? `<div class="flex gap-2 pl-1"><span>•</span><span>${body}</span></div>` : `<p>${body}</p>`;
  }).join("");
}

function initChat(root) {
  const log = $("[data-log]", root), form = $("[data-form]", root), input = $("[data-input]", root), send = $("[data-send]", root);
  const history = [];
  let busy = false;

  const bubble = (role) => {
    $("[data-empty]", root)?.remove();
    const wrap = document.createElement("div");
    wrap.className = "flex " + (role === "user" ? "justify-end" : "justify-start");
    const b = document.createElement("div");
    b.className = "max-w-[88%] space-y-1 rounded-2xl px-4 py-2.5 text-sm leading-relaxed " +
      (role === "user" ? "rounded-br-md bg-indigo-600 text-white" : "rounded-bl-md bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100");
    wrap.appendChild(b); log.appendChild(wrap);
    return b;
  };
  const scroll = () => { log.scrollTop = log.scrollHeight; };

  async function ask(text) {
    text = text.trim();
    if (!text || busy) return;
    busy = true; send.disabled = true; input.value = "";
    history.push({ role: "user", content: text });
    bubble("user").textContent = text;
    const out = bubble("assistant");
    out.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    scroll();
    let acc = "";
    try {
      const token = await accessToken();
      if (!token) throw new Error("Please sign in again.");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/librarian`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
        body: JSON.stringify({ messages: history }),
      });
      if (!res.ok || !res.body) {
        let msg = await res.text();
        try { msg = JSON.parse(msg).message || JSON.parse(msg).error || msg; } catch {}
        if (res.status === 404) msg = "The AI Librarian isn't deployed yet (Edge Function \"librarian\" not found).";
        out.textContent = "⚠️ " + (msg || "Something went wrong.");
        history.pop();
      } else {
        const reader = res.body.getReader(), dec = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          out.innerHTML = renderRich(acc); scroll();
        }
        if (!acc.trim()) out.textContent = "⚠️ The librarian returned an empty answer. Try rephrasing.";
        history.push({ role: "assistant", content: acc });
      }
    } catch (e) {
      out.textContent = "⚠️ " + (e.message || "Network error. Please try again.");
      history.pop();
    } finally {
      busy = false; send.disabled = false; input.focus();
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(input.value); } });
  $$("[data-suggest]", root).forEach((b) => b.addEventListener("click", () => ask(b.textContent)));
}

function viewAssistant(el) {
  el.innerHTML = `
  <div class="mx-auto max-w-3xl space-y-6">
    <div><h1 class="flex items-center gap-2 text-2xl font-semibold tracking-tight sm:text-3xl"><span class="text-indigo-500">${icon("sparkles", "w-7 h-7")}</span> AI Librarian</h1>
      <p class="mt-1 text-sm text-slate-500">Ask about what’s in the library. Answers are based on book titles, authors, categories and descriptions.</p></div>
    <div class="card flex h-[65vh] min-h-[420px] flex-col overflow-hidden">${chatMarkup()}</div>
  </div>`;
  initChat($("[data-chat]", el));
}

/* floating widget */
function syncFloatingChat() {
  const path = currentPath();
  const pop = $("#chat-pop"), fab = $("#chat-fab");
  const hide = path === "/assistant" || path === "/login" || !configured;
  fab.classList.toggle("hidden", hide);
  if (hide) { pop.classList.add("hidden"); pop.classList.remove("flex"); }
  const signed = !!state.user;
  if (pop.dataset.signed !== String(signed)) {
    pop.dataset.signed = String(signed);
    pop.innerHTML = `
      <div class="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div class="flex items-center gap-2 text-sm font-semibold"><span class="text-indigo-500">${icon("sparkles")}</span> AI Librarian</div>
        <button data-action="chat-close" aria-label="Close chat" class="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">${icon("x")}</button>
      </div>
      ${signed ? chatMarkup() : `<div class="grid flex-1 place-items-center p-6 text-center"><div class="space-y-3"><p class="text-sm text-slate-500">Sign in to chat with the AI Librarian.</p><a href="#/login?next=/assistant" class="btn-primary">Sign in</a></div></div>`}`;
    if (signed) initChat($("[data-chat]", pop));
  }
}

/* ---------------- auth view ---------------- */
function viewAuth(el) {
  const q = hashQuery();
  const mode = q.get("mode") === "register" ? "register" : "login";
  const next = safeRoute(q.get("next") || "/library");
  const reg = mode === "register";
  el.innerHTML = `
  <div class="py-8 sm:py-16">
    <div class="card mx-auto w-full max-w-md space-y-5 p-6 sm:p-8">
      <div class="text-center"><h1 class="text-xl font-semibold tracking-tight">${reg ? "Create your account" : "Welcome back"}</h1>
        <p class="mt-1 text-sm text-slate-500">${reg ? "Join the community library." : "Sign in to upload, preview and download."}</p></div>
      <button data-action="google" class="btn-ghost w-full">
        <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
        Continue with Google</button>
      <div class="flex items-center gap-3 text-xs text-slate-400"><span class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></span> or <span class="h-px flex-1 bg-slate-200 dark:bg-slate-800"></span></div>
      <form id="auth-form" class="space-y-4">
        ${reg ? '<div class="space-y-1.5"><label for="name" class="text-sm font-medium">Full name</label><input id="name" required maxlength="80" autocomplete="name" class="input"></div>' : ""}
        <div class="space-y-1.5"><label for="email" class="text-sm font-medium">Email</label><input id="email" type="email" required autocomplete="email" class="input"></div>
        <div class="space-y-1.5"><label for="password" class="text-sm font-medium">Password</label><input id="password" type="password" required minlength="8" autocomplete="${reg ? "new-password" : "current-password"}" class="input"></div>
        <button id="auth-submit" class="btn-primary w-full">${reg ? "Create account" : "Sign in"}</button>
      </form>
      <p class="text-center text-sm text-slate-500">${reg
        ? `Already have an account? <a class="font-medium text-indigo-600 hover:underline" href="#/login?next=${encodeURIComponent(next)}">Sign in</a>`
        : `New here? <a class="font-medium text-indigo-600 hover:underline" href="#/login?mode=register&next=${encodeURIComponent(next)}">Create an account</a>`}</p>
    </div>
  </div>`;

  $("#auth-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#email").value.trim(), password = $("#password").value;
    const btn = $("#auth-submit"); btn.disabled = true;
    sessionStorage.setItem("afterLogin", next); // onAuthStateChange moves the user on to `next`
    try {
      if (reg) {
        const name = $("#name").value.trim();
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: baseUrl() } });
        if (error) throw error;
        if (data.session) toast("Welcome to LitVault!", "success");
        else { toast("Check your inbox to confirm your email, then sign in.", "success"); location.hash = "#/login"; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast("Signed in.", "success");
      }
    } catch (err) {
      sessionStorage.removeItem("afterLogin");
      toast(err.message || "Authentication failed.", "error");
    } finally { btn.disabled = false; }
  });
}

/* ============================ global events ============================ */
document.addEventListener("click", async (e) => {
  const um = $("#user-menu");
  if (um?.open && !um.contains(e.target)) um.open = false;

  const t = e.target.closest("[data-action]");
  if (!t) return;
  switch (t.dataset.action) {
    case "theme": {
      const dark = document.documentElement.classList.toggle("dark");
      try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch {}
      break;
    }
    case "menu": $("#mobile-nav")?.classList.toggle("hidden"); break;
    case "signout":
      await supabase.auth.signOut();
      toast("Signed out.", "success");
      location.hash = "#/";
      break;
    case "google": {
      const next = safeRoute(hashQuery().get("next") || "/library");
      sessionStorage.setItem("afterLogin", next);
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: baseUrl() } });
      if (error) toast(error.message, "error");
      break;
    }
    case "chat-close": $("#chat-pop").classList.add("hidden"); $("#chat-pop").classList.remove("flex"); break;
  }
});
document.addEventListener("click", (e) => { if (e.target.closest("#mobile-nav a")) $("#mobile-nav")?.classList.add("hidden"); });

$("#chat-fab").innerHTML = icon("chat", "w-6 h-6");
$("#chat-fab").addEventListener("click", () => {
  const pop = $("#chat-pop"), open = pop.classList.contains("hidden");
  pop.classList.toggle("hidden", !open); pop.classList.toggle("flex", open);
});

$("#pdf-close").innerHTML = icon("x");
$("#pdf-download").innerHTML = `${icon("download", "w-3.5 h-3.5")} Download`;
$("#pdf-close").addEventListener("click", closePdf);
$("#pdf-download").addEventListener("click", () => viewer.book && downloadBook(viewer.book));
$("#pdf-modal").addEventListener("click", (e) => { if (e.target.id === "pdf-modal") closePdf(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePdf(); });
const zoom = (f) => {
  if (!viewer.doc) return;
  viewer.scale = Math.min(3, Math.max(0.6, viewer.scale * f));
  buildPages();
};
$("#pdf-zoom-in").addEventListener("click", () => zoom(1.25));
$("#pdf-zoom-out").addEventListener("click", () => zoom(0.8));

window.addEventListener("hashchange", route);

/* ============================ boot ============================ */
(async function init() {
  if (!configured) { renderNav(); viewSetup(); return; }

  const { data } = await supabase.auth.getSession(); // also completes a PKCE ?code= exchange
  state.session = data.session; state.user = data.session?.user ?? null;
  await loadProfile();
  if (location.search) history.replaceState(null, "", location.pathname + location.hash); // drop ?code=…

  if (state.user) {
    const after = sessionStorage.getItem("afterLogin");
    if (after && (location.hash === "" || location.hash === "#/")) location.hash = "#" + safeRoute(after);
    sessionStorage.removeItem("afterLogin");
  }

  supabase.auth.onAuthStateChange((event, session) => {
    // Don't await Supabase calls directly inside this callback (can deadlock) — defer them.
    setTimeout(async () => {
      const wasUser = state.user?.id;
      state.session = session; state.user = session?.user ?? null;
      if (event === "TOKEN_REFRESHED") return;
      await loadProfile();
      state.books = null;
      if (event === "SIGNED_IN" && state.user && state.user.id !== wasUser) {
        const next = safeRoute(sessionStorage.getItem("afterLogin") || hashQuery().get("next") || "/library");
        sessionStorage.removeItem("afterLogin");
        const same = currentPath() === next && location.hash !== "";
        location.hash = "#" + next;
        if (same) route(); // hash unchanged → no hashchange event, so render manually
      } else if (event === "SIGNED_OUT" || event === "USER_UPDATED") {
        route();
      } else {
        renderNav(); syncFloatingChat();
      }
    }, 0);
  });

  route();
})();
