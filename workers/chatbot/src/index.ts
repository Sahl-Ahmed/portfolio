export interface Env {
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_DATABASE_ID?: string;
}

// In-Memory Caches for Sahl's Portfolio Context & AI Config
let cachedContext: { data: any; timestamp: number } | null = null;
let cachedAiConfig: { data: any; timestamp: number } | null = null;

// In-memory fallback session store inside the Worker
const memorySessionStore: Record<string, {
  messages: any[];
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
  conversationSummary?: string;
}> = {};

// Cache for AI replies to avoid repetitive model calls
const sessionAiCache: Record<string, Record<string, { text: string; suggestions: string[]; timestamp: number }>> = {};

// Helper: Clean cache entries older than 1 hour
function cleanSessionAiCache() {
  const now = Date.now();
  for (const sessionId in sessionAiCache) {
    const sessionCache = sessionAiCache[sessionId];
    let hasValidEntries = false;
    for (const query in sessionCache) {
      if (now - sessionCache[query].timestamp > 60 * 60 * 1000) {
        delete sessionCache[query];
      } else {
        hasValidEntries = true;
      }
    }
    if (!hasValidEntries) {
      delete sessionAiCache[sessionId];
    }
  }
}

// Helper: Save successful response to cache
function saveToSessionAiCache(sessionId: string, query: string, text: string, suggestions: string[]) {
  if (!sessionAiCache[sessionId]) {
    sessionAiCache[sessionId] = {};
  }
  sessionAiCache[sessionId][query] = {
    text,
    suggestions,
    timestamp: Date.now()
  };
}

// Firestore REST Helpers
function parseFirestoreFields(fields: any): any {
  const result: any = {};
  if (!fields) return result;
  for (const [key, value] of Object.entries(fields)) {
    result[key] = parseFirestoreValue(value);
  }
  return result;
}

function parseFirestoreValue(value: any): any {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return parseInt(value.integerValue, 10);
  if ('doubleValue' in value) return parseFloat(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) {
    const values = value.arrayValue.values || [];
    return values.map((v: any) => parseFirestoreValue(v));
  }
  if ('mapValue' in value) {
    return parseFirestoreFields(value.mapValue.fields);
  }
  if ('nullValue' in value) return null;
  return value;
}

function convertToFirestoreFields(obj: any): any {
  const fields: any = {};
  for (const [key, val] of Object.entries(obj)) {
    const converted = convertToFirestoreValue(val);
    if (converted !== undefined) {
      fields[key] = converted;
    }
  }
  return fields;
}

function convertToFirestoreValue(val: any): any {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === 'string') {
    return { stringValue: val };
  }
  if (typeof val === 'boolean') {
    return { booleanValue: val };
  }
  if (typeof val === 'number') {
    if (Number.isInteger(val)) {
      return { integerValue: val.toString() };
    } else {
      return { doubleValue: val };
    }
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(item => convertToFirestoreValue(item))
      }
    };
  }
  if (typeof val === 'object') {
    return {
      mapValue: {
        fields: convertToFirestoreFields(val)
      }
    };
  }
  return undefined;
}

async function fetchFirestoreDoc(projectId: string, databaseId: string, path: string, apiKey: string): Promise<any> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/${path}?key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Firestore REST error: ${res.status} for doc path ${path}`);
  }
  const data: any = await res.json();
  return parseFirestoreFields(data.fields);
}

async function fetchFirestoreCollection(projectId: string, databaseId: string, collectionId: string, apiKey: string): Promise<any[]> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents:runQuery?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }]
      }
    })
  });
  if (!res.ok) {
    console.warn(`Firestore REST collection query failed for ${collectionId}: ${res.status}`);
    return [];
  }
  const items: any = await res.json();
  if (!Array.isArray(items)) {
    return [];
  }
  const results: any[] = [];
  for (const item of items) {
    if (item.document) {
      const doc = item.document;
      const fields = parseFirestoreFields(doc.fields);
      if (!fields.id && doc.name) {
        const parts = doc.name.split('/');
        fields.id = parts[parts.length - 1];
      }
      results.push(fields);
    }
  }
  return results;
}

async function getAiConfig(projectId: string, databaseId: string, apiKey: string): Promise<any> {
  const now = Date.now();
  if (cachedAiConfig && (now - cachedAiConfig.timestamp < 5 * 60 * 1000)) {
    return cachedAiConfig.data;
  }
  let aiConfig: any = {
    enabled: true,
    model: "gemini-3.5-flash",
    temperature: 0.7,
    maxOutputTokens: 1000,
    topP: 0.95,
    topK: 40,
    systemPrompt: "You are Ask Sahl AI. You represent Sahl Ahmed professionally...",
    aiProvider: "auto",
    groqModel: "llama-3.3-70b-versatile"
  };
  try {
    const data = await fetchFirestoreDoc(projectId, databaseId, "settings/ai_config", apiKey);
    if (data) {
      aiConfig = data;
    }
  } catch (err) {
    console.warn("Failed to fetch AI Settings from Firestore. Using fallback:", err);
  }
  cachedAiConfig = { data: aiConfig, timestamp: now };
  return aiConfig;
}

async function getSahlPortfolioContext(projectId: string, databaseId: string, apiKey: string): Promise<any> {
  const now = Date.now();
  if (cachedContext && (now - cachedContext.timestamp < 10 * 60 * 1000)) {
    return cachedContext.data;
  }

  try {
    const [
      skills,
      projects,
      experience,
      education,
      achievements,
      gallery,
      socials,
      about,
      contact
    ] = await Promise.all([
      fetchFirestoreCollection(projectId, databaseId, "skills", apiKey).catch(() => []),
      fetchFirestoreCollection(projectId, databaseId, "projects", apiKey).catch(() => []),
      fetchFirestoreCollection(projectId, databaseId, "experience", apiKey).catch(() => []),
      fetchFirestoreCollection(projectId, databaseId, "education", apiKey).catch(() => []),
      fetchFirestoreCollection(projectId, databaseId, "achievements", apiKey).catch(() => []),
      fetchFirestoreCollection(projectId, databaseId, "gallery", apiKey).catch(() => []),
      fetchFirestoreCollection(projectId, databaseId, "socials", apiKey).catch(() => []),
      fetchFirestoreDoc(projectId, databaseId, "about/info", apiKey).catch(() => ({})),
      fetchFirestoreDoc(projectId, databaseId, "contact/info", apiKey).catch(() => ({}))
    ]);

    const context = {
      skills,
      projects,
      experience,
      education,
      achievements,
      gallery,
      socials,
      about,
      contact
    };

    cachedContext = { data: context, timestamp: now };
    return context;
  } catch (err) {
    console.error("Error building portfolio context in Worker:", err);
    return {
      skills: [],
      projects: [],
      experience: [],
      education: [],
      achievements: [],
      gallery: [],
      socials: [],
      about: {},
      contact: {}
    };
  }
}

async function getSessionHistory(
  projectId: string,
  databaseId: string,
  apiKey: string,
  sessionId: string
): Promise<any[]> {
  try {
    const sessionDoc = await fetchFirestoreDoc(projectId, databaseId, `ai_sessions/${sessionId}`, apiKey);
    if (sessionDoc && Array.isArray(sessionDoc.messages)) {
      return sessionDoc.messages;
    }
  } catch (err) {
    console.warn(`[Worker History] Failed to fetch session history for ${sessionId} from Firestore. Falling back to memory:`, err);
  }
  const fbSession = memorySessionStore[sessionId];
  return fbSession ? (fbSession.messages || []) : [];
}

async function saveSessionToFirestore(
  projectId: string,
  databaseId: string,
  apiKey: string,
  sessionId: string,
  sessionData: any
): Promise<boolean> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/ai_sessions/${sessionId}?key=${apiKey}`;
  const fields = convertToFirestoreFields(sessionData);
  
  try {
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    });
    
    if (!res.ok) {
      console.error(`Failed to save session to Firestore: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Error saving session to Firestore via REST:", err);
    return false;
  }
}

// Sahl's Portfolio Knowledge Engine Logic Ported from server.ts

function detectLanguage(message: string): 'bangla' | 'banglish' | 'english' {
  const msgLower = message.toLowerCase();
  if (/[\u0980-\u09FF]/.test(message)) {
    return 'bangla';
  }
  const banglishWords = [
    'apnar', 'tomar', 'kivabe', 'sahajjo', 'kaj', 'skill', 'experian', 'contact', 'resume', 'dhonnobad', 'shundor', 'amake'
  ];
  if (banglishWords.some(word => msgLower.includes(word))) {
    return 'banglish';
  }
  return 'english';
}

function classifyQuestion(userMessage: string): 'direct' | 'analysis' | 'external' {
  const msgLower = userMessage.toLowerCase().trim();

  const directKeywords = [
    "about", "education", "experience", "project", "skill", "achievement", "resume", "cv", "gallery",
    "contact", "whatsapp", "facebook", "linkedin", "github", "youtube", "certificate", "software",
    "latest project", "latest video", "latest achievement", "category", "categories", "project count",
    "software list", "where do you live", "location", "address", "phone", "email", "mail", "hire", "work with",
    "repro", "repos", "channel", "social", "insta", "instagram", "portfolio", "sahl", "ahmed", "shahol",
    "যোগাযোগ", "ঠিকানা", "ফোন", "নাম্বার", "ইমেইল", "ভিডিও", "কাজ", "প্রজেক্ট", "স্কিল", "অভিজ্ঞতা", "ডিজাইন", "পড়াশোনা", "অর্জন", "রেজুমে", "জীবনবৃত্তান্ত", "সার্টিফিকেট", "ফলো", "লিঙ্ক",
    "hello", "hi", "hey", "hola", "greetings", "good morning", "good afternoon", "good evening", "how are you", "who are you", "হাই", "হ্যালো", "কেমন আছেন"
  ];

  const analysisKeywords = [
    "strongest skill", "best skill", "most used software", "most used", "frequent software",
    "most common category", "most common", "career summary", "project recommendation",
    "recommend a project", "software comparison", "compare software", "portfolio summary",
    "explain experience", "compare skills", "best work", "highlighted project", "top project", "most proud",
    "career goal", "why hire", "what do you do", "kind of work"
  ];

  const externalKeywords = [
    "weather", "temperature", "news", "politic", "president", "minister", "sports", "cricket", "football",
    "soccer", "movie", "cinema", "actor", "actress", "celebrity", "history", "science", "physics", "chemistry",
    "biology", "space", "earth", "planet", "math", "calculus", "algebra", "stock", "shares", "nasdaq",
    "country", "countries", "capital of", "population of", "who is", "what is the capital", "how many countries",
    "current events", "recipe", "how to cook", "tell me a joke", "write a poem", "solve", "translate",
    "who won", "score", "game of thrones", "minecraft", "playstation", "xbox", "nintendo", "crypto",
    "bitcoin", "ethereum", "dollar", "currency", "gold rate", "weather in", "unrelated", "programming language",
    "how to write a loop", "learn python", "javascript tutorial", "what is react", "how does a database work"
  ];

  const hasDirect = directKeywords.some(kw => msgLower.includes(kw));
  const hasAnalysis = analysisKeywords.some(kw => msgLower.includes(kw));
  const hasExternal = externalKeywords.some(kw => msgLower.includes(kw));

  if (hasExternal) {
    const selfRefs = ["sahl", "you", "your", "his", "him", "he", "she", "portfolio"];
    const hasSelfRef = selfRefs.some(ref => msgLower.includes(ref));
    if (!hasSelfRef) {
      return 'external';
    }
  }

  if (hasAnalysis) {
    return 'analysis';
  }

  if (hasDirect) {
    return 'direct';
  }

  const selfReferences = ["sahl", "you", "your", "his", "him", "he", "she", "portfolio", "career", "qualification", "resume", "cv", "project", "work", "skill", "contact", "experience", "education", "achievement"];
  if (selfReferences.some(ref => msgLower.includes(ref))) {
    return 'direct';
  }

  const banglaSelfRefs = ["তুমি", "আপনার", "তোমার", "সাহল", "পোর্টফোলিও", "কাজ", "প্রজেক্ট", "অভিজ্ঞতা", "ইমেইল", "যোগাযোগ"];
  if (banglaSelfRefs.some(ref => msgLower.includes(ref))) {
    return 'direct';
  }

  return 'external';
}

function extractAllSocialLinks(context: any): Record<string, string> {
  const links: Record<string, string> = {};

  const platforms = [
    { key: "whatsapp", patterns: [/whatsapp/i, /wa\.me/i, /phone/i, /mobile/i, /number/i] },
    { key: "email", patterns: [/email/i, /mail/i, /gmail/i] },
    { key: "facebook", patterns: [/facebook/i, /^fb$/i, /fb_page/i, /fb_profile/i] },
    { key: "linkedin", patterns: [/linkedin/i, /^li$/i] },
    { key: "github", patterns: [/github/i, /^gh$/i] },
    { key: "youtube", patterns: [/youtube/i, /^yt$/i] },
    { key: "instagram", patterns: [/instagram/i, /^ig$/i] },
    { key: "behance", patterns: [/behance/i] },
    { key: "artstation", patterns: [/artstation/i] },
    { key: "dribbble", patterns: [/dribbble/i] },
    { key: "portfolio", patterns: [/portfolio/i, /website/i] }
  ];

  const tryAdd = (platformKey: string, val: any) => {
    if (typeof val !== "string") return;
    const trimmed = val.trim();
    if (!trimmed) return;

    if (platformKey === "email") {
      if (trimmed.includes("@") && !trimmed.startsWith("http")) {
        links.email = trimmed.startsWith("mailto:") ? trimmed : `mailto:${trimmed}`;
      } else if (trimmed.startsWith("http") || trimmed.startsWith("mailto:")) {
        links.email = trimmed;
      }
    } else if (platformKey === "whatsapp") {
      if (trimmed.startsWith("http")) {
        links.whatsapp = trimmed;
      } else {
        const cleanNum = trimmed.replace(/[^0-9]/g, "");
        if (cleanNum.length >= 10) {
          const formattedNum = cleanNum.startsWith("88") ? cleanNum : `88${cleanNum}`;
          links.whatsapp = `https://wa.me/${formattedNum}`;
        }
      }
    } else {
      if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.includes(".")) {
        let url = trimmed;
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = `https://${url}`;
        }
        links[platformKey] = url;
      }
    }
  };

  if (context && Array.isArray(context.socials)) {
    context.socials.forEach((item: any) => {
      if (item && item.name && item.url) {
        const name = item.name.toLowerCase().trim();
        const url = item.url.trim();
        for (const p of platforms) {
          if (p.patterns.some(pattern => pattern.test(name))) {
            tryAdd(p.key, url);
          }
        }
      }
    });
  }

  const seenObjects = new Set<any>();
  const scanObj = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    if (seenObjects.has(obj)) return;
    seenObjects.add(obj);

    if (Array.isArray(obj)) {
      obj.forEach(scanObj);
      return;
    }

    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === "string") {
        const keyLower = key.toLowerCase();
        for (const p of platforms) {
          if (p.patterns.some(pattern => pattern.test(keyLower))) {
            tryAdd(p.key, val);
          }
        }
      } else if (val && typeof val === "object") {
        scanObj(val);
      }
    }
  };

  scanObj(context);
  return links;
}

