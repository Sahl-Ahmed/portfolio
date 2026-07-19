import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

// Firebase Imports
import { initializeApp } from "firebase/app";
import { 
  initializeFirestore,
  memoryLocalCache,
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  getDocs, 
  deleteDoc,
  updateDoc,
  arrayUnion
} from "firebase/firestore";

// Load environment variables
dotenv.config();

// Read Firebase Config from config file
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));

// Initialize Firebase
const appFirebase = initializeApp(firebaseConfig);
const db = firebaseConfig.firestoreDatabaseId
  ? initializeFirestore(appFirebase, { localCache: memoryLocalCache(), experimentalForceLongPolling: true }, firebaseConfig.firestoreDatabaseId)
  : initializeFirestore(appFirebase, { localCache: memoryLocalCache(), experimentalForceLongPolling: true });

// Fallback in-memory session store in case Firestore is offline
const fallbackSessionStore: Record<string, {
  messages: any[];
  createdAt: string;
  lastActivity: string;
  expiresAt: string;
  conversationSummary?: string;
}> = {};

// AI Provider Layer Cache
// Map of sessionId -> (normalizedQuery -> { text, suggestions, timestamp })
const sessionAiCache: Record<string, Record<string, { text: string; suggestions: string[]; timestamp: number }>> = {};

