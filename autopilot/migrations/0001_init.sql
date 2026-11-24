CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,              -- 'reel' | 'carousel'
  platforms TEXT NOT NULL,         -- JSON array: ["ig","fb"]
  caption TEXT NOT NULL,
  fb_caption TEXT,
  media TEXT NOT NULL,             -- JSON array of R2 keys (1 video, or 2-10 JPEG images)
  scheduled_utc TEXT NOT NULL,     -- ISO time in UTC
  status TEXT NOT NULL DEFAULT 'queued', -- queued | processing | done | partial | failed | cancelled
  state TEXT NOT NULL DEFAULT '{}',      -- JSON: per-platform progress and result ids/links
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS posts_due ON posts (status, scheduled_utc);

CREATE TABLE IF NOT EXISTS stats (
  day TEXT NOT NULL,               -- YYYY-MM-DD (IST)
  platform TEXT NOT NULL,          -- yt | ig | fb
  item_id TEXT NOT NULL,           -- video/media id, or 'account'
  title TEXT,
  url TEXT,
  published TEXT,
  views INTEGER, likes INTEGER, comments INTEGER,
  shares INTEGER, saves INTEGER, reach INTEGER, followers INTEGER,
  PRIMARY KEY (day, platform, item_id)
);