function calculateSoftwareScores(context: any) {
  const scores: Record<string, {
    software: string;
    totalScore: number;
    experienceMonths: number;
    projectCount: number;
    moreWorksCount: number;
    featuredCount: number;
    achievementCount: number;
    galleryCount: number;
  }> = {};

  const skills = context.skills || [];
  const projects = context.projects || [];
  const gallery = context.gallery || [];
  const achievements = context.achievements || [];

  skills.forEach((skill: any) => {
    if (!skill || !skill.name) return;
    const name = skill.name.trim();
    const normalized = name.toLowerCase();

    let months = 0;
    if (skill.experienceStartedDate) {
      const startDate = new Date(skill.experienceStartedDate);
      const currentDate = new Date('2026-07-09');
      const yearsDiff = currentDate.getFullYear() - startDate.getFullYear();
      const monthsDiff = currentDate.getMonth() - startDate.getMonth();
      const total = (yearsDiff * 12) + monthsDiff;
      months = total > 0 ? total : 1;
    }

    scores[normalized] = {
      software: name,
      totalScore: months * 1,
      experienceMonths: months,
      projectCount: 0,
      moreWorksCount: 0,
      featuredCount: 0,
      achievementCount: 0,
      galleryCount: 0
    };
  });

  const getOrCreateEntry = (name: string) => {
    const normalized = name.toLowerCase().trim();
    if (!scores[normalized]) {
      scores[normalized] = {
        software: name.trim(),
        totalScore: 0,
        experienceMonths: 0,
        projectCount: 0,
        moreWorksCount: 0,
        featuredCount: 0,
        achievementCount: 0,
        galleryCount: 0
      };
    }
    return scores[normalized];
  };

  projects.forEach((proj: any) => {
    let softwareList: string[] = [];
    if (Array.isArray(proj.software)) {
      softwareList = proj.software;
    } else if (typeof proj.software === 'string') {
      softwareList = proj.software.split(',').map((s: string) => s.trim());
    }

    softwareList.forEach((sw) => {
      if (!sw) return;
      const entry = getOrCreateEntry(sw);
      entry.projectCount++;
      entry.totalScore += 5;

      if (proj.featured === true) {
        entry.featuredCount++;
        entry.totalScore += 10;
      }
    });
  });

  gallery.forEach((g: any) => {
    let softwareList: string[] = [];
    if (Array.isArray(g.software)) {
      softwareList = g.software;
    } else if (typeof g.software === 'string') {
      softwareList = g.software.split(',').map((s: string) => s.trim());
    }

    softwareList.forEach((sw) => {
      if (!sw) return;
      const entry = getOrCreateEntry(sw);
      entry.moreWorksCount++;
      entry.galleryCount++;
      entry.totalScore += 3 + 2;
    });
  });

  achievements.forEach((ach: any) => {
    const title = (ach.title || "").toLowerCase();
    const desc = (ach.description || "").toLowerCase();
    
    Object.values(scores).forEach((entry) => {
      const swLower = entry.software.toLowerCase();
      if (title.includes(swLower) || desc.includes(swLower)) {
        entry.achievementCount++;
        entry.totalScore += 4;
      }
    });
  });

  return Object.values(scores).sort((a, b) => b.totalScore - a.totalScore);
}

function generateStrongestSoftwareExplanation(strongest: any, lang: 'bangla' | 'banglish' | 'english') {
  const { software, totalScore, experienceMonths, projectCount, moreWorksCount, featuredCount, achievementCount } = strongest;
  
  if (lang === 'bangla') {
    return `সাহল আহমেদের ডাটাবেজ বিশ্লেষণ অনুযায়ী তার সবচেয়ে শক্তিশালী সফটওয়্যার হলো **${software}** (মোট স্কোর: **${totalScore}** পয়েন্ট)।
  
এই সফটওয়্যারটি সেরা হিসেবে নির্বাচিত হওয়ার কারণসমূহ নিচে বিস্তারিত দেওয়া হলো:
• **অভিজ্ঞতার সময়কাল**: সাহল আহমেদ এই সফটওয়্যারে প্রায় **${experienceMonths} মাস** প্রফেশনাল লেভেলে কাজ করছেন (১ পয়েন্ট/মাস হিসেবে স্কোর: ${experienceMonths} পয়েন্ট)।
• **পোর্টফোলিও প্রজেক্ট**: তিনি এটি ব্যবহার করে **${projectCount}টি মূল পোর্টফোলিও প্রজেক্ট** সম্পন্ন করেছেন (৫ পয়েন্ট/প্রজেক্ট হিসেবে স্কোর: ${projectCount * 5} পয়েন্ট)।
${featuredCount > 0 ? `• **ফিচার্ড মাস্টারপিস**: এর মধ্যে **${featuredCount}টি প্রজেক্ট ফিচার্ড মাস্টারপিস** হিসেবে ডিজাইন সেকশনে রয়েছে (১০ এক্সট্রা পয়েন্ট/ফিচার্ড প্রজেক্ট হিসেবে স্কোর: ${featuredCount * 10} পয়েন্ট)।\n` : ''}${moreWorksCount > 0 ? `• **গ্যালারি ও প্র্যাকটিস কাজ**: তার **${moreWorksCount}টি গ্যালারি ও প্র্যাকটিস প্রজেক্টে** এই টুলের সরাসরি ব্যবহার রয়েছে (৫ পয়েন্ট/গ্যালারি রেফারেন্স হিসেবে স্কোর: ${moreWorksCount * 5} পয়েন্ট)।\n` : ''}${achievementCount > 0 ? `• **অ্যাওয়ার্ড ও অর্জন রেফারেন্স**: **${achievementCount}টি আন্তর্জাতিক সম্মাননা/অর্জন**-এ এই সফটওয়্যারের কাজের রেফারেন্স রয়েছে (৪ পয়েন্ট/অর্জন হিসেবে স্কোর: ${achievementCount * 4} পয়েন্ট)।` : ''}`;
  } else if (lang === 'banglish') {
    return `Sahl Ahmed er dynamic database analysis anujayi tar shobcheye strongest software holo **${software}** (Total Score: **${totalScore}**)।
  
Ata strongest hobar mukhho karon gulo holo:
• **Experience Duration**: Sahl er ai software e pray **${experienceMonths} Months** er active experience ache (Score: ${experienceMonths} points)।
• **Portfolio Projects**: Sahl eta diye core **${projectCount} ti key projects** build korechen (Score: ${projectCount * 5} points)।
${featuredCount > 0 ? `• **Featured Masterpieces**: Er moddhe **${featuredCount} ti featured project** royeche (Score: ${featuredCount * 10} points)।\n` : ''}${moreWorksCount > 0 ? `• **Gallery works**: **${moreWorksCount} ti gallery details** e eta use kora hoyeche (Score: ${moreWorksCount * 5} points)।\n` : ''}${achievementCount > 0 ? `• **Achievements Reference**: Tar **${achievementCount} ti industry award/achievements** database e er direct mention royeche (Score: ${achievementCount * 4} points)।` : ''}`;
  } else {
    return `According to Sahl Ahmed's dynamic scoring engine, Sahl's strongest core software is **${software}** with an overall score of **${totalScore}**.
  
Here is the explainable breakdown of why **${software}** is ranked as Sahl's strongest tool:
- **Professional Experience**: Sahl has over **${experienceMonths} months** of active professional experience using this tool (Scoring **${experienceMonths} points**).
- **Portfolio Projects**: It is integrated into **${projectCount} main portfolio projects** (Scoring **${projectCount * 5} points**).
${featuredCount > 0 ? `- **Featured Masterpieces**: Among those, **${featuredCount} are recognized as Featured Masterpieces** (Adding an extra **${featuredCount * 10} points**).\n` : ''}${moreWorksCount > 0 ? `- **Gallery & Practical Studies**: It is featured in **${moreWorksCount} daily practice and gallery artworks** (Scoring **${moreWorksCount * 5} points**).\n` : ''}${achievementCount > 0 ? `- **Industry Achievements**: Sahl's mastery of this software is referenced in **${achievementCount} global industry awards and achievements** (Adding **${achievementCount * 4} points**).` : ''}`;
  }
}