function runFuzzyContextSearch(userMessage: string, context: any, lang: string) {
  const msgLower = userMessage.toLowerCase().trim();
  
  // Try to find a matching project
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

  // Try to find a matching skill
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

  // Try to find a matching achievement
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

async function startServer() {
  const app = express();
  app.set("trust proxy", true);
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Background Session Cleanup (Runs every 5 minutes)
  // Safely deletes expired chat sessions from Firestore without manual action
  setInterval(async () => {
    try {
      console.log("[AI Sessions Cleanup] Checking for expired sessions...");
      const querySnap = await getDocs(collection(db, "ai_sessions"));
      const now = new Date();
      let deleteCount = 0;

      for (const docSnap of querySnap.docs) {
        const data = docSnap.data();
        if (data.expiresAt) {
          const expiry = new Date(data.expiresAt);
          if (now > expiry) {
            await deleteDoc(doc(db, "ai_sessions", docSnap.id));
            delete sessionAiCache[docSnap.id]; // Delete cached context too
            deleteCount++;
          }
        }
      }
      if (deleteCount > 0) {
        console.log(`[AI Sessions Cleanup] Successfully expired and deleted ${deleteCount} sessions.`);
      }
    } catch (error) {
      console.error("[AI Sessions Cleanup] Error during background session cleanup:", error);
    }
  }, 5 * 60 * 1000);

  // Helper: Detect query language (Bangla, English, or Banglish)
  function detectLanguage(message: string): 'bangla' | 'banglish' | 'english' {
    const msgLower = message.toLowerCase();
    
    // Check for Bangla unicode characters
    if (/[\u0980-\u09FF]/.test(message)) {
      return 'bangla';
    }
    
    // Check for common Banglish words
    const banglishWords = [
      'apnar', 'tomar', 'kivabe', 'sahajjo', 'kaj', 'skill', 'experian', 'contact', 'resume', 'dhonnobad', 'shundor', 'amake'
    ];
    if (banglishWords.some(word => msgLower.includes(word))) {
      return 'banglish';
    }
    
    return 'english';
  }

  // API Route: Initialize or restore temporary session
  app.post("/api/session/init", async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      const sessionDocRef = doc(db, "ai_sessions", sessionId);
      const now = new Date();
      let sessionData = null;
      let usingFallback = false;

      try {
        const sessionSnap = await getDoc(sessionDocRef);
        if (sessionSnap.exists()) {
          sessionData = sessionSnap.data();
        }
      } catch (err) {
        console.warn("Firestore getDoc failed, using in-memory fallback store:", err);
        sessionData = fallbackSessionStore[sessionId] || null;
        usingFallback = true;
      }

      if (sessionData) {
        const expiry = new Date(sessionData.expiresAt);

        if (now > expiry) {
          // Session expired: permanently delete it and start fresh
          if (!usingFallback) {
            await deleteDoc(sessionDocRef).catch(() => {});
          } else {
            delete fallbackSessionStore[sessionId];
          }
          delete sessionAiCache[sessionId]; // Delete cached context too

          const newSession = {
            sessionId,
            messages: [],
            createdAt: now.toISOString(),
            lastActivity: now.toISOString(),
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString() // 1 hour expiry
          };

          if (!usingFallback) {
            await setDoc(sessionDocRef, newSession).catch(() => {
              fallbackSessionStore[sessionId] = newSession;
            });
          } else {
            fallbackSessionStore[sessionId] = newSession;
          }

          return res.json({ messages: [], active: false });
        } else {
          // Session active: restore it and update activity/expiry
          const updatedSession = {
            lastActivity: now.toISOString(),
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
          };

          if (!usingFallback) {
            await updateDoc(sessionDocRef, updatedSession).catch(() => {
              if (fallbackSessionStore[sessionId]) {
                fallbackSessionStore[sessionId].lastActivity = updatedSession.lastActivity;
                fallbackSessionStore[sessionId].expiresAt = updatedSession.expiresAt;
              }
            });
          } else {
            if (fallbackSessionStore[sessionId]) {
              fallbackSessionStore[sessionId].lastActivity = updatedSession.lastActivity;
              fallbackSessionStore[sessionId].expiresAt = updatedSession.expiresAt;
            }
          }

          return res.json({ messages: sessionData.messages || [], active: true });
        }
      } else {
        // Create brand new conversation session
        const newSession = {
          sessionId,
          messages: [],
          createdAt: now.toISOString(),
          lastActivity: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
        };

        if (!usingFallback) {
          await setDoc(sessionDocRef, newSession).catch(() => {
            fallbackSessionStore[sessionId] = newSession;
          });
        } else {
          fallbackSessionStore[sessionId] = newSession;
        }

        return res.json({ messages: [] });
      }
    } catch (error: any) {
      console.error("Error in /api/session/init endpoint:", error);
      // Even if everything fails, do NOT crash. Return empty array so client can proceed
      res.json({ messages: [], active: false, fallback: true });
    }
  });

  // Knowledge Guard Classifier
  // Classifies visitor questions into Direct Portfolio, Portfolio Analysis, or External/Unrelated.
  function classifyQuestion(userMessage: string): 'direct' | 'analysis' | 'external' {
    const msgLower = userMessage.toLowerCase().trim();

    // 1. Direct Portfolio patterns and keywords
    const directKeywords = [
      "about", "education", "experience", "project", "skill", "achievement", "resume", "cv", "gallery",
      "contact", "whatsapp", "facebook", "linkedin", "github", "youtube", "certificate", "software",
      "latest project", "latest video", "latest achievement", "category", "categories", "project count",
      "software list", "where do you live", "location", "address", "phone", "email", "mail", "hire", "work with",
      "repro", "repos", "channel", "social", "insta", "instagram", "portfolio", "sahl", "ahmed", "shahol",
      "যোগাযোগ", "ঠিকানা", "ফোন", "নাম্বার", "ইমেইল", "ভিডিও", "কাজ", "প্রজেক্ট", "স্কিল", "অভিজ্ঞতা", "ডিজাইন", "পড়াশোনা", "অর্জন", "রেজুমে", "জীবনবৃত্তান্ত", "সার্টিফিকেট", "ফলো", "লিঙ্ক",
      "hello", "hi", "hey", "hola", "greetings", "good morning", "good afternoon", "good evening", "how are you", "who are you", "হাই", "হ্যালো", "কেমন আছেন"
    ];

    // 2. Portfolio Analysis patterns and keywords
    const analysisKeywords = [
      "strongest skill", "best skill", "most used software", "most used", "frequent software",
      "most common category", "most common", "career summary", "project recommendation",
      "recommend a project", "software comparison", "compare software", "portfolio summary",
      "explain experience", "compare skills", "best work", "highlighted project", "top project", "most proud",
      "career goal", "why hire", "what do you do", "kind of work"
    ];

    // 3. External Unrelated patterns and keywords
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
      // If Sahl or Portfolio references are explicitly present in the query, bypass external rejection
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

    // Default heuristics:
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

  // Helper: extract all social links from context dynamically
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

  // Helper: Software Scoring Engine
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

    // Initialize from skills
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
        totalScore: months * 1, // Experience Duration: 1 point per month
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

    // Project Count (5 points) & Featured Projects (10 extra points)
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

    // More Works Count (3 points) & Gallery References (2 points)
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
        entry.totalScore += 3 + 2; // More Works (3 points) + Gallery References (2 points)
      });
    });

    // Achievement References (4 points per achievement)
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

  // Helper: Explainable Answers for Strongest Software
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

  // Upgraded Smart Response Engine
  // Serves deterministic replies with ZERO API calls if Firestore contains matching datasets
  function runSmartResponseEngine(userMessage: string, context: any, lang: 'bangla' | 'banglish' | 'english') {
    const msgLower = userMessage.toLowerCase().trim();
    
    // Default suggestion chips depending on context
    const defaultChips = [
      "Show Latest Projects",
      "Show UI UX Projects",
      "Show Maya Projects",
      "Show Motion Graphics",
      "Contact Sahl",
      "Show Skills",
      "Latest Achievement"
    ];

    // Helper: format list of software used across all projects
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

    // Helper: count project categories
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

    // Helper to translate Bangla/Banglish software terms to normalize search matching
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

    // 1. INTENT DETECT: About Sahl (Tell me about yourself, who are you)
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

সাহল আহমেদের অভিজ্ঞতা, প্রজেক্ট এবং কন্টাক্ট ইনফরমেশন জানতে যেকোনো প্রশ্ন করতে পারেন!`
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

    // 2. INTENT DETECT: Contact Details (WhatsApp, Email, Facebook, GitHub, LinkedIn, Contact Form)
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

    // 4. INTENT DETECT: Address / Base Coordinates
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

    // 5. INTENT DETECT: YouTube Links / Latest Video
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

    // 6. INTENT DETECT: Most Used Software (Analysis Intent)
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

    // 7. INTENT DETECT: Most Common Category (Analysis Intent)
    if (msgLower.includes("kind of work do you do most") || msgLower.includes("work you do most") || msgLower.includes("kind of projects") || msgLower.includes("most common category")) {
      const highestCat = getCategoryUsage();
      return {
        text: lang === 'bangla'
          ? `সাহল আহমেদ মূলত **${highestCat}** বিভাগে সবচেয়ে বেশি প্রজেক্ট করে থাকেন। তিনি একজন দক্ষ ক্রিয়েティブ ডিজাইনার হিসেবে ইন্টারেক্টিভ ইন্টারফেস ডিজাইন এবং ভিজ্যুয়াল ব্র্যান্ডিংয়ে পারদর্শী।`
          : lang === 'banglish'
          ? `Sahl mainy **${highestCat}** category e shobcheye besi kaj kore thaken. UI/UX dynamically solve korte tar khub bhalo lage.`
          : `Based on a comprehensive analysis of Sahl's portfolio database, he produces works most frequently in the **${highestCat}** category, focusing on building high-fidelity interactive solutions.`,
        suggestions: ["Show Latest Projects", "Show UI UX Projects"]
      };
    }

    // 8. INTENT DETECT: Strongest Skill / Compare Skills (Analysis Intent)
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

    // 9. INTENT DETECT: Education / University
    if (msgLower.includes("education") || msgLower.includes("study") || msgLower.includes("university") || msgLower.includes("college") || msgLower.includes("school") || msgLower.includes("পড়াশোনা") || msgLower.includes("বিশ্ববিদ্যালয়")) {
      const edu = context.education || [];
      if (edu.length === 0) return null;
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

    // 10. INTENT DETECT: Experience / Work history
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
      if (exp.length === 0) return null;
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

    // 11. INTENT DETECT: Achievements & Awards
    if (msgLower.includes("achievements") || msgLower.includes("achievement") || msgLower.includes("awards") || msgLower.includes("award") || msgLower.includes("latest achievement") || msgLower.includes("অর্জন") || msgLower.includes("পুরস্কার")) {
      const ach = context.achievements || [];
      if (ach.length === 0) return null;
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

    // 12. INTENT DETECT: Skills List
    if (msgLower === "show skills" || msgLower.includes("what skills") || msgLower.includes("skills list")) {
      const skills = context.skills || [];
      if (skills.length === 0) return null;
      const formatted = skills.map((s: any) => `• **${s.name}** (${s.level || "Expert"})`).join('\n');
      return {
        text: `Here is Sahl Ahmed's full skills list from his database:\n\n${formatted}`,
        suggestions: ["Show Experience", "What software do you use most?"]
      };
    }

    // 13. INTENT DETECT: Certificates Match
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

    // 14. INTENT DETECT: Gallery Artwork Match
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

    // 15. INTENT DETECT: Project recommendation / search by software, category or title
    const searchKey = translateSoftwareQuery(msgLower);
    const projs = context.projects || [];
    
    // Check if searching for software, category, or title matches dynamically (Partial & Case Insensitive)
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

    // 16. INTENT DETECT: Latest Project / Latest Content
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

    return null; // Bypasses Firestore engine and routes to reasoning AI Provider layer (Groq/Gemini)
  }

  // Clean cache entries older than 1 hour
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

  // Save successful response to cache
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

  // Groq API client
  async function callGroq(contents: any[], systemInstruction: string, aiConfig: any): Promise<{ text: string; suggestions: string[] }> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    const groqModelName = aiConfig.groqModel || "llama-3.3-70b-versatile";

    // Build messages compatible with Groq API
    const messages = [
      { 
        role: "system", 
        content: `${systemInstruction}\n\nIMPORTANT: You must return your response as a JSON object matching this schema exactly:\n{\n  "text": "Your markdown formatted reply text for Sahl's assistant.",\n  "suggestions": ["3-4 short follow-up questions tailored to Sahl\'s portfolio"]\n}` 
      }
    ];

    for (const c of contents) {
      messages.push({
        role: c.role === 'model' ? 'assistant' : 'user',
        content: c.parts[0].text
      });
    }

    console.log(`[AI Provider Layer] Routing to Groq using model: ${groqModelName}`);

    // Set 8-second timeout for Groq request
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

      try {
        const parsed = JSON.parse(responseContent);
        if (!parsed.text) {
          throw new Error("Malformed response: Missing 'text' field");
        }
        return {
          text: parsed.text,
          suggestions: parsed.suggestions || []
        };
      } catch (jsonErr) {
        throw new Error(`Malformed response / JSON parse error: ${jsonErr}`);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error("Groq timeout");
      }
      throw err;
    }
  }

  // Gemini API client
  async function callGemini(contents: any[], systemInstruction: string, aiConfig: any): Promise<{ text: string; suggestions: string[] }> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured");
    }

    const ai = new GoogleGenAI({ apiKey });
    const selectedModel = aiConfig.model || 'gemini-3.5-flash';

    console.log(`[AI Provider Layer] Routing to Gemini using model: ${selectedModel}`);

    const response = await ai.models.generateContent({
      model: selectedModel,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: aiConfig.temperature !== undefined ? Number(aiConfig.temperature) : 0.7,
        maxOutputTokens: aiConfig.maxOutputTokens ? Number(aiConfig.maxOutputTokens) : 1000,
        topP: aiConfig.topP !== undefined ? Number(aiConfig.topP) : 0.95,
        topK: aiConfig.topK ? Number(aiConfig.topK) : 40,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            text: { 
              type: 'STRING',
              description: 'The markdown formatted reply text for Sahl\'s assistant.' 
            },
            suggestions: {
              type: 'ARRAY',
              items: { type: 'STRING' },
              description: '3-4 highly relevant, short suggested follow-up questions tailored dynamically to Sahl\'s portfolio.'
            }
          },
          required: ['text', 'suggestions']
        }
      }
    });

    if (!response || !response.text || response.text.trim() === "") {
      throw new Error("Empty response from Gemini");
    }

    try {
      const parsed = JSON.parse(response.text);
      if (!parsed.text) {
        throw new Error("Malformed response: Missing 'text' field");
      }
      return {
        text: parsed.text,
        suggestions: parsed.suggestions || []
      };
    } catch (e) {
      throw new Error(`Malformed response from Gemini: ${e}`);
    }
  }

  // Unified AI Provider Layer Interface
  async function callAIProviderLayer(
    userMessage: string,
    sessionId: string,
    contents: any[],
    systemInstruction: string,
    aiConfig: any,
    context: any,
    detectedLang: "bangla" | "banglish" | "english"
  ): Promise<{ text: string; suggestions: string[]; source: "cache" | "session_cache" | "groq" | "gemini" | "fallback"; dynamicContactButtons?: any[] }> {
    
    // 1. Check Session Cache (Discarded when session expires or > 1 hour)
    cleanSessionAiCache();
    const normalizedQuery = userMessage.trim().toLowerCase();
    const cached = sessionAiCache[sessionId]?.[normalizedQuery];
    if (cached && (Date.now() - cached.timestamp < 60 * 60 * 1000)) {
      console.log(`[AI Provider Layer] Cache hit for "${userMessage}" in session ${sessionId}`);
      return {
        text: cached.text,
        suggestions: cached.suggestions,
        source: "session_cache"
      };
    }

    // 2. Knowledge Guard Check
    // Classify the visitor's question first.
    const classification = classifyQuestion(userMessage);
    console.log(`[AI Provider Layer] Question classification: ${classification} for "${userMessage}"`);

    if (classification === 'external') {
      const politeRejectionText = "I'm sorry, I couldn't find that information in Sahl Ahmed's portfolio. I can only answer questions related to Sahl Ahmed's portfolio, projects, skills, experience, education, achievements and contact information.";
      const rejectionSuggestions = ["Show Latest Projects", "Show Skills", "Contact Sahl"];
      
      // Save to session cache so subsequent matching is instantaneous
      saveToSessionAiCache(sessionId, normalizedQuery, politeRejectionText, rejectionSuggestions);
      
      return {
        text: politeRejectionText,
        suggestions: rejectionSuggestions,
        source: "fallback"
      };
    }

    // 3. Smart Response Engine (Firestore Exact Match)
    // Run rule-based response check to ensure ZERO API calls if Firestore contains the answers
    const exactMatch = runSmartResponseEngine(userMessage, context || {}, detectedLang);
    if (exactMatch) {
      console.log(`[AI Provider Layer] Exact match found in Firestore database context for "${userMessage}"`);
      saveToSessionAiCache(sessionId, normalizedQuery, exactMatch.text, exactMatch.suggestions);
      return {
        text: exactMatch.text,
        suggestions: exactMatch.suggestions,
        source: "cache",
        dynamicContactButtons: (exactMatch as any).dynamicContactButtons
      };
    }

    const provider = aiConfig.aiProvider || "auto";

    // Default Fallback
    const friendlyFallbackText = "I'm sorry, I couldn't find that information in Sahl Ahmed's portfolio.";
    const fallbackResponse = {
      text: friendlyFallbackText,
      suggestions: ["Show Skills", "Contact Sahl", "Show Latest Projects"],
      source: "fallback" as const
    };

    // Specific API Down / Failed Reply (Both APIs failed/down)
    const apiDownResponse = {
      text: "Sorry, I can't answer this question right now.",
      suggestions: ["Contact Sahl", "Show Skills"],
      source: "fallback" as const
    };

    // 4. Selected reasoning provider routing
    if (provider === "groq") {
      try {
        const res = await callGroq(contents, systemInstruction, aiConfig);
        saveToSessionAiCache(sessionId, normalizedQuery, res.text, res.suggestions);
        return { ...res, source: "groq" };
      } catch (err) {
        console.error("[AI Provider Layer] Groq direct call failed:", err);
        return apiDownResponse;
      }
    } else if (provider === "gemini") {
      try {
        const res = await callGemini(contents, systemInstruction, aiConfig);
        saveToSessionAiCache(sessionId, normalizedQuery, res.text, res.suggestions);
        return { ...res, source: "gemini" };
      } catch (err) {
        console.error("[AI Provider Layer] Gemini direct call failed:", err);
        return apiDownResponse;
      }
    } else {
      // AUTO mode: Call Groq first, retry with Gemini on Groq failures
      let groqError = null;
      try {
        const res = await callGroq(contents, systemInstruction, aiConfig);
        saveToSessionAiCache(sessionId, normalizedQuery, res.text, res.suggestions);
        return { ...res, source: "groq" };
      } catch (err: any) {
        console.warn(`[AI Provider Layer] Groq failed in AUTO mode (${err.message || err}). Retrying with Gemini...`);
        groqError = err;
      }

      // Retry automatically with Gemini
      try {
        const res = await callGemini(contents, systemInstruction, aiConfig);
        saveToSessionAiCache(sessionId, normalizedQuery, res.text, res.suggestions);
        return { ...res, source: "gemini" };
      } catch (err: any) {
        console.error("[AI Provider Layer] Gemini retry failed in AUTO mode:", err);
        return apiDownResponse;
      }
    }
  }

  // Helper to fetch and cache settings/ai_config
  let cachedAiConfig: { data: any; timestamp: number } | null = null;
  async function getAiConfig() {
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
      const configSnap = await getDoc(doc(db, "settings", "ai_config"));
      if (configSnap.exists()) {
        aiConfig = configSnap.data();
      }
    } catch (err) {
      console.warn("Failed to fetch AI Settings from Firestore. Using fallback:", err);
    }
    cachedAiConfig = { data: aiConfig, timestamp: now };
    return aiConfig;
  }

  // Helper to generate a summary of older conversation history
  async function generateOlderConversationSummary(olderMessages: any[], aiConfig: any): Promise<string> {
    const conversationText = olderMessages.map(m => `${m.sender === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join("\n");
    
    // 1. Try to use Groq as the primary summary engine (since Groq is the primary AI provider!)
    const groqApiKey = process.env.GROQ_API_KEY;
    if (groqApiKey) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      try {
        console.log("[Adaptive Context] Attempting to generate summary with Groq...");
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
            console.log(`[Adaptive Context] Groq summary generated: "${summary}"`);
            return `Previously, the user and assistant discussed: ${summary}`;
          }
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.warn("[Adaptive Context] Groq summary generation failed, falling back to Gemini:", err);
      }
    }

    // 2. Fallback to Gemini
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (geminiApiKey) {
      try {
        console.log("[Adaptive Context] Attempting to generate summary with Gemini...");
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const response = await ai.models.generateContent({
          model: aiConfig.model || 'gemini-3.5-flash',
          contents: [
            {
              role: 'user',
              parts: [{
                text: `Please write a single, short sentence (max 15 words) summarizing what the User and Assistant discussed so far. Do NOT include introductory phrases. Start directly with the core topics:\n\n${conversationText}`
              }]
            }
          ],
          config: {
            maxOutputTokens: 60,
            temperature: 0.3
          }
        });

        const summary = response?.text?.trim();
        if (summary) {
          console.log(`[Adaptive Context] Gemini summary generated: "${summary}"`);
          return `Previously, the user and assistant discussed: ${summary}`;
        }
      } catch (err) {
        console.warn("[Adaptive Context] Gemini summary generation failed:", err);
      }
    }

    // 3. Simple elegant rule-based heuristic fallback if both AI models fail or are unavailable
    try {
      const userQueries = olderMessages
        .filter(m => m.sender === 'user' && m.text && m.text.length > 5)
        .map(m => m.text.trim())
        .slice(-3); // get last 3 user inputs
      
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

  // Adaptive Context window helper
  async function getAdaptiveConversationContext(
    sessionId: string,
    historyMessages: any[],
    userMessage: string,
    aiConfig: any,
    context: any
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
        const sessionDocRef = doc(db, "ai_sessions", sessionId);
        let cachedSummary = "";
        try {
          const sessionSnap = await getDoc(sessionDocRef);
          if (sessionSnap.exists()) {
            cachedSummary = sessionSnap.data().conversationSummary || "";
          }
        } catch (e) {
          const fbSession = fallbackSessionStore[sessionId];
          cachedSummary = fbSession ? (fbSession.conversationSummary || "") : "";
        }

        if (cachedSummary) {
          conversationSummary = cachedSummary;
          console.log(`[Adaptive Context] Found cached conversation summary: "${conversationSummary}"`);
        } else {
          console.log(`[Adaptive Context] Conversation is long (${actualMessages.length} messages). Generating short internal summary...`);
          conversationSummary = await generateOlderConversationSummary(oldMessages, aiConfig);
          
          updateDoc(sessionDocRef, {
            conversationSummary
          }).catch(() => {
            const fbSession = fallbackSessionStore[sessionId];
            if (fbSession) {
              fbSession.conversationSummary = conversationSummary;
            }
          });
        }
      } catch (err) {
        console.error("[Adaptive Context] Failed to handle conversation summary:", err);
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

  // Dedicated Conversation Intent Handler to resolve conversational portfolio intents from Firestore
  async function handleConversationIntent(
    userMessage: string,
    sessionId: string,
    context: any,
    detectedLang: 'bangla' | 'banglish' | 'english',
    aiConfig: any
  ): Promise<{ text: string; suggestions: string[]; dynamicContactButtons?: any[]; navigationSection?: string; projects?: any[] } | null> {
    console.log(`[Conversation Handler] Classifying user message: "${userMessage}"`);
    const msgLower = userMessage.toLowerCase().trim();
    const cleanMsg = msgLower.replace(/[?,.!]/g, "").trim();

    // 1. Define Intent Patterns
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

    // Dynamic social links extraction
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

    // Helper: Build related recommendations string (maximum 3 sections)
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

    // 2. Handle matched intents

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

    // Contact & Coordinates & Social Links
    if (isContact) {
      let contactData: any = null;
      try {
        const contactDocRef = doc(db, 'contact', 'info');
        const snap = await getDoc(contactDocRef);
        if (snap.exists()) {
          contactData = snap.data();
        }
      } catch (err: any) {
        console.error("Firestore fetch failed for contact:", err.message);
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
        const aboutDocRef = doc(db, 'about', 'info');
        const snap = await getDoc(aboutDocRef);
        if (snap.exists()) {
          aboutData = snap.data();
        }
      } catch (err: any) {
        console.error("Firestore fetch failed for about info:", err.message);
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

    // Skills & Expertise
    if (isSkills) {
      const skills = context.skills || [];
      let text = "";
      if (skills.length > 0) {
        text = "I've automatically navigated to Sahl's **Credentials & Skills** section under the About tab!\n\nHere are Sahl Ahmed's core competencies:\n\n";
        skills.forEach((s: any) => {
          text += `• **${s.name}** (${s.proficiency || 'Advanced'}): ${s.description || ''}\n`;
        });
      } else {
        text = "I couldn't find a dedicated Skills page. I've opened Sahl Ahmed's **More Work** section because it showcases Sahl's practical work and provides a better understanding of his skills, software knowledge, and creative experience.";
      }
      text += buildRecommendations("skills");
      return {
        text,
        suggestions: ["What software do you use?", "Show Latest Projects", "Contact Sahl"],
        navigationSection: "skills",
        dynamicContactButtons
      };
    }

    // Software Knowledge
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
      let text = "I've taken you to the Achievements section.\n\nHere you can explore Sahl Ahmed's awards, recognitions, certifications, and outstanding milestones Sahl has reached throughout his creative career.";
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

    // Featured Masterpieces
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

    // More Work / Gallery
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

  // API Route: chat stream proxy endpoint
  app.post("/api/chat/stream", async (req, res) => {
    let connectionClosed = false;
    let abortController = new AbortController();

    const sendEvent = (event: string, data: any) => {
      if (connectionClosed || res.writableEnded || (res as any).finished) return;
      try {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      } catch (err) {
        console.warn("[Chat Stream] res.write failed:", err);
      }
    };

    req.on("close", () => {
      connectionClosed = true;
      abortController.abort();
      console.log("[Chat Stream] Connection closed by client.");
    });

    try {
      const { userMessage, sessionId, context } = req.body;

      if (!userMessage || !sessionId) {
        res.status(400).send("userMessage and sessionId are required");
        return;
      }

      // Set SSE headers with writeHead to flush immediately and disable buffering
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
      });

      // Helper function to stream a static text progressively with smooth simulated delay
      const streamStaticText = async (
        text: string,
        suggestions: string[],
        source: string,
        dynamicContactButtons?: any[],
        navigationSection?: string,
        projects?: any[]
      ) => {
        const words = text.split(/(\s+)/); // keep spaces
        for (const word of words) {
          if (connectionClosed || res.writableEnded || (res as any).finished) return;
          sendEvent("text", { text: word });
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
        sendEvent("done", { suggestions, dynamicContactButtons, source, navigationSection, projects });
        if (!res.writableEnded && !(res as any).finished) {
          try {
            res.end();
          } catch (e) {
            console.warn("[Chat Stream] Failed to end stream:", e);
          }
        }
      };

      // 1. Fetch Dynamic AI Config
      const aiConfig = await getAiConfig();

      if (!aiConfig.enabled) {
        const offlineReply = "I'm sorry, my AI Assistant services are currently offline. Please reach out to Sahl Ahmed directly via WhatsApp or the contact form below!";
        await streamStaticText(
          offlineReply,
          ["Contact Sahl", "Show Skills"],
          "fallback"
        );
        return;
      }

      const detectedLang = detectLanguage(userMessage);

      // 2. Check Session Cache Hit
      cleanSessionAiCache();
      const normalizedQuery = userMessage.trim().toLowerCase();
      const cached = sessionAiCache[sessionId]?.[normalizedQuery];
      if (cached && (Date.now() - cached.timestamp < 60 * 60 * 1000)) {
        console.log(`[Chat Stream] Session cache hit for "${userMessage}"`);
        await streamStaticText(cached.text, cached.suggestions, "session_cache");
        return;
      }

      // 3. Knowledge Guard Check
      const classification = classifyQuestion(userMessage);
      if (classification === 'external') {
        const politeRejectionText = "I'm sorry, I couldn't find that information in Sahl Ahmed's portfolio. I can only answer questions related to Sahl Ahmed's portfolio, projects, skills, experience, education, achievements and contact information.";
        const rejectionSuggestions = ["Show Latest Projects", "Show Skills", "Contact Sahl"];
        saveToSessionAiCache(sessionId, normalizedQuery, politeRejectionText, rejectionSuggestions);
        await streamStaticText(politeRejectionText, rejectionSuggestions, "fallback");
        return;
      }

      // 4. Smart Response Engine (Firestore Exact Match)
      const exactMatch = runSmartResponseEngine(userMessage, context || {}, detectedLang);
      if (exactMatch) {
        console.log(`[Chat Stream] Exact match found for "${userMessage}"`);
        saveToSessionAiCache(sessionId, normalizedQuery, exactMatch.text, exactMatch.suggestions);
        await streamStaticText(
          exactMatch.text,
          exactMatch.suggestions,
          "cache",
          exactMatch.dynamicContactButtons
        );
        return;
      }

      // NEW: Dedicated Conversation Intent Handler (executes BEFORE AI Provider selection)
      const conversationResponse = await handleConversationIntent(
        userMessage,
        sessionId,
        context || {},
        detectedLang,
        aiConfig
      );
      if (conversationResponse) {
        console.log(`[Chat Stream] Conversation Intent Handled for "${userMessage}"`);
        saveToSessionAiCache(sessionId, normalizedQuery, conversationResponse.text, conversationResponse.suggestions);
        
        // Save messages and update activity inside Firestore / Fallback
        const now = new Date();
        const chatPairUser = {
          id: `msg-${Date.now()}-user`,
          sender: "user",
          text: userMessage,
          timestamp: now.toISOString()
        };
        const chatPairAI = {
          id: `msg-${Date.now()}-ai`,
          sender: "ai",
          text: conversationResponse.text,
          timestamp: now.toISOString()
        };

        const sessionDocRef = doc(db, "ai_sessions", sessionId);
        await updateDoc(sessionDocRef, {
          messages: arrayUnion(chatPairUser, chatPairAI),
          lastActivity: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
        }).catch(() => {
          setDoc(sessionDocRef, {
            sessionId,
            messages: [chatPairUser, chatPairAI],
            createdAt: now.toISOString(),
            lastActivity: now.toISOString(),
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
          }).catch(() => {
            const existing = fallbackSessionStore[sessionId] || {
              messages: [],
              createdAt: now.toISOString(),
              lastActivity: now.toISOString(),
              expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
            };
            existing.messages.push(chatPairUser, chatPairAI);
            existing.lastActivity = now.toISOString();
            existing.expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
            fallbackSessionStore[sessionId] = existing;
          });
        });

         await streamStaticText(
          conversationResponse.text,
          conversationResponse.suggestions,
          "conversation_handler",
          conversationResponse.dynamicContactButtons,
          (conversationResponse as any).navigationSection,
          (conversationResponse as any).projects
        );
        return;
      }

      // 5. Route to AI Provider (Groq or Gemini)
      const provider = aiConfig.aiProvider || "auto";

      // Prepare conversation history context
      const sessionDocRef = doc(db, "ai_sessions", sessionId);
      let historyMessages: any[] = [];
      try {
        const sessionSnap = await getDoc(sessionDocRef);
        historyMessages = sessionSnap.exists() ? (sessionSnap.data().messages || []) : [];
      } catch (err) {
        const fbSession = fallbackSessionStore[sessionId];
        historyMessages = fbSession ? (fbSession.messages || []) : [];
      }

      // Generate optimized adaptive context and system instructions (max 2 exchanges)
      const { contents, baseSystemInstruction } = await getAdaptiveConversationContext(
        sessionId,
        historyMessages,
        userMessage,
        aiConfig,
        context
      );

      // Build system prompt with instructions for streaming recommendations
      const systemInstruction = `${baseSystemInstruction}

Response Format:
You must reply in plain markdown. Do NOT wrap your response in a JSON object.
At the very end of your response, after your message, you must output a separator line "---SUGGESTIONS---" followed by a JSON array of 3-4 highly relevant, short follow-up questions (under 40 characters each, no numbering), on a single line.
Example:
Hello Sahl is...
---SUGGESTIONS---
["Show Latest Projects", "Contact Sahl", "Show Skills"]
`;

      let finalMainText = "";
      let suggestions: string[] = ["Show Latest Projects", "Show Skills", "Contact Sahl"];
      let selectedProvider: "groq" | "gemini" | "fallback" = "fallback";

      let sentTextLength = 0;
      let accumulatedText = "";
      let hasSuggestionsSeparator = false;
      let suggestionsBuffer = "";

      const handleTextChunk = (chunk: string) => {
        accumulatedText += chunk;
        const separatorIdx = accumulatedText.indexOf("---SUGGESTIONS---");
        if (separatorIdx !== -1) {
          hasSuggestionsSeparator = true;
          const totalMainText = accumulatedText.substring(0, separatorIdx);
          const toSend = totalMainText.substring(sentTextLength);
          if (toSend) {
            sendEvent("text", { text: toSend });
            sentTextLength = totalMainText.length;
          }
          suggestionsBuffer = accumulatedText.substring(separatorIdx + "---SUGGESTIONS---".length);
        } else {
          const separator = "---SUGGESTIONS---";
          let partialLength = 0;
          for (let i = 1; i < separator.length; i++) {
            const suffix = accumulatedText.substring(accumulatedText.length - i);
            if (separator.startsWith(suffix)) {
              partialLength = i;
            }
          }
          const sendLimit = accumulatedText.length - partialLength;
          const toSend = accumulatedText.substring(sentTextLength, sendLimit);
          if (toSend) {
            sendEvent("text", { text: toSend });
            sentTextLength += toSend.length;
          }
        }
      };

      const streamFromGroq = async (): Promise<boolean> => {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) return false;

        const groqModelName = aiConfig.groqModel || "llama-3.3-70b-versatile";
        console.log(`[Chat Stream] Call Groq: ${groqModelName}`);

        const messages = [
          { role: "system", content: systemInstruction }
        ];
        for (const c of contents) {
          messages.push({
            role: c.role === 'model' ? 'assistant' : 'user',
            content: c.parts[0].text
          });
        }

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: groqModelName,
            messages,
            temperature: aiConfig.temperature !== undefined ? Number(aiConfig.temperature) : 0.7,
            max_tokens: aiConfig.maxOutputTokens ? Number(aiConfig.maxOutputTokens) : 1000,
            stream: true
          }),
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error(`Groq stream failed: ${response.statusText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) return false;

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done || connectionClosed) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine) continue;
            if (cleanLine === "data: [DONE]") break;
            if (cleanLine.startsWith("data: ")) {
              try {
                const parsedObj = JSON.parse(cleanLine.substring(6));
                const deltaText = parsedObj.choices?.[0]?.delta?.content;
                if (deltaText) {
                  handleTextChunk(deltaText);
                }
              } catch (err) {
                // Ignore parse errors on partial JSON chunks
              }
            }
          }
        }

        return true;
      };

      const streamFromGemini = async (): Promise<boolean> => {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return false;

        const selectedModel = aiConfig.model || 'gemini-3.5-flash';
        console.log(`[Chat Stream] Call Gemini: ${selectedModel}`);

        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build'
            }
          }
        });

        const responseStream = await ai.models.generateContentStream({
          model: selectedModel,
          contents: contents,
          config: {
            systemInstruction,
            temperature: aiConfig.temperature !== undefined ? Number(aiConfig.temperature) : 0.7,
            maxOutputTokens: aiConfig.maxOutputTokens ? Number(aiConfig.maxOutputTokens) : 1000,
            topP: aiConfig.topP !== undefined ? Number(aiConfig.topP) : 0.95,
            topK: aiConfig.topK ? Number(aiConfig.topK) : 40,
          }
        });

        for await (const chunk of responseStream) {
          if (connectionClosed) break;
          const text = chunk.text;
          if (text) {
            handleTextChunk(text);
          }
        }

        return true;
      };

      // Perform AI Stream Routing with 3-second timeout protection
      let success = false;
      const streamRoutingPromise = (async () => {
        if (provider === "groq") {
          try {
            success = await streamFromGroq();
            if (success) selectedProvider = "groq";
          } catch (err) {
            console.error("[Chat Stream] Groq stream failed:", err);
          }
        } else if (provider === "gemini") {
          try {
            success = await streamFromGemini();
            if (success) selectedProvider = "gemini";
          } catch (err) {
            console.error("[Chat Stream] Gemini stream failed:", err);
          }
        } else {
          // AUTO mode: Try Groq first, retry with Gemini on Groq failure
          try {
            success = await streamFromGroq();
            if (success) selectedProvider = "groq";
          } catch (err) {
            console.warn("[Chat Stream] Groq failed, falling back to Gemini...", err);
          }

          if (!success) {
            try {
              success = await streamFromGemini();
              if (success) selectedProvider = "gemini";
            } catch (err) {
              console.error("[Chat Stream] Gemini fallback failed:", err);
            }
          }
        }
      })();

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error("Timeout")), 12000);
      });

      try {
        await Promise.race([streamRoutingPromise, timeoutPromise]);
      } catch (err: any) {
        console.error("[Stage Failed: AI Provider] Stream routing exceeded 12 seconds timeout limit:", err.message || err);
        success = false;
      }

      // If both providers failed or yielded nothing, fall back to default rejection
      if (!success || accumulatedText.trim() === "") {
        const fallbackText = !success 
          ? "Sorry, I can't answer this question right now."
          : "I'm sorry, I couldn't find that information in Sahl Ahmed's portfolio.";
        await streamStaticText(
          fallbackText,
          ["Show Skills", "Contact Sahl", "Show Latest Projects"],
          "fallback"
        );
        return;
      }

      // Extract main response text and final suggestions from the buffer
      const separatorIdx = accumulatedText.indexOf("---SUGGESTIONS---");
      if (separatorIdx !== -1) {
        finalMainText = accumulatedText.substring(0, separatorIdx).trim();
      } else {
        finalMainText = accumulatedText.trim();
      }

      // Flush any remaining unsent main text
      if (sentTextLength < finalMainText.length) {
        const remainingMain = finalMainText.substring(sentTextLength);
        if (remainingMain) {
          sendEvent("text", { text: remainingMain });
        }
      }

      if (suggestionsBuffer) {
        try {
          const cleanBuffer = suggestionsBuffer.trim();
          const jsonMatch = cleanBuffer.match(/\[\s*".*?"\s*\]/s) || cleanBuffer.match(/\[.*\]/s);
          const jsonStr = jsonMatch ? jsonMatch[0] : cleanBuffer;
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            suggestions = parsed.map(item => String(item).trim()).filter(Boolean);
          }
        } catch (err) {
          console.warn("[Chat Stream] Failed to parse suggestions:", suggestionsBuffer, err);
        }
      }

      // Clean up final values
      saveToSessionAiCache(sessionId, normalizedQuery, finalMainText, suggestions);

      // Determine dynamic contact buttons
      let dynamicContactButtons: any[] | undefined = undefined;
      const finalLower = finalMainText.toLowerCase();
      if (
        finalLower.includes("contact") ||
        finalLower.includes("email") ||
        finalLower.includes("whatsapp") ||
        finalLower.includes("facebook") ||
        finalLower.includes("linkedin") ||
        finalLower.includes("github") ||
        finalLower.includes("youtube") ||
        finalLower.includes("instagram") ||
        finalLower.includes("behance") ||
        finalLower.includes("artstation") ||
        finalLower.includes("dribbble") ||
        finalLower.includes("social link") ||
        finalLower.includes("shsahl1125@gmail.com")
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

      // Send final event with complete metadata
      sendEvent("done", {
        suggestions,
        dynamicContactButtons,
        source: selectedProvider
      });

      // Save messages and update activity inside Firestore / Fallback
      const now = new Date();
      const chatPairUser = {
        id: `msg-${Date.now()}-user`,
        sender: "user",
        text: userMessage,
        timestamp: now.toISOString()
      };
      const chatPairAI = {
        id: `msg-${Date.now()}-ai`,
        sender: "ai",
        text: finalMainText,
        timestamp: now.toISOString()
      };

      await updateDoc(sessionDocRef, {
        messages: arrayUnion(chatPairUser, chatPairAI),
        lastActivity: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
      }).catch(() => {
        setDoc(sessionDocRef, {
          sessionId,
          messages: [chatPairUser, chatPairAI],
          createdAt: now.toISOString(),
          lastActivity: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
        }).catch(() => {
          // Fallback to in-memory store
          const existing = fallbackSessionStore[sessionId] || {
            messages: [],
            createdAt: now.toISOString(),
            lastActivity: now.toISOString(),
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
          };
          existing.messages.push(chatPairUser, chatPairAI);
          existing.lastActivity = now.toISOString();
          existing.expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
          fallbackSessionStore[sessionId] = existing;
        });
      });

      if (!res.writableEnded && !(res as any).finished) {
        try {
          res.end();
        } catch (e) {
          console.warn("[Chat Stream] Failed to end stream:", e);
        }
      }

    } catch (error: any) {
      console.error("[Chat Stream] Fatal stream handler error:", error);
      sendEvent("error", {
        message: "I'm sorry, I encountered an unexpected error processing your message. Please try again or feel free to reach out to Sahl directly!"
      });
      if (!res.writableEnded && !(res as any).finished) {
        try {
          res.end();
        } catch (e) {
          console.warn("[Chat Stream] Failed to end stream in catch:", e);
        }
      }
    }
  });

  // API Route: chat proxy endpoint
  app.post("/api/chat", async (req, res) => {
    try {
      const { userMessage, sessionId, context } = req.body;

      if (!userMessage) {
        return res.status(400).json({ error: "userMessage is required" });
      }

      if (!sessionId) {
        return res.status(400).json({ error: "sessionId is required" });
      }

      const aiConfig = await getAiConfig();

      // Check if AI is disabled
      if (!aiConfig.enabled) {
        const offlineReply = "I'm sorry, my AI Assistant services are currently offline. Please reach out to Sahl Ahmed directly via WhatsApp or the contact form below!";
        return res.json({
          text: offlineReply,
          suggestions: ["Contact Sahl", "Show Skills"]
        });
      }

      const detectedLang = detectLanguage(userMessage);

      // NEW: Dedicated Conversation Intent Handler (executes BEFORE context retrieval and AI Provider selection)
      const conversationResponse = await handleConversationIntent(
        userMessage,
        sessionId,
        context || {},
        detectedLang,
        aiConfig
      );

      const sessionDocRef = doc(db, "ai_sessions", sessionId);

      if (conversationResponse) {
        console.log(`[Chat] Conversation Intent Handled for "${userMessage}"`);
        
        // Save messages and update activity inside Firestore / Fallback
        const now = new Date();
        const chatPairUser = {
          id: `msg-${Date.now()}-user`,
          sender: "user",
          text: userMessage,
          timestamp: now.toISOString()
        };
        const chatPairAI = {
          id: `msg-${Date.now()}-ai`,
          sender: "ai",
          text: conversationResponse.text,
          timestamp: now.toISOString()
        };

        await updateDoc(sessionDocRef, {
          messages: arrayUnion(chatPairUser, chatPairAI),
          lastActivity: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
        }).catch(() => {
          setDoc(sessionDocRef, {
            sessionId,
            messages: [chatPairUser, chatPairAI],
            createdAt: now.toISOString(),
            lastActivity: now.toISOString(),
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
          }).catch(() => {
            const existing = fallbackSessionStore[sessionId] || {
              messages: [],
              createdAt: now.toISOString(),
              lastActivity: now.toISOString(),
              expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
            };
            existing.messages.push(chatPairUser, chatPairAI);
            existing.lastActivity = now.toISOString();
            existing.expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
            fallbackSessionStore[sessionId] = existing;
          });
        });

        return res.json({
          text: conversationResponse.text,
          suggestions: conversationResponse.suggestions,
          source: "conversation_handler",
          dynamicContactButtons: conversationResponse.dynamicContactButtons,
          navigationSection: (conversationResponse as any).navigationSection,
          projects: (conversationResponse as any).projects
        });
      }

      // Fetch message history from Firestore session to maintain conversational memory
      let historyMessages = [];
      try {
        const sessionSnap = await getDoc(sessionDocRef);
        historyMessages = sessionSnap.exists() ? (sessionSnap.data().messages || []) : [];
      } catch (err) {
        console.warn("Firestore getDoc failed for session history in /api/chat:", err);
        const fbSession = fallbackSessionStore[sessionId];
        historyMessages = fbSession ? (fbSession.messages || []) : [];
      }

      // Generate optimized adaptive context and system instructions (max 2 exchanges)
      const { contents, baseSystemInstruction } = await getAdaptiveConversationContext(
        sessionId,
        historyMessages,
        userMessage,
        aiConfig,
        context
      );

      const systemInstruction = baseSystemInstruction;

      // Route through unified AI Provider Layer with 3-second timeout protection
      const aiResponsePromise = callAIProviderLayer(
        userMessage,
        sessionId,
        contents,
        systemInstruction,
        aiConfig,
        context,
        detectedLang
      );

      const timeoutPromise = new Promise<any>((_, reject) => {
        setTimeout(() => reject(new Error("Timeout")), 12000);
      });

      let aiResponse;
      try {
        aiResponse = await Promise.race([aiResponsePromise, timeoutPromise]);
      } catch (err: any) {
        console.error("[Stage Failed: AI Provider] callAIProviderLayer exceeded 12 seconds timeout limit:", err.message || err);
        aiResponse = {
          text: "Sorry, I can't answer this question right now.",
          suggestions: ["Contact Sahl", "Show Skills"],
          source: "fallback"
        };
      }

      if (!aiResponse) {
        aiResponse = {
          text: "Sorry, I can't answer this question right now.",
          suggestions: ["Contact Sahl", "Show Skills"],
          source: "fallback"
        };
      }

      let dynamicContactButtons = aiResponse.dynamicContactButtons;

      // Dynamic fallback extraction of contact buttons if the response references Sahl's contact channels
      if (!dynamicContactButtons) {
        const responseTextLower = (aiResponse.text || "").toLowerCase();
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
      }

      // Save messages and update activity inside Firestore / Fallback
      const now = new Date();
      const chatPairUser = {
        id: `msg-${Date.now()}-user`,
        sender: "user",
        text: userMessage,
        timestamp: now.toISOString()
      };
      const chatPairAI = {
        id: `msg-${Date.now()}-ai`,
        sender: "ai",
        text: aiResponse.text,
        timestamp: now.toISOString()
      };

      await updateDoc(sessionDocRef, {
        messages: arrayUnion(chatPairUser, chatPairAI),
        lastActivity: now.toISOString(),
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
      }).catch(() => {
        setDoc(sessionDocRef, {
          sessionId,
          messages: [chatPairUser, chatPairAI],
          createdAt: now.toISOString(),
          lastActivity: now.toISOString(),
          expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
        }).catch(() => {
          // Fallback to in-memory store
          const existing = fallbackSessionStore[sessionId] || {
            messages: [],
            createdAt: now.toISOString(),
            lastActivity: now.toISOString(),
            expiresAt: new Date(now.getTime() + 60 * 60 * 1000).toISOString()
          };
          existing.messages.push(chatPairUser, chatPairAI);
          existing.lastActivity = now.toISOString();
          existing.expiresAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
          fallbackSessionStore[sessionId] = existing;
        });
      });

      res.json({
        text: aiResponse.text,
        suggestions: aiResponse.suggestions,
        source: aiResponse.source,
        dynamicContactButtons
      });

    } catch (error: any) {
      console.error("Error in /api/chat endpoint:", error);
      res.json({ 
        text: `I'm sorry, I encountered an unexpected error processing your message. Please try again or feel free to reach out to Sahl directly via WhatsApp or email!`,
        suggestions: ["Contact Sahl", "Show Skills"],
        source: "cache"
      });
    }
  });

  // Dynamically serve robots.txt
  app.get("/robots.txt", (req, res) => {
    const protocol = req.protocol || "https";
    const host = req.get("host") || "sahl-ahmed.web.app";
    const BASE_URL = `${protocol}://${host}`;

    res.header("Content-Type", "text/plain");
    res.send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /private
Disallow: /api/session/
Disallow: /api/chat

Sitemap: ${BASE_URL}/sitemap.xml
`);
  });

  // Google Search Console HTML Verification File Route
  app.get("/google*.html", (req, res) => {
    const filename = req.path.substring(1); // e.g. "google1234567.html"
    const envFilename = process.env.VITE_GSC_VERIFICATION_HTML_FILE || "google-verification-placeholder.html";
    const envContent = process.env.VITE_GSC_VERIFICATION_HTML_CONTENT || "google-site-verification: google-verification-placeholder.html";
    
    res.header("Content-Type", "text/html");
    if (filename === envFilename) {
      res.send(envContent);
    } else {
      res.send(`google-site-verification: ${filename.replace(".html", "")}`);
    }
  });

  // Bing Webmaster Tools XML Site Authorization File Route
  app.get("/BingSiteAuth.xml", (req, res) => {
    const xmlContent = process.env.VITE_BING_VERIFICATION_XML_CONTENT || 
      `<?xml version="1.0"?><users><user>your_bing_auth_code_placeholder</user></users>`;
    res.header("Content-Type", "application/xml");
    res.send(xmlContent);
  });

  // IndexNow API Key Ownership Verification Route
  app.get("/:key.txt", (req, res) => {
    const requestedKey = req.params.key;
    const apiKey = process.env.VITE_INDEXNOW_API_KEY || "";
    
    // Check if the requested file matches the pattern of an IndexNow key (min 8 chars)
    if (apiKey && requestedKey === apiKey && apiKey.length >= 8) {
      res.header("Content-Type", "text/plain");
      res.send(apiKey);
    } else {
      res.status(404).send("Not Found");
    }
  });

  // Dynamically generate and serve sitemap.xml in real-time from Firestore data
  app.get("/sitemap.xml", async (req, res) => {
    try {
      const protocol = req.protocol || "https";
      const host = req.get("host") || "sahl-ahmed.web.app";
      const BASE_URL = `${protocol}://${host}`;
      
      // Fetch dynamic contents from Firestore to calculate accurate lastmod and include dynamic routes
      const masterpiecesSnap = await getDocs(collection(db, "projects")).catch(() => null);
      const gallerySnap = await getDocs(collection(db, "gallery")).catch(() => null);
      const experienceSnap = await getDocs(collection(db, "experience")).catch(() => null);
      const achievementsSnap = await getDocs(collection(db, "achievements")).catch(() => null);

      const projects: any[] = [];
      if (masterpiecesSnap) {
        masterpiecesSnap.forEach(d => {
          projects.push({ id: d.id, isGallery: false, ...d.data() });
        });
      }

      const galleryItems: any[] = [];
      if (gallerySnap) {
        gallerySnap.forEach(d => {
          galleryItems.push({ id: d.id, isGallery: true, ...d.data() });
        });
      }

      const experiences: any[] = [];
      if (experienceSnap) {
        experienceSnap.forEach(d => {
          experiences.push({ id: d.id, ...d.data() });
        });
      }

      const achievements: any[] = [];
      if (achievementsSnap) {
        achievementsSnap.forEach(d => {
          achievements.push({ id: d.id, ...d.data() });
        });
      }

      // Find the absolute latest timestamp to represent general sitemap lastmod
      let latestDate = new Date("2026-07-17"); // local base time
      
      const checkAndSetLatest = (dateStr: any) => {
        if (!dateStr) return;
        const d = new Date(dateStr);
        if (!isNaN(d.getTime()) && d > latestDate) {
          latestDate = d;
        }
      };

      // Helper to extract a formatted date (YYYY-MM-DD)
      const formatDate = (date: Date) => {
        try {
          return date.toISOString().split("T")[0];
        } catch {
          return "2026-07-17";
        }
      };

      // Process lastmod across collections
      projects.forEach(p => {
        checkAndSetLatest(p.updatedAt);
        checkAndSetLatest(p.createdAt);
      });
      galleryItems.forEach(p => {
        checkAndSetLatest(p.updatedAt);
        checkAndSetLatest(p.createdAt);
      });
      experiences.forEach(e => {
        checkAndSetLatest(e.updatedAt);
        checkAndSetLatest(e.createdAt);
      });
      achievements.forEach(a => {
        checkAndSetLatest(a.updatedAt);
        checkAndSetLatest(a.createdAt);
      });

      const rootLastMod = formatDate(latestDate);

      // Define static routes with search engine priorities
      const staticPages = [
        { loc: "/", priority: "1.0", changefreq: "daily", lastmod: rootLastMod },
        { loc: "/about", priority: "0.8", changefreq: "weekly", lastmod: rootLastMod },
        { loc: "/projects", priority: "0.9", changefreq: "daily", lastmod: rootLastMod },
        { loc: "/gallery", priority: "0.8", changefreq: "daily", lastmod: rootLastMod },
        { loc: "/contact", priority: "0.7", changefreq: "monthly", lastmod: rootLastMod },
        { loc: "/achievements", priority: "0.8", changefreq: "weekly", lastmod: rootLastMod },
        { loc: "/more-works", priority: "0.8", changefreq: "weekly", lastmod: rootLastMod },
      ];

      // Build XML items
      let xmlItems = "";

      // Add static pages
      staticPages.forEach(p => {
        xmlItems += `  <url>
    <loc>${BASE_URL}${p.loc}</loc>
    <lastmod>${p.lastmod}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>\n`;
      });

      // Add masterpieces (projects) dynamic pages
      projects.forEach(p => {
        const itemLastmod = p.updatedAt || p.createdAt || rootLastMod;
        const formattedItemLastmod = formatDate(new Date(itemLastmod));
        xmlItems += `  <url>
    <loc>${BASE_URL}/projects/${p.id}</loc>
    <lastmod>${formattedItemLastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>\n`;
      });

      // Add gallery dynamic pages
      galleryItems.forEach(p => {
        const itemLastmod = p.updatedAt || p.createdAt || rootLastMod;
        const formattedItemLastmod = formatDate(new Date(itemLastmod));
        xmlItems += `  <url>
    <loc>${BASE_URL}/gallery/${p.id}</loc>
    <lastmod>${formattedItemLastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>\n`;
      });

      // Assemble final XML sitemap
      const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlItems}</urlset>`;

      res.header("Content-Type", "application/xml");
      res.send(sitemapXml);

    } catch (error) {
      console.error("Error generating dynamic sitemap.xml:", error);
      res.status(500).send("Error generating sitemap.xml");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
