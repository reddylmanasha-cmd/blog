# WritePulse AI

**Turn information overload into your next great story.**

An agentic AI writing assistant that helps bloggers collect, synthesize, and transform scattered information into compelling content.

---

## Features

- **Content Inbox** — Add text, URLs, images, and voice notes
- **AI Topic Studio** — Synthesize sources into ranked blog topics
- **Multimodal Idea Refinery** — Transform rough ideas into compelling concepts
- **Blog Blueprint Generator** — Full blog structures with SEO, tone, audience
- **Writing Pulse Dashboard** — Sentiment, engagement forecasts, hashtags
- **AI Writing Assistant** — Context-aware chat assistant for your blog
- **Demo Mode** — Works without an API key for presentations

---

## Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript (Single Page Application)
- **Backend:** Node.js + Express (API proxy)
- **AI:** Groq API (`llama3-8b-8192`)

---

## Setup

### 1. Install Node.js

Download and install Node.js 18+ from [nodejs.org](https://nodejs.org).

### 2. Install dependencies

```bash
npm install
```

### 3. Create your environment file

Copy the example file:

```bash
cp .env.example .env
```

### 4. Add your Groq API key

Edit `.env`:

```
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

Get your free Groq API key at [console.groq.com](https://console.groq.com).

> ⚠️ **Never commit your `.env` file.** It is already in `.gitignore`.

### 5. Start the server

```bash
npm start
```

### 6. Open the application

Navigate to [http://localhost:3000](http://localhost:3000) in your browser.

---

## Demo Mode

The application includes a **Demo Mode** that works without any API key.

Click **"Load Demo Workspace"** on the Overview page to instantly populate the dashboard with realistic sample data — perfect for presentations.

Demo content includes:
- A technology news article about AI
- Research findings on content engagement
- Social media trend data
- Audience comments
- A personal blog idea

---

## Security

- The Groq API key is stored **only** in `.env` (server-side)
- The key is **never** sent to or accessible in the browser
- All AI calls are proxied through the backend
- `.env` is excluded from git via `.gitignore`

---

## Project Structure

```
writepulse-ai/
├── public/
│   └── index.html      # Complete frontend SPA
├── server.js           # Express backend / Groq proxy
├── .env                # API secrets (never commit)
├── .env.example        # Example config (safe to commit)
├── .gitignore
├── package.json
└── README.md
```

---

## AI Agents

WritePulse uses a modular agentic workflow:

| Agent | Role |
|-------|------|
| Source Analyst | Analyzes incoming content for sentiment, topics, relevance |
| Trend Synthesizer | Identifies common themes across sources |
| Topic Strategist | Generates and ranks blog topic ideas |
| Audience Analyst | Analyzes sentiment and engagement signals |
| Content Planner | Creates blog structures and publishing recommendations |
| Writing Assistant | Helps develop actual blog content |

---

## License

MIT
