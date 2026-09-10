require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'qwen/qwen3.8-27b';
const GROQ_VISION_MODEL = 'openai/gpt-oss-120b';

function getApiKey() {
  return process.env.GROQ_API_KEY || '';
}

async function groqChat(messages, { model, temperature = 0.7, max_tokens = 2048, json = false } = {}) {
  const apiKey = getApiKey();
  if (!apiKey || apiKey === 'your_groq_api_key_here') {
    throw new Error('GROQ_API_KEY is not configured. Please add it to your .env file.');
  }

  const useModel = model || GROQ_MODEL;
  const body = {
    model: useModel,
    messages,
    temperature,
    max_tokens,
  };
  // Note: response_format json_object is model-dependent; rely on prompt instruction instead
  // Qwen3 models support it but we add explicit JSON instruction in the prompt for safety

  const fetch = (await import('node-fetch')).default;
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    let errMsg = `Groq API error (${res.status})`;
    try {
      const errJson = JSON.parse(errText);
      errMsg = errJson.error?.message || errMsg;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await res.json();
  let content = data.choices?.[0]?.message?.content || '';
  // Strip thinking blocks from models that emit <think>...</think>
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return content;
}

function safeJsonParse(text) {
  try {
    // Try direct parse
    return JSON.parse(text);
  } catch (_) {
    // Try extracting JSON block
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/) || text.match(/(\{[\s\S]*\})/);
    if (match) {
      try { return JSON.parse(match[1]); } catch (_) {}
    }
    return null;
  }
}

// Health check
app.get('/api/health', (req, res) => {
  const hasKey = !!(getApiKey() && getApiKey() !== 'your_groq_api_key_here');
  res.json({ status: 'ok', groqConfigured: hasKey });
});

