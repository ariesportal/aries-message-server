// ===================================================================
// A.R.I.E.S. Hub Message Center — self-hosted backend
// Deploy this on Render.com (see render.yaml + setup instructions).
//
// This uses simple REST endpoints + polling on the frontend (not
// WebSockets) — a bit less instantaneous than true real-time, but far
// more reliable and easier to debug, which matters a lot after the
// Firebase troubleshooting marathon this replaced.
// ===================================================================

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "change-this-in-render-env-vars";
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// ---- one-time table setup, runs automatically on every server start ----
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT,
      last_message TEXT,
      last_message_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (conversation_id, user_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INTEGER REFERENCES users(id),
      sender_name TEXT,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log("Database tables ready.");
}

// ---- auth middleware ----
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing auth token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ---- health check (visit this URL in a browser to confirm the server is alive) ----
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "A.R.I.E.S. message server is running." });
});

// ---- sign up ----
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: "Email, password, and display name are all required." });
    }
    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "That email is already registered." });
    }
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      "INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id, display_name",
      [email, hash, displayName]
    );
    const user = result.rows[0];
    const token = jwt.sign({ uid: user.id, displayName: user.display_name }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, uid: user.id, displayName: user.display_name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error during signup: " + e.message });
  }
});

// ---- log in ----
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "No account found with that email." });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(400).json({ error: "Incorrect password." });
    }
    const token = jwt.sign({ uid: user.id, displayName: user.display_name }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ token, uid: user.id, displayName: user.display_name });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error during login: " + e.message });
  }
});

// ---- list all other users (for starting new conversations) ----
app.get("/api/users", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, display_name FROM users WHERE id != $1 ORDER BY display_name ASC",
      [req.user.uid]
    );
    res.json(result.rows.map((r) => ({ uid: r.id, name: r.display_name })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error loading users: " + e.message });
  }
});

// ---- list my conversations ----
app.get("/api/conversations", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.type, c.name, c.last_message, c.last_message_at,
              array_agg(cm2.user_id) AS member_ids,
              array_agg(u2.display_name) AS member_names
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
       JOIN conversation_members cm2 ON cm2.conversation_id = c.id
       JOIN users u2 ON u2.id = cm2.user_id
       GROUP BY c.id
       ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC`,
      [req.user.uid]
    );
    const convos = result.rows.map((c) => {
      let displayName = c.name;
      if (c.type === "dm") {
        const idx = c.member_ids.findIndex((id) => id !== req.user.uid);
        displayName = c.member_names[idx] || "Direct Message";
      }
      return {
        id: c.id,
        type: c.type,
        name: displayName || "Group Chat",
        lastMessage: c.last_message,
      };
    });
    res.json(convos);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error loading conversations: " + e.message });
  }
});

// ---- start a new conversation (DM or group) ----
app.post("/api/conversations", requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { type, memberIds, name } = req.body;
    if (!type || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ error: "type and memberIds are required." });
    }
    const allMembers = Array.from(new Set([...memberIds, req.user.uid]));

    if (type === "dm") {
      // check for an existing DM between exactly these two people first
      const existing = await client.query(
        `SELECT c.id FROM conversations c
         JOIN conversation_members cm ON cm.conversation_id = c.id
         WHERE c.type = 'dm' AND cm.user_id = ANY($1::int[])
         GROUP BY c.id
         HAVING COUNT(DISTINCT cm.user_id) = $2
            AND (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) = $2`,
        [allMembers, allMembers.length]
      );
      if (existing.rows.length > 0) {
        return res.json({ id: existing.rows[0].id });
      }
    }

    await client.query("BEGIN");
    const convoResult = await client.query(
      "INSERT INTO conversations (type, name) VALUES ($1, $2) RETURNING id",
      [type, type === "group" ? name || "Group Chat" : null]
    );
    const convoId = convoResult.rows[0].id;
    for (const uid of allMembers) {
      await client.query(
        "INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)",
        [convoId, uid]
      );
    }
    await client.query("COMMIT");
    res.json({ id: convoId });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Server error creating conversation: " + e.message });
  } finally {
    client.release();
  }
});

// ---- get messages in a conversation (must be a member) ----
app.get("/api/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    const convoId = req.params.id;
    const membership = await pool.query(
      "SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2",
      [convoId, req.user.uid]
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ error: "You are not a member of this conversation." });
    }
    const result = await pool.query(
      "SELECT id, sender_id, sender_name, text, created_at FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [convoId]
    );
    res.json(
      result.rows.map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        senderName: m.sender_name,
        text: m.text,
        createdAt: m.created_at,
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error loading messages: " + e.message });
  }
});

// ---- send a message ----
app.post("/api/conversations/:id/messages", requireAuth, async (req, res) => {
  try {
    const convoId = req.params.id;
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Message text is required." });

    const membership = await pool.query(
      "SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2",
      [convoId, req.user.uid]
    );
    if (membership.rows.length === 0) {
      return res.status(403).json({ error: "You are not a member of this conversation." });
    }

    await pool.query(
      "INSERT INTO messages (conversation_id, sender_id, sender_name, text) VALUES ($1, $2, $3, $4)",
      [convoId, req.user.uid, req.user.displayName, text.trim()]
    );
    await pool.query(
      "UPDATE conversations SET last_message = $1, last_message_at = now() WHERE id = $2",
      [text.trim(), convoId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error sending message: " + e.message });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, () => console.log("Server listening on port " + PORT));
  })
  .catch((e) => {
    console.error("Failed to initialize database:", e);
    process.exit(1);
  });
