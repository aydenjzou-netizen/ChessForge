CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_subject text NOT NULL UNIQUE,
    email text NOT NULL UNIQUE,
    display_name text NOT NULL,
    avatar_piece text,
    avatar_theme text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS external_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL CHECK (provider IN ('chess.com','lichess')),
    provider_username text NOT NULL,
    last_synced_at timestamptz,
    sync_cursor jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, provider),
    UNIQUE (provider, provider_username)
);

CREATE TABLE IF NOT EXISTS games (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_account_id uuid REFERENCES external_accounts(id) ON DELETE SET NULL,
    source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','upload','chess.com','lichess')),
    external_game_id text,
    external_url text,
    title text NOT NULL DEFAULT 'Untitled Game',
    event_name text,
    site text,
    white_player text NOT NULL,
    black_player text NOT NULL,
    user_color text CHECK (user_color IS NULL OR user_color IN ('white','black')),
    result text NOT NULL DEFAULT '*' CHECK (result IN ('1-0','0-1','1/2-1/2','*')),
    played_at timestamptz,
    time_class text,
    rules text NOT NULL DEFAULT 'chess',
    move_count integer CHECK (move_count IS NULL OR move_count >= 0),
    pgn text,
    ai_text text,
    import_state text NOT NULL DEFAULT 'complete' CHECK (import_state IN ('metadata_only','complete','failed')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS games_user_played_idx ON games(user_id, played_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS games_user_created_idx ON games(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS games_metadata_gin_idx ON games USING gin(metadata);
CREATE UNIQUE INDEX IF NOT EXISTS games_external_unique ON games(user_id, source, external_game_id) WHERE external_game_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS training_profiles (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    profile jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_weaknesses (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    theme text NOT NULL,
    occurrence_count integer NOT NULL DEFAULT 0,
    confidence numeric(5,4),
    explanation text,
    last_detected_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, theme)
);