function runFuzzyContextSearch(userMessage: string, context: any) {
  const msgLower = userMessage.toLowerCase().trim();
  
  if (context.projects && Array.isArray(context.projects)) {
    for (const proj of context.projects) {
      const titleLower = (proj.title || "").toLowerCase();
      if (titleLower && (msgLower.includes(titleLower) || titleLower.includes(msgLower))) {
        return {
          text: `Here is Sahl's project **${proj.title}** (${proj.subtitle || proj.category || ""}):\n\n${proj.description || ""}\n\n*Tools used*: ${Array.isArray(proj.software) ? proj.software.join(', ') : proj.software || ""}`,
          suggestions: ["Show Latest Projects", "Contact Sahl"]
        };
      }
    }
  }

  if (context.skills && Array.isArray(context.skills)) {
    for (const skill of context.skills) {
      const nameLower = (skill.name || "").toLowerCase();
      if (nameLower && (msgLower.includes(nameLower) || nameLower.includes(msgLower))) {
        return {
          text: `Yes, Sahl is skilled in **${skill.name}** with a level of **${skill.level || "Expert"}** out of 100.\n\nSahl regularly applies this skill across his creative projects.`,
          suggestions: ["Show Skills", "Show Experience"]
        };
      }
    }
  }

  if (context.achievements && Array.isArray(context.achievements)) {
    for (const ach of context.achievements) {
      const titleLower = (ach.title || "").toLowerCase();
      if (titleLower && (msgLower.includes(titleLower) || titleLower.includes(msgLower))) {
        return {
          text: `🏆 **${ach.title}** (${ach.category || ""}):\n\n${ach.description || ""}`,
          suggestions: ["Latest Achievement", "Contact Sahl"]
        };
      }
    }
  }

  return null;
}

