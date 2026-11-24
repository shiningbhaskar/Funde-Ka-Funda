// Funde Autopilot: schedules and publishes Instagram + Facebook posts,
// and pulls daily numbers from YouTube, Instagram and Facebook.
// Runs on Cloudflare Workers (free plan is enough). See ../SETUP.md.
import { ADMIN_HTML } from "./admin.js";

const IST_MS = 5.5 * 3600 * 1000;
const MAX_ATTEMPTS = 8;

// ---------- small helpers ----------
const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
  });
const nowIso = () => new Date().toISOString();
const istDay = (d = new Date()) => new Date(d.getTime() + IST_MS).toISOString().slice(0, 10);
const isSundayIST = (d) => new Date(d.getTime() + IST_MS).getUTCDay() === 0;
const uid = () => crypto.randomUUID().slice(0, 8);

function istToUtc(local) {
  // "2026-12-01T19:00" (IST) -> Date
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local || "");
  if (!m) throw new Error("Time must look like 2026-12-01T19:00 (IST)");
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - IST_MS);
}

function authed(req, env) {
  const k = req.headers.get("x-admin-key") || new URL(req.url).searchParams.get("key");
  return env.ADMIN_KEY && k === env.ADMIN_KEY;
}

async function graph(env, method, path, params = {}) {
  const url = new URL(`${env.GRAPH_BASE || "https://graph.facebook.com"}/${env.GRAPH_VERSION}/${path}`);
  const body = new URLSearchParams({ ...params, access_token: env.META_TOKEN });
  let res;
  if (method === "GET") {
    body.forEach((v, k) => url.searchParams.set(k, v));
    res = await fetch(url);
  } else {
    res = await fetch(url, { method, body });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    throw new Error(`Meta ${path}: ${e.message || res.status}${e.error_user_msg ? " - " + e.error_user_msg : ""}`);
  }
  return data;
}

const mediaUrl = (env, key) => `${env.MEDIA_PUBLIC_BASE}/${encodeURI(key)}`;

