import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Send, 
  Sparkles, 
  Maximize2, 
  Minimize2, 
  MessageSquare,
  ArrowRight,
  Info,
  Layers,
  Terminal,
  HelpCircle,
  ThumbsUp,
  Eye,
  Download,
  Phone,
  Mail,
  ExternalLink,
  Calendar,
  Code,
  Award,
  Search,
  Compass,
  Briefcase,
  Play
} from 'lucide-react';
import Markdown from 'react-markdown';
import { sendChatMessage, sendChatMessageStream, initChatSession, ChatMessage } from '../services/ai';
import { Project, SkillItem } from '../types';
import { trackAiChatbotConversationStarted } from '../services/analytics';

interface AskSahlAIProps {
  onClose: () => void;
  isDarkMode: boolean;
  context: any;
  onOpenProject?: (project: Project) => void;
  onNavigateToSection?: (section: string) => void;
}

export default function AskSahlAI({ 
  onClose, 
  isDarkMode, 
  context, 
  onOpenProject, 
  onNavigateToSection 
}: AskSahlAIProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeAbortController = useRef<AbortController | null>(null);

  // Cleanup active streams on unmount
  useEffect(() => {
    return () => {
      if (activeAbortController.current) {
        activeAbortController.current.abort();
      }
    };
  }, []);

  // Suggested questions state - updated dynamically by Gemini
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([
    'Tell me about Sahl',
    'Show latest projects',
    'Show achievements',
    'What software does Sahl use?',
    'Show UI/UX projects',
    'Show 3D projects',
    'Contact Sahl'
  ]);

  // Session ID management
  const [sessionId] = useState(() => {
    let sid = localStorage.getItem('sahl_chat_session_id');
    if (!sid) {
      sid = 'session_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('sahl_chat_session_id', sid);
    }
    return sid;
  });

  // Dynamic WhatsApp URL extracted from context.socials to prevent hardcoding links!
  const whatsappUrl = useMemo(() => {
    if (context && Array.isArray(context.socials)) {
      const waItem = context.socials.find((s: any) => {
        const name = s.name?.toLowerCase().trim() || '';
        return name === 'whatsapp' || name === 'phone' || name === 'mobile' || name === 'number' || name.includes('whatsapp');
      });
      if (waItem && waItem.url) {
        return waItem.url;
      }
    }
    return "https://wa.me/8801949380524?text=Hi%20Sahl,%20I'm%20interested%20in%20your%20design%20services!";
  }, [context]);

  // Restore existing session on mount
  useEffect(() => {
    const restoreSession = async () => {
      setIsTyping(true);
      try {
        const historyMsgs = await initChatSession(sessionId);
        if (historyMsgs && historyMsgs.length > 0) {
          setMessages(historyMsgs);
        } else {
          setMessages([
            {
              id: 'welcome-msg',
              sender: 'ai',
              text: `Hello 👋\n\nI'm **Sahl Ahmed's AI Portfolio Assistant**.\n\nYou can ask me anything about:\n• **About Me** (Sahl's story & vision)\n• **Skills & Software Armory**\n• **Experience & Education**\n• **Design Projects (UI/UX & 3D)**\n• **Achievements & Awards**\n• **Contact & Social Links**\n\nI will answer using real information available on Sahl's portfolio!`,
              timestamp: new Date(),
              actionButtons: true
            }
          ]);
        }
      } catch (err) {
        console.error("Failed to restore session, starting fresh:", err);
      } finally {
        setIsTyping(false);
      }
    };

    restoreSession();
  }, [sessionId]);

  // Auto scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, isSearching, isMinimized]);

  // Auto-expand input area
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  // Client-Side Smart Portfolio Search and Command Engine
  const handleLocalQueryAndActions = (userQuery: string): ChatMessage | null => {
    const query = userQuery.toLowerCase().trim();
    const cleanMsg = query.replace(/[?,.!]/g, "").trim();

    // 1. SMART NAVIGATIONAL / SEMANTIC SECTION MAPPING
    // Identify whether the user's request refers to an existing portfolio section using natural language
    const navigationVerbs = ["show", "open", "go to", "take me to", "view", "see", "browse", "explore", "navigate to", "scroll to", "take me"];
    const hasNavVerb = navigationVerbs.some(verb => cleanMsg.startsWith(verb + " ") || cleanMsg.includes(" " + verb + " "));

    // Define strict semantic mapping groups as requested by the user
    const masterpiecePhrases = [
      "show best works", "show best projects", "show featured works", "show top works", "show top projects",
      "show your best designs", "show your best creations", "show your masterpiece", "show masterpiece",
      "best portfolio", "best work", "favorite work", "top designs", "featured projects", "highlighted works",
      "portfolio highlights", "best creations", "your masterpiece", "featured masterpieces", "best design", "finest"
    ];

    const moreWorkPhrases = [
      "more work", "other work", "additional work", "extra work", "older projects", "all projects",
      "see everything", "more portfolio", "more creations", "more works", "other works", "additional works", "extra projects"
    ];

    const projectsPhrases = [
      "projects", "portfolio", "works", "designs", "case studies"
    ];

    const galleryPhrases = [
      "gallery", "photos", "images", "artwork", "renders", "visuals", "render", "drawing", "illustration", "drawings", "illustrations", "daily practice", "shaders"
    ];

    const experiencePhrases = [
      "experience", "career", "professional history", "work history", "background", "professional experience",
      "job", "employment", "employer", "portfolio history", "career trajectory"
    ];

    const educationPhrases = [
      "education", "study", "university", "academic background", "qualification", "academic", "school",
      "college", "institution", "academic credentials"
    ];

    const achievementsPhrases = [
      "achievement", "award", "certificate", "recognition", "competition", "awards", "achievements",
      "certificates", "key metrics", "wins", "honors", "metric", "certification", "certifications", "credential"
    ];

    const contactPhrases = [
      "contact", "hire", "email", "phone", "reach sahl", "reach Sahl", "contact form", "let's work together",
      "lets work together", "work together", "how can i contact you", "contact info", "whatsapp number", "social links"
    ];

    // Helper checking matching logic
    const checkMatch = (phrases: string[], keywords: string[]) => {
      if (phrases.some(phrase => cleanMsg === phrase || cleanMsg.includes(phrase))) {
        return true;
      }
      if (hasNavVerb) {
        return keywords.some(keyword => cleanMsg.includes(keyword));
      }
      return false;
    };

    // Priority Check matches
    const isMasterpieceMatch = checkMatch(masterpiecePhrases, ["masterpiece", "masterpieces", "featured masterpieces", "best works", "best projects", "top works", "top projects", "featured work", "favorite works", "favorite work", "best design", "best designs", "finest"]);
    const isMoreWorkMatch = checkMatch(moreWorkPhrases, ["more work", "more works", "other work", "other works", "additional work", "additional works", "extra work", "extra projects", "older projects", "all projects", "see everything", "more portfolio", "more creations"]);
    const isProjectsMatch = checkMatch(projectsPhrases, ["projects", "portfolio", "works", "designs", "case studies"]) && !isMasterpieceMatch;
    const isGalleryMatch = checkMatch(galleryPhrases, ["gallery", "photos", "images", "artwork", "renders", "visuals", "drawings", "illustrations", "daily practice", "shaders"]) && !isMoreWorkMatch;
    const isExperienceMatch = checkMatch(experiencePhrases, ["experience", "career", "professional history", "work history", "background", "professional experience", "job", "employment", "employer", "portfolio history"]);
    const isEducationMatch = checkMatch(educationPhrases, ["education", "study", "university", "academic background", "qualification", "academic", "school", "college", "institution", "academic credentials"]);
    const isAchievementsMatch = checkMatch(achievementsPhrases, ["achievement", "award", "certificate", "recognition", "competition", "awards", "achievements", "certificates", "key metrics", "wins", "honors", "metric", "certification", "certifications", "credential"]);
    const isContactMatch = checkMatch(contactPhrases, ["contact", "hire", "email", "phone", "reach sahl", "contact form", "let's work together", "lets work together", "work together", "contact you", "contact info", "whatsapp number", "social links"]);

    if (isMasterpieceMatch) {
      if (onNavigateToSection) onNavigateToSection('projects');
      const masterpieces = (context?.projects || []).filter((p: any) => p.featured).slice(0, 3);
      const hasMore = (context?.projects || []).length > 3;
      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I've taken you to the Featured Masterpieces section.\n\nHere you'll find some of Sahl Ahmed's best and most representative works that showcase his creativity, technical skills, and professional experience. Sahl focuses on crafting high-fidelity design layouts and highly responsive software interfaces.\n\nIf you'd like, I can also guide you to the More Work, Gallery, or Experience sections.`,
        timestamp: new Date(),
        projects: masterpieces.length > 0 ? masterpieces : undefined,
        showViewAll: hasMore,
        suggestions: ["Show More Work", "Show Gallery", "Show Experience"]
      };
    }

    if (isMoreWorkMatch) {
      if (onNavigateToSection) onNavigateToSection('gallery');
      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I've opened the More Work section for you.\n\nHere you'll find additional creative projects beyond the featured portfolio, giving you a broader view of Sahl Ahmed's work. Sahl regularly updates this area with raw 3D models, drawing tutorials, and procedural studies.`,
        timestamp: new Date(),
        suggestions: ["Show Masterpieces", "Show Gallery", "Show Experience"]
      };
    }

    if (isProjectsMatch) {
      if (onNavigateToSection) onNavigateToSection('projects');
      const masterpieces = (context?.projects || []).filter((p: any) => p.featured).slice(0, 3);
      const hasMore = (context?.projects || []).length > 3;
      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I've navigated you to the Projects section.\n\nThis is Sahl Ahmed's main workspace showcase. Here, you can explore detailed design processes, interface layouts, and interactive software rigs. Sahl's approach mixes design thinking with precise front-end engineering.`,
        timestamp: new Date(),
        projects: masterpieces.length > 0 ? masterpieces : undefined,
        showViewAll: hasMore,
        suggestions: ["Show More Work", "Show Gallery", "Show Experience"]
      };
    }

    if (isGalleryMatch) {
      if (onNavigateToSection) onNavigateToSection('gallery');
      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I've switched Sahl's view to the Gallery section.\n\nThis section showcases Sahl's visual playrooms, hyper-detailed renders, shader experiments, and YouTube walkthrough videos. It is a wonderful playground showcasing Sahl's persistent daily practice and procedural mastery.`,
        timestamp: new Date(),
        suggestions: ["Show Masterpieces", "Show Experience", "Contact Sahl"]
      };
    }

    if (isExperienceMatch) {
      if (onNavigateToSection) onNavigateToSection('experience');
      const expList = context?.experience || [];
      let expText = "";
      if (expList.length > 0) {
        expText = "\n\nHere are some career trajectory highlights:\n" + expList.map((e: any) => `- **${e.role}** at **${e.company}** (${e.period}): ${e.description || ""}`).join("\n");
      }
      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I've navigated you to Sahl's professional Experience credentials.${expText}\n\nHere you will find Sahl Ahmed's complete career trajectory, employer history, and freelance contracts. Sahl has worked with diverse teams, refining interactive products and delivering robust design systems.`,
        timestamp: new Date(),
        suggestions: ["Show Skills", "Show Education", "Show Achievements"]
      };
    }

    if (isEducationMatch) {
      if (onNavigateToSection) onNavigateToSection('education');
      const eduList = context?.education || [];
      let eduText = "";
      if (eduList.length > 0) {
        eduText = "\n\nHere are some of Sahl's educational steps:\n" + eduList.map((e: any) => `- **${e.degree}** from **${e.institution}** (${e.period || ""})`).join("\n");
      }
      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I've opened the Education section for you on Sahl's portfolio.${eduText}\n\nIn this section, you can review Sahl's formal study achievements, academic degrees, and institutional credentials. Sahl constantly pursues academic and creative growth.`,
        timestamp: new Date(),
        suggestions: ["Show Skills", "Show Experience", "Show Achievements"]
      };
    }

    if (isAchievementsMatch) {
      if (onNavigateToSection) onNavigateToSection('achievements');
      const achs = context?.achievements || [];
      let achsText = "";
      if (achs.length > 0) {
        achsText = "\n\nHere are Sahl's top distinctions:\n" + achs.map((a: any) => `- **${a.title}**: ${a.description}`).join("\n");
      }
      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I've taken you to the Achievements section.${achsText}\n\nHere you can explore Sahl Ahmed's awards, recognitions, certifications, and outstanding milestones Sahl has reached throughout his creative career.`,
        timestamp: new Date(),
        suggestions: ["Show Masterpieces", "Show Experience", "Contact Sahl"]
      };
    }

    if (isContactMatch) {
      if (onNavigateToSection) onNavigateToSection('contact');
      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I've taken you to the Contact Form and Studio Coordinates section.\n\nHere you will find Sahl Ahmed's direct email, phone, and social coordinates so you can reach out, hire him, or initiate a collaboration easily. Sahl is always thrilled to discuss new creative challenges!`,
        timestamp: new Date(),
        contactButtons: true,
        suggestions: ["Show Masterpieces", "Show Skills", "Show Achievements"]
      };
    }

    // Skills, Expertise, Abilities, Software Knowledge
    const skillsKeywords = [
      "skill", "skills", "expertise", "ability", "abilities", "software knowledge", "software used", "expert", "know software", "programming", "designer skills",
      "দক্ষতা", "সফটওয়্যার", "অভিজ্ঞতা", "specialization", "specialties", "software skills", "coding skills", "design skills"
    ];
    if (skillsKeywords.some(keyword => query.includes(keyword))) {
      if (onNavigateToSection) onNavigateToSection('skills');
      const skillsList: SkillItem[] = context?.skills || [];
      let skillsText = "";
      if (skillsList.length > 0) {
        skillsText = "Here are Sahl Ahmed's specialized skills and software armory:\n\n" +
          skillsList.map(s => {
            let monthsStr = "";
            if (s.experienceStartedDate) {
              const start = new Date(s.experienceStartedDate);
              const now = new Date();
              const diffYears = now.getFullYear() - start.getFullYear();
              const diffMonths = (now.getMonth() - start.getMonth()) + (diffYears * 12);
              const years = Math.floor(diffMonths / 12);
              const remainingMonths = diffMonths % 12;
              if (years > 0) {
                monthsStr = `${years} Year${years > 1 ? 's' : ''}${remainingMonths > 0 ? ` ${remainingMonths} Month${remainingMonths > 1 ? 's' : ''}` : ''}`;
              } else {
                monthsStr = `${diffMonths} Month${diffMonths > 1 ? 's' : ''}`;
              }
            }
            return `- **${s.name}**${monthsStr ? ` (${monthsStr} of experience)` : ''}${s.comment ? `: ${s.comment}` : ''}`;
          }).join("\n");
      } else {
        skillsText = "Sahl Ahmed has professional expertise in high-fidelity UI/UX design (Figma Pro, After Effects), advanced 3D modeling and rigging (Autodesk Maya, Cinema 4D), custom procedural motion graphics, and creative frontend development.";
      }

      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I have automatically navigated to the **Credentials & Skills** section on your screen so you can inspect Sahl Ahmed's software armory first-hand!\n\n${skillsText}\n\n### 🚀 Discover Sahl's Practical Work:\n- **Featured Masterpieces**: Check out the **Masterpieces** tab. These high-fidelity interactive systems (like Nebula OS) demonstrate Sahl's core skills, software expertise, and professional experience in a cohesive, practical design language.\n- **More Work & Gallery**: Browse the **Gallery** tab containing YouTube video designs, daily practice rigs, and volumetric shaders that demonstrate his technical skill execution in real-world contexts.`,
        timestamp: new Date(),
        suggestions: ["Show Latest Projects", "Show Achievements", "Contact Sahl"]
      };
    }

    // About / Bio / Who is Sahl
    const aboutKeywords = ["about", "who is sahl", "bio", "introduction", "about sahl", "পরিচয়"];
    if (aboutKeywords.some(keyword => query.includes(keyword))) {
      if (onNavigateToSection) onNavigateToSection('about');
      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I've opened Sahl Ahmed's **About Me** section where you can discover his core philosophy and creative trajectory.\n\nSahl is a multidisciplinary designer, animator, and front-end developer who focuses on high-fidelity user experiences and geometric architectural rhythms.\n\n### 🚀 Continue Discovering:\n- **Credentials & Software Armory**: Scroll down on the **About** tab to see Sahl's educational history and detailed skills.\n- **Featured Masterpieces**: Check out Sahl's flagship interactive projects under the **Masterpieces** tab.`,
        timestamp: new Date(),
        suggestions: ["Show Skills", "Show Latest Projects", "Contact Sahl"]
      };
    }

    // 2. HIRE / CONTACT ASSISTANT INTENT
    const hireIntents = ["hire", "work with you", "discuss a project", "need a designer", "need a 3d artist", "need motion", "need animation", "job offer", "freelance"];
    if (hireIntents.some(intent => query.includes(intent))) {
      if (onNavigateToSection) onNavigateToSection('contact');
      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: "Sahl Ahmed is actively open to full-time roles, creative contracts, and premium freelance projects! I've opened the Contact Form section on your screen.\n\nHere are Sahl's direct channels for instant project initialization:",
        timestamp: new Date(),
        contactButtons: true
      };
    }

    // 3. PROJECT SEARCH & RECOMMENDATION ENGINE
    const projectsList: Project[] = context?.projects || [];
    let foundProjects: Project[] = [];

    // Software Matchers
    const softwares = ["maya", "blender", "photoshop", "figma", "after effects", "substance painter", "zbrush", "octane", "cinema 4d", "illustrator", "indesign"];
    const matchedSoftware = softwares.find(sw => query.includes(sw));

    // Category Matchers
    const categoriesList = ["ui/ux", "ui ux", "3d design", "3d", "motion graphics", "motion", "graphic design", "graphic", "video editing", "video", "drawing", "illustration"];
    const matchedCategory = categoriesList.find(cat => query.includes(cat));

    if (query.includes("latest video") || query.includes("youtube video") || query.includes("videos") || query.includes("video presentation")) {
      foundProjects = projectsList.filter((p) => p.videoUrl || p.subtitle?.toLowerCase().includes("video"));
    } else if (query.includes("latest projects") || query.includes("latest project") || query.includes("latest work") || query.includes("show projects") || query.includes("show latest")) {
      foundProjects = projectsList.slice(0, 3);
    } else if (matchedSoftware) {
      foundProjects = projectsList.filter((p) => {
        const swList = (p.software || []).map((s) => s.toLowerCase());
        return swList.some((s) => s.includes(matchedSoftware)) || 
               (typeof p.software === 'string' && (p.software as string).toLowerCase().includes(matchedSoftware));
      });
    } else if (matchedCategory) {
      const normMatched = matchedCategory === "ui ux" ? "ui/ux" : matchedCategory;
      foundProjects = projectsList.filter((p) => {
        const catLower = (p.category || "").toLowerCase();
        return catLower.includes(normMatched) || normMatched.includes(catLower);
      });
    } else {
      // Fuzzy key search (Part 7: Title, Software, Category, Keyword, Year)
      foundProjects = projectsList.filter((p) => {
        const titleLower = (p.title || "").toLowerCase();
        const descLower = (p.description || "").toLowerCase();
        const fullDescLower = (p.fullDescription || "").toLowerCase();
        const catLower = (p.category || "").toLowerCase();
        const swString = (p.software || []).join(" ").toLowerCase();
        const yearLower = (p.year || "").toLowerCase();
        const subLower = (p.subtitle || "").toLowerCase();
        
        return titleLower.includes(query) || 
               descLower.includes(query) || 
               fullDescLower.includes(query) || 
               catLower.includes(query) || 
               swString.includes(query) ||
               yearLower.includes(query) ||
               subLower.includes(query);
      });
    }

    if (foundProjects.length > 0) {
      const displayProjects = foundProjects.slice(0, 3);
      const hasMore = foundProjects.length > 3;
      
      // Determine similar projects for recommendation (Part 9)
      const firstProj = displayProjects[0];
      const similar = projectsList.filter((p) => 
        p.id !== firstProj.id && 
        !displayProjects.some(dp => dp.id === p.id) &&
        (p.category === firstProj.category || p.software?.some((s) => firstProj.software?.includes(s)))
      ).slice(0, 2);

      const softwareLabel = matchedSoftware ? ` using **${matchedSoftware.toUpperCase()}**` : "";
      const categoryLabel = matchedCategory ? ` in **${matchedCategory.toUpperCase()}**` : "";
      const searchTypeLabel = softwareLabel || categoryLabel || "";

      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I searched Sahl's portfolio database and found **${foundProjects.length}** project(s)${searchTypeLabel}. Here are the top matches:`,
        timestamp: new Date(),
        projects: displayProjects,
        showViewAll: hasMore,
        similarProjects: similar.length > 0 ? similar : undefined
      };
    }

    // Fallback polite guide if keywords indicate search but nothing was found in the database
    const searchKeywords = ["show", "find", "search", "project", "work", "portfolio", "latest", "maya", "figma", "photoshop", "blender", "video", "drawing", "illustration"];
    if (searchKeywords.some(keyword => query.includes(keyword))) {
      if (onNavigateToSection) onNavigateToSection('projects');
      return {
        id: `msg-${Date.now()}-local`,
        sender: 'ai',
        text: `I've guided you to Sahl's **Featured Masterpieces** section!\n\nWhile I didn't find an exact matching project in our database for "${userQuery}", Sahl's masterpieces showcase a wide range of his core talents in UI/UX systems and procedural 3D pipelines. You can also discover more about Sahl's daily practice experiments in the **More Work** or **Gallery** sections.`,
        timestamp: new Date(),
        suggestions: ["Show More Work", "Show Gallery", "Contact Sahl"]
      };
    }

    return null; // Delegate to Gemini for general conversation
  };

  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isTyping || isSearching) return;

    // Track when conversation is first started
    const userMessageCount = messages.filter(m => m.sender === 'user').length;
    if (userMessageCount === 0) {
      trackAiChatbotConversationStarted();
    }

    // Abort any existing active stream
    if (activeAbortController.current) {
      activeAbortController.current.abort();
    }

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');

    // Check client-side matches first for smart navigation, hiring, or project search
    const localMatch = handleLocalQueryAndActions(textToSend);

    if (localMatch) {
      // Satisfying "Searching Portfolio..." loading experience
      setIsSearching(true);
      await new Promise((resolve) => setTimeout(resolve, 800));
      setIsSearching(false);

      setMessages((prev) => [...prev, localMatch]);

      // Provide dynamic follow-up suggested chips based on matching state
      if (localMatch.suggestions && localMatch.suggestions.length > 0) {
        setDynamicSuggestions(localMatch.suggestions);
      } else if (localMatch.projects && localMatch.projects.length > 0) {
        setDynamicSuggestions(["Contact Sahl", "Show Achievements", "Show Skills"]);
      } else if (localMatch.contactButtons) {
        setDynamicSuggestions(["Show Latest Projects", "Show Achievements", "Show Skills"]);
      } else {
        setDynamicSuggestions([
          "Tell me about Sahl",
          "Show latest projects",
          "Contact Sahl"
        ]);
      }
    } else {
      // Fallback: Send to Google Gemini proxy API using reactive SSE stream
      setIsTyping(true);
      
      const aiMsgId = `msg-${Date.now()}-ai`;
      const placeholderAiMsg: ChatMessage = {
        id: aiMsgId,
        sender: 'ai',
        text: "",
        timestamp: new Date()
      };

      // Add the empty message placeholder immediately to show rendering progress
      setMessages((prev) => [...prev, placeholderAiMsg]);

      const controller = new AbortController();
      activeAbortController.current = controller;

      sendChatMessageStream(
        textToSend,
        sessionId,
        context,
        (chunk) => {
          setMessages((prev) => prev.map((msg) => {
            if (msg.id === aiMsgId) {
              return { ...msg, text: msg.text + chunk };
            }
            return msg;
          }));
        },
        (data) => {
          setMessages((prev) => prev.map((msg) => {
            if (msg.id === aiMsgId) {
              const responseTextLower = msg.text.toLowerCase();
              let showActions = false;
              let showContact = false;

              if (responseTextLower.includes("resume") || responseTextLower.includes("cv") || responseTextLower.includes("portfolio")) {
                showActions = true;
              }
              if (responseTextLower.includes("contact") || responseTextLower.includes("hire") || responseTextLower.includes("email") || responseTextLower.includes("whatsapp")) {
                showContact = true;
              }

              return {
                ...msg,
                actionButtons: showActions || undefined,
                contactButtons: showContact || undefined,
                dynamicContactButtons: data.dynamicContactButtons,
                projects: data.projects,
                navigationSection: data.navigationSection
              };
            }
            return msg;
          }));

          if (data.navigationSection && onNavigateToSection) {
            onNavigateToSection(data.navigationSection);
          }

          if (data.suggestions && data.suggestions.length > 0) {
            setDynamicSuggestions(data.suggestions);
          }
          setIsTyping(false);
          activeAbortController.current = null;
        },
        (error) => {
          console.error("AI Stream Error:", error);
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== aiMsgId),
            {
              id: `err-${Date.now()}`,
              sender: 'ai',
              text: `Apologies, but I encountered an error. Please try asking again or check Sahl's contact form below.`,
              timestamp: new Date(),
              contactButtons: true
            }
          ]);
          setIsTyping(false);
          activeAbortController.current = null;
        },
        controller.signal
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage(inputValue);
    }
  };

  return (
    <div 
      className="fixed bottom-24 right-6 z-[9999] flex flex-col items-end pointer-events-none"
      id="ask-sahl-chat-container"
    >
      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={`w-[calc(100vw-32px)] sm:w-[400px] h-[580px] rounded-2xl flex flex-col overflow-hidden pointer-events-auto shadow-2xl border ${
              isDarkMode 
                ? 'bg-[#080b11]/95 border-white/10 text-white/90 shadow-black/80' 
                : 'bg-white/95 border-slate-200/90 text-slate-800 shadow-slate-300/50'
            } backdrop-blur-xl transition-colors duration-300`}
            role="dialog"
            aria-label="Ask Sahl AI chat interface"
          >
            {/* Header */}
            <div className={`p-4 flex items-center justify-between border-b ${
              isDarkMode ? 'bg-[#0c101b]/80 border-white/10' : 'bg-slate-50/90 border-slate-200/90'
            } select-none transition-colors duration-300`}>
              <div className="flex items-center gap-3">
                {/* AI Avatar */}
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center font-mono text-sm font-extrabold text-white shadow-md">
                    SA
                  </div>
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-[#080b11] animate-pulse"></span>
                </div>
                <div>
                  <h3 className="text-xs font-bold tracking-wide uppercase flex items-center gap-1.5">
                    Ask Sahl AI
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  </h3>
                  <span className={`text-[10px] font-mono tracking-wider ${
                    isDarkMode ? 'text-white/55' : 'text-slate-500'
                  }`}>Interactive Portfolio Assistant</span>
                </div>
              </div>

              {/* Window Controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsMinimized(true)}
                  className={`p-1.5 rounded-lg hover:bg-white/5 transition-all text-white/60 hover:text-white ${
                    !isDarkMode && 'hover:bg-slate-100 text-slate-500 hover:text-slate-900'
                  }`}
                  title="Minimize chat"
                  aria-label="Minimize chat"
                >
                  <Minimize2 className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className={`p-1.5 rounded-lg hover:bg-red-500/10 hover:text-red-400 transition-all text-white/60 hover:text-white ${
                    !isDarkMode && 'text-slate-500 hover:text-red-500 hover:bg-red-50'
                  }`}
                  title="Close chat"
                  aria-label="Close chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Chat History Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
              {messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div 
                    key={msg.id} 
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'} items-start gap-2.5`}
                  >
                    {!isUser && (
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-primary/80 to-secondary/80 flex items-center justify-center font-mono text-[10px] font-bold text-white shrink-0 mt-0.5 select-none">
                        SA
                      </div>
                    )}
                    <div className="flex flex-col max-w-[85%] w-full">
                      <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                        isUser 
                          ? 'bg-gradient-to-r from-primary to-secondary text-white rounded-tr-none shadow-md ml-auto' 
                          : isDarkMode
                            ? 'bg-white/5 border border-white/5 text-white/90 rounded-tl-none mr-auto'
                            : 'bg-slate-100/80 border border-slate-200/60 text-slate-800 rounded-tl-none mr-auto'
                      }`}>
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                        ) : (
                          <div className="markdown-body prose prose-invert prose-xs text-inherit">
                            <Markdown>{msg.text}</Markdown>
                          </div>
                        )}

                        {/* Rendering Project Recommendation Cards (Part 2) */}
                        {msg.projects && msg.projects.length > 0 && (
                          <div className="mt-3 space-y-3">
                            {msg.projects.map((proj) => (
                              <div 
                                key={proj.id}
                                className={`rounded-xl overflow-hidden border p-3 flex flex-col gap-2 shadow-sm transition-all hover:scale-[1.01] ${
                                  isDarkMode 
                                    ? 'bg-white/[0.03] border-white/10 text-white' 
                                    : 'bg-white border-slate-200 text-slate-800'
                                }`}
                              >
                                {/* Thumbnail Image */}
                                {proj.image && (
                                  <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black/40 border border-white/5 shrink-0 select-none">
                                    <img 
                                      src={proj.image} 
                                      alt={proj.title} 
                                      className="object-cover w-full h-full"
                                      referrerPolicy="no-referrer"
                                    />
                                    {proj.featured && (
                                      <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-[8px] font-bold tracking-wider font-mono bg-amber-500 text-black flex items-center gap-1 shadow">
                                        <Sparkles className="w-2.5 h-2.5 animate-pulse" /> FEATURED
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Details */}
                                <div className="flex-1 flex flex-col justify-between">
                                  <div>
                                    <span className="text-[9px] font-bold tracking-wider font-mono uppercase text-primary">
                                      {proj.category}
                                    </span>
                                    <h4 className="text-xs font-bold leading-tight mt-0.5 line-clamp-1">
                                      {proj.title}
                                    </h4>
                                    <p className={`text-[10px] mt-1 line-clamp-2 leading-relaxed ${
                                      isDarkMode ? 'text-white/70' : 'text-slate-600'
                                    }`}>
                                      {proj.description}
                                    </p>
                                  </div>

                                  {/* Software Icons / Labels */}
                                  {proj.software && proj.software.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                      {proj.software.map((sw, idx) => (
                                        <span 
                                          key={idx} 
                                          className={`text-[8px] font-mono px-1 py-0.5 rounded ${
                                            isDarkMode ? 'bg-white/5 text-white/60' : 'bg-slate-100 text-slate-500'
                                          }`}
                                        >
                                          {sw}
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Views & Likes Panel */}
                                  <div className="flex items-center gap-3 text-[9px] font-mono mt-3 text-white/40">
                                    <span className="flex items-center gap-1">
                                      <Eye className="w-3 h-3 text-white/30" /> {proj.views || 45} views
                                    </span>
                                    <span className="flex items-center gap-1">
                                      <ThumbsUp className="w-3 h-3 text-white/30" /> {proj.likes || 12} likes
                                    </span>
                                    {proj.year && (
                                      <span className="flex items-center gap-1 ml-auto">
                                        <Calendar className="w-3 h-3 text-white/30" /> {proj.year}
                                      </span>
                                    )}
                                  </div>

                                  {/* Open Project CTA */}
                                  <button
                                    onClick={() => onOpenProject && onOpenProject(proj)}
                                    className="mt-3 w-full py-2 bg-gradient-to-r from-primary to-secondary hover:from-primary/90 hover:to-secondary/90 text-white font-bold text-[10px] rounded-lg tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-95"
                                  >
                                    Open Project <ExternalLink className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                            ))}

                            {/* View All Masterpieces Button */}
                            {msg.showViewAll && (
                              <button
                                onClick={() => onNavigateToSection && onNavigateToSection('projects')}
                                className={`w-full py-2 border rounded-lg font-mono text-[9px] uppercase tracking-widest text-center transition-all ${
                                  isDarkMode 
                                    ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white' 
                                    : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                                } cursor-pointer active:scale-95`}
                              >
                                View All Matching Masterpieces <ArrowRight className="w-3.5 h-3.5 inline ml-1" />
                              </button>
                            )}

                            {/* Similar Projects Recommendations (Part 9) */}
                            {msg.similarProjects && msg.similarProjects.length > 0 && (
                              <div className="pt-2 border-t border-white/5 mt-2">
                                <p className="text-[9px] font-mono text-white/40 uppercase mb-2 flex items-center gap-1">
                                  <Compass className="w-3 h-3 animate-pulse text-amber-400" /> Similar projects you may like:
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                  {msg.similarProjects.map((sp) => (
                                    <button
                                      key={sp.id}
                                      onClick={() => onOpenProject && onOpenProject(sp)}
                                      className={`p-2 rounded-lg border text-left transition-all hover:border-primary/40 active:scale-95 cursor-pointer ${
                                        isDarkMode 
                                          ? 'bg-white/[0.01] border-white/5 hover:bg-white/[0.04]' 
                                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                                      }`}
                                    >
                                      <p className="text-[10px] font-bold truncate">{sp.title}</p>
                                      <span className="text-[8px] font-mono text-primary uppercase">{sp.category}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Rendering AI Dynamic Contact Buttons (Part 6) */}
                        {msg.dynamicContactButtons && msg.dynamicContactButtons.length > 0 && (
                          <div className="mt-3 flex flex-col gap-1.5">
                            {msg.dynamicContactButtons.map((btn, index) => {
                              const nameLower = btn.name.toLowerCase();
                              let btnBg = "bg-white/5 border border-white/10 hover:bg-white/10 text-white";
                              let iconElement = <ExternalLink className="w-3 h-3" />;
                              
                              if (nameLower === 'whatsapp') {
                                btnBg = "bg-[#25d366] hover:bg-[#20ba56] text-white";
                                iconElement = <Phone className="w-3 h-3 fill-current" />;
                              } else if (nameLower === 'email') {
                                btnBg = "bg-rose-600 hover:bg-rose-700 text-white";
                                iconElement = <Mail className="w-3 h-3" />;
                              } else if (nameLower === 'facebook') {
                                btnBg = "bg-[#1877f2] hover:bg-[#166fe5] text-white";
                              } else if (nameLower === 'linkedin') {
                                btnBg = "bg-[#0a66c2] hover:bg-[#0958a8] text-white";
                              } else if (nameLower === 'github') {
                                btnBg = "bg-[#24292e] hover:bg-[#1c2024] text-white";
                                iconElement = <Code className="w-3 h-3" />;
                              } else if (nameLower === 'youtube') {
                                btnBg = "bg-[#ff0000] hover:bg-[#e60000] text-white";
                              } else if (nameLower === 'instagram') {
                                btnBg = "bg-gradient-to-r from-[#f9ce3f] via-[#e1306c] to-[#833ab4] text-white hover:opacity-90";
                              } else if (nameLower === 'behance') {
                                btnBg = "bg-[#053eff] hover:bg-[#0035ef] text-white";
                              } else if (nameLower === 'dribbble') {
                                btnBg = "bg-[#ea4c89] hover:bg-[#df3e7c] text-white";
                              } else if (nameLower === 'artstation') {
                                btnBg = "bg-[#13aff0] hover:bg-[#0e98d2] text-white";
                              } else if (nameLower === 'portfolio' || nameLower === 'portfolio website' || nameLower === 'portfolio_website') {
                                btnBg = "bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90";
                              }

                              return (
                                <a
                                  key={`${btn.name}-${index}`}
                                  href={btn.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`w-full py-1.5 px-3 rounded-lg font-bold text-[9px] tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer ${btnBg}`}
                                >
                                  {iconElement} {btn.name}
                                </a>
                              );
                            })}
                          </div>
                        )}

                        {/* Rendering AI Contact Assistant buttons (Part 4) */}
                        {msg.contactButtons && (
                          <div className="mt-3 space-y-2">
                            <a 
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-full py-2 px-3 bg-[#25d366] text-white font-bold text-[10px] rounded-lg tracking-wider uppercase flex items-center justify-center gap-2 transition-all shadow-sm active:scale-95 cursor-pointer"
                            >
                              <Phone className="w-3.5 h-3.5" /> WhatsApp Sahl Directly
                            </a>
                            <button
                              onClick={() => onNavigateToSection && onNavigateToSection('contact')}
                              className={`w-full py-2 border rounded-lg font-mono text-[9px] uppercase tracking-widest text-center transition-all ${
                                isDarkMode 
                                  ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white' 
                                  : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                              } cursor-pointer active:scale-95`}
                            >
                              Fill Interactive Contact Form
                            </button>
                          </div>
                        )}

                        {/* Rendering Quick Action buttons (Part 5) */}
                        {msg.actionButtons && (
                          <div className="mt-3 pt-2 border-t border-white/5 space-y-2">
                            <p className="text-[9px] font-mono text-white/40 uppercase mb-2">Quick Actions:</p>
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                onClick={() => handleSendMessage("Show latest projects")}
                                className={`p-1.5 rounded-lg text-center font-mono text-[9px] border transition-all active:scale-95 cursor-pointer ${
                                  isDarkMode ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                                }`}
                              >
                                🚀 Latest Projects
                              </button>
                              <button
                                onClick={() => handleSendMessage("Show latest videos")}
                                className={`p-1.5 rounded-lg text-center font-mono text-[9px] border transition-all active:scale-95 cursor-pointer ${
                                  isDarkMode ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                                }`}
                              >
                                🎬 Latest Videos
                              </button>
                              <button
                                onClick={() => handleSendMessage("Show achievements")}
                                className={`p-1.5 rounded-lg text-center font-mono text-[9px] border transition-all active:scale-95 cursor-pointer ${
                                  isDarkMode ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                                }`}
                              >
                                🏆 Achievements
                              </button>
                              <button
                                onClick={() => handleSendMessage("Contact Sahl")}
                                className={`p-1.5 rounded-lg text-center font-mono text-[9px] border transition-all active:scale-95 cursor-pointer ${
                                  isDarkMode ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                                }`}
                              >
                                ✉️ Contact Sahl
                              </button>
                              <a
                                href="https://github.com/Sahl-Ahmed"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`p-1.5 rounded-lg text-center font-mono text-[9px] border transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 ${
                                  isDarkMode ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                                }`}
                              >
                                💻 GitHub
                              </a>
                              <a
                                href="https://www.linkedin.com/in/sahl-ahmed-7637a940b/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`p-1.5 rounded-lg text-center font-mono text-[9px] border transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1 ${
                                  isDarkMode ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                                }`}
                              >
                                🔗 LinkedIn
                              </a>
                              <a
                                href="https://www.youtube.com/@ShaholAhmed-006"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`p-1.5 rounded-lg text-center font-mono text-[9px] border transition-all active:scale-95 cursor-pointer ${
                                  isDarkMode ? 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600'
                                }`}
                              >
                                📺 YouTube
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                      <span className={`text-[8px] font-mono mt-1 ${isUser ? 'text-right' : 'text-left'} ${
                        isDarkMode ? 'text-white/30' : 'text-slate-400'
                      }`}>
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Dynamic Searching Portfolio Loader (Part 6) */}
              {isSearching && (
                <div className="flex justify-start items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-primary/80 to-secondary/80 flex items-center justify-center font-mono text-[10px] font-bold text-white shrink-0 mt-0.5 select-none animate-spin">
                    <Search className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className={`px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-2 ${
                    isDarkMode ? 'bg-white/5 border border-white/5' : 'bg-slate-100/80 border border-slate-200/60'
                  }`}>
                    <span className="text-[10px] font-mono text-primary font-bold animate-pulse">Searching Portfolio...</span>
                    <div className="flex gap-1 shrink-0">
                      <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    </div>
                  </div>
                </div>
              )}

              {/* Standard Typing Loader */}
              {isTyping && !isSearching && (
                <div className="flex justify-start items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-primary/80 to-secondary/80 flex items-center justify-center font-mono text-[10px] font-bold text-white shrink-0 mt-0.5 select-none">
                    SA
                  </div>
                  <div className={`px-4 py-3 rounded-2xl rounded-tl-none flex items-center gap-1 ${
                    isDarkMode ? 'bg-white/5 border border-white/5' : 'bg-slate-100/80 border border-slate-200/60'
                  }`}>
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                    <span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                  </div>
                </div>
              )}
              
              <div ref={chatEndRef} />
            </div>

            {/* Suggested Chip Badges */}
            <div className={`px-4 py-2 flex gap-1.5 overflow-x-auto select-none border-t border-b scrollbar-none ${
              isDarkMode ? 'border-white/5 bg-[#07090e]/40' : 'border-slate-100 bg-slate-50/50'
            }`}>
              {dynamicSuggestions.map((text, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(text)}
                  disabled={isTyping || isSearching}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-mono border transition-all active:scale-95 disabled:opacity-50 cursor-pointer ${
                    isDarkMode 
                      ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:border-white/25 hover:text-white' 
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 hover:text-slate-900 shadow-sm'
                  }`}
                >
                  <Sparkles className="w-3 h-3 text-primary shrink-0 animate-pulse" />
                  {text}
                </button>
              ))}
            </div>

            {/* Input Form Area */}
            <div className={`p-4 border-t ${
              isDarkMode ? 'border-white/5 bg-[#0c101b]/50' : 'border-slate-100 bg-slate-50/30'
            }`}>
              <div className="flex items-end gap-2">
                <div className="relative flex-1">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask me anything about Sahl Ahmed..."
                    disabled={isTyping || isSearching}
                    className={`w-full pr-10 pl-4 py-2.5 rounded-xl text-xs font-sans border focus:outline-none transition-all resize-none max-h-[120px] leading-relaxed overflow-y-auto ${
                      isDarkMode 
                        ? 'bg-white/5 border-white/10 text-white placeholder-white/40 focus:border-primary/50 focus:bg-white/[0.08]' 
                        : 'bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 focus:bg-white shadow-inner'
                    }`}
                  />
                </div>
                <button
                  onClick={() => handleSendMessage(inputValue)}
                  disabled={!inputValue.trim() || isTyping || isSearching}
                  className={`p-2.5 rounded-xl transition-all font-bold text-white flex items-center justify-center shrink-0 active:scale-95 disabled:scale-100 ${
                    inputValue.trim() && !isTyping && !isSearching
                      ? 'bg-gradient-to-r from-primary to-secondary hover:shadow-lg hover:shadow-primary/20'
                      : 'bg-white/5 text-white/30 border border-white/5 cursor-not-allowed' + (!isDarkMode ? ' bg-slate-100 text-slate-300 border-slate-200' : '')
                  }`}
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimized Float Action Trigger Button */}
      {isMinimized && (
        <motion.button
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => setIsMinimized(false)}
          className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-bold text-xs tracking-wider uppercase shadow-xl hover:shadow-primary/30 active:scale-95 transition-all select-none mb-1 shadow-black/30 cursor-pointer"
          aria-label="Maximize Sahl AI Chat"
        >
          <div className="relative flex items-center justify-center">
            <MessageSquare className="w-4 h-4" />
            <span className="absolute -top-1.5 -right-1.5 w-2 h-2 bg-emerald-500 rounded-full border border-white"></span>
          </div>
          <span>Sahl AI Assistant</span>
          <Maximize2 className="w-3.5 h-3.5" />
        </motion.button>
      )}
    </div>
  );
}
