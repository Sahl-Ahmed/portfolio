# Cloudflare Workers Migration Plan - Phase 3 (Complete)

This folder contains the complete Cloudflare Workers implementation representing **Phase 3** of Sahl's Portfolio Chatbot Assistant migration from Google Cloud Run containerized hosting to Cloudflare Workers. 

The primary goal of Phase 3 is moving the complete Firestore Knowledge Engine from `server.ts` into the Cloudflare Worker, transforming the Worker into a fully self-contained, ultra-fast serverless backend.

---

## 1. Folder Structure

```
/workers/chatbot/
├── package.json          # Node dependencies, scripts, and wrangler dev environment tools
├── tsconfig.json         # TypeScript configuration tuned for Worker modules and edge runtime types
├── wrangler.toml         # Deployment targets, compatibility dates, and binding configurations
├── README.md             # This document containing future migration blueprints and deployment actions
└── src/
    └── index.ts          # Core service entrypoint delivering the serverless Firestore Knowledge Engine
```

---

## 2. Worker Architecture & Knowledge Engine

The Cloudflare Worker has been upgraded to a fully functional, serverless brain that handles:
* **Firestore Knowledge Retrieval**: Utilizing a lightweight, native, and robust Firestore REST client authorizing with Sahl's Firebase Web API keys.
* **Intent Classification (Knowledge Guard)**: Categorizing questions into `direct`, `analysis`, or `external` to politely reject unrelated topics.
* **Exact & Fuzzy Match Search**: Checking user queries against published projects, skills, and achievements to deliver zero-latency dynamic answers.
* **Dynamic Analytics & Software Rankings**: Implementing automated score weights across professional experience months, featured masterpieces, gallery items, and industry awards.
* **Context Building (Adaptive Context Window)**: Bundling active message streams, generating micro-summaries of historical exchanges using AI models, and keeping prompts clean and light.
* **Conversation History Storage**: Synchronizing the complete chat log directly back to Firestore's `ai_sessions` collection.

### Hybrid Communication Flow
1. **Direct Worker Communication**: If `VITE_AI_BACKEND_URL` is set, the frontend makes a single direct POST request to the Worker's `/api/chat` or `/*` endpoint with `userMessage`, `sessionId`, and `context`.
2. **Double Compatibility**: The Worker remains 100% backward compatible. If it receives standard `contents` and `systemInstruction` arrays, it functions as a lightweight AI proxy. If it receives a raw `userMessage` and `sessionId`, it automatically runs the complete Firestore Knowledge Engine.
3. **Resilient Fallback**: If the Worker is unreachable or returns an error, the frontend automatically falls back to Sahl's original local Express `server.ts` endpoints.

---

## 3. High-Performance Caching Layer

To guarantee sub-second response times and minimize database reads, the Worker implements a dynamic in-memory caching layer:
* **Portfolio Context Cache**: Caches Sahl's structural data (skills, projects, gallery, socials) inside the V8 isolate memory for 5 minutes.
* **AI Configuration Cache**: Caches global settings (`enabled`, `model`, `groqModel`, `temperature`) for 5 minutes.
* **Session Chat Cache**: Keeps a rolling 1-hour in-memory cache of resolved AI replies per session to completely bypass duplicate requests.

---

## 4. Secret Management

Sensitive API Keys are injected as secure environment variables using Cloudflare Secrets:

```bash
# Inject Google Gemini Secret
echo "YOUR_GEMINI_API_KEY" | wrangler secret put GEMINI_API_KEY

# Inject Groq Secret
echo "YOUR_GROQ_API_KEY" | wrangler secret put GROQ_API_KEY

# Optional custom Firestore configurations (falls back to Sahl's defaults if not provided)
echo "YOUR_FIREBASE_API_KEY" | wrangler secret put FIREBASE_API_KEY
echo "YOUR_FIREBASE_PROJECT_ID" | wrangler secret put FIREBASE_PROJECT_ID
echo "YOUR_FIREBASE_DATABASE_ID" | wrangler secret put FIREBASE_DATABASE_ID
```