// ---------- validation ----------
function validatePost(p) {
  const errs = [];
  if (!["reel", "carousel"].includes(p.kind)) errs.push("kind must be reel or carousel");
  const plats = Array.isArray(p.platforms) ? p.platforms : [];
  if (!plats.length || plats.some((x) => !["ig", "fb"].includes(x))) errs.push("platforms must be ig and/or fb");
  if (!p.caption || !p.caption.trim()) errs.push("caption is empty");
  const tags = (p.caption || "").match(/#[\p{L}\p{N}_]+/gu) || [];
  if (tags.length > 5) errs.push(`Instagram allows at most 5 hashtags (found ${tags.length})`);
  if ((p.caption || "").length > 2200) errs.push("caption longer than 2200 characters");
  const media = Array.isArray(p.media) ? p.media : [];
  if (p.kind === "reel" && media.length !== 1) errs.push("a reel needs exactly 1 video");
  if (p.kind === "carousel" && (media.length < 2 || media.length > 10)) errs.push("a carousel needs 2 to 10 images");
  if (p.kind === "carousel" && media.some((k) => !/\.jpe?g$/i.test(k))) errs.push("carousel images must be JPEG (.jpg) for Instagram");
  let when;
  try {
    when = istToUtc(p.when_ist);
    if (isSundayIST(when)) errs.push("Sunday is the rest day: pick Monday to Saturday");
    if (when.getTime() < Date.now() - 60000) errs.push("time is in the past");
  } catch (e) { errs.push(e.message); }
  return { errs, when, plats, media };
}

// ---------- publishing ----------
async function igStep(env, post, st) {
  const media = JSON.parse(post.media);
  const s = st.ig || (st.ig = { phase: "create" });
  if (s.phase === "done") return;

  if (s.phase === "create") {
    if (post.kind === "reel") {
      const c = await graph(env, "POST", `${env.IG_USER_ID}/media`, {
        media_type: "REELS", video_url: mediaUrl(env, media[0]), caption: post.caption, share_to_feed: "true",
      });
      s.container = c.id;
    } else {
      const children = [];
      for (const key of media) {
        const c = await graph(env, "POST", `${env.IG_USER_ID}/media`, { image_url: mediaUrl(env, key), is_carousel_item: "true" });
        children.push(c.id);
      }
      const c = await graph(env, "POST", `${env.IG_USER_ID}/media`, {
        media_type: "CAROUSEL", children: children.join(","), caption: post.caption,
      });
      s.container = c.id;
    }
    s.phase = "wait";
  }

  if (s.phase === "wait") {
    const c = await graph(env, "GET", s.container, { fields: "status_code,status" });
    if (c.status_code === "ERROR" || c.status_code === "EXPIRED") throw new Error(`Instagram processing ${c.status_code}: ${c.status || ""}`);
    if (c.status_code !== "FINISHED") return; // try again on the next 15-min tick
    const pub = await graph(env, "POST", `${env.IG_USER_ID}/media_publish`, { creation_id: s.container });
    const info = await graph(env, "GET", pub.id, { fields: "permalink" }).catch(() => ({}));
    Object.assign(s, { phase: "done", id: pub.id, link: info.permalink || null, at: nowIso() });
  }
}

async function fbStep(env, post, st) {
  const media = JSON.parse(post.media);
  const s = st.fb || (st.fb = { phase: "create" });
  if (s.phase === "done") return;
  const text = post.fb_caption || post.caption;
  if (post.kind === "reel") {
    const r = await graph(env, "POST", `${env.FB_PAGE_ID}/videos`, {
      file_url: mediaUrl(env, media[0]), description: text, published: "true",
    });
    Object.assign(s, { phase: "done", id: r.id, link: `https://www.facebook.com/${r.id}`, at: nowIso() });
  } else {
    const ids = [];
    for (const key of media) {
      const r = await graph(env, "POST", `${env.FB_PAGE_ID}/photos`, { url: mediaUrl(env, key), published: "false" });
      ids.push(r.id);
    }
    const params = { message: text };
    ids.forEach((id, i) => (params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id })));
    const r = await graph(env, "POST", `${env.FB_PAGE_ID}/feed`, params);
    Object.assign(s, { phase: "done", id: r.id, link: `https://www.facebook.com/${r.id}`, at: nowIso() });
  }
}

async function runPost(env, post) {
  const st = JSON.parse(post.state || "{}");
  const plats = JSON.parse(post.platforms);
  const errors = [];
  for (const p of plats) {
    if (st[p]?.phase === "done") continue;
    try {
      if (p === "ig") await igStep(env, post, st);
      if (p === "fb") await fbStep(env, post, st);
    } catch (e) {
      (st[p] = st[p] || {}).lastError = String(e.message || e);
      errors.push(`${p}: ${e.message || e}`);
    }
  }
  const doneAll = plats.every((p) => st[p]?.phase === "done");
  const attempts = post.attempts + (errors.length ? 1 : 0);
  let status = doneAll ? "done" : "processing";
  if (!doneAll && attempts >= MAX_ATTEMPTS) status = plats.some((p) => st[p]?.phase === "done") ? "partial" : "failed";
  await env.DB.prepare("UPDATE posts SET state=?, status=?, attempts=?, error=? WHERE id=?")
    .bind(JSON.stringify(st), status, attempts, errors.join(" | ") || null, post.id).run();
  return { id: post.id, status, errors };
}

async function publishDue(env, force = false) {
  if (!force && isSundayIST(new Date())) return [];
  const { results } = await env.DB.prepare(
    "SELECT * FROM posts WHERE status IN ('queued','processing') AND scheduled_utc <= ? ORDER BY scheduled_utc LIMIT 5"
  ).bind(nowIso()).all();
  const out = [];
  for (const p of results) out.push(await runPost(env, p));
  return out;
}

// ---------- numbers ----------
async function upsertStat(env, r) {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO stats (day,platform,item_id,title,url,published,views,likes,comments,shares,saves,reach,followers)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(r.day, r.platform, r.item_id, r.title ?? null, r.url ?? null, r.published ?? null,
    r.views ?? null, r.likes ?? null, r.comments ?? null, r.shares ?? null, r.saves ?? null, r.reach ?? null, r.followers ?? null).run();
}

