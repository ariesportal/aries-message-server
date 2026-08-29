// ===================================================================
// A.R.I.E.S. Hub Backend — Message Center + Member Dashboard +
// Intake Form Email Submission
// Deploy this on Render.com (see render.yaml + setup instructions).
//
// This uses simple REST endpoints + polling on the frontend (not
// WebSockets) — a bit less instantaneous than true real-time, but far
// more reliable and easier to debug, which matters a lot after the
// Firebase troubleshooting marathon this replaced.
//
// ===================================================================
// GMAIL SETUP — do this once, for the intake form's auto-email
// ===================================================================
// 1. Go to myaccount.google.com/security on the Gmail account you
//    want to SEND from (can be ariesportalinquiries@gmail.com itself,
//    or a different Gmail account — either works).
// 2. Turn on "2-Step Verification" if it isn't already on.
// 3. Scroll to the bottom of that Security page → "App passwords" →
//    create one (name it anything, e.g. "ARIES Intake Form") → Google
//    gives you a 16-character code. Copy it (remove any spaces).
// 4. In Render: Environment → add two variables:
//      GMAIL_USER = the full Gmail address you're sending FROM
//      GMAIL_APP_PASSWORD = the 16-character code from step 3
//    NEVER put these in frontend code or share them in chat.
// ===================================================================

const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || "change-this-in-render-env-vars";
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const mailTransporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// where completed intake forms get sent
const INTAKE_RECIPIENT = "ariesportalinquiries@gmail.com";

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
  // added for online status + unread notification badges — IF NOT EXISTS
  // makes these safe to run every time the server starts, including on
  // a database that already has the older table shape.
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ;`);
  await pool.query(`ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ DEFAULT now();`);
  // private per-member case notes, added for the member dashboard
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
  console.log("Database tables ready.");
}

// how recently someone must have sent a heartbeat to count as "online"
const ONLINE_WINDOW_SECONDS = 45;

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

// ---- heartbeat: call this every ~20s while the messenger is open, so
// other people can see you as "online" (green dot) ----
app.post("/api/heartbeat", requireAuth, async (req, res) => {
  try {
    await pool.query("UPDATE users SET last_seen = now() WHERE id = $1", [req.user.uid]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error updating heartbeat: " + e.message });
  }
});

// ---- list all other users (for starting new conversations) ----
app.get("/api/users", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, display_name,
              (last_seen IS NOT NULL AND last_seen > now() - interval '${ONLINE_WINDOW_SECONDS} seconds') AS online
       FROM users WHERE id != $1 ORDER BY display_name ASC`,
      [req.user.uid]
    );
    res.json(result.rows.map((r) => ({ uid: r.id, name: r.display_name, online: r.online })));
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
              array_agg(u2.display_name) AS member_names,
              array_agg(u2.last_seen) AS member_last_seen,
              (SELECT last_read_at FROM conversation_members WHERE conversation_id = c.id AND user_id = $1) AS my_last_read,
              (SELECT COUNT(*) FROM messages m
                 WHERE m.conversation_id = c.id
                   AND m.sender_id != $1
                   AND m.created_at > COALESCE(
                     (SELECT last_read_at FROM conversation_members WHERE conversation_id = c.id AND user_id = $1),
                     '1970-01-01'::timestamptz
                   )
              ) AS unread_count
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
      let online = false;
      if (c.type === "dm") {
        const idx = c.member_ids.findIndex((id) => id !== req.user.uid);
        displayName = c.member_names[idx] || "Direct Message";
        const otherLastSeen = c.member_last_seen[idx];
        online = !!otherLastSeen && (Date.now() - new Date(otherLastSeen).getTime()) / 1000 < ONLINE_WINDOW_SECONDS;
      }
      return {
        id: c.id,
        type: c.type,
        name: displayName || "Group Chat",
        lastMessage: c.last_message,
        unreadCount: parseInt(c.unread_count, 10) || 0,
        online: online,
      };
    });
    res.json(convos);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error loading conversations: " + e.message });
  }
});

// ---- mark a conversation as read (clears its unread badge) ----
app.post("/api/conversations/:id/read", requireAuth, async (req, res) => {
  try {
    const convoId = req.params.id;
    await pool.query(
      `INSERT INTO conversation_members (conversation_id, user_id, last_read_at)
       VALUES ($1, $2, now())
       ON CONFLICT (conversation_id, user_id) DO UPDATE SET last_read_at = now()`,
      [convoId, req.user.uid]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error marking conversation read: " + e.message });
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

// ---- account info for the dashboard (email, display name, member since) ----
app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT email, display_name, created_at FROM users WHERE id = $1",
      [req.user.uid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Account not found." });
    const u = result.rows[0];
    res.json({ email: u.email, displayName: u.display_name, createdAt: u.created_at });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error loading account info: " + e.message });
  }
});

// ---- private case notes (visible only to the member who wrote them) ----
app.get("/api/notes", requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, text, created_at, updated_at FROM notes WHERE user_id = $1 ORDER BY updated_at DESC",
      [req.user.uid]
    );
    res.json(result.rows.map((n) => ({ id: n.id, text: n.text, createdAt: n.created_at, updatedAt: n.updated_at })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error loading notes: " + e.message });
  }
});

app.post("/api/notes", requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Note text is required." });
    const result = await pool.query(
      "INSERT INTO notes (user_id, text) VALUES ($1, $2) RETURNING id, text, created_at, updated_at",
      [req.user.uid, text.trim()]
    );
    const n = result.rows[0];
    res.json({ id: n.id, text: n.text, createdAt: n.created_at, updatedAt: n.updated_at });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error creating note: " + e.message });
  }
});

app.put("/api/notes/:id", requireAuth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: "Note text is required." });
    const result = await pool.query(
      "UPDATE notes SET text = $1, updated_at = now() WHERE id = $2 AND user_id = $3 RETURNING id, text, created_at, updated_at",
      [text.trim(), req.params.id, req.user.uid]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Note not found." });
    const n = result.rows[0];
    res.json({ id: n.id, text: n.text, createdAt: n.created_at, updatedAt: n.updated_at });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error updating note: " + e.message });
  }
});

app.delete("/api/notes/:id", requireAuth, async (req, res) => {
  try {
    await pool.query("DELETE FROM notes WHERE id = $1 AND user_id = $2", [req.params.id, req.user.uid]);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error deleting note: " + e.message });
  }
});

// ---- intake form submission: emails the completed form to the
// business inbox. No login required — anyone with the intake form's
// link can submit, matching the existing manual verification process
// (you match submissions to Stripe notifications by email yourself).
app.post("/api/submit-intake", async (req, res) => {
  try {
    const { subject, text, replyToEmail, honeypot } = req.body;

    // basic spam deterrent: a hidden field real users never fill in
    if (honeypot) {
      return res.json({ ok: true }); // pretend success, don't actually send
    }
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Form content is missing." });
    }

    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: INTAKE_RECIPIENT,
      subject: subject || "New A.R.I.E.S. Intake Form Submission",
      text: text,
    };
    if (replyToEmail && replyToEmail.trim()) {
      mailOptions.replyTo = replyToEmail.trim();
    }

    await mailTransporter.sendMail(mailOptions);
    res.json({ ok: true });
  } catch (e) {
    console.error("Failed to send intake form email:", e);
    res.status(500).json({ error: "Server error sending the form: " + e.message });
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
