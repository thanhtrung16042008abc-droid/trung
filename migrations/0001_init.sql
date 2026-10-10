CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  badge TEXT NOT NULL DEFAULT '',
  specs TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL DEFAULT '#22d3ee',
  shape TEXT NOT NULL DEFAULT 'box',
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  payment TEXT NOT NULL,
  status TEXT NOT NULL,
  total INTEGER NOT NULL,
  customer_json TEXT NOT NULL,
  items_json TEXT NOT NULL
);