function runSmartResponseEngine(userMessage: string, context: any, lang: 'bangla' | 'banglish' | 'english') {
  const msgLower = userMessage.toLowerCase().trim();

  const getSoftwareUsage = () => {
    const counts: { [key: string]: number } = {};
    const projs = context.projects || [];
    const gallery = context.gallery || [];
    const allItems = [...projs, ...gallery];

    allItems.forEach((p: any) => {
      let swList: string[] = [];
      if (Array.isArray(p.software)) {
        swList = p.software;
      } else if (typeof p.software === 'string') {
        swList = p.software.split(',').map((s: string) => s.trim());
      }
      swList.forEach((sw) => {
        if (!sw) return;
        const normalized = sw.trim();
        counts[normalized] = (counts[normalized] || 0) + 1;
      });
    });

    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return { sorted, highest: sorted[0]?.[0] || "Figma" };
  };

  const getCategoryUsage = () => {
    const counts: { [key: string]: number } = {};
    const projs = context.projects || [];
    projs.forEach((p: any) => {
      if (p.category) {
        counts[p.category] = (counts[p.category] || 0) + 1;
      }
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || "UI/UX";
  };

  const translateSoftwareQuery = (query: string): string => {
    const translations: { [key: string]: string } = {
      "মায়া": "maya",
      "মায়া": "maya",
      "ফিগমা": "figma",
      "ফটোশপ": "photoshop",
      "ইলাস্ট্রেটর": "illustrator",
      "আফটার ইফেক্টস": "after effects",
      "আফটার ইফেক্ট": "after effects",
      "ব্লেন্ডার": "blender",
      "প্রিমিয়ার": "premiere",
      "থ্রিডি": "3d",
      "৩ডি": "3d",
      "ইউআই": "ui",
      "ইউএক্স": "ux"
    };
    let result = query;
    for (const [bangla, english] of Object.entries(translations)) {
      if (query.includes(bangla)) {
        result += " " + english;
      }
    }
    return result;
  };

  // 1. INTENT DETECT: About Sahl
  const hasSpecificKeyword = [
    "experience", "work", "job", "career", "employment", "history", "background",
    "skill", "project", "education", "study", "university", "achievement", "award",
    "contact", "email", "whatsapp", "phone", "social", "behance", "dribbble", "github", "linkedin", "youtube",
    "অভিজ্ঞতা", "চাকরি", "কাজ", "প্রজেক্ট", "স্কিল", "পড়াশোনা", "অর্জন", "যোগাযোগ"
  ].some(kw => msgLower.includes(kw));

  if (
    !hasSpecificKeyword && (
      msgLower.includes("about you") || 
      msgLower.includes("tell me about yourself") || 
      msgLower.includes("who are you") || 
      msgLower.includes("introduce yourself") || 
      msgLower.includes("about sahl") || 
      msgLower.includes("কে আপনি") || 
      msgLower.includes("সম্পর্কে") ||
      msgLower === "sahl" ||
      msgLower === "sahl ahmed"
    )
  ) {
    const skills = context.skills || [];
    const mainSkills = skills.slice(0, 3).map((s: any) => s.name).join(", ");
    return {
      text: lang === 'bangla'
        ? `আমি হচ্ছি **Ask Sahl AI**, সাহল আহমেদের অফিসিয়াল ভার্চুয়াল অ্যাসিস্ট্যান্ট। 
        
সাহল আহমেদ একজন প্রফেশনাল **UI/UX ডিজাইনার**, **৩ডি ইন্টারেক্টিভ মকআপ ডিজাইনার** এবং **মোশন গ্রাফিক্স আর্টিস্ট**। তিনি দৃষ্টিনন্দন ও ব্যবহারকারী-বান্ধব ইন্টারফেস ডিজাইন করতে ভালোবাসেন। তার মূল দক্ষতাসমূহ হলো: ${mainSkills || "UI/UX, 3D Design, Motion Graphics"}।
Web app এ সরাসরি সাহল আহমেদের যোগ্যতা ও অভিজ্ঞতা জানার জন্য যেকোনো প্রশ্ন করতে পারেন!`
        : lang === 'banglish'
        ? `Ami holam **Ask Sahl AI**, Sahl Ahmed er official digital assistant.
        
Sahl Ahmed ekjon professional **UI/UX Designer**, **3D Interactive Mockup Designer**, ebong **Motion Graphics Artist**. Tar key skills holo: ${mainSkills || "UI/UX, 3D Design, Motion Graphics"}।
Apni tar portfolio projects, credentials, skills ba jobs niye jekono prosno amake korte paren!`
        : `I am **Ask Sahl AI**, the official virtual assistant for Sahl Ahmed.
        
Sahl Ahmed is a professional **UI/UX Designer**, **3D Interactive Mockup Designer**, and **Motion Graphics Artist** dedicated to crafting highly interactive and visually stunning interfaces. His core expertise lies in **${mainSkills || "UI/UX Design, Autodesk Maya, and Motion Graphics"}**.
Feel free to ask me about his work experience, academic background, creative projects, or click one of the quick chips below to get in touch!`,
      suggestions: ["Show Latest Projects", "Show Skills", "Contact Sahl"]
    };
  }

  // 2. INTENT DETECT: Contact Details
  if (
    msgLower.includes("contact") || 
    msgLower.includes("whatsapp") || 
    msgLower.includes("email") || 
    msgLower.includes("linkedin") || 
    msgLower.includes("github") || 
    msgLower.includes("facebook") || 
    msgLower.includes("youtube") || 
    msgLower.includes("instagram") || 
    msgLower.includes("behance") || 
    msgLower.includes("artstation") || 
    msgLower.includes("dribbble") || 
    msgLower === "portfolio website" || 
    msgLower === "portfolio link" || 
    msgLower.includes("your website link") || 
    msgLower.includes("sahl's portfolio website") || 
    msgLower.includes("website url") || 
    msgLower.includes("portfolio url") ||
    msgLower.includes("social link") || 
    msgLower.includes("hire") || 
    msgLower.includes("work with") ||
    msgLower.includes("যোগাযোগ") ||
    msgLower.includes("নাম্বার") ||
    msgLower.includes("লিঙ্ক") ||
    msgLower.includes("fb") ||
    msgLower.includes("yt")
  ) {
    const socialLinksMap = extractAllSocialLinks(context);
    
    const labels: Record<string, string> = {
      whatsapp: "💬 **WhatsApp**",
      email: "✉️ **Email**",
      facebook: "👥 **Facebook**",
      linkedin: "🔗 **LinkedIn**",
      github: "💻 **GitHub**",
      youtube: "📺 **YouTube**",
      instagram: "📸 **Instagram**",
      behance: "🎨 **Behance**",
      artstation: "🖌️ **ArtStation**",
      dribbble: "🏀 **Dribbble**",
      portfolio: "🌐 **Portfolio Website**",
    };

    const displayNames: Record<string, string> = {
      whatsapp: "WhatsApp",
      email: "Email",
      facebook: "Facebook",
      linkedin: "LinkedIn",
      github: "GitHub",
      youtube: "YouTube",
      instagram: "Instagram",
      behance: "Behance",
      artstation: "ArtStation",
      dribbble: "Dribbble",
      portfolio: "Portfolio Website"
    };

    const linksList: string[] = [];
    Object.entries(socialLinksMap).forEach(([key, url]) => {
      const label = labels[key] || `🔗 **${key.toUpperCase()}**`;
      if (key === 'whatsapp') {
        linksList.push(`• ${label}: [Chat directly](${url})`);
      } else if (key === 'email') {
        const emailAddr = url.replace("mailto:", "");
        linksList.push(`• ${label}: [${emailAddr}](${url})`);
      } else {
        linksList.push(`• ${label}: [Open Profile](${url})`);
      }
    });

    const formattedLinks = linksList.length > 0 
      ? linksList.join("\n") 
      : (lang === 'bangla' ? "কোনো সোশ্যাল লিঙ্ক খুঁজে পাওয়া যায়নি।" : "No social profiles found.");

    const dynamicContactButtons = Object.entries(socialLinksMap).map(([key, url]) => ({
      name: displayNames[key] || (key.charAt(0).toUpperCase() + key.slice(1)),
      url
    }));

    if (lang === 'bangla') {
      return {
        text: `সাহল আহমেদের সাথে যোগাযোগের অফিসিয়াল মাধ্যমসমূহ নিচে দেওয়া হলো:
  
${formattedLinks}
  
আপনি চাইলে সরাসরি নিচের **Contact Form** ব্যবহার করেও সাহলের সাথে যোগাযোগ করতে পারেন!`,
        suggestions: ["Show Latest Projects", "Show Skills"],
        dynamicContactButtons
      };
    } else if (lang === 'banglish') {
      return {
        text: `Sahl Ahmed er sathe direct contact korar details niche deya holo:
  
${formattedLinks}
  
Apni direct amader page er niche thaka **Contact Form** fill up koreo message pathate paren!`,
        suggestions: ["Show Latest Projects", "Show Skills"],
        dynamicContactButtons
      };
    } else {
      return {
        text: `Here are Sahl Ahmed's direct and official contact channels:
  
${formattedLinks}
  
Feel free to fill out the **Contact Form** at the bottom of Sahl's portfolio page to start a project!`,
        suggestions: ["Show Latest Projects", "Show Skills"],
        dynamicContactButtons
      };
    }
  }

  // 3. INTENT DETECT: Resume / CV
  if (msgLower.includes("resume") || msgLower.includes("cv") || msgLower.includes("রেজুমে") || msgLower.includes("জীবনবৃত্তান্ত")) {
    return {
      text: lang === 'bangla' 
        ? `সাহল আহমেদের প্রফেশনাল যোগ্যতা এবং দক্ষতার বিবরণ পোর্টফোলিওর **Credential Station** সেকশনে সরাসরি দেখতে পারেন।`
        : lang === 'banglish'
        ? `Sahl Ahmed er professional qualifications and skills details direct page er **Credential Station** section e dekhte parben.`
        : `You can explore Sahl Ahmed's professional qualifications, educational background, and software skills directly under the **Credential Station** section on Sahl Ahmed's portfolio.`,
      suggestions: ["Show Latest Projects", "Contact Sahl"]
    };
  }

  // 4. INTENT DETECT: Address
  if (msgLower.includes("address") || msgLower.includes("location") || msgLower.includes("where do you live") || msgLower.includes("ঠিকানা") || msgLower.includes("বাসা") || msgLower.includes("coordinates")) {
    return {
      text: lang === 'bangla'
        ? `সাহল আহমেদ **ঢাকা, বাংলাদেশ**-এ বসবাস করেন এবং এখান থেকেই বিশ্বব্যাপী রিমোট প্রজেক্টে কাজ করে থাকেন।`
        : lang === 'banglish'
        ? `Sahl Ahmed **Dhaka, Bangladesh** e thaken, ebong ekan thekei remote/freelance kaj koren.`
        : `Sahl Ahmed is located in **Dhaka, Bangladesh**. He is open to remote roles globally and local collaborations in Dhaka.`,
      suggestions: ["Contact Sahl", "Show Latest Projects"]
    };
  }

  // 5. INTENT DETECT: YouTube Links
  if (msgLower.includes("youtube video") || msgLower.includes("latest video") || msgLower.includes("ইউটিউব") || msgLower.includes("ভিডিও")) {
    return {
      text: lang === 'bangla'
        ? `সাহলের সর্বশেষ ইউটিউব ভিডিও এবং ডিজাইন টিউটোরিয়ালগুলো দেখতে সরাসরি তার অফিসিয়াল চ্যানেল ভিজিট করুন:
 
📺 **[Shahol Ahmed YouTube Channel](https://www.youtube.com/@ShaholAhmed-006)**`
        : lang === 'banglish'
        ? `Sahl er latest designs tutorial video dekte primary YouTube channel a click korun:
 
📺 **[Shahol Ahmed YouTube Channel](https://www.youtube.com/@ShaholAhmed-006)**`
        : `You can watch Sahl's latest motion graphics renders, UI tutorials, and behind-the-scenes walkthroughs directly on his official YouTube channel:
 
📺 **[@ShaholAhmed-006 on YouTube](https://www.youtube.com/@ShaholAhmed-006)**`,
      suggestions: ["Show Latest Projects", "Show Motion Graphics"]
    };
  }

  // 6. INTENT DETECT: Most Used Software
  if (msgLower.includes("software do you use most") || msgLower.includes("software you use most") || msgLower.includes("most used software") || msgLower.includes("most used tool") || msgLower.includes("software comparison")) {
    const sortedScores = calculateSoftwareScores(context);
    const listFormatted = sortedScores.map((entry) => `• **${entry.software}** - Dynamic Score: **${entry.totalScore}** (Used in ${entry.projectCount} projects, ${entry.moreWorksCount} gallery items)`).join('\n');
    const highest = sortedScores[0]?.software || "Figma";
    
    return {
      text: lang === 'bangla'
        ? `সাহলের পোর্টফোলিও ডাটাবেস ও গ্যালারি বিশ্লেষণ করে দেখা গেছে যে তার সবচেয়ে বেশি ব্যবহৃত সফটওয়্যার হলো **${highest}**।
  
সাহলের ব্যবহৃত মূল সফটওয়্যারসমূহ এবং তাদের ডাইনামিক স্কোর (র‍্যাঙ্কিং):
${listFormatted}`
        : lang === 'banglish'
        ? `Sahl er overall projects database analyze kore dekha gese je tar shobcheye besi use kora software holo **${highest}**।
  
Main software list and rankings (dynamic scoring analysis):
${listFormatted}`
        : `By running our automated scoring engine across Sahl Ahmed's published projects, gallery, and achievements, his most utilized software is **${highest}**.
  
Here is Sahl Ahmed's software ranking breakdown based on dynamic weights (Experience, Projects, Gallery, and Achievements):
${listFormatted}`,
      suggestions: ["Show Skills", "Show Latest Projects"]
    };
  }

  // 7. INTENT DETECT: Most Common Category
  if (msgLower.includes("kind of work do you do most") || msgLower.includes("work you do most") || msgLower.includes("kind of projects") || msgLower.includes("most common category")) {
    const highestCat = getCategoryUsage();
    return {
      text: lang === 'bangla'
        ? `সাহল আহমেদ মূলত **${highestCat}** বিভাগে সবচেয়ে বেশি প্রজেক্ট করে থাকেন। তিনি একজন দক্ষ ক্রিয়েটিভ ডিজাইনার হিসেবে ইন্টারেক্টিভ ইন্টারফেস ডিজাইন এবং ভিজ্যুয়াল ব্র্যান্ডিংয়ে পারদর্শী।`
        : lang === 'banglish'
        ? `Sahl mainy **${highestCat}** category e shobcheye besi kaj kore thaken. UI/UX dynamically solve korte tar khub bhalo lage.`
        : `Based on a comprehensive analysis of Sahl's portfolio database, he produces works most frequently in the **${highestCat}** category, focusing on building high-fidelity interactive solutions.`,
      suggestions: ["Show Latest Projects", "Show UI UX Projects"]
    };
  }

  // 8. INTENT DETECT: Strongest Skill
  if (
    msgLower.includes("strongest skill") || 
    msgLower.includes("best skill") || 
    msgLower.includes("strongest core skill") || 
    msgLower.includes("compare skills") ||
    msgLower.includes("strongest software") ||
    msgLower.includes("best software") ||
    msgLower.includes("software are you strongest") ||
    msgLower.includes("software are you best") ||
    msgLower.includes("what is sahl's strongest") ||
    msgLower.includes("what is sahl's best")
  ) {
    const sortedScores = calculateSoftwareScores(context);
    if (sortedScores.length > 0) {
      const strongest = sortedScores[0];
      const textExplanation = generateStrongestSoftwareExplanation(strongest, lang);
      return {
        text: textExplanation,
        suggestions: ["Show Skills", "Show Latest Projects"]
      };
    }

    const skills = context.skills || [];
    const sorted = [...skills].sort((a: any, b: any) => {
      const lvA = parseInt(a.level) || 0;
      const lvB = parseInt(b.level) || 0;
      return lvB - lvA;
    });
    const strongest = sorted[0]?.name || "UI/UX Design & 3D Interactive Mockups";
    return {
      text: lang === 'bangla'
        ? `সাহল আহমেদের প্রধান এবং সবচেয়ে শক্তিশালী দক্ষতা হলো **${strongest}**। তিনি প্রতিটি প্রজেক্টে এই দক্ষতা কাজে লাগিয়ে চমৎকার ইউজার এক্সপেরিয়েন্স তৈরি করেন।`
        : lang === 'banglish'
        ? `Sahl er database anujayi tar strongest core skill holo **${strongest}**।`
        : `According to Sahl's Skills collection, his strongest registered skill is **${strongest}**, representing exceptional proficiency and hands-on professional mastery.`,
      suggestions: ["Show Skills", "Show Latest Projects"]
    };
  }

  // 9. INTENT DETECT: Education
  if (msgLower.includes("education") || msgLower.includes("study") || msgLower.includes("university") || msgLower.includes("college") || msgLower.includes("school") || msgLower.includes("পড়াশোনা") || msgLower.includes("বিশ্ববিদ্যালয়")) {
    const edu = context.education || [];
    if (edu.length > 0) {
      const formatted = edu.map((e: any) => `🎓 **${e.degree || "Education"}** - ${e.school || "Institution"}\n*${e.year || ""}*\n${e.description || ""}`).join('\n\n');
      return {
        text: lang === 'bangla'
          ? `সাহল আহমেদের শিক্ষাগত যোগ্যতা নিচে দেওয়া হলো:
 
${formatted}`
          : lang === 'banglish'
          ? `Sahl Ahmed er education qualifications list niche kheyal korun:
 
${formatted}`
          : `Here is the academic background of Sahl Ahmed:
 
${formatted}`,
        suggestions: ["Show Experience", "Contact Sahl"]
      };
    }
  }

  // 10. INTENT DETECT: Experience
  if (
    msgLower.includes("experience") || 
    msgLower.includes("work experience") || 
    msgLower.includes("career") || 
    msgLower.includes("professional experience") || 
    msgLower.includes("employment") || 
    msgLower.includes("job") || 
    msgLower.includes("work history") || 
    msgLower.includes("background") || 
    msgLower.includes("job history") || 
    msgLower.includes("explain experience") || 
    msgLower.includes("career summary") || 
    msgLower.includes("portfolio summary") || 
    msgLower.includes("অভিজ্ঞতা") || 
    msgLower.includes("চাকরি")
  ) {
    const exp = context.experience || [];
    if (exp.length > 0) {
      const formatted = exp.map((e: any) => `💼 **${e.role || "Professional Role"}** at **${e.company || "Company"}**\n*${e.duration || ""}*\n${e.description || ""}`).join('\n\n');
      return {
        text: lang === 'bangla'
          ? `সাহল আহমেদের প্রফেশনাল কাজের অভিজ্ঞতা নিচে দেওয়া হলো:
 
${formatted}`
          : lang === 'banglish'
          ? `Sahl Ahmed er real job/freelance experience gulo niche kheyal korun:
  
${formatted}`
          : `Sahl Ahmed's professional experience and track record:
 
${formatted}`,
        suggestions: ["Show Skills", "Show Latest Projects"]
      };
    }
  }

  // 11. INTENT DETECT: Achievements
  if (msgLower.includes("achievements") || msgLower.includes("achievement") || msgLower.includes("awards") || msgLower.includes("award") || msgLower.includes("latest achievement") || msgLower.includes("অর্জন") || msgLower.includes("পুরস্কার")) {
    const ach = context.achievements || [];
    if (ach.length > 0) {
      const formatted = ach.map((e: any) => `🏆 **${e.title || "Achievement"}**\n*${e.category || ""}*\n${e.description || ""}`).join('\n\n');
      return {
        text: lang === 'bangla'
          ? `সাহল আহমেদের উল্লেখযোগ্য কিছু অর্জন ও স্বীকৃতি নিচে দেওয়া হলো:
 
${formatted}`
          : lang === 'banglish'
          ? `Sahl Ahmed er structural achievements and rewards list niche roilo:
 
${formatted}`
          : `Here are Sahl Ahmed's notable awards, achievements, and recognition:
 
${formatted}`,
        suggestions: ["Show Latest Projects", "Contact Sahl"]
      };
    }
  }

  // 12. INTENT DETECT: Skills List
  if (msgLower === "show skills" || msgLower.includes("what skills") || msgLower.includes("skills list")) {
    const skills = context.skills || [];
    if (skills.length > 0) {
      const formatted = skills.map((s: any) => `• **${s.name}** (${s.level || "Expert"})`).join('\n');
      return {
        text: `Here is Sahl Ahmed's full skills list from his database:\n\n${formatted}`,
        suggestions: ["Show Experience", "What software do you use most?"]
      };
    }
  }

  // 13. INTENT DETECT: Certificates
  if (msgLower.includes("certificate") || msgLower.includes("certification") || msgLower.includes("সার্টিফিকেট")) {
    const certs = context.certificates || [];
    if (certs.length > 0) {
      const formatted = certs.map((c: any) => `📜 **${c.title}** - Issued by **${c.issuer || "Authority"}**\n*Credential ID: ${c.credentialId || "N/A"}*`).join('\n\n');
      return {
        text: `Here are Sahl Ahmed's professional certifications:\n\n${formatted}`,
        suggestions: ["Show Experience", "Show Skills"]
      };
    }
  }

  // 14. INTENT DETECT: Gallery Artwork
  if (msgLower.includes("gallery") || msgLower.includes("image") || msgLower.includes("photo") || msgLower.includes("art") || msgLower.includes("গ্যালারি") || msgLower.includes("ছবি")) {
    const gallery = context.gallery || [];
    if (gallery.length > 0) {
      const formatted = gallery.slice(0, 5).map((g: any) => `🖼️ **${g.title || "Artwork"}**\n*Software: ${g.software || "Design Software"}*\nCategory: ${g.category || "Design"}`).join('\n\n');
      return {
        text: lang === 'bangla'
          ? `সাহল আহমেদের ডিজাইন গ্যালারির কিছু চমৎকার কাজ নিচে দেওয়া হলো:\n\n${formatted}`
          : lang === 'banglish'
          ? `Sahl Ahmed er dynamic design gallery er kisu details niche deya holo:\n\n${formatted}`
          : `Here are some featured artwork entries from Sahl Ahmed's visual gallery:\n\n${formatted}`,
        suggestions: ["Show Latest Projects", "Contact Sahl"]
      };
    }
  }

  // 15. INTENT DETECT: Project recommendations/search fuzzy
  const fuzzy = runFuzzyContextSearch(userMessage, context);
  if (fuzzy) {
    return fuzzy;
  }

  const searchKey = translateSoftwareQuery(msgLower);
  const projs = context.projects || [];
  
  const matchedProjects = projs.filter((p: any) => {
    const title = (p.title || "").toLowerCase();
    const subtitle = (p.subtitle || "").toLowerCase();
    const category = (p.category || "").toLowerCase();
    const desc = (p.description || "").toLowerCase();
    const swList = Array.isArray(p.software)
      ? p.software.map((s: string) => s.toLowerCase())
      : (p.software || "").toLowerCase().split(",").map((s: string) => s.trim());

    return title.includes(searchKey) || 
           searchKey.includes(title) || 
           category.includes(searchKey) || 
           searchKey.includes(category) || 
           desc.includes(searchKey) ||
           swList.some((sw: string) => sw.includes(searchKey) || searchKey.includes(sw));
  });

  if (matchedProjects.length > 0) {
    const formatted = matchedProjects.map((m: any) => `✨ **${m.title}**\n${m.subtitle || ""}\n*Category: ${m.category || "Design"}* | *Tools: ${Array.isArray(m.software) ? m.software.join(', ') : m.software || ""}*\n${m.description || ""}`).join('\n\n');
    return {
      text: `Here are Sahl Ahmed's projects matching your search query **"${userMessage}"**:\n\n${formatted}`,
      suggestions: ["Show Latest Project", "Show Skills", "Contact Sahl"]
    };
  }

  // 16. INTENT DETECT: Latest Project
  if (msgLower.includes("latest project") || msgLower.includes("show latest project") || msgLower.includes("latest work") || msgLower.includes("latest video") || msgLower.includes("latest content")) {
    const projsList = context.projects || [];
    if (projsList.length > 0) {
      const latest = projsList[0];
      return {
        text: `Here is Sahl Ahmed's **Latest Project** published on his portfolio:
 
🎨 **${latest.title}**
*${latest.subtitle || ""}* | **Category**: ${latest.category || "Design"}
*Armory / Tools Used*: **${Array.isArray(latest.software) ? latest.software.join(', ') : latest.software || ""}**
 
**Description**:
${latest.description || ""}
 
${latest.deliverables ? `**Deliverables**: \n${latest.deliverables.filter(Boolean).map((d: string) => `• ${d}`).join('\n')}` : ""}`,
        suggestions: ["Show UI UX Projects", "Contact Sahl"]
      };
    }
  }

  return null;
}

async function handleConversationIntent(
  userMessage: string,
  sessionId: string,
  context: any,
  detectedLang: 'bangla' | 'banglish' | 'english',
  aiConfig: any,
  projectId: string,
  databaseId: string,
  apiKey: string
): Promise<{ text: string; suggestions: string[]; dynamicContactButtons?: any[]; navigationSection?: string; projects?: any[] } | null> {
  const msgLower = userMessage.toLowerCase().trim();
  const cleanMsg = msgLower.replace(/[?,.!]/g, "").trim();

  const greetingWords = ["hello", "hi", "hey", "greetings", "good morning", "good evening", "how are you", "how’re you", "how're you", "how are u", "yo", "hola", "হাই", "হ্যালো", "কেমন আছেন"];
  const isGreeting = greetingWords.some(g => cleanMsg === g || cleanMsg.startsWith(g + " ") || cleanMsg.endsWith(" " + g));

  const introWords = [
    "who are you", "who r you", "who r u", "who are u", "introduce yourself", "introduce",
    "tell me about yourself", "tell me about u", "tell me about you", "about yourself", "about u",
    "tell me about sahl", "about sahl", "who is sahl", "who is sahul", "ke sahul", "কে আপনি", "সম্পর্কে", "sahl", "sahl ahmed"
  ];
    const hasSpecificKeyword = [
      "experience", "work", "job", "career", "employment", "history", "background",
      "skill", "project", "education", "study", "university", "achievement", "award",
      "contact", "email", "whatsapp", "phone", "social", "behance", "dribbble", "github", "linkedin", "youtube",
      "অভিজ্ঞতা", "চাকরি", "কাজ", "প্রজেক্ট", "স্কিল", "পড়াশোনা", "অর্জন", "যোগাযোগ"
    ].some(kw => msgLower.includes(kw));

    const isIntro = !hasSpecificKeyword && introWords.some(w => cleanMsg === w || cleanMsg.includes("about yourself") || cleanMsg.includes("about sahl") || cleanMsg.includes("tell me about yourself") || cleanMsg.includes("who are you") || cleanMsg.includes("introduce yourself") || cleanMsg === "sahl");

  const navigationVerbs = ["show", "open", "go to", "take me to", "view", "see", "browse", "explore", "navigate to", "scroll to", "take me"];
  const hasNavVerb = navigationVerbs.some(verb => cleanMsg.startsWith(verb + " ") || cleanMsg.includes(" " + verb + " "));

  const masterpiecePhrases = [
    "best works", "best project", "best projects", "top projects", "featured work", "my favorite works", 
    "show your best design", "masterpiece", "masterpieces", "featured masterpieces", "featured", "flagship", 
    "top works", "best design", "finest"
  ];
  const isMasterpiece = masterpiecePhrases.some(phrase => cleanMsg === phrase || cleanMsg.includes(phrase)) || (hasNavVerb && (cleanMsg.includes("projects") || cleanMsg.includes("works") || cleanMsg.includes("designs")));
  const isProjects = isMasterpiece;

  const moreWorkPhrases = [
    "more works", "other works", "additional works", "extra projects", "more work", "gallery", 
    "drawings", "illustrations", "daily practice", "renders", "shader", "youtube", "videos", 
    "rendering study", "artwork", "video presentations"
  ];
  const isGallery = moreWorkPhrases.some(phrase => cleanMsg === phrase || cleanMsg.includes(phrase)) || (hasNavVerb && cleanMsg.includes("gallery"));

  const experiencePhrases = [
    "experience", "work experience", "career", "professional experience", "employment", 
    "job", "work history", "background", "job history", "explain experience", 
    "career summary", "portfolio summary", "employer", "portfolio history", 
    "অভিজ্ঞতা", "চাকরি"
  ];
  const isExperience = experiencePhrases.some(phrase => cleanMsg === phrase || cleanMsg.includes(phrase));

  const educationPhrases = [
    "education", "study", "university", "qualification", "degree", "academic", "school", 
    "college", "institution", "academic credentials", "পড়াশোনা", "শিক্ষা"
  ];
  const isEducation = educationPhrases.some(phrase => cleanMsg === phrase || cleanMsg.includes(phrase));

  const achievementsPhrases = [
    "awards", "achievements", "certificates", "achievement", "award", "key metrics", "wins", 
    "honors", "recognition", "metric", "certificate", "certification", "certifications", "credential", "অর্জন", "পুরস্কার", "সার্টিফিকেট"
  ];
  const isAchievement = achievementsPhrases.some(phrase => cleanMsg === phrase || cleanMsg.includes(phrase));
  const isCertificate = isAchievement;

  const contactPhrases = [
    "contact", "hire", "email", "reach sahl", "contact form", "let's work together", "lets work together", 
    "work together", "how can i contact you", "contact info", "phone number", "email address", 
    "whatsapp number", "social links", "যোগাযোগ"
  ];
  const isContact = contactPhrases.some(phrase => cleanMsg === phrase || cleanMsg.includes(phrase));

  const skillsWords = ["skills", "expertise", "abilities", "expert at", "what can you do", "skills and expertise", "skills & expertise", "দক্ষতা", "কাজ", "specialize", "specialties", "software skills", "coding skills", "design skills"];
  const isSkills = skillsWords.some(w => cleanMsg.includes(w));

  const softwareWords = ["software", "tools", "figma", "maya", "after effects", "photoshop", "c4d", "cinema 4d", "redshift", "render", "substance painter", "substance", "illustrator", "premiere", "software armory", "armory"];
  const isSoftware = softwareWords.some(w => cleanMsg.includes(w));

  const servicesWords = ["services", "offers", "freelance", "pricing", "rates", "hourly", "package", "service"];
  const isServices = servicesWords.some(w => cleanMsg.includes(w));

  const resumeWords = ["resume", "cv", "download resume", "রেজুমে", "জীবনবৃত্তান্ত"];
  const isResume = resumeWords.some(w => cleanMsg.includes(w));

  const socialLinksMap = extractAllSocialLinks(context);
  const displayNames: Record<string, string> = {
    whatsapp: "WhatsApp",
    email: "Email",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    github: "GitHub",
    youtube: "YouTube",
    instagram: "Instagram",
    behance: "Behance",
    artstation: "ArtStation",
    dribbble: "Dribbble",
    portfolio: "Portfolio Website"
  };
  const dynamicContactButtons = Object.entries(socialLinksMap).map(([key, url]) => ({
    name: displayNames[key] || (key.charAt(0).toUpperCase() + key.slice(1)),
    url
  }));

  const buildRecommendations = (currentSection: string) => {
    const allSections = [
      { name: "Featured Masterpieces", keyword: "Show Masterpieces", section: "projects" },
      { name: "Skills & Software Armory", keyword: "Show Skills", section: "skills" },
      { name: "Experience & Career History", keyword: "Show Experience", section: "experience" },
      { name: "Achievements & Awards", keyword: "Show Achievements", section: "achievements" },
      { name: "More Work & Gallery", keyword: "Show Gallery", section: "gallery" },
      { name: "Contact & Coordinates", keyword: "Contact Sahl", section: "contact" }
    ];

    const filtered = allSections.filter(s => s.section !== currentSection).slice(0, 3);
    let text = "\n\n💡 **Related Sections to Explore:**";
    filtered.forEach(s => {
      text += `\n• **${s.name}**: Use "${s.keyword}" to navigate there.`;
    });
    return text;
  };

  // Greetings
  if (isGreeting) {
    let text = "";
    if (detectedLang === 'bangla') {
      text = `হ্যালো! আমি **Ask Sahl AI**, সাহল আহমেদের ডিজিটাল সহকারী। আপনাকে কীভাবে সাহায্য করতে পারি? আপনি সাহলের কাজ, দক্ষতা বা প্রজেক্ট নিয়ে যেকোনো প্রশ্ন করতে পারেন!`;
    } else if (detectedLang === 'banglish') {
      text = `Hello! Ami **Ask Sahl AI**, Sahl Ahmed er digital assistant. Apnake kivabe sahajjo korte pari? Apni Sahl er work, skills ba contact niye jekono prosno amake korte paren!`;
    } else {
      text = `Hello! I am **Ask Sahl AI**, Sahl Ahmed's virtual assistant. How can I assist you today? Feel free to ask me about Sahl's experience, skills, projects, or how to get in touch!`;
    }
    return {
      text,
      suggestions: ["Tell me about Sahl", "Show Skills", "Contact Sahl"]
    };
  }

  // Services
  if (isServices) {
    let text = `I have navigated directly to Sahl's **Contact & Freelance Inquiries** section so you can start collaborating!\n\nSahl provides professional creative services in:\n• **UI/UX Systems Design** (Figma, high-fidelity layouts, responsive systems)\n• **3D Interactive Mockups & Prototyping** (Maya, C4D, realistic shaders, rigging)\n• **Motion Graphics & Animations** (After Effects, promotional visual loops)\n• **Frontend Creative Engineering** (React, Tailwind CSS, fluid animations)\n\nHourly rates and project quotes are tailored dynamically to complexity and deadline.`;
    text += buildRecommendations("contact");
    return {
      text,
      suggestions: ["Contact Sahl", "Show Latest Projects", "Show Skills"],
      navigationSection: "contact",
      dynamicContactButtons
    };
  }

  // Contact
  if (isContact) {
    let contactData: any = null;
    try {
      contactData = await fetchFirestoreDoc(projectId, databaseId, 'contact/info', apiKey);
    } catch (err: any) {
      console.error("Firestore REST fetch failed for contact:", err.message);
    }

    let text = "I've navigated directly to Sahl Ahmed's **Contact Form & Studio Coordinates** section!\n\n";
    if (contactData) {
      const title = contactData.studioCoordinatesTitle || "Contact Sahl Ahmed";
      const desc = contactData.studioCoordinatesDescription || "Get in touch with Sahl for your next creative project.";
      const meta = contactData.contactsMeta || {};
      const delay = meta.averageResponseDelay ? `\n⏱️ **Response Time**: ${meta.averageResponseDelay}` : "";
      const channel = meta.preferredChannel ? `\n📞 **Preferred Channel**: ${meta.preferredChannel}` : "";
      const whatsappNum = meta.whatsappNumber ? `\n💬 **WhatsApp**: ${meta.whatsappNumber}` : "";

      text += `📬 **${title}**\n\n${desc}${delay}${channel}${whatsappNum}\n\nFeel free to connect using the links below!`;
    } else {
      const title = context?.sectionTexts?.studioCoordinatesTitle || "Contact Sahl Ahmed";
      const desc = context?.sectionTexts?.studioCoordinatesDescription || "Get in touch with Sahl for your next creative project.";
      const meta = context?.sectionTexts?.contactsMeta || {};
      const delay = meta.averageResponseDelay ? `\n⏱️ **Response Time**: ${meta.averageResponseDelay}` : "";
      const channel = meta.preferredChannel ? `\n📞 **Preferred Channel**: ${meta.preferredChannel}` : "";

      text += `📬 **${title}**\n\n${desc}${delay}${channel}\n\nFeel free to connect using the links below!`;
    }
    text += buildRecommendations("contact");
    return {
      text,
      suggestions: ["Show Latest Projects", "Show Skills", "Latest Achievement"],
      dynamicContactButtons,
      navigationSection: "contact"
    };
  }

  // Resume / CV
  if (isResume) {
    let text = "I've navigated directly to Sahl Ahmed's **Resume & Credentials** section under the About tab.\n\nYou can inspect Sahl's professional career milestones, core software armory, and academic background there. There is also an option to download a PDF copy of his resume directly from that section!";
    text += buildRecommendations("resume");
    return {
      text,
      suggestions: ["Show Skills", "Show Experience", "Contact Sahl"],
      navigationSection: "resume",
      dynamicContactButtons
    };
  }

  // About Sahl
  if (isIntro) {
    let aboutData: any = null;
    try {
      aboutData = await fetchFirestoreDoc(projectId, databaseId, 'about/info', apiKey);
    } catch (err: any) {
      console.error("Firestore REST fetch failed for about info:", err.message);
    }

    let text = "I've navigated directly to Sahl Ahmed's **About Me & Biography** section on your screen!\n\n";
    if (aboutData) {
      const title = aboutData.aboutTitle || "Sahl Ahmed";
      const desc = aboutData.aboutDescription || "Sahl Ahmed is a professional UI/UX Designer, 3D Interactive Mockup Designer, and Motion Graphics Artist.";
      const quote = aboutData.aboutQuote ? `\n\n> *"${aboutData.aboutQuote}"*` : "";
      const location = aboutData.aboutLocationValue ? `\n\n📍 **Location**: ${aboutData.aboutLocationValue}` : "";
      const tongues = aboutData.aboutTonguesValue ? `\n🗣️ **Languages**: ${aboutData.aboutTonguesValue}` : "";
      const basePosition = aboutData.basePosition ? `\n💼 **Current Focus**: ${aboutData.basePosition}` : "";

      text += `💼 **${title}**\n\n${desc}${quote}${location}${tongues}${basePosition}`;
    } else {
      const title = context?.sectionTexts?.aboutTitle || "The Multidisciplinary Designer";
      const desc = context?.sectionTexts?.aboutDescription || "Sahl Ahmed is an award-winning multidisciplinary creator, blending hyper-detailed 3D assets, procedural motion graphics, and ultra-crisp responsive layouts.";
      const quote = context?.sectionTexts?.aboutQuote ? `\n\n> *"${context?.sectionTexts?.aboutQuote}"*` : "";
      const location = context?.sectionTexts?.aboutLocationValue ? `\n\n📍 **Location**: ${context?.sectionTexts?.aboutLocationValue}` : "";
      const tongues = context?.sectionTexts?.aboutTonguesValue ? `\n🗣️ **Languages**: ${context?.sectionTexts?.aboutTonguesValue}` : "";

      text += `💼 **${title}**\n\n${desc}${quote}${location}${tongues}`;
    }
    text += buildRecommendations("about");
    return {
      text,
      suggestions: ["Show Skills", "Show Latest Projects", "Contact Sahl"],
      navigationSection: "about",
      dynamicContactButtons
    };
  }

  // Skills
  if (isSkills) {
    const skills = context.skills || [];
    let text = "";
    if (skills.length > 0) {
      text = "I've automatically navigated to Sahl's **Credentials & Skills** section under the About tab!\n\nHere are Sahl Ahmed's core competencies:\n\n";
      skills.forEach((s: any) => {
        text += `• **${s.name}** (${s.proficiency || 'Advanced'}): ${s.description || ''}\n`;
      });
    } else {
      text = "I couldn't find Sahl's skills dynamically. I've opened Sahl Ahmed's **More Work** section because it showcases Sahl's practical work and provides a better understanding of his skills, software knowledge, and creative experience.";
    }
    text += buildRecommendations("skills");
    return {
      text,
      suggestions: ["What software do you use?", "Show Latest Projects", "Contact Sahl"],
      navigationSection: "skills",
      dynamicContactButtons
    };
  }

  // Software
  if (isSoftware) {
    const scores = calculateSoftwareScores(context);
    let text = "I've navigated directly to the **Credentials & Skills** section to highlight Sahl's software armory!\n\n";
    const entries = Object.entries(scores);
    if (entries.length > 0) {
      text += "Here is Sahl Ahmed's software utilization metrics calculated dynamically:\n\n";
      entries.slice(0, 8).forEach(([sw, details]: any) => {
        text += `• **${details.software}**: Used in ${details.projectCount} major masterpieces and ${details.galleryCount} daily rigs.\n`;
      });
    } else {
      text += "Sahl Ahmed is highly proficient in modern design tools, leveraging **Figma** for high-fidelity responsive layout design, **Autodesk Maya** for detailed 3D assets/rigging, **After Effects** for fluid animations/motion graphics, and **Redshift** for high-quality ray-traced renders.";
    }
    text += buildRecommendations("skills");
    return {
      text,
      suggestions: ["Show Latest Projects", "Show Experience", "Contact Sahl"],
      navigationSection: "skills",
      dynamicContactButtons
    };
  }

  // Experience
  if (isExperience) {
    const exp = context.experience || [];
    let text = "I've navigated you to Sahl's professional Experience credentials.\n\nHere you will find Sahl Ahmed's complete career trajectory, employer history, and freelance contracts. Sahl has worked with diverse teams, refining interactive products and delivering robust design systems.";
    if (exp.length > 0) {
      text += "\n\n💼 **Career Trajectory Highlights:**\n" + exp.map((e: any) => `- **${e.role}** at **${e.company}** (${e.period}): ${e.description || ""}`).join("\n");
    }
    return {
      text,
      suggestions: ["Show Skills", "Show Education", "Show Achievements"],
      navigationSection: "experience",
      dynamicContactButtons
    };
  }

  // Education
  if (isEducation) {
    const edu = context.education || [];
    let text = "I've opened the Education section for you on Sahl's portfolio.\n\nIn this section, you can review Sahl's formal study achievements, academic degrees, and institutional credentials. Sahl constantly pursues academic and creative growth.";
    if (edu.length > 0) {
      text += "\n\n🎓 **Educational Credentials:**\n" + edu.map((e: any) => `- **${e.degree}** from **${e.institution}** (${e.period || ""})`).join("\n");
    }
    return {
      text,
      suggestions: ["Show Skills", "Show Experience", "Show Achievements"],
      navigationSection: "education",
      dynamicContactButtons
    };
  }

  // Achievements
  if (isAchievement) {
    const ach = context.achievements || [];
    let text = "I've taken you to Sahl's Achievements section.\n\nHere you can explore Sahl Ahmed's awards, recognitions, certifications, and outstanding milestones Sahl has reached throughout his creative career.";
    if (ach.length > 0) {
      text += "\n\n🏆 **Awards & Distinctions:**\n" + ach.map((a: any) => `- **${a.title}**: ${a.description || ""}`).join("\n");
    }
    return {
      text,
      suggestions: ["Show Masterpieces", "Show Experience", "Contact Sahl"],
      navigationSection: "achievements",
      dynamicContactButtons
    };
  }

  // Certificates
  if (isCertificate) {
    const certs = context.certificates || [];
    let text = "I've taken you to Sahl's Achievements section.\n\nHere you can explore Sahl Ahmed's awards, recognitions, certifications, and outstanding milestones Sahl has reached throughout his creative career.";
    if (certs.length > 0) {
      text += "\n\n📜 **Credentials & Certifications:**\n" + certs.map((c: any) => `- **${c.title}** issued by ${c.issuer || "Professional Authority"} (${c.date || ""})`).join("\n");
    }
    return {
      text,
      suggestions: ["Show Skills", "Show Experience", "Contact Sahl"],
      navigationSection: "achievements",
      dynamicContactButtons
    };
  }

  // Masterpieces
  if (isMasterpiece) {
    const masterpieces = (context.projects || []).filter((p: any) => p.featured);
    let text = `I've taken you to the Featured Masterpieces section.\n\nHere you'll find some of Sahl Ahmed's best and most representative works that showcase his creativity, technical skills, and professional experience. Sahl focuses on crafting high-fidelity design layouts and highly responsive software interfaces.`;
    if (masterpieces.length > 0) {
      text += "\n\n⭐ **Featured Highlights:**\n" + masterpieces.slice(0, 3).map((p: any) => `- **${p.title}**: ${p.description || p.subtitle || ""}`).join("\n");
    }
    return {
      text,
      suggestions: ["Show More Work", "Show Gallery", "Show Experience"],
      navigationSection: "projects",
      dynamicContactButtons,
      projects: masterpieces.slice(0, 3)
    };
  }

  // Gallery
  if (isGallery) {
    let text = `I've opened the More Work section for you.\n\nHere you'll find additional creative projects beyond the featured portfolio, giving you a broader view of Sahl Ahmed's work. Sahl regularly updates this area with raw 3D models, drawing tutorials, and procedural studies.`;
    return {
      text,
      suggestions: ["Show Masterpieces", "Show Gallery", "Show Experience"],
      navigationSection: "gallery",
      dynamicContactButtons
    };
  }

  return null;
}

// Conversation summary & Adaptive contexts
async function generateOlderConversationSummary(
  olderMessages: any[],
  aiConfig: any,
  groqApiKey?: string,
  geminiApiKey?: string
): Promise<string> {
  const conversationText = olderMessages.map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join("\n");
  
  if (groqApiKey) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${groqApiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: aiConfig.groqModel || "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "You are an internal summarizer. Write a single, short sentence summarizing what the User and Assistant discussed so far. Be extremely brief (max 15 words) and professional. Do NOT include introductory phrases like 'The conversation was about...'. Start directly with the core topics."
            },
            {
              role: "user",
              content: conversationText
            }
          ],
          temperature: 0.3,
          max_tokens: 60
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data: any = await response.json();
        const summary = data.choices?.[0]?.message?.content?.trim();
        if (summary) {
          return `Previously, the user and assistant discussed: ${summary}`;
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn("[Worker Summary] Groq summary generation failed:", err);
    }
  }

  if (geminiApiKey) {
    const selectedModel = aiConfig.model || "gemini-3.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${geminiApiKey}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{
                text: `Please write a single, short sentence (max 15 words) summarizing what the User and Assistant discussed so far. Do NOT include introductory phrases. Start directly with the core topics:\n\n${conversationText}`
              }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 60,
            temperature: 0.3
          }
        })
      });

      if (response.ok) {
        const data: any = await response.json();
        const summary = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (summary) {
          return `Previously, the user and assistant discussed: ${summary}`;
        }
      }
    } catch (err) {
      console.warn("[Worker Summary] Gemini summary generation failed:", err);
    }
  }

  // Rule-based fallback
  try {
    const userQueries = olderMessages
      .filter(m => m.sender === 'user' && m.text && m.text.length > 5)
      .map(m => m.text.trim())
      .slice(-3);
    
    if (userQueries.length > 0) {
      const topics = userQueries.map(q => {
        let cleaned = q.replace(/^(who is|what is|tell me about|show me|do you have|can you|how to)\s+/i, "");
        cleaned = cleaned.replace(/[?.!]/g, "").trim();
        if (cleaned.length > 35) {
          cleaned = cleaned.substring(0, 32) + "...";
        }
        return cleaned;
      });
      const uniqueTopics = Array.from(new Set(topics));
      return `Previously, the discussion covered topics including: ${uniqueTopics.join(", ")}.`;
    }
  } catch (e) {
    // Ignored
  }

  return "Previously, the user and Sahl's assistant discussed Sahl's professional background, projects, and skills.";
}

