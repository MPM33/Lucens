-- ─────────────────────────────────────────────────────────────────────────────
-- ARC Relation – Schéma initial
-- Migration 001
--
-- Tables :
--   sessions              → flux de tirage (persistance progressive)
--   session_events        → event log par étape (décision 4A)
--   reports               → rapport final + scoring
--   user_quotas           → quota freemium server-side (décision 3A)
--   processed_webhook_events → idempotence Stripe (décision 16A)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- SESSIONS
-- Une session = un tirage RELATION, de l'étape 1 à la complétion.
-- Statut 'in_progress' tant que toutes les étapes ne sont pas répondues.
-- Quota débité uniquement à la complétion (status → 'completed').
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  protocol_id       TEXT        NOT NULL DEFAULT 'relation_v1',
  protocol_version  TEXT        NOT NULL DEFAULT '1.0.0',
  status            TEXT        NOT NULL DEFAULT 'in_progress'
                                CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Garantit qu'une session ne peut pas être complétée sans date
  CONSTRAINT completed_requires_date CHECK (
    status != 'completed' OR completed_at IS NOT NULL
  )
);

-- Index pour lister l'historique d'une utilisatrice efficacement
CREATE INDEX idx_sessions_user_status
  ON sessions(user_id, status, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- SESSION_EVENTS (event log)
-- Chaque ligne = une réponse à une étape du protocole.
-- Source de vérité pour le calcul du score et l'historique.
-- Insertion immédiate à chaque étape → reprise possible si LLM échoue.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE session_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       UUID        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  step_id          TEXT        NOT NULL,
  step_position    INTEGER     NOT NULL CHECK (step_position BETWEEN 1 AND 7),
  scale_value      INTEGER     CHECK (scale_value BETWEEN 1 AND 5),
  choice_id        TEXT,
  -- Pour l'étape composite (étape 5) : { phase_relationnelle, urgence_ressentie, fenetre_influence }
  composite_values JSONB,
  free_text        TEXT,
  answered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Une session ne peut avoir qu'une seule réponse par étape
  CONSTRAINT unique_step_per_session UNIQUE (session_id, step_id)
);

-- Index principal pour le calcul du score (décision 14A)
CREATE INDEX idx_session_events_lookup
  ON session_events(user_id, session_id, answered_at);

-- Index pour compter les réponses d'une session (vérification de complétion)
CREATE INDEX idx_session_events_session
  ON session_events(session_id, step_position);

