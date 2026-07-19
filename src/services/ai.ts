import { Project } from '../types';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: Date;
  projects?: Project[];
  showViewAll?: boolean;
  contactButtons?: boolean;
  actionButtons?: boolean;
  similarProjects?: Project[];
  isSearchLoader?: boolean;
  dynamicContactButtons?: Array<{ name: string; url: string }>;
  suggestions?: string[];
  navigationSection?: string;
}

export interface ChatResponse {
  text: string;
  suggestions: string[];
  dynamicContactButtons?: Array<{ name: string; url: string }>;
  navigationSection?: string;
  projects?: Project[];
}

/**
 * AI Service for "Ask Sahl AI"
 * 
 * Fetches responses from the server-side proxy `/api/chat` endpoint.
 * Bypasses Firestore directly inside the chatbot, keeping database calls server-secure
 * and utilizing the real-time cached "Knowledge Engine" data.
 */

export async function initChatSession(sessionId: string): Promise<ChatMessage[]> {
  try {
    const response = await fetch('/api/session/init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!response.ok) {
      throw new Error(`Session initiation failed: ${response.status}`);
    }

    const data = await response.json();
    const historyMsgs = data.messages || [];
    return historyMsgs.map((m: any) => ({
      id: m.id,
      sender: m.sender,
      text: m.text,
      timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
    }));
  } catch (error) {
    console.error("initChatSession error:", error);
    return [];
  }
}

export async function sendChatMessage(
  userMessage: string,
  sessionId: string,
  context: any
): Promise<ChatResponse> {
  const workerUrl = (import.meta as any).env?.VITE_AI_BACKEND_URL;

  if (workerUrl) {
    try {
      console.log(`[AI Proxy] Initiating direct communication with Cloudflare Worker at: ${workerUrl}`);
      const workerResponse = await fetch(workerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userMessage,
          sessionId,
          context,
        }),
      });

      if (workerResponse.ok) {
        const workerData = await workerResponse.json();
        console.log(`[AI Proxy] Direct Worker communication successful.`);
        return {
          text: workerData.text || "No response received.",
          suggestions: workerData.suggestions || [],
          dynamicContactButtons: workerData.dynamicContactButtons,
          navigationSection: workerData.navigationSection,
          projects: workerData.projects,
        };
      } else {
        console.warn(`[AI Proxy] Cloudflare Worker returned error status ${workerResponse.status}. Falling back to default server.ts...`);
      }
    } catch (err: any) {
      console.error(`[AI Proxy] Error routing request directly through Cloudflare Worker, falling back to default server.ts:`, err.message || err);
    }
  }

  // DEFAULT / FALLBACK: Call existing server.ts /api/chat endpoint directly
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userMessage,
        sessionId,
        context,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with status ${response.status}`);
    }

    const data: ChatResponse = await response.json();
    return {
      text: data.text || "No response received.",
      suggestions: data.suggestions || [],
      dynamicContactButtons: data.dynamicContactButtons,
      navigationSection: data.navigationSection,
      projects: data.projects,
    };
  } catch (error: any) {
    console.error("sendChatMessage fetch error:", error);
    return {
      text: `I'm sorry, I'm having trouble connecting to Sahl Ahmed's AI Assistant service right now.\n\n*Error details: ${error.message}*`,
      suggestions: [
        "Tell me about Sahl",
        "Show latest projects",
        "Contact Sahl"
      ]
    };
  }
}

export async function sendChatMessageStream(
  userMessage: string,
  sessionId: string,
  context: any,
  onChunk: (text: string) => void,
  onDone: (data: ChatResponse) => void,
  onError: (error: any) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    // Temporarily disabled streaming for debugging.
    // Directly fetch using the normal non-streaming chat API.
    const nonStreamRes = await sendChatMessage(userMessage, sessionId, context);
    if (signal?.aborted) {
      console.log("Chat aborted by user.");
      return;
    }
    // Deliver the entire response text instantly in one go.
    onChunk(nonStreamRes.text);
    onDone(nonStreamRes);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log("Chat aborted by user.");
      return;
    }
    console.error("sendChatMessageStream non-streaming request failed:", error);
    onError(error);
  }
}
