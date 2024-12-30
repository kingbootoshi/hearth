-- ===============================
-- 1) chat_history
-- Used to store ongoing conversation data.
-- ===============================
CREATE TABLE IF NOT EXISTS chat_history (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  images TEXT[] -- Array of image URLs
);

ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;


-- ===============================
-- 2) chat_history_archive
-- Old messages get moved here (archived).
-- ===============================
CREATE TABLE IF NOT EXISTS chat_history_archive (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  images TEXT[]
);

ALTER TABLE chat_history_archive ENABLE ROW LEVEL SECURITY;


-- ===============================
-- 3) extracted_knowledge
-- Stores JSON of AI-extracted knowledge from the chat logs.
-- ===============================
CREATE TABLE IF NOT EXISTS extracted_knowledge (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  extracted_data JSONB NOT NULL
);

ALTER TABLE extracted_knowledge ENABLE ROW LEVEL SECURITY;


-- ===============================
-- 4) short_term_summaries
-- Summaries of recent conversations.
-- archived indicates whether they've been condensed into mid-term.
-- ===============================
CREATE TABLE IF NOT EXISTS short_term_summaries (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE short_term_summaries ENABLE ROW LEVEL SECURITY;


-- ===============================
-- 5) mid_term_summaries
-- Summaries formed by condensing multiple short term summaries.
-- archived indicates whether they've been condensed into a long-term.
-- ===============================
CREATE TABLE IF NOT EXISTS mid_term_summaries (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE
);

ALTER TABLE mid_term_summaries ENABLE ROW LEVEL SECURITY;


-- ===============================
-- 6) long_term_summaries
-- Summaries formed by condensing multiple mid-term summaries.
-- There are usually few or even one row here that grows over time.
-- ===============================
CREATE TABLE IF NOT EXISTS long_term_summaries (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL
);

ALTER TABLE long_term_summaries ENABLE ROW LEVEL SECURITY;


-- ===============================
-- 7) image_generations
-- Stores the prompts, enhanced prompts, and associated outputs for images.
-- ===============================
CREATE TABLE IF NOT EXISTS image_generations (
  id BIGSERIAL PRIMARY KEY,
  user_prompt TEXT NOT NULL,
  enhanced_prompt TEXT NOT NULL,
  image_url TEXT NOT NULL,
  feedback TEXT NOT NULL,         -- e.g. 'good' or 'bad'
  created_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE image_generations ENABLE ROW LEVEL SECURITY;


-- ===============================
-- 8) temp_alpha_messages
-- Temporary raw messages for the summary module (example usage).
-- ===============================
CREATE TABLE IF NOT EXISTS temp_alpha_messages (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  content TEXT NOT NULL
);

ALTER TABLE temp_alpha_messages ENABLE ROW LEVEL SECURITY;


-- ===============================
-- 9) hourly_summaries
-- Summaries created hourly from temp_alpha_messages.
-- ===============================
CREATE TABLE IF NOT EXISTS hourly_summaries (
  id BIGSERIAL PRIMARY KEY,
  summary TEXT NOT NULL
);

ALTER TABLE hourly_summaries ENABLE ROW LEVEL SECURITY;


-- ===============================
-- 10) daily_summaries
-- Summaries created daily from hourly_summaries.
-- ===============================
CREATE TABLE IF NOT EXISTS daily_summaries (
  id BIGSERIAL PRIMARY KEY,
  summary TEXT NOT NULL
);

ALTER TABLE daily_summaries ENABLE ROW LEVEL SECURITY;