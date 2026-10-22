CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── users ──────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  github_id     BIGINT UNIQUE NOT NULL,
  username      TEXT NOT NULL,
  email         TEXT,
  avatar_url    TEXT,
  access_token  TEXT NOT NULL,           -- encrypted at rest (Phase 2)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── repositories ───────────────────────────────────────────────────────
CREATE TABLE repositories (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  github_id         BIGINT UNIQUE NOT NULL,
  owner             TEXT NOT NULL,
  name              TEXT NOT NULL,
  full_name         TEXT NOT NULL,
  is_private        BOOLEAN NOT NULL DEFAULT FALSE,
  default_branch    TEXT NOT NULL DEFAULT 'main',
  stars             INT NOT NULL DEFAULT 0,
  forks             INT NOT NULL DEFAULT 0,
  contributor_count INT NOT NULL DEFAULT 0,
  added_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── scans ──────────────────────────────────────────────────────────────
CREATE TABLE scans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repo_id       UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | running | complete | failed
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  error         TEXT,
  summary       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scans_repo_id    ON scans(repo_id);
CREATE INDEX idx_scans_status     ON scans(status);
CREATE INDEX idx_scans_created_at ON scans(created_at DESC);

-- ─── tool_usage ─────────────────────────────────────────────────────────
CREATE TABLE tool_usage (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_id           UUID NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  repo_id           UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  tool_name         TEXT NOT NULL,
  category          TEXT NOT NULL,
  detected          BOOLEAN NOT NULL,
  adoption_rate     NUMERIC(5,2) NOT NULL DEFAULT 0,
  contributor_id    BIGINT,
  contributor_login TEXT,
  evidence          JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tool_usage_repo_tool ON tool_usage(repo_id, tool_name);
CREATE INDEX idx_tool_usage_scan      ON tool_usage(scan_id);