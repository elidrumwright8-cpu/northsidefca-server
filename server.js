const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const KEY = process.env.ANTHROPIC_API_KEY;

// ── Push notification helpers ─────────────────────────────────────────────────

const FIREBASE_PROJECT = 'northsidefca-1b741';
const FIREBASE_API_KEY = 'AIzaSyAYBOb17_xhep1B8MEDTNf79NqNkM9vh3E';

// Reads every saved push token (all pages), without duplicates.
async function getFirestoreTokens() {
  const tokens = new Set();
  let pageToken = '';
  do {
    const url =
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT}/databases/(default)/documents/pushTokens` +
      `?pageSize=300&key=${FIREBASE_API_KEY}` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
    const res = await fetch(url);
    const data = await res.json();
    for (const d of data.documents ?? []) {
      const t = d.fields?.token?.stringValue;
      if (t) tokens.add(t);
    }
    pageToken = data.nextPageToken ?? '';
  } while (pageToken);
  return [...tokens];
}

async function postToExpo(messages) {
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

// Expo refuses a request that mixes phones from two different app builds/projects
// (for example version 1.2 and version 1.3.0 of the app). When that happens, Expo says
// which phones belong to which project, so we resend each group on its own.
async function sendExpoPush(tokens, title, body, data = {}) {
  if (!tokens.length) return;
  const toMessages = (list) => list.map((token) => ({ to: token, title, body, sound: 'default', data }));

  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const { ok, json } = await postToExpo(toMessages(chunk));
    const mixed = json.errors?.find((e) => e.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS');

    if (mixed) {
      let groups = mixed.details && typeof mixed.details === 'object'
        ? Object.values(mixed.details).filter((g) => Array.isArray(g) && g.length)
        : [];
      if (!groups.length) groups = chunk.map((t) => [t]); // no usable details: send one phone at a time
      for (const group of groups) {
        const r = await postToExpo(toMessages(group));
        if (!r.ok) console.error('[push] group send failed:', JSON.stringify(r.json).slice(0, 500));
      }
    } else if (!ok || json.errors) {
      console.error('[push] send failed:', JSON.stringify(json).slice(0, 500));
    }
  }
}

// ── Scheduled notifications ───────────────────────────────────────────────────

// Thursdays at 5:00 PM Eastern — prayer check-in
cron.schedule(
  '0 17 * * 4',
  async () => {
    try {
      const tokens = await getFirestoreTokens();
      await sendExpoPush(
        tokens,
        'How can we pray for you?',
        'Submit a prayer request and let your FCA family lift you up this week.',
        { type: 'prayer_checkin' }
      );
      console.log(`[cron] Thursday prayer check-in sent to ${tokens.length} device(s)`);
    } catch (e) {
      console.error('[cron] Thursday prayer check-in failed:', e.message);
    }
  },
  { timezone: 'America/New_York' }
);

// ── Admin-triggered notification endpoints ────────────────────────────────────

app.post('/notify/prayer-checkin', async (req, res) => {
  try {
    const tokens = await getFirestoreTokens();
    await sendExpoPush(
      tokens,
      'How can we pray for you?',
      'Tap to submit a prayer request before Wednesday\'s meeting.',
      { type: 'prayer_checkin' }
    );
    res.json({ sent: tokens.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/notify/meeting-notes', async (req, res) => {
  try {
    const { title = 'Meeting Notes Posted', body = 'Check out what we talked about at today\'s FCA meeting.' } = req.body ?? {};
    const tokens = await getFirestoreTokens();
    await sendExpoPush(tokens, title, body, { type: 'meeting_notes' });
    res.json({ sent: tokens.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/prayer', async (req, res) => {
  try {
    const { topic, focus } = req.query;

    const sportsFocuses = new Set(['My Team', 'My Coaches']);
    const isSports = focus && sportsFocuses.has(focus);

    const focusDescriptions = {
      'My Team':       'for my sports team and teammates',
      'My Coaches':    'for my coaches who guide and mentor me',
      'My School':     'for my school, its students, and teachers',
      'My Family':     'for my family, their health, unity, and faith',
      'Our Nation':    'for our nation, its leaders, and all its people',
      'Everyday Life': 'for guidance and strength in everyday life',
    };

    const focusPhrase = (focus && focusDescriptions[focus]) || 'for a high school student';
    let prompt = `Write a short, heartfelt prayer ${focusPhrase}`;
    if (topic?.trim()) {
      prompt += `, specifically about ${topic.trim()}`;
    }
    if (isSports) {
      prompt += '. Use language that naturally relates to sports, teamwork, and athletic life.';
    } else {
      prompt += '. Do not use sports or athletic language — keep the tone and imagery fitting for the focus area.';
    }
    prompt += ' Keep it 3–5 sentences. Return prayer text only, no headings or labels.';

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const d = await r.json();
    res.json({ prayer: d.content[0].text.trim() });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/devotional', async (req, res) => {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        messages: [{role:'user',content:'Write a devotional for high school FCA athletes. Return ONLY valid JSON: {"title":"","tag":"","verse":"","reference":"","body":"","reflections":["","",""]}'}]
      })
    });
    const d = await r.json();
    const t = d.content[0].text.replace(/```json|```/g,'').trim();
    res.json(JSON.parse(t));
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/notes/generate-blanks', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });

    const prompt = `You are helping create a fill-in-the-blank worksheet from FCA meeting notes for high school students.

Given the notes below, identify 8–12 key theological terms, names, scripture references, or central phrases that are important to the teaching. These should be words/phrases students should remember.

Return ONLY a valid JSON array of segments. Rules:
- Every single word of the original text must appear in exactly one segment
- Text segments carry everything between blanks
- Blank segments carry the key word/phrase (the correct answer)
- Use sequential IDs: "b1", "b2", etc.
- Do not add, remove, or rephrase any words from the original text

Format: [{"type":"text","content":"..."},{"type":"blank","id":"b1","answer":"..."},...]

Notes:
${text.trim()}`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const d = await r.json();
    if (!d.content?.[0]?.text) {
      throw new Error(d.error?.message ?? 'Anthropic API error — please try again');
    }
    const raw = d.content[0].text.replace(/```json|```/g, '').trim();
    const segments = JSON.parse(raw);
    res.json({ segments });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
