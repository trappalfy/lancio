import { bigint, boolean, integer, pgTable, primaryKey, serial, smallint, text } from "drizzle-orm/pg-core";

/** Addresses are stored lowercase. Timestamps are unix seconds. */
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  token: text("token").notNull(),
  author: text("author").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  hidden: boolean("hidden").notNull(),
  score: integer("score").notNull(),
  commentsCount: integer("comments_count").notNull(),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  author: text("author").notNull(),
  body: text("body").notNull(),
  createdAt: bigint("created_at", { mode: "number" }).notNull(),
  hidden: boolean("hidden").notNull(),
});

export const votes = pgTable(
  "votes",
  {
    postId: integer("post_id").notNull(),
    voter: text("voter").notNull(),
    value: smallint("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.voter] })],
);

export const schema = { posts, comments, votes };

/** Idempotent DDL, run once per process on first use (no migration tooling). One statement per entry. */
export const DDL = [
  `CREATE TABLE IF NOT EXISTS posts (
    id serial PRIMARY KEY,
    token text NOT NULL,
    author text NOT NULL,
    title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
    body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 5000),
    created_at bigint NOT NULL,
    hidden boolean NOT NULL DEFAULT false,
    score integer NOT NULL DEFAULT 0,
    comments_count integer NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS posts_created_idx ON posts (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS posts_token_created_idx ON posts (token, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS posts_author_created_idx ON posts (author, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS comments (
    id serial PRIMARY KEY,
    post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    author text NOT NULL,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at bigint NOT NULL,
    hidden boolean NOT NULL DEFAULT false
  )`,
  `CREATE INDEX IF NOT EXISTS comments_post_idx ON comments (post_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS votes (
    post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    voter text NOT NULL,
    value smallint NOT NULL CHECK (value IN (-1, 1)),
    PRIMARY KEY (post_id, voter)
  )`,
];
