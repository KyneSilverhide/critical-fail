const pool = require('./db')

const migrations = `
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  code UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  created_by INTEGER REFERENCES admins(id),
  created_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  player_name VARCHAR(100) NOT NULL,
  joined_at TIMESTAMP DEFAULT NOW(),
  socket_id VARCHAR(100)
);

ALTER TABLE players ADD COLUMN IF NOT EXISTS ac INTEGER DEFAULT 10;
ALTER TABLE players ADD COLUMN IF NOT EXISTS max_hp INTEGER DEFAULT 20;
ALTER TABLE players ADD COLUMN IF NOT EXISTS current_hp INTEGER DEFAULT 20;
ALTER TABLE players ADD COLUMN IF NOT EXISTS dnd_class VARCHAR(50);
ALTER TABLE players ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  from_name VARCHAR(100) NOT NULL,
  to_player_id INTEGER REFERENCES players(id),
  type VARCHAR(20) DEFAULT 'text',
  content TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dice_results (
  id SERIAL PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  combat_type VARCHAR(20) NOT NULL,
  roll_value INTEGER NOT NULL,
  result_text TEXT NOT NULL,
  sent_to INTEGER REFERENCES players(id),
  created_at TIMESTAMP DEFAULT NOW()
);
`

async function runMigrations() {
  const client = await pool.connect()
  try {
    await client.query(migrations)
    console.log('Migrations executed successfully.')
  } finally {
    client.release()
  }
}

module.exports = runMigrations
