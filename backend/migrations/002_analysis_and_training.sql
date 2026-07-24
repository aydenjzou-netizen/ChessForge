CREATE TABLE IF NOT EXISTS game_analyses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    engine_name text NOT NULL,
    engine_version text,
    engine_depth integer,
    analyzed_color text CHECK (analyzed_color IS NULL OR analyzed_color IN ('white','black')),
    average_centipawn_loss numeric(8,2),
    inaccuracies integer NOT NULL DEFAULT 0,
    mistakes integer NOT NULL DEFAULT 0,
    blunders integer NOT NULL DEFAULT 0,
    summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
    error_message text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS game_analyses_game_idx ON game_analyses(game_id, created_at DESC);

CREATE TABLE IF NOT EXISTS move_analyses (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    analysis_id uuid NOT NULL REFERENCES game_analyses(id) ON DELETE CASCADE,
    ply integer NOT NULL,
    move_san text,
    move_uci text,
    fen_before text,
    fen_after text,
    evaluation_before integer,
    evaluation_after integer,
    centipawn_loss integer,
    classification text,
    best_move_uci text,
    themes text[] NOT NULL DEFAULT '{}',
    UNIQUE (analysis_id, ply)
);

CREATE TABLE IF NOT EXISTS puzzle_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    selected_themes text[] NOT NULL DEFAULT '{}',
    target_rating integer,
    total_puzzles integer NOT NULL DEFAULT 0,
    correct_puzzles integer NOT NULL DEFAULT 0,
    xp_earned integer NOT NULL DEFAULT 0,
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS puzzle_attempts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL REFERENCES puzzle_sessions(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    puzzle_id text NOT NULL,
    theme text,
    puzzle_rating integer,
    correct boolean NOT NULL,
    hints_used integer NOT NULL DEFAULT 0,
    duration_ms integer,
    attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS puzzle_attempts_user_date_idx ON puzzle_attempts(user_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS user_activity (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_type text NOT NULL,
    entity_type text,
    entity_id text,
    title text,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_activity_feed_idx ON user_activity(user_id, occurred_at DESC);