// Analyze content (Source Analyst)
app.post('/api/analyze', async (req, res) => {
  try {
    const { content, type, url } = req.body;
    if (!content && !url) return res.status(400).json({ error: 'Content or URL required.' });

    const sourceInfo = url ? ` (from: ${url})` : '';
    const prompt = `You are a Source Analyst AI. Analyze the following ${type || 'text'} content${sourceInfo} and respond ONLY with a valid JSON object (no markdown, no extra text) with these fields:
- summary: a concise 2-3 sentence summary
- topics: array of up to 5 topic strings
- sentiment: "positive", "neutral", or "negative"
- sentiment_score: number from -1 (very negative) to 1 (very positive)
- relevance_score: number 0-100 indicating how relevant/interesting this is for blog writing
- key_points: array of up to 5 key takeaways
- category: one of "news", "research", "social", "comment", "note", "other"

Content:
${content || url}`;

    const raw = await groqChat([{ role: 'user', content: prompt }], { json: false, max_tokens: 600 });
    const parsed = safeJsonParse(raw);
    if (parsed) {
      res.json({ success: true, data: parsed, raw });
    } else {
      res.json({ success: true, data: { summary: raw, topics: [], sentiment: 'neutral', sentiment_score: 0, relevance_score: 50, key_points: [], category: type || 'note' }, raw });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Analyze image (vision)
app.post('/api/analyze-image', async (req, res) => {
  try {
    const { base64, mimeType } = req.body;
    if (!base64) return res.status(400).json({ error: 'Image data required.' });

    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'You are a Source Analyst. Describe this image in detail and extract useful context for blog writing. Respond ONLY with a valid JSON object (no markdown, no extra text) with: summary (string), topics (array of strings), sentiment ("positive","neutral","negative"), relevance_score (0-100), key_points (array of strings).' },
          { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${base64}` } }
        ]
      }
    ];

    const raw = await groqChat(messages, { model: GROQ_VISION_MODEL, json: false, max_tokens: 600 });
    const parsed = safeJsonParse(raw);
    if (parsed) {
      res.json({ success: true, data: parsed, raw });
    } else {
      res.json({ success: true, data: { summary: raw, topics: [], sentiment: 'neutral', relevance_score: 60, key_points: [] }, raw });
    }
  } catch (err) {
    // Vision model may not be available on all plans
    res.status(500).json({ error: `Image analysis unavailable: ${err.message}` });
  }
});

// Generate topics (Topic Strategist + Trend Synthesizer)
app.post('/api/topics', async (req, res) => {
  try {
    const { sources } = req.body;
    if (!sources || !sources.length) return res.status(400).json({ error: 'No sources provided.' });

    const sourcesSummary = sources.map((s, i) =>
      `[${i + 1}] (${s.category || 'note'}) ${s.title || ''}: ${s.summary || s.content || ''}`
    ).join('\n');

    const prompt = `You are a Topic Strategist AI. Analyze these content sources and generate blog topic ideas.

Sources:
${sourcesSummary}

Respond ONLY with a valid JSON object (no markdown, no extra text) with:
- topics: array of 4 topics, each with: title, description (1-2 sentences), suggested_angle, relevance_score (0-100), trend_score (0-100), engagement_score (0-100), momentum ("rising"/"stable"/"declining"), hashtags (array of 4), recommended_tone
- themes: array of 3-4 common themes
- summary: 2-sentence synthesis`;

    const raw = await groqChat([{ role: 'user', content: prompt }], { json: false, max_tokens: 950 });
    const parsed = safeJsonParse(raw);
    if (parsed) {
      res.json({ success: true, data: parsed, raw });
    } else {
      res.json({ success: true, data: { topics: [], themes: [], summary: raw }, raw });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Refine idea (Audience Analyst + Content Planner)
app.post('/api/refine', async (req, res) => {
  try {
    const { idea, type } = req.body;
    if (!idea) return res.status(400).json({ error: 'Idea content required.' });

    const prompt = `You are an AI writing coach. Transform this rough ${type || 'text'} idea into a stronger content concept.

Rough idea: "${idea}"

Respond ONLY with a valid JSON object (no markdown, no extra text) with:
- original_idea: 1-sentence restatement
- refined_idea: clearer compelling version (2 sentences)
- suggested_angle: best unique perspective
- recommended_audience: target reader
- recommended_tone: one of "informative","conversational","analytical","persuasive","storytelling","professional","casual"
- tone_explanation: brief reason (1 sentence)
- suggested_visuals: array of 3 visual types
- key_questions: array of 3 key questions
- hooks: array of 2 opening hooks
- estimated_length: "short (500-800 words)" or "medium (800-1500 words)" or "long (1500+ words)"`;

    const raw = await groqChat([{ role: 'user', content: prompt }], { json: false, max_tokens: 800 });
    const parsed = safeJsonParse(raw);
    if (parsed) {
      res.json({ success: true, data: parsed, raw });
    } else {
      res.json({ success: true, data: { refined_idea: raw }, raw });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate blog blueprint (Content Planner)
app.post('/api/blueprint', async (req, res) => {
  try {
    const { topic, tone, audience, sources } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic required.' });

    const sourcesContext = sources && sources.length
      ? `\nAvailable sources:\n${sources.map((s, i) => `[${i + 1}] ${s.summary || s.content || ''}`).join('\n')}`
      : '';

    const prompt = `You are a Content Planner AI. Generate a blog post blueprint.

Topic: "${topic}"
Tone: ${tone || 'informative'}
Audience: ${audience || 'general blog readers'}${sourcesContext}

Respond ONLY with a valid JSON object (no markdown, no extra text) with:
- working_title: blog post title
- headline_alternatives: array of 2 alternative titles
- hook: attention-grabbing opening sentence
- introduction: 2-sentence introduction
- sections: array of 3 main sections, each with: heading, summary (1-2 sentences), key_arguments (array of 2)
- counterpoints: array of 2 counterarguments
- conclusion: 2-sentence conclusion
- call_to_action: what to ask readers
- seo_keywords: array of 6 keywords
- estimated_length: word count range
- recommended_publishing_time: {time, day, explanation (1 sentence)}
- hashtags: array of 5 hashtags`;

    const raw = await groqChat([{ role: 'user', content: prompt }], { json: false, max_tokens: 950 });
    const parsed = safeJsonParse(raw);
    if (parsed) {
      res.json({ success: true, data: parsed, raw });
    } else {
      res.json({ success: true, data: { working_title: topic, raw_blueprint: raw }, raw });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Writing Pulse dashboard data
app.post('/api/pulse', async (req, res) => {
  try {
    const { sources, topics } = req.body;
    if ((!sources || !sources.length) && (!topics || !topics.length)) {
      return res.status(400).json({ error: 'Sources or topics required.' });
    }

    const context = [
      sources && sources.length ? `Sources: ${sources.map(s => s.summary || s.title || '').join('; ')}` : '',
      topics && topics.length ? `Topics: ${topics.map(t => t.title || '').join('; ')}` : ''
    ].filter(Boolean).join('\n');

    const prompt = `You are an Audience Analyst AI. Generate a Writing Pulse dashboard from this content.

${context}

Respond ONLY with a valid JSON object (no markdown, no extra text) with:
- trending_topics: array of 4 objects with {topic, momentum: "rising"|"stable"|"declining", score: 0-100}
- sentiment_breakdown: {positive: number, neutral: number, negative: number} (percentages summing to 100)
- overall_sentiment: "positive", "neutral", or "negative"
- engagement_forecast: array of 3 topics with {topic, level: "low"|"medium"|"high", score: 0-100}
- recommended_publishing_time: {time, day, explanation (1 sentence)}
- top_hashtags: array of 8 hashtags
- recommended_angle: 1-2 sentence distinctive angle
- content_gaps: array of 3 content gap topics
- publishing_note: 1-sentence AI estimate disclaimer`;

    const raw = await groqChat([{ role: 'user', content: prompt }], { json: false, max_tokens: 800 });
    const parsed = safeJsonParse(raw);
    if (parsed) {
      res.json({ success: true, data: parsed, raw });
    } else {
      res.json({ success: true, data: { raw }, raw });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// AI Writing Assistant chat
app.post('/api/chat', async (req, res) => {
  try {
    const { messages, context } = req.body;
    if (!messages || !messages.length) return res.status(400).json({ error: 'Messages required.' });

    const systemPrompt = `You are a skilled AI Writing Assistant helping a blogger create compelling content.
${context?.topic ? `Current topic: ${context.topic}` : ''}
${context?.tone ? `Desired tone: ${context.tone}` : ''}
${context?.audience ? `Target audience: ${context.audience}` : ''}
${context?.blueprint ? `Blog blueprint context:\n${JSON.stringify(context.blueprint, null, 2)}` : ''}
${context?.sources ? `Available sources:\n${context.sources.map(s => `- ${s.summary || s.title || ''}`).join('\n')}` : ''}

Help the writer develop their blog content. Be specific, creative, and actionable. When asked for alternatives, provide exactly what was requested. Format responses clearly using markdown when appropriate.`;

    const allMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const raw = await groqChat(allMessages, { max_tokens: 900 });
    res.json({ success: true, content: raw });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✅ WritePulse AI server running at http://localhost:${PORT}`);
  const hasKey = !!(getApiKey() && getApiKey() !== 'your_groq_api_key_here');
  console.log(`🔑 Groq API: ${hasKey ? 'Configured ✓' : 'NOT configured — Demo Mode only'}`);
  console.log(`📝 Open your browser and navigate to http://localhost:${PORT}\n`);
});