async function pullYouTube(env, day) {
  if (!env.YT_API_KEY) return "skipped (no YT_API_KEY)";
  const yt = async (path, params) => {
    const u = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    Object.entries({ ...params, key: env.YT_API_KEY }).forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u); const d = await r.json();
    if (!r.ok) throw new Error(`YouTube ${path}: ${d.error?.message || r.status}`);
    return d;
  };
  const ch = await yt("channels", { part: "statistics,contentDetails,snippet", forHandle: env.YT_HANDLE });
  const c = ch.items?.[0];
  if (!c) throw new Error(`YouTube channel ${env.YT_HANDLE} not found`);
  await upsertStat(env, { day, platform: "yt", item_id: "account", title: c.snippet.title,
    url: `https://www.youtube.com/${env.YT_HANDLE}`, views: +c.statistics.viewCount, followers: +c.statistics.subscriberCount });
  const pl = await yt("playlistItems", { part: "contentDetails", playlistId: c.contentDetails.relatedPlaylists.uploads, maxResults: "50" });
  const ids = pl.items.map((i) => i.contentDetails.videoId);
  if (!ids.length) return "0 videos";
  const v = await yt("videos", { part: "statistics,snippet", id: ids.join(",") });
  for (const x of v.items) {
    await upsertStat(env, { day, platform: "yt", item_id: x.id, title: x.snippet.title, url: `https://youtu.be/${x.id}`,
      published: x.snippet.publishedAt, views: +(x.statistics.viewCount || 0), likes: +(x.statistics.likeCount || 0),
      comments: +(x.statistics.commentCount || 0) });
  }
  return `${v.items.length} videos`;
}

async function pullInstagram(env, day) {
  if (!env.META_TOKEN) return "skipped (no META_TOKEN)";
  const acc = await graph(env, "GET", env.IG_USER_ID, { fields: "username,followers_count,media_count" });
  await upsertStat(env, { day, platform: "ig", item_id: "account", title: "@" + acc.username,
    url: `https://www.instagram.com/${acc.username}/`, followers: acc.followers_count });
  const list = await graph(env, "GET", `${env.IG_USER_ID}/media`, {
    fields: "id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count", limit: "25" });
  for (const m of list.data || []) {
    const ins = {};
    try {
      const r = await graph(env, "GET", `${m.id}/insights`, { metric: "reach,saved,shares,views" });
      for (const x of r.data || []) ins[x.name] = x.values?.[0]?.value ?? x.total_value?.value;
    } catch { /* some media types do not support every metric */ }
    await upsertStat(env, { day, platform: "ig", item_id: m.id, title: (m.caption || "").split("\n")[0].slice(0, 120),
      url: m.permalink, published: m.timestamp, likes: m.like_count, comments: m.comments_count,
      views: ins.views, reach: ins.reach, saves: ins.saved, shares: ins.shares });
  }
  return `${(list.data || []).length} posts`;
}

async function pullFacebook(env, day) {
  if (!env.META_TOKEN) return "skipped (no META_TOKEN)";
  const p = await graph(env, "GET", env.FB_PAGE_ID, { fields: "name,link,followers_count,fan_count" });
  await upsertStat(env, { day, platform: "fb", item_id: "account", title: p.name, url: p.link,
    followers: p.followers_count ?? p.fan_count });
  return "page";
}

async function pullAll(env) {
  const day = istDay();
  const out = {};
  for (const [k, fn] of [["yt", pullYouTube], ["ig", pullInstagram], ["fb", pullFacebook]]) {
    try { out[k] = await fn(env, day); } catch (e) { out[k] = "error: " + e.message; }
  }
  return out;
}

