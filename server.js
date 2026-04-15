const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json());

const KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

app.get('/prayer', async (req, res) => {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{role:'user',content:'Write a short morning prayer for high school athletes. 3-5 sentences. Prayer text only.'}]
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
        model: 'claude-sonnet-4-20250514',
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
