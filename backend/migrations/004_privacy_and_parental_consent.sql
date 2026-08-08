ALTER TABLE users
    ADD COLUMN IF NOT EXISTS country_code text,
    ADD COLUMN IF NOT EXISTS age_band text,
    ADD COLUMN IF NOT EXISTS date_of_birth date,
    ADD COLUMN IF NOT EXISTS next_age_review_at date,
    ADD COLUMN IF NOT EXISTS privacy_state text NOT NULL DEFAULT 'review_required',
    ADD COLUMN IF NOT EXISTS privacy_ruleset_version text,
    ADD COLUMN IF NOT EXISTS guardian_approved_at timestamptz,
    ADD COLUMN IF NOT EXISTS privacy_notice_version text;

DO $$ BEGIN
    ALTER TABLE users ADD CONSTRAINT users_privacy_state_check CHECK
      (privacy_state IN ('review_required','adult_active','minor_active','restricted','deletion_pending'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS privacy_age_assessments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash text NOT NULL UNIQUE,
    date_of_birth date,
    country_code text NOT NULL,
    region_code text,
    age_years integer NOT NULL CHECK (age_years BETWEEN 0 AND 125),
    age_band text NOT NULL CHECK (age_band IN ('under_13','13_15','16_17','adult')),
    required_path text NOT NULL CHECK (required_path IN ('adult','guardian','coppa_vpc','blocked')),
    ruleset_version text NOT NULL,
    notice_version text NOT NULL,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    guardian_approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_age_assessments_expiry_idx ON privacy_age_assessments(expires_at);

CREATE TABLE IF NOT EXISTS guardian_consent_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id uuid NOT NULL REFERENCES privacy_age_assessments(id) ON DELETE CASCADE,
    guardian_email text NOT NULL,
    guardian_email_hash text NOT NULL,
    relationship_claim text,
    decision_token_hash text NOT NULL UNIQUE,
    management_token_hash text UNIQUE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verification_required','approved','denied','expired','revoked')),
    verification_method text,
    verification_reference text,
    assurance_level text,
    requested_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    decided_at timestamptz,
    revoked_at timestamptz,
    resend_count integer NOT NULL DEFAULT 0 CHECK (resend_count BETWEEN 0 AND 10),
    UNIQUE (assessment_id)
);
CREATE INDEX IF NOT EXISTS guardian_consent_email_idx ON guardian_consent_requests(guardian_email_hash);

CREATE TABLE IF NOT EXISTS guardian_relationships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    child_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    consent_request_id uuid NOT NULL REFERENCES guardian_consent_requests(id) ON DELETE RESTRICT,
    guardian_email text NOT NULL,
    relationship_claim text NOT NULL,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
    verified_method text NOT NULL,
    assurance_level text NOT NULL,
    verified_at timestamptz NOT NULL,
    revoked_at timestamptz,
    UNIQUE (child_user_id, consent_request_id)
);

CREATE TABLE IF NOT EXISTS privacy_consent_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guardian_relationship_id uuid REFERENCES guardian_relationships(id) ON DELETE SET NULL,
    purpose_code text NOT NULL,
    granted boolean NOT NULL,
    source text NOT NULL CHECK (source IN ('user','guardian','system_required')),
    jurisdiction text NOT NULL,
    notice_version text NOT NULL,
    ruleset_version text NOT NULL,
    granted_at timestamptz NOT NULL DEFAULT now(),
    withdrawn_at timestamptz,
    UNIQUE (user_id, purpose_code)
);

CREATE TABLE IF NOT EXISTS privacy_consent_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    assessment_id uuid REFERENCES privacy_age_assessments(id) ON DELETE SET NULL,
    consent_request_id uuid REFERENCES guardian_consent_requests(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    actor_type text NOT NULL CHECK (actor_type IN ('user','guardian','system','administrator')),
    request_id text,
    ip_hash text,
    ruleset_version text,
    notice_version text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_consent_events_user_idx ON privacy_consent_events(user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS privacy_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    request_type text NOT NULL CHECK (request_type IN ('access','export','correct','delete','restrict','object')),
    status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','verifying','processing','completed','denied')),
    due_at timestamptz NOT NULL,
    completed_at timestamptz,
    result jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS privacy_deletion_tombstones (
    subject_hash text PRIMARY KEY,
    request_id uuid,
    reason text NOT NULL,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS privacy_rate_limits (
    scope text NOT NULL,
    key_hash text NOT NULL,
    window_started_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    PRIMARY KEY (scope, key_hash)
);

CREATE INDEX IF NOT EXISTS users_privacy_state_idx ON users(privacy_state);