async function getAdaptiveConversationContext(
  sessionId: string,
  historyMessages: any[],
  userMessage: string,
  aiConfig: any,
  context: any,
  projectId: string,
  databaseId: string,
  apiKey: string,
  groqApiKey?: string,
  geminiApiKey?: string
): Promise<{
  contents: any[];
  conversationSummary: string;
  baseSystemInstruction: string;
}> {
  const actualMessages = historyMessages.filter(msg => 
    msg.id !== 'welcome-msg' && 
    (msg.sender === 'user' || msg.sender === 'ai') &&
    msg.text && msg.text.trim() !== ""
  );

  let recentMessages: any[] = [];
  let oldMessages: any[] = [];
  let conversationSummary = "";

  if (actualMessages.length > 4) {
    recentMessages = actualMessages.slice(-4);
    oldMessages = actualMessages.slice(0, -4);
  } else {
    recentMessages = actualMessages;
  }

  if (oldMessages.length > 0) {
    try {
      let cachedSummary = "";
      try {
        const sessionDoc = await fetchFirestoreDoc(projectId, databaseId, `ai_sessions/${sessionId}`, apiKey);
        if (sessionDoc && sessionDoc.conversationSummary) {
          cachedSummary = sessionDoc.conversationSummary;
        }
      } catch (e) {
        const fbSession = memorySessionStore[sessionId];
        cachedSummary = fbSession ? (fbSession.conversationSummary || "") : "";
      }

      if (cachedSummary) {
        conversationSummary = cachedSummary;
      } else {
        conversationSummary = await generateOlderConversationSummary(oldMessages, aiConfig, groqApiKey, geminiApiKey);
        
        // Async update session conversationSummary on Firestore REST
        const now = new Date().toISOString();
        const updateData = {
          sessionId,
          messages: historyMessages,
          conversationSummary,
          lastActivity: now,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        };
        saveSessionToFirestore(projectId, databaseId, apiKey, sessionId, updateData).catch(() => {
          const fbSession = memorySessionStore[sessionId];
          if (fbSession) {
            fbSession.conversationSummary = conversationSummary;
          }
        });
      }
    } catch (err) {
      console.error("[Worker Context] Failed to build conversation summary:", err);
      conversationSummary = "The user and Sahl's assistant previously discussed Sahl's background, portfolio projects, and skills.";
    }
  }

  const contents: any[] = [];
  for (const msg of recentMessages) {
    if (msg.sender === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.text }] });
    } else if (msg.sender === 'ai') {
      contents.push({ role: 'model', parts: [{ text: msg.text }] });
    }
  }
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const strictGuidelines = `
---
CRITICAL SYSTEM GUIDELINES FOR ASK SAHL AI:
1. You are Sahl Ahmed's professional portfolio assistant, not a robotic keyword search engine.
2. If the user asks about Sahl's skills, software knowledge, experience, or achievements, NEVER reply "I couldn't find matching projects" or "Not found".
3. Instead, try to provide a highly helpful and rich response based on the portfolio context.
4. If appropriate, guide the visitor to the most relevant section on the portfolio (More Work, Featured Masterpieces, Projects, Gallery, Experience, Achievements, Contact, Resume, About).
5. Explain WHY that section is relevant (e.g., "I couldn't find a dedicated Skills page, but I've opened the 'More Work' section where Sahl Ahmed's practical work and daily practice rigs are showcased, giving you a better idea of his practical design abilities.").
6. For broad or vague questions, ask clarifying follow-up questions to guide the user (e.g., "Would you like to explore Sahl's 3D assets or his high-fidelity UI/UX systems?").
7. Always recommend up to three relevant sections to explore.
8. Keep your responses highly professional, friendly, natural, and engaging. Avoid dry and robotic phrasing. Never make up or hallucinate any skills or achievements that are not in the context.
---
`;

  const baseSystemInstruction = `${aiConfig.systemPrompt || "You are Ask Sahl AI. You represent Sahl Ahmed professionally..."}
${strictGuidelines}

PORTFOLIO CONTEXT FOR SAHL AHMED (KNOWLEDGE ENGINE):
${JSON.stringify(context || {}, null, 2)}
${conversationSummary ? `\nPREVIOUS CONVERSATION SUMMARY (CONTEXT OF OLDER HISTORY):\n${conversationSummary}\n` : ""}
`;

  return { contents, conversationSummary, baseSystemInstruction };
}

