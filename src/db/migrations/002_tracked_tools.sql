CREATE TABLE tracked_tools (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  repo_id     UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  tool_name   TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repo_id, tool_name)
);

CREATE INDEX idx_tracked_tools_repo ON tracked_tools(repo_id);
CREATE INDEX idx_tracked_tools_repo_enabled ON tracked_tools(repo_id, enabled);