-- ─────────────────────────────────────────────────────────────────────────────
-- REPORTS
-- Résultat complet d'une session : scoring + prose LLM.
-- Relation 1:1 avec sessions (une session → un rapport).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE reports (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id              UUID        NOT NULL UNIQUE REFERENCES sessions(id) ON DELETE CASCADE,
  user_id                 UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Scoring déterministe (calculé par le moteur TypeScript)
  final_score             INTEGER     NOT NULL CHECK (final_score BETWEEN 0 AND 100),
  raw_score               INTEGER     NOT NULL CHECK (raw_score BETWEEN 0 AND 100),
  orientation             TEXT        NOT NULL,
  sub_scores              JSONB       NOT NULL, -- { alignement, epuisement, investissement_percu, estime }
  short_circuit_triggered TEXT,
  raw_orientation         TEXT        NOT NULL,
  gut_check_adjustment    INTEGER     NOT NULL DEFAULT 0,
  coherence_gap           INTEGER     CHECK (coherence_gap BETWEEN 0 AND 3),
  tension_percent         INTEGER     CHECK (tension_percent BETWEEN 0 AND 100),
  timing_flags            JSONB       NOT NULL DEFAULT '{}',

  -- Prose LLM (générée après le scoring)
  -- step_prose : { step_id → texte d'analyse de l'étape }
  step_prose              JSONB       NOT NULL DEFAULT '{}',
  -- assembly_prose : rapport final assemblé (null si génération en cours ou échouée)
  assembly_prose          TEXT,
  prose_status            TEXT        NOT NULL DEFAULT 'pending'
                                      CHECK (prose_status IN ('pending', 'generating', 'completed', 'failed')),

  generated_at            TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour l'historique des rapports d'une utilisatrice
CREATE INDEX idx_reports_user
  ON reports(user_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- USER_QUOTAS
-- Une ligne par utilisatrice, créée automatiquement à l'inscription.
-- Plan 'free'      : 1 tirage/semaine  (quota_limit = 1)
-- Plan 'essential' : 5 tirages/mois    (quota_limit = 5)
-- Plan 'unlimited' : illimité          (quota_limit = NULL)
-- Le quota se reset à quota_reset_at (géré par la logique applicative + webhooks Stripe).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE user_quotas (
  user_id               UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_tier             TEXT        NOT NULL DEFAULT 'free'
                                    CHECK (plan_tier IN ('free', 'essential', 'unlimited')),
  readings_completed    INTEGER     NOT NULL DEFAULT 0 CHECK (readings_completed >= 0),
  -- null = illimité (plan 'unlimited')
  quota_limit           INTEGER     CHECK (quota_limit > 0),
  -- Début de la période en cours (semaine pour free, mois pour essential)
  quota_period_start    TIMESTAMPTZ NOT NULL DEFAULT date_trunc('week', NOW()),
  -- Date de reset du quota
  quota_reset_at        TIMESTAMPTZ NOT NULL DEFAULT date_trunc('week', NOW()) + INTERVAL '1 week',
  stripe_customer_id    TEXT        UNIQUE,
  stripe_subscription_id TEXT,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PROCESSED_WEBHOOK_EVENTS
-- Table d'idempotence pour les webhooks Stripe (décision 16A).
-- Avant tout traitement, on vérifie que stripe_event_id n'est pas déjà présent.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE processed_webhook_events (
  stripe_event_id TEXT        PRIMARY KEY,
  event_type      TEXT        NOT NULL,
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 'success' = traitement terminé | 'failed' = erreur enregistrée
  status          TEXT        NOT NULL CHECK (status IN ('success', 'failed')),
  error_message   TEXT
);

-- Index pour le nettoyage des anciens événements (optionnel, pour une future tâche cron)
CREATE INDEX idx_webhook_events_age
  ON processed_webhook_events(processed_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- Toutes les tables sont protégées. Les utilisatrices ne voient que leurs données.
-- Les mises à jour critiques (quota, webhooks) passent uniquement par des
-- fonctions SECURITY DEFINER côté serveur — jamais depuis le client.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quotas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_webhook_events ENABLE ROW LEVEL SECURITY;

-- Sessions : lecture et écriture uniquement sur ses propres données
CREATE POLICY "sessions_own_data" ON sessions
  FOR ALL USING (auth.uid() = user_id);

-- Events : lecture et écriture uniquement sur ses propres données
CREATE POLICY "events_own_data" ON session_events
  FOR ALL USING (auth.uid() = user_id);

-- Reports : lecture uniquement (l'écriture passe par le serveur)
CREATE POLICY "reports_read_own" ON reports
  FOR SELECT USING (auth.uid() = user_id);

-- Quotas : lecture uniquement depuis le client (écriture = serveur uniquement)
CREATE POLICY "quotas_read_own" ON user_quotas
  FOR SELECT USING (auth.uid() = user_id);

-- Webhooks : aucun accès direct depuis le client
-- (pas de politique SELECT/INSERT/UPDATE pour les clients)

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER : création automatique du quota à l'inscription
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_quotas (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- FONCTION UTILITAIRE : vérification du quota (appellée côté serveur)
-- Retourne true si l'utilisatrice peut démarrer une nouvelle session.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_user_start_session(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quota user_quotas%ROWTYPE;
BEGIN
  SELECT * INTO v_quota FROM user_quotas WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Vérifier si le quota doit être resetté
  IF NOW() >= v_quota.quota_reset_at THEN
    UPDATE user_quotas
    SET
      readings_completed = 0,
      quota_period_start = NOW(),
      quota_reset_at = CASE
        WHEN plan_tier = 'free' THEN date_trunc('week', NOW()) + INTERVAL '1 week'
        WHEN plan_tier = 'essential' THEN date_trunc('month', NOW()) + INTERVAL '1 month'
        ELSE NOW() + INTERVAL '1 month'
      END,
      updated_at = NOW()
    WHERE user_id = p_user_id;

    -- Après reset, toujours de la place
    RETURN TRUE;
  END IF;

  -- Plan illimité
  IF v_quota.quota_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  -- Vérifier le quota courant
  RETURN v_quota.readings_completed < v_quota.quota_limit;
END;
$$;