// AI Call Engines
async function callGroq(
  contents: any[],
  systemInstruction: string,
  aiConfig: any,
  apiKey: string
): Promise<{ text: string; suggestions: string[] }> {
  const groqModelName = aiConfig.groqModel || "llama-3.3-70b-versatile";

  const messages = [
    {
      role: "system",
      content: `${systemInstruction}\n\nIMPORTANT: You must return your response as a JSON object matching this schema exactly:\n{\n  "text": "Your markdown formatted reply text for Sahl's assistant.",\n  "suggestions": ["3-4 short follow-up questions tailored to Sahl\'s portfolio"]\n}`
    }
  ];

  for (const c of contents) {
    messages.push({
      role: c.role === "model" ? "assistant" : "user",
      content: c.parts[0].text
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: groqModelName,
        messages: messages,
        temperature: aiConfig.temperature !== undefined ? Number(aiConfig.temperature) : 0.7,
        max_tokens: aiConfig.maxOutputTokens ? Number(aiConfig.maxOutputTokens) : 1000,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Groq API Error: ${response.status} ${response.statusText}`);
    }

    const data: any = await response.json();
    const responseContent = data.choices?.[0]?.message?.content;

    if (!responseContent || responseContent.trim() === "") {
      throw new Error("Empty response from Groq");
    }

    const parsed = JSON.parse(responseContent);
    if (!parsed.text) {
      throw new Error("Malformed response: Missing 'text' field");
    }

    return {
      text: parsed.text,
      suggestions: parsed.suggestions || []
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Groq timeout");
    }
    throw err;
  }
}

async function callGemini(
  contents: any[],
  systemInstruction: string,
  aiConfig: any,
  apiKey: string
): Promise<{ text: string; suggestions: string[] }> {
  const selectedModel = aiConfig.model || "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      contents: contents,
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      generationConfig: {
        temperature: aiConfig.temperature !== undefined ? Number(aiConfig.temperature) : 0.7,
        maxOutputTokens: aiConfig.maxOutputTokens ? Number(aiConfig.maxOutputTokens) : 1000,
        topP: aiConfig.topP !== undefined ? Number(aiConfig.topP) : 0.95,
        topK: aiConfig.topK ? Number(aiConfig.topK) : 40,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            text: {
              type: "STRING",
              description: "The markdown formatted reply text for Sahl's assistant."
            },
            suggestions: {
              type: "ARRAY",
              items: { type: "STRING" },
              description: "3-4 highly relevant, short suggested follow-up questions tailored dynamically to Sahl's portfolio."
            }
          },
          required: ["text", "suggestions"]
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API Error: ${response.status} ${response.statusText}`);
  }

  const data: any = await response.json();
  const textContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent || textContent.trim() === "") {
    throw new Error("Empty response from Gemini");
  }

  const parsed = JSON.parse(textContent);
  if (!parsed.text) {
    throw new Error("Malformed response: Missing 'text' field");
  }

  return {
    text: parsed.text,
    suggestions: parsed.suggestions || []
  };
}