async function latestStats(env) {
  const row = await env.DB.prepare("SELECT MAX(day) AS d FROM stats").first();
  if (!row?.d) return { day: null, items: [] };
  const prev = await env.DB.prepare("SELECT MAX(day) AS d FROM stats WHERE day < ?").bind(row.d).first();
  const { results } = await env.DB.prepare("SELECT * FROM stats WHERE day = ? ORDER BY platform, published DESC").bind(row.d).all();
  let before = {};
  if (prev?.d) {
    const r = await env.DB.prepare("SELECT platform,item_id,views,followers FROM stats WHERE day = ?").bind(prev.d).all();
    for (const x of r.results) before[x.platform + ":" + x.item_id] = x;
  }
  return { day: row.d, compared_with: prev?.d || null, items: results.map((x) => {
    const b = before[x.platform + ":" + x.item_id];
    return { ...x, views_change: b && x.views != null && b.views != null ? x.views - b.views : null,
      followers_change: b && x.followers != null && b.followers != null ? x.followers - b.followers : null };
  }) };
}

// ---------- HTTP ----------
async function handle(req, env) {
  const url = new URL(req.url);
  const path = url.pathname;
  if (req.method === "OPTIONS") return new Response(null, { headers: {
    "access-control-allow-origin": "*", "access-control-allow-headers": "content-type,x-admin-key",
    "access-control-allow-methods": "GET,POST,DELETE" } });
  if (path === "/" ) return new Response(ADMIN_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
  if (path === "/health") return json({ ok: true, time_ist: new Date(Date.now() + IST_MS).toISOString().slice(0, 16) });
  if (!authed(req, env)) return json({ error: "wrong or missing admin key" }, 401);

  if (path === "/api/upload" && req.method === "POST") {
    const name = (url.searchParams.get("name") || "file").replace(/[^\w.\-]+/g, "_");
    const key = `${istDay()}/${uid()}-${name}`;
    await env.MEDIA.put(key, req.body, { httpMetadata: { contentType: req.headers.get("content-type") || "application/octet-stream" } });
    return json({ key, url: mediaUrl(env, key) });
  }
  if (path === "/api/posts" && req.method === "GET") {
    const { results } = await env.DB.prepare("SELECT * FROM posts ORDER BY scheduled_utc DESC LIMIT 100").all();
    return json(results.map((p) => ({ ...p, platforms: JSON.parse(p.platforms), media: JSON.parse(p.media), state: JSON.parse(p.state),
      scheduled_ist: new Date(Date.parse(p.scheduled_utc) + IST_MS).toISOString().slice(0, 16) })));
  }
  if (path === "/api/posts" && req.method === "POST") {
    const p = await req.json();
    const { errs, when, plats, media } = validatePost(p);
    if (errs.length) return json({ error: errs }, 400);
    const id = uid();
    await env.DB.prepare("INSERT INTO posts (id,kind,platforms,caption,fb_caption,media,scheduled_utc,created_utc) VALUES (?,?,?,?,?,?,?,?)")
      .bind(id, p.kind, JSON.stringify(plats), p.caption.trim(), p.fb_caption?.trim() || null, JSON.stringify(media), when.toISOString(), nowIso()).run();
    return json({ id, scheduled_utc: when.toISOString() });
  }
  let m = /^\/api\/posts\/(\w+)$/.exec(path);
  if (m && req.method === "DELETE") {
    await env.DB.prepare("UPDATE posts SET status='cancelled' WHERE id=? AND status IN ('queued','processing')").bind(m[1]).run();
    return json({ ok: true });
  }
  m = /^\/api\/posts\/(\w+)\/retry$/.exec(path);
  if (m && req.method === "POST") {
    await env.DB.prepare("UPDATE posts SET status='processing', attempts=0 WHERE id=? AND status IN ('failed','partial')").bind(m[1]).run();
    return json({ ok: true });
  }
  if (path === "/api/run" && req.method === "POST") return json(await publishDue(env, true));
  if (path === "/api/pull" && req.method === "POST") return json(await pullAll(env));
  if (path === "/api/stats") return json(await latestStats(env));
  return json({ error: "not found" }, 404);
}

export default {
  fetch: (req, env) => handle(req, env).catch((e) => json({ error: String(e.message || e) }, 500)),
  async scheduled(event, env, ctx) {
    if (event.cron === "30 0 * * *") ctx.waitUntil(pullAll(env));
    else ctx.waitUntil(publishDue(env));
  },
};
// exported for tests
export { validatePost, istToUtc, isSundayIST };
