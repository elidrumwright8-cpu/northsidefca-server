const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json());

const KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;

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
        model: 'claude-sonnet-4-20250514',
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