export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // Dynamic headers for full CORS enablement
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    };

    // CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Health check endpoint
    if (url.pathname === "/" && request.method === "GET") {
      const data = {
        status: "ok",
        service: "Sahl AI Worker Proxy & Complete Knowledge Engine",
        version: "3.0"
      };

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        }
      });
    }

    // Complete AI + Firestore Knowledge Engine Endpoint
    if ((url.pathname === "/" || url.pathname === "/api/chat" || url.pathname === "/api/generate") && request.method === "POST") {
      try {
        const body: any = await request.json();

        // 1. Check if this is the Phase 2 legacy direct contents call or Phase 3 complete flow
        const isLegacyProxyCall = body.contents && body.systemInstruction;

        const firebaseApiKey = env.FIREBASE_API_KEY;
        const firebaseProjectId = env.FIREBASE_PROJECT_ID;
        const firebaseDbId = env.FIREBASE_DATABASE_ID;

        if (!firebaseApiKey || !firebaseProjectId || !firebaseDbId) {
          return new Response(JSON.stringify({ 
            error: "Configuration Error: FIREBASE_API_KEY, FIREBASE_PROJECT_ID, and FIREBASE_DATABASE_ID environment variables must be configured on the Worker." 
          }), {
            status: 500,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        if (isLegacyProxyCall) {
          // LEGACY COMPATIBILITY MODE (Phase 2 proxy call)
          const { contents, systemInstruction, aiConfig } = body;
          const config = aiConfig || {};
          const provider = config.aiProvider || "auto";

          const groqApiKey = env.GROQ_API_KEY;
          const geminiApiKey = env.GEMINI_API_KEY;

          let text = "";
          let suggestions: string[] = [];
          let source: "groq" | "gemini" | "fallback" = "fallback";

          if (provider === "groq") {
            if (!groqApiKey) throw new Error("GROQ_API_KEY is not configured in Worker");
            const res = await callGroq(contents, systemInstruction, config, groqApiKey);
            text = res.text;
            suggestions = res.suggestions;
            source = "groq";
          } else if (provider === "gemini") {
            if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not configured in Worker");
            const res = await callGemini(contents, systemInstruction, config, geminiApiKey);
            text = res.text;
            suggestions = res.suggestions;
            source = "gemini";
          } else {
            if (groqApiKey) {
              try {
                const res = await callGroq(contents, systemInstruction, config, groqApiKey);
                text = res.text;
                suggestions = res.suggestions;
                source = "groq";
              } catch (err: any) {
                console.warn("Groq legacy call failed. Retrying with Gemini fallback...", err.message || err);
                if (geminiApiKey) {
                  const res = await callGemini(contents, systemInstruction, config, geminiApiKey);
                  text = res.text;
                  suggestions = res.suggestions;
                  source = "gemini";
                } else {
                  throw new Error(`Groq legacy call failed and GEMINI_API_KEY is not configured: ${err.message || err}`);
                }
              }
            } else if (geminiApiKey) {
              const res = await callGemini(contents, systemInstruction, config, geminiApiKey);
              text = res.text;
              suggestions = res.suggestions;
              source = "gemini";
            } else {
              throw new Error("Neither GROQ_API_KEY nor GEMINI_API_KEY are configured in Worker secrets");
            }
          }

          return new Response(JSON.stringify({ text, suggestions, source }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders
            }
          });
        }

        // COMPLETE SERVERLESS KNOWLEDGE ENGINE MODE (Phase 3 complete flow)
        const { userMessage, sessionId, context: clientContext } = body;

        if (!userMessage || !sessionId) {
          return new Response(JSON.stringify({ error: "userMessage and sessionId are required" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // Fetch AI configuration from Firestore
        const aiConfig = await getAiConfig(firebaseProjectId, firebaseDbId, firebaseApiKey);

        if (!aiConfig.enabled) {
          const offlineReply = "I'm sorry, my AI Assistant services are currently offline. Please reach out to Sahl Ahmed directly via WhatsApp or the contact form below!";
          return new Response(JSON.stringify({
            text: offlineReply,
            suggestions: ["Contact Sahl", "Show Skills"],
            source: "fallback"
          }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        const detectedLang = detectLanguage(userMessage);

        // 1. Session Cache Check
        cleanSessionAiCache();
        const normalizedQuery = userMessage.trim().toLowerCase();
        const cached = sessionAiCache[sessionId]?.[normalizedQuery];
        if (cached && (Date.now() - cached.timestamp < 60 * 60 * 1000)) {
          return new Response(JSON.stringify({
            text: cached.text,
            suggestions: cached.suggestions,
            source: "session_cache"
          }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // Retrieve/build Sahl's complete portfolio context
        let context = clientContext;
        if (!context || !context.skills || context.skills.length === 0) {
          context = await getSahlPortfolioContext(firebaseProjectId, firebaseDbId, firebaseApiKey);
        }

        // 2. Knowledge Guard Check
        const classification = classifyQuestion(userMessage);
        if (classification === 'external') {
          const politeRejectionText = "I'm sorry, I couldn't find that information in Sahl Ahmed's portfolio. I can only answer questions related to Sahl Ahmed's portfolio, projects, skills, experience, education, achievements and contact information.";
          const rejectionSuggestions = ["Show Latest Projects", "Show Skills", "Contact Sahl"];
          
          saveToSessionAiCache(sessionId, normalizedQuery, politeRejectionText, rejectionSuggestions);
          
          // Save rejection exchange to history asynchronously
          const historyMessages = await getSessionHistory(firebaseProjectId, firebaseDbId, firebaseApiKey, sessionId);
          const nowStr = new Date().toISOString();
          historyMessages.push(
            { id: `msg-${Date.now()}-user`, sender: "user", text: userMessage, timestamp: nowStr },
            { id: `msg-${Date.now()}-ai`, sender: "ai", text: politeRejectionText, timestamp: nowStr }
          );
          await saveSessionToFirestore(firebaseProjectId, firebaseDbId, firebaseApiKey, sessionId, {
            sessionId,
            messages: historyMessages,
            lastActivity: nowStr,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
          }).catch(() => {});

          return new Response(JSON.stringify({
            text: politeRejectionText,
            suggestions: rejectionSuggestions,
            source: "fallback"
          }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // 3. Smart Response Engine (Exact Match)
        const exactMatch = runSmartResponseEngine(userMessage, context, detectedLang);
        if (exactMatch) {
          saveToSessionAiCache(sessionId, normalizedQuery, exactMatch.text, exactMatch.suggestions);

          // Save exact match exchange to history asynchronously
          const historyMessages = await getSessionHistory(firebaseProjectId, firebaseDbId, firebaseApiKey, sessionId);
          const nowStr = new Date().toISOString();
          historyMessages.push(
            { id: `msg-${Date.now()}-user`, sender: "user", text: userMessage, timestamp: nowStr },
            { id: `msg-${Date.now()}-ai`, sender: "ai", text: exactMatch.text, timestamp: nowStr }
          );
          await saveSessionToFirestore(firebaseProjectId, firebaseDbId, firebaseApiKey, sessionId, {
            sessionId,
            messages: historyMessages,
            lastActivity: nowStr,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
          }).catch(() => {});

          return new Response(JSON.stringify({
            text: exactMatch.text,
            suggestions: exactMatch.suggestions,
            source: "cache",
            dynamicContactButtons: (exactMatch as any).dynamicContactButtons
          }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // 4. Dedicated Conversation Intent Handler
        const conversationResponse = await handleConversationIntent(
          userMessage,
          sessionId,
          context,
          detectedLang,
          aiConfig,
          firebaseProjectId,
          firebaseDbId,
          firebaseApiKey
        );

        if (conversationResponse) {
          saveToSessionAiCache(sessionId, normalizedQuery, conversationResponse.text, conversationResponse.suggestions);

          // Save conversation intent exchange to history asynchronously
          const historyMessages = await getSessionHistory(firebaseProjectId, firebaseDbId, firebaseApiKey, sessionId);
          const nowStr = new Date().toISOString();
          historyMessages.push(
            { id: `msg-${Date.now()}-user`, sender: "user", text: userMessage, timestamp: nowStr },
            { id: `msg-${Date.now()}-ai`, sender: "ai", text: conversationResponse.text, timestamp: nowStr }
          );
          await saveSessionToFirestore(firebaseProjectId, firebaseDbId, firebaseApiKey, sessionId, {
            sessionId,
            messages: historyMessages,
            lastActivity: nowStr,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
          }).catch(() => {});

          return new Response(JSON.stringify({
            text: conversationResponse.text,
            suggestions: conversationResponse.suggestions,
            source: "conversation_handler",
            dynamicContactButtons: conversationResponse.dynamicContactButtons,
            navigationSection: conversationResponse.navigationSection,
            projects: conversationResponse.projects
          }), {
            status: 200,
            headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // 5. Need AI Generation - Load full session history and build adaptive context
        const historyMessages = await getSessionHistory(firebaseProjectId, firebaseDbId, firebaseApiKey, sessionId);

        const groqApiKey = env.GROQ_API_KEY;
        const geminiApiKey = env.GEMINI_API_KEY;

        const { contents, baseSystemInstruction, conversationSummary } = await getAdaptiveConversationContext(
          sessionId,
          historyMessages,
          userMessage,
          aiConfig,
          context,
          firebaseProjectId,
          firebaseDbId,
          firebaseApiKey,
          groqApiKey,
          geminiApiKey
        );

        const provider = aiConfig.aiProvider || "auto";
        let text = "";
        let suggestions: string[] = [];
        let source: "groq" | "gemini" | "fallback" = "fallback";

        if (provider === "groq") {
          if (!groqApiKey) throw new Error("GROQ_API_KEY is not configured in Worker");
          const res = await callGroq(contents, baseSystemInstruction, aiConfig, groqApiKey);
          text = res.text;
          suggestions = res.suggestions;
          source = "groq";
        } else if (provider === "gemini") {
          if (!geminiApiKey) throw new Error("GEMINI_API_KEY is not configured in Worker");
          const res = await callGemini(contents, baseSystemInstruction, aiConfig, geminiApiKey);
          text = res.text;
          suggestions = res.suggestions;
          source = "gemini";
        } else {
          if (groqApiKey) {
            try {
              const res = await callGroq(contents, baseSystemInstruction, aiConfig, groqApiKey);
              text = res.text;
              suggestions = res.suggestions;
              source = "groq";
            } catch (err: any) {
              console.warn("Groq call failed in Worker AUTO mode. Retrying with Gemini...", err.message || err);
              if (geminiApiKey) {
                const res = await callGemini(contents, baseSystemInstruction, aiConfig, geminiApiKey);
                text = res.text;
                suggestions = res.suggestions;
                source = "gemini";
              } else {
                throw new Error(`Groq failed and GEMINI_API_KEY is not configured: ${err.message || err}`);
              }
            }
          } else if (geminiApiKey) {
            const res = await callGemini(contents, baseSystemInstruction, aiConfig, geminiApiKey);
            text = res.text;
            suggestions = res.suggestions;
            source = "gemini";
          } else {
            throw new Error("Neither GROQ_API_KEY nor GEMINI_API_KEY are configured in Worker secrets");
          }
        }

        saveToSessionAiCache(sessionId, normalizedQuery, text, suggestions);

        // Save AI generated response to history
        const nowStr = new Date().toISOString();
        const chatPairUser = { id: `msg-${Date.now()}-user`, sender: "user", text: userMessage, timestamp: nowStr };
        const chatPairAI = { id: `msg-${Date.now()}-ai`, sender: "ai", text, timestamp: nowStr };
        historyMessages.push(chatPairUser, chatPairAI);

        const updatedSessionData: any = {
          sessionId,
          messages: historyMessages,
          lastActivity: nowStr,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        };
        if (conversationSummary) {
          updatedSessionData.conversationSummary = conversationSummary;
        }

        await saveSessionToFirestore(firebaseProjectId, firebaseDbId, firebaseApiKey, sessionId, updatedSessionData).catch(() => {
          memorySessionStore[sessionId] = updatedSessionData;
        });

        // Dynamic extraction of contact buttons if response references contact
        let dynamicContactButtons = undefined;
        const responseTextLower = (text || "").toLowerCase();
        if (
          responseTextLower.includes("contact") ||
          responseTextLower.includes("email") ||
          responseTextLower.includes("whatsapp") ||
          responseTextLower.includes("facebook") ||
          responseTextLower.includes("linkedin") ||
          responseTextLower.includes("github") ||
          responseTextLower.includes("youtube") ||
          responseTextLower.includes("instagram") ||
          responseTextLower.includes("behance") ||
          responseTextLower.includes("artstation") ||
          responseTextLower.includes("dribbble") ||
          responseTextLower.includes("social link") ||
          responseTextLower.includes("shsahl1125@gmail.com")
        ) {
          const socialLinksMap = extractAllSocialLinks(context);
          const displayNames: Record<string, string> = {
            whatsapp: "WhatsApp",
            email: "Email",
            facebook: "Facebook",
            linkedin: "LinkedIn",
            github: "GitHub",
            youtube: "YouTube",
            instagram: "Instagram",
            behance: "Behance",
            artstation: "ArtStation",
            dribbble: "Dribbble",
            portfolio: "Portfolio Website"
          };
          dynamicContactButtons = Object.entries(socialLinksMap).map(([key, url]) => ({
            name: displayNames[key] || (key.charAt(0).toUpperCase() + key.slice(1)),
            url
          }));
        }

        return new Response(JSON.stringify({
          text,
          suggestions,
          source,
          dynamicContactButtons
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });

      } catch (err: any) {
        console.error("Worker Execution Error:", err.message || err);
        return new Response(JSON.stringify({
          text: `I'm sorry, I encountered an unexpected error processing Sahl Ahmed's AI Knowledge Engine. Please try again or reach Sahl directly via WhatsApp or email!`,
          suggestions: ["Contact Sahl", "Show Skills"],
          source: "fallback"
        }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders
          }
        });
      }
    }

    // Default 404 response
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders
      }
    });
  }
};
