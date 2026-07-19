import React, { useState, useEffect, useMemo, lazy, Suspense, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { 
  Heart, 
  ArrowRight, 
  Search, 
  Layout, 
  Box, 
  Play, 
  Code, 
  Sparkles, 
  Clock, 
  Award, 
  Cpu, 
  Sun,
  Moon, 
  Calendar, 
  ChevronRight, 
  Send, 
  X, 
  Menu, 
  Check, 
  ExternalLink, 
  Plus, 
  Trash, 
  Layers, 
  ThumbsUp, 
  Database,
  Edit,
  Save,
  Video,
  User,
  Mail,
  ChevronLeft,
  Briefcase,
  Phone,
  Pause,
  Rewind,
  FastForward,
  Settings
} from 'lucide-react';
import { 
  initialProjects, 
  initialAchievements, 
  initialEducation, 
  initialSkills, 
  initialSocials, 
  initialSectionTexts 
} from './data';
import { Project, Achievement, Education, SkillItem, SocialLink, Experience, Service, SectionTexts } from './types';
import { onSnapshot, collection, doc, setDoc, getDoc } from 'firebase/firestore';
import {
  dbGetProjects,
  dbSaveProject,
  dbDeleteProject,
  dbGetAchievements,
  dbSaveAchievement,
  dbDeleteAchievement,
  dbGetEducation,
  dbSaveEducation,
  dbDeleteEducation,
  dbGetSkills,
  dbSaveSkill,
  dbDeleteSkill,
  dbGetSocials,
  dbSaveSocial,
  dbDeleteSocial,
  dbGetSectionTexts,
  dbSaveSectionTexts,
  dbGetCategories,
  dbSaveCategories,
  dbSubmitContact,
  dbGetViews,
  dbIncrementViews,
  dbSaveHero,
  dbGetHero,
  dbSaveAbout,
  dbGetAbout,
  dbGetExperience,
  dbSaveExperience,
  dbDeleteExperience,
  dbGetServices,
  dbSaveService,
  dbDeleteService,
  dbGetGalleryItems,
  dbSaveGalleryItem,
  dbDeleteGalleryItem,
  dbAddProject,
  dbAddGalleryItem,
  dbAddAchievement,
  auth,
  db,
  cleanUndefined
} from './firebase';
import { usePortfolioSEO, normalizePathname } from './services/seo';
import { useStructuredData } from './services/structuredData';
import {
  trackPageView,
  trackRouteChange,
  track404Page,
  trackProjectDetailView,
  trackGalleryView,
  trackContactFormSubmission,
  trackOutboundLinkClick,
  trackResumeDownload,
  trackVideoPlay,
  trackSearchUsage,
  trackAiChatbotOpen,
  trackAiChatbotConversationStarted
} from './services/analytics';
import {
  SEO_CONFIG,
  initializeGoogleAnalytics,
  initializeMicrosoftClarity,
  getConsent,
  saveConsent,
  hasConsentChoiceBeenMade
} from './services/config';

const AiSettingsModal = lazy(() => import('./components/AiSettingsModal'));
const ExperienceTimeline = lazy(() => import('./components/ExperienceTimeline'));
const HomeExperienceSlider = lazy(() => import('./components/HomeExperienceSlider'));


// Helper to compress base64 images using HTML Canvas
function compressImageBase64(base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.6): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
}


// Helper to calculate months automatically from start date up to current date (July 2026)
function calculateMonths(startedDateStr: string): number {
  const startDate = new Date(startedDateStr);
  const currentDate = new Date('2026-07-09'); // Constant local current time from system
  
  const yearsDiff = currentDate.getFullYear() - startDate.getFullYear();
  const monthsDiff = currentDate.getMonth() - startDate.getMonth();
  
  const total = (yearsDiff * 12) + monthsDiff;
  return total > 0 ? total : 1;
}

// Helper to get YouTube Video ID
function getYoutubeId(url: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.trim().match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

// Helper to convert Google Drive sharing links to direct asset links
function getGoogleDriveLink(url: string, type: 'image' | 'video'): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
    // Extract ID
    const match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      const fileId = match[1];
      if (type === 'image') {
        return `https://lh3.googleusercontent.com/d/${fileId}`;
      } else {
        return `https://drive.google.com/file/d/${fileId}/preview`;
      }
    }
  }
  return trimmed;
}

function getProfileImage(url: string | undefined): string {
  const defaultDriveLink = "https://lh3.googleusercontent.com/d/1hpeQFOV5RE1KlxiagbL_kaS0aJFJgNu3";
  if (!url) return defaultDriveLink;
  const trimmed = url.trim();
  if (trimmed === "" || trimmed.includes("aida-public") || trimmed.includes("AB6AXu")) {
    return defaultDriveLink;
  }
  return getGoogleDriveLink(trimmed, 'image');
}

// Interactive Typewriter
interface TypewriterProps {
  phrases: string[];
}

function Typewriter({ phrases }: TypewriterProps) {
  const activePhrases = phrases && phrases.length > 0 ? phrases : ["Multimedia Designer", "UI/UX Designer", "3D Artist", "Creative Technologist"];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [text, setText] = useState("");
  const [speed, setSpeed] = useState(120);

  // If the activePhrases list changes, reset the typewriter indices safely
  useEffect(() => {
    setPhraseIndex(0);
    setCharIndex(0);
    setIsDeleting(false);
    setText("");
    setSpeed(120);
  }, [phrases]);

  useEffect(() => {
    if (activePhrases.length === 0) return;
    let timer: NodeJS.Timeout;
    const currentPhrase = activePhrases[phraseIndex % activePhrases.length] || "";

    const handleType = () => {
      if (isDeleting) {
        setText(currentPhrase.substring(0, charIndex - 1));
        setCharIndex(prev => Math.max(0, prev - 1));
        setSpeed(40);
      } else {
        setText(currentPhrase.substring(0, charIndex + 1));
        setCharIndex(prev => Math.min(currentPhrase.length, prev + 1));
        setSpeed(100);
      }

      if (!isDeleting && charIndex >= currentPhrase.length) {
        setIsDeleting(true);
        setSpeed(2000);
      } else if (isDeleting && charIndex <= 0) {
        setIsDeleting(false);
        setPhraseIndex(prev => (prev + 1) % activePhrases.length);
        setSpeed(350);
      }
    };

    timer = setTimeout(handleType, speed);
    return () => clearTimeout(timer);
  }, [charIndex, isDeleting, phraseIndex, speed, activePhrases]);

  return (
    <span className="text-2xl sm:text-4xl text-primary font-bold tracking-tight font-mono">
      {text}<span className="animate-pulse">|</span>
    </span>
  );
}

// Custom Video Player component with on-screen play, pause, rewind, and fast-forward controls
// Custom Video Player component with on-screen play, pause, rewind, and fast-forward controls
function CustomVideoPlayer({ src, posterImage }: { src: string; posterImage?: string }) {
  const ytId = getYoutubeId(src);
  const [hasInteracted, setHasInteracted] = useState(false);

  if (ytId) {
    if (!hasInteracted) {
      return (
        <div 
          onClick={() => {
            setHasInteracted(true);
            trackVideoPlay(src, 'YouTube Video', 'youtube');
          }}
          className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center cursor-pointer group"
          id="youtube-player-placeholder"
        >
          <img 
            src={`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`}
            alt="Play video"
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors" />
          <div className="relative w-16 h-16 rounded-full bg-primary/20 backdrop-blur-md flex items-center justify-center border border-primary/30 group-hover:scale-110 group-hover:bg-primary group-hover:text-black text-primary transition-all duration-300">
            <Play className="w-8 h-8 fill-current ml-1" />
          </div>
        </div>
      );
    }
    return (
      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center max-w-full h-full">
        <iframe 
          src={`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`} 
          className="absolute inset-0 m-auto w-full h-full border-none rounded-xl max-w-full max-h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    );
  }

  const isDriveVideo = src.includes('drive.google.com') || src.includes('docs.google.com');

  if (isDriveVideo) {
    let previewUrl = src;
    if (src.includes('/view') || src.includes('?usp=sharing')) {
      const match = src.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || src.match(/id=([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        previewUrl = `https://drive.google.com/file/d/${match[1]}/preview`;
      }
    }
    if (!hasInteracted) {
      return (
        <div 
          onClick={() => {
            setHasInteracted(true);
            trackVideoPlay(src, 'Google Drive Video', 'drive');
          }}
          className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center cursor-pointer group"
          id="drive-player-placeholder"
        >
          {posterImage ? (
            <img 
              src={posterImage}
              alt="Play video"
              loading="lazy"
              referrerPolicy="no-referrer"
              className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-tr from-surface to-surface-variant opacity-60" />
          )}
          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
          <div className="relative w-16 h-16 rounded-full bg-secondary/20 backdrop-blur-md flex items-center justify-center border border-secondary/30 group-hover:scale-110 group-hover:bg-secondary group-hover:text-black text-secondary transition-all duration-300">
            <Play className="w-8 h-8 fill-current ml-1" />
          </div>
          <span className="absolute bottom-4 font-mono text-[10px] text-white/60 uppercase tracking-widest">Load Google Drive Host Preview</span>
        </div>
      );
    }
    return (
      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black flex items-center justify-center max-w-full h-full">
        <iframe 
          src={previewUrl} 
          className="absolute inset-0 m-auto w-full h-full border-none rounded-xl max-w-full max-h-full"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const togglePlay = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => console.log("Video play error: ", err));
    }
  };

  const skipBackward = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
  };

  const skipForward = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.min(videoRef.current.duration || 0, videoRef.current.currentTime + 10);
  };

  return (
    <div className="relative group/video rounded-2xl overflow-hidden border border-white/10 bg-black aspect-video max-w-full">
      <video 
        ref={videoRef}
        src={src} 
        preload="none"
        poster={posterImage}
        controlsList="nodownload" 
        onContextMenu={(e) => e.preventDefault()}
        onClick={togglePlay}
        onPlay={() => {
          setIsPlaying(true);
          trackVideoPlay(src, 'Direct Portfolio Showcase Video', 'direct');
        }}
        onPause={() => setIsPlaying(false)}
        className="w-full h-full object-contain"
      />
      
      {/* On-Screen Center Controls Overlay */}
      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/video:opacity-100 transition-opacity flex flex-col justify-center items-center z-10 pointer-events-none">
        <div className="flex items-center justify-center gap-8 pointer-events-auto">
          {/* Skip Backward 10s */}
          <button 
            type="button"
            onClick={skipBackward}
            className="p-3 bg-black/60 hover:bg-primary hover:text-black text-white rounded-full transition-all backdrop-blur-md flex flex-col items-center justify-center gap-0.5 active:scale-90 border border-white/10"
            title="Rewind 10s"
          >
            <Rewind className="w-5 h-5" />
            <span className="text-[9px] font-mono font-bold">-10s</span>
          </button>

          {/* Toggle Play/Pause */}
          <button 
            type="button"
            onClick={togglePlay}
            className="p-4 bg-primary text-black rounded-full hover:scale-110 transition-all shadow-lg active:scale-90"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
          </button>

          {/* Skip Forward 10s */}
          <button 
            type="button"
            onClick={skipForward}
            className="p-3 bg-black/60 hover:bg-primary hover:text-black text-white rounded-full transition-all backdrop-blur-md flex flex-col items-center justify-center gap-0.5 active:scale-90 border border-white/10"
            title="Fast Forward 10s"
          >
            <FastForward className="w-5 h-5" />
            <span className="text-[9px] font-mono font-bold">+10s</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Loopable Left/Right sliding Image Slider component
function ImageSlider({ images }: { images: string[] }) {
  const [index, setIndex] = useState(0);

  const prevSlide = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const nextSlide = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="relative group/slider rounded-2xl overflow-hidden border border-white/5 aspect-[4/3] bg-black">
      <AnimatePresence mode="wait">
        <motion.img 
          key={index}
          src={images[index]} 
          alt={`Slider visual ${index + 1}`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="w-full h-full object-cover"
        />
      </AnimatePresence>

      {/* Left Navigation Arrow */}
      <button 
        type="button"
        onClick={prevSlide}
        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-primary hover:text-black text-white rounded-full transition-all opacity-0 group-hover/slider:opacity-100 backdrop-blur-md active:scale-95 z-10 border border-white/5"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* Right Navigation Arrow */}
      <button 
        type="button"
        onClick={nextSlide}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-primary hover:text-black text-white rounded-full transition-all opacity-0 group-hover/slider:opacity-100 backdrop-blur-md active:scale-95 z-10 border border-white/5"
      >
        <ChevronRight className="w-5 h-5" />
      </button>

      {/* Slide Indicators */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5 bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-md z-10">
        {images.map((_, i) => (
          <div 
            key={i} 
            onClick={(e) => { e.stopPropagation(); setIndex(i); }}
            className={`w-2 h-2 rounded-full cursor-pointer transition-all ${i === index ? 'bg-primary w-4' : 'bg-white/40'}`}
          />
        ))}
      </div>
    </div>
  );
}

const AskSahlAI = lazy(() => import('./components/AskSahlAI'));

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // Views count - initialized to 1420 fallback, loaded dynamically from Firestore
  const [views, setViews] = useState<number>(1420);

  // Screen View active state: 'home' | 'masterpieces' | 'gallery' | 'about' | 'contact'
  const [activeTab, setActiveTab] = useState<'home' | 'masterpieces' | 'gallery' | 'about' | 'contact'>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // States initialized with default values, populated from Firestore in real-time
  const [masterpiecesState, setMasterpiecesState] = useState<Project[]>([]);
  const [galleryState, setGalleryState] = useState<Project[]>([]);
  const projectsList = useMemo(() => {
    return [...masterpiecesState, ...galleryState];
  }, [masterpiecesState, galleryState]);

  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [educationList, setEducationList] = useState<Education[]>([]);
  const [skillItems, setSkillItems] = useState<SkillItem[]>([]);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [sectionTexts, setSectionTexts] = useState<SectionTexts>(initialSectionTexts as SectionTexts);
  const [categories, setCategories] = useState<string[]>(['All', 'UI/UX', '3D Design', 'Motion Graphics', 'Graphic Design', 'Video Editing']);

  // Professional Experience Timeline and Offered Services States
  const [experienceList, setExperienceList] = useState<Experience[]>([]);
  const [servicesList, setServicesList] = useState<Service[]>([]);

  // Cached Knowledge Engine for Sahl's AI Assistant
  const chatbotContext = useMemo(() => {
    return {
      projects: masterpiecesState,
      gallery: galleryState,
      achievements: achievements,
      education: educationList,
      skills: skillItems,
      socials: socialLinks,
      sectionTexts: sectionTexts,
      experience: experienceList,
      services: servicesList,
    };
  }, [masterpiecesState, galleryState, achievements, educationList, skillItems, socialLinks, sectionTexts, experienceList, servicesList]);

  // Add Professional Experience Form State
  const [newExpRole, setNewExpRole] = useState('');
  const [newExpCompany, setNewExpCompany] = useState('');
  const [newExpDuration, setNewExpDuration] = useState('');
  const [newExpDesc, setNewExpDesc] = useState('');

  // Add Offered Services Form State
  const [newServiceTitle, setNewServiceTitle] = useState('');
  const [newServiceDesc, setNewServiceDesc] = useState('');
  const [newServiceSkills, setNewServiceSkills] = useState('');
  const [newServicePrice, setNewServicePrice] = useState<number>(100);

  // Load and sync data from Firestore in REAL-TIME (Bi-directional)
  useEffect(() => {
    setIsLoading(true);

    // 1. Sync Hero texts
    const unsubHero = onSnapshot(doc(db, 'hero', 'info'), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const oldDescSub = "Crafting high-fidelity digital";
        if (data.heroDescription && data.heroDescription.includes(oldDescSub)) {
          data.heroDescription = "Turning imagination into meaningful digital experiences through thoughtful design, motion, storytelling, and innovation.";
          await setDoc(doc(db, 'hero', 'info'), { heroDescription: data.heroDescription }, { merge: true });
        }
        setSectionTexts(prev => ({ ...prev, ...data }));
      } else {
        const initialHero = {
          heroTitle: initialSectionTexts.heroTitle,
          heroSubtitle: initialSectionTexts.heroSubtitle,
          heroDescription: initialSectionTexts.heroDescription,
          typewriterPhrases: initialSectionTexts.typewriterPhrases
        };
        await setDoc(doc(db, 'hero', 'info'), cleanUndefined(initialHero));
      }
    });

    // 2. Sync About texts
    const unsubAbout = onSnapshot(doc(db, 'about', 'info'), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        let updated = false;
        if (data.basePositionLabel === 'HEY THERE' || data.basePositionLabel === 'Base Position') {
          data.basePositionLabel = 'Hey There!';
          updated = true;
        }
        if (data.basePosition === 'Just Push Your Limits' || data.basePosition === 'Available Worldwide') {
          data.basePosition = "Let's get creative";
          updated = true;
        }
        if (!data.aboutSubtitle) {
          data.aboutSubtitle = "YOU'RE HERE? TO KNOW";
          updated = true;
        }
        if (updated) {
          await setDoc(doc(db, 'about', 'info'), { 
            basePositionLabel: data.basePositionLabel, 
            basePosition: data.basePosition,
            aboutSubtitle: data.aboutSubtitle || "YOU'RE HERE? TO KNOW"
          }, { merge: true });
        }
        setSectionTexts(prev => ({ ...prev, ...data }));
      } else {
        const initialAbout = {
          aboutTitle: initialSectionTexts.aboutTitle,
          aboutSubtitle: initialSectionTexts.aboutSubtitle,
          aboutDescription: initialSectionTexts.aboutDescription,
          aboutQuote: initialSectionTexts.aboutQuote,
          baseCoordinatesTitle: (initialSectionTexts as any).baseCoordinatesTitle || 'Base coordinates',
          aboutLocationLabel: initialSectionTexts.aboutLocationLabel || 'Location',
          aboutLocationValue: 'Dhaka, Bangladesh',
          aboutTonguesLabel: initialSectionTexts.aboutTonguesLabel || 'Tongues',
          aboutTonguesValue: 'Bangla, English, Hindi, Urdu',
          credentialStationTitle: initialSectionTexts.credentialStationTitle || 'CREDENTIAL STATION',
          credentialStationSubtitle: initialSectionTexts.credentialStationSubtitle || 'Education & Software Armory',
          basePositionLabel: 'Hey There!',
          basePosition: "Let's get creative",
          heroImage: (initialSectionTexts as any).heroImage || 'https://lh3.googleusercontent.com/d/1hpeQFOV5RE1KlxiagbL_kaS0aJFJgNu3'
        };
        await setDoc(doc(db, 'about', 'info'), cleanUndefined(initialAbout));
      }
    });

    // 3. Sync Contact Info
    const unsubContactInfo = onSnapshot(doc(db, 'contact', 'info'), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSectionTexts(prev => ({
          ...prev,
          studioCoordinatesTitle: data.studioCoordinatesTitle,
          studioCoordinatesSubtitle: data.studioCoordinatesSubtitle,
          studioCoordinatesDescription: data.studioCoordinatesDescription,
          contactsMeta: data.contactsMeta || prev.contactsMeta
        }));
      } else {
        const initialContact = {
          studioCoordinatesTitle: initialSectionTexts.studioCoordinatesTitle || 'STUDIO COORDINATES',
          studioCoordinatesSubtitle: initialSectionTexts.studioCoordinatesSubtitle || 'Initialize Communication',
          studioCoordinatesDescription: initialSectionTexts.studioCoordinatesDescription || "Looking to develop spatial 3D art, high-fidelity UI systems, or customized visual components? Let's initialize connection immediately.",
          contactsMeta: {
            averageResponseDelay: '± 2 Hours Delay',
            preferredChannel: 'WhatsApp Direct Secure Line',
            whatsappNumber: '+8801949380524'
          }
        };
        await setDoc(doc(db, 'contact', 'info'), cleanUndefined(initialContact));
      }
    });

    // 4. Sync Professional Experience
    const unsubExp = onSnapshot(collection(db, 'experience'), async (snap) => {
      const list: Experience[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Experience));
      if (list.length === 0) {
        const defaultExps: Experience[] = [
          {
            id: 'exp-1',
            title: 'Lead 3D & UI Designer',
            role: 'Lead 3D & UI Designer',
            company: 'Aural Labs',
            duration: '2024 - Present',
            startDate: '2024',
            isCurrent: true,
            description: 'Designing immersive spatial dashboards and premium real-time graphics rigs.',
            softwareUsed: 'Figma, Blender, Three.js, React',
            employmentType: 'Full-time',
            location: 'Dhaka, Bangladesh (Remote)',
            sortOrder: 0
          },
          {
            id: 'exp-2',
            title: 'Creative Technologist',
            role: 'Creative Technologist',
            company: 'Freelance Studio',
            duration: '2021 - 2024',
            startDate: '2021',
            endDate: '2024',
            isCurrent: false,
            description: 'Delivered customized visual components and interactive UI/UX experiences globally.',
            softwareUsed: 'Maya, Photoshop, Unity, WebGL',
            employmentType: 'Freelance',
            location: 'Remote',
            sortOrder: 1
          }
        ];
        for (const exp of defaultExps) {
          await setDoc(doc(db, 'experience', exp.id), cleanUndefined(exp));
        }
        setExperienceList(defaultExps);
      } else {
        setExperienceList(list);
      }
    });

    // 5. Sync Education
    const unsubEdu = onSnapshot(collection(db, 'education'), async (snap) => {
      const list: Education[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Education));
      if (list.length === 0) {
        for (const e of initialEducation) {
          await setDoc(doc(db, 'education', e.id), cleanUndefined(e));
        }
        setEducationList(initialEducation);
      } else {
        setEducationList(list);
      }
    });

    // 6. Sync Skills
    const unsubSkills = onSnapshot(collection(db, 'skills'), async (snap) => {
      const list: SkillItem[] = [];
      snap.forEach((d) => list.push(d.data() as SkillItem));
      if (list.length === 0) {
        for (const s of initialSkills) {
          const docId = s.name.replace(/[^a-zA-Z0-9]/g, '_');
          await setDoc(doc(db, 'skills', docId), cleanUndefined(s));
        }
        setSkillItems(initialSkills);
      } else {
        setSkillItems(list);
      }
    });

    // 7. Sync Services
    const unsubServices = onSnapshot(collection(db, 'services'), async (snap) => {
      const list: Service[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Service));
      if (list.length === 0) {
        const defaultServices: Service[] = [
          {
            id: 'service-1',
            title: '3D Spatial Modeling & Design',
            description: 'Immersive low-poly/high-poly 3D models with normal reflections and high detail.',
            icon: 'Box',
            skills: ['Blender', 'Substance Painter'],
            basePrice: 250
          },
          {
            id: 'service-2',
            title: 'High-Fidelity UI/UX Prototyping',
            description: 'Custom-designed functional mockups, dark cosmic palettes, and responsive layouts.',
            icon: 'Layout',
            skills: ['Figma', 'Tailwind CSS'],
            basePrice: 180
          }
        ];
        for (const s of defaultServices) {
          await setDoc(doc(db, 'services', s.id), cleanUndefined(s));
        }
        setServicesList(defaultServices);
      } else {
        setServicesList(list);
      }
    });

    // 8. Sync Projects (Masterpieces)
    const unsubProjs = onSnapshot(collection(db, 'projects'), async (snap) => {
      const list: Project[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({ id: d.id, ...data, isGallery: false } as Project);
      });
      if (list.length === 0) {
        const masterpieces = initialProjects.filter(p => !p.isGallery);
        for (const p of masterpieces) {
          await setDoc(doc(db, 'projects', p.id), cleanUndefined(p));
        }
        setMasterpiecesState(masterpieces);
      } else {
        setMasterpiecesState(list);
      }
    });

    // 9. Sync Gallery (Daily Practice Works)
    const unsubGallery = onSnapshot(collection(db, 'gallery'), async (snap) => {
      const list: Project[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({ id: d.id, ...data, isGallery: true } as Project);
      });
      if (list.length === 0) {
        const galleryItems = initialProjects.filter(p => p.isGallery);
        for (const p of galleryItems) {
          await setDoc(doc(db, 'gallery', p.id), cleanUndefined(p));
        }
        setGalleryState(galleryItems);
      } else {
        // Auto-seed Sahl's requested POTHIK video if it does not exist
        const hasPothik = list.some(item => item.videoUrl === "https://youtu.be/yspv06M4CF8" || item.title === "POTHIK App Concept Introduction");
        if (!hasPothik) {
          const pothikItem = {
            title: "POTHIK App Concept Introduction",
            subtitle: "Video",
            description: "While tourism in Bangladesh is booming, travelers frequently face fraud, safety and planning issues due to misinformation. POTHIK is an AI-powered Smart Travel Assistant that solves this by combining Trip Planning, Safety Guidance, Cultural Learning, and XR Experiences into one unified platform.",
            fullDescription: "While tourism in Bangladesh is booming, travelers frequently face fraud, safety and planning issues due to misinformation. POTHIK is an AI-powered Smart Travel Assistant that solves this by combining Trip Planning, Safety Guidance, Cultural Learning, and XR Experiences into one unified platform.",
            image: "https://img.youtube.com/vi/yspv06M4CF8/maxresdefault.jpg",
            images: ["https://img.youtube.com/vi/yspv06M4CF8/maxresdefault.jpg"],
            imageUrls: ["https://img.youtube.com/vi/yspv06M4CF8/maxresdefault.jpg"],
            videoUrl: "https://youtu.be/yspv06M4CF8",
            modelUrl: '',
            category: "Travel app",
            software: ["Figma"],
            softwareUsed: ["Figma"],
            likes: 12,
            featured: false,
            deliverables: ["New concept", "Travel app"],
            views: 45,
            isGallery: true,
            status: 'published',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          try {
            await dbAddGalleryItem(pothikItem);
          } catch (e) {
            console.error("Failed to seed POTHIK video:", e);
          }
        }
        setGalleryState(list);
      }
    });

    // 10. Sync Achievements
    const unsubAchievements = onSnapshot(collection(db, 'achievements'), async (snap) => {
      const list: Achievement[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Achievement));
      if (list.length === 0) {
        for (const a of initialAchievements) {
          await setDoc(doc(db, 'achievements', a.id), cleanUndefined(a));
        }
        setAchievements(initialAchievements);
      } else {
        list.sort((a, b) => {
          const tA = parseInt(a.id.replace('ach-', ''), 10) || 0;
          const tB = parseInt(b.id.replace('ach-', ''), 10) || 0;
          return tB - tA;
        });
        setAchievements(list);
      }
    });

    // 11. Sync Social Links & ensure Sahl's official URLs
    const unsubSocials = onSnapshot(collection(db, 'socials'), async (snap) => {
      let list: SocialLink[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as SocialLink));
      if (list.length === 0) {
        for (const s of initialSocials) {
          await setDoc(doc(db, 'socials', s.id), cleanUndefined(s));
        }
        setSocialLinks(initialSocials);
      } else {
        // Enforce Sahl's links
        list = list.map(s => {
          if (s.name.toLowerCase() === 'facebook' && s.url !== 'https://www.facebook.com/shsahlahmed') {
            s.url = 'https://www.facebook.com/shsahlahmed';
            setDoc(doc(db, 'socials', s.id), cleanUndefined(s));
          }
          if (s.name.toLowerCase() === 'linkedin' && s.url !== 'https://www.linkedin.com/in/sahl-ahmed-7637a940b/') {
            s.url = 'https://www.linkedin.com/in/sahl-ahmed-7637a940b/';
            setDoc(doc(db, 'socials', s.id), cleanUndefined(s));
          }
          if (s.name.toLowerCase() === 'youtube' && s.url !== 'https://www.youtube.com/@ShaholAhmed-006') {
            s.url = 'https://www.youtube.com/@ShaholAhmed-006';
            setDoc(doc(db, 'socials', s.id), cleanUndefined(s));
          }
          if (s.name.toLowerCase() === 'github' && s.url !== 'https://github.com/Sahl-Ahmed') {
            s.url = 'https://github.com/Sahl-Ahmed';
            setDoc(doc(db, 'socials', s.id), cleanUndefined(s));
          }
          return s;
        });

        // Ensure GitHub is in the socials list
        const hasGithub = list.some(s => s.name.toLowerCase() === 'github');
        if (!hasGithub) {
          const githubLink: SocialLink = { id: 'soc-4', name: 'GitHub', url: 'https://github.com/Sahl-Ahmed' };
          await setDoc(doc(db, 'socials', githubLink.id), cleanUndefined(githubLink));
          list.push(githubLink);
        }

        // Sort socials in preferred order: Facebook, YouTube, LinkedIn, GitHub
        const order = ['facebook', 'youtube', 'linkedin', 'github'];
        list.sort((a, b) => order.indexOf(a.name.toLowerCase()) - order.indexOf(b.name.toLowerCase()));

        setSocialLinks(list);
      }
    });

    // 12. Sync Settings (Categories)
    const unsubCats = onSnapshot(doc(db, 'settings', 'categories'), async (snap) => {
      if (snap.exists()) {
        setCategories(snap.data().list || []);
      } else {
        const defaultCats = ['All', 'UI/UX', '3D Design', 'Motion Graphics', 'Graphic Design', 'Video Editing'];
        await setDoc(doc(db, 'settings', 'categories'), { list: defaultCats });
      }
    });

    // 13. Sync Settings (Views Counter)
    const unsubViews = onSnapshot(doc(db, 'settings', 'views_counter'), async (snap) => {
      if (snap.exists()) {
        setViews(snap.data().count || 1420);
      } else {
        await setDoc(doc(db, 'settings', 'views_counter'), { count: 1420 });
      }
    });

    // 14. Sync Settings (Favicon)
    const unsubFavicon = onSnapshot(doc(db, 'settings', 'favicon'), async (snap) => {
      const newFavicon = 'https://lh3.googleusercontent.com/d/1425YjC4uNChURl7vD1S_7fsYdZ1z3Yur=w256-h256-p';
      if (snap.exists()) {
        const faviconUrl = snap.data().url;
        if (faviconUrl && faviconUrl.includes('1LyQKchFa9YuctDO9TkvEHieWX3D9n-Im')) {
          await setDoc(doc(db, 'settings', 'favicon'), { url: newFavicon });
          return;
        }
        if (faviconUrl) {
          let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
          if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
          }
          link.href = faviconUrl;
        }
      } else {
        await setDoc(doc(db, 'settings', 'favicon'), { url: newFavicon });
      }
    });

    setIsLoading(false);

    // Increment view once on load dynamically
    async function trackView() {
      try {
        const response = await fetch('/api/health'); // safe dummy call
        // wait a moment then update
        setTimeout(async () => {
          const vDoc = doc(db, 'settings', 'views_counter');
          const vSnap = await getDoc(vDoc);
          const currentCount = vSnap.exists() ? (vSnap.data().count || 1420) : 1420;
          await setDoc(vDoc, { count: currentCount + 1 });
        }, 1500);
      } catch (err) {
        console.error("View increment failed:", err);
      }
    }
    trackView();

    return () => {
      unsubHero();
      unsubAbout();
      unsubContactInfo();
      unsubExp();
      unsubEdu();
      unsubSkills();
      unsubServices();
      unsubProjs();
      unsubGallery();
      unsubAchievements();
      unsubSocials();
      unsubCats();
      unsubViews();
      unsubFavicon();
    };
  }, []);


  // Admin and Popups state
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(() => {
    return localStorage.getItem('sahl_admin_logged') === 'true';
  });

  // Synchronize authenticated user state with Firebase Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        if (user.email === 'shsahl1125@gmail.com') {
          setIsAdminLoggedIn(true);
          localStorage.setItem('sahl_admin_logged', 'true');
        } else {
          setIsAdminLoggedIn(false);
          localStorage.setItem('sahl_admin_logged', 'false');
          signOut(auth);
        }
      } else {
        setIsAdminLoggedIn(false);
        localStorage.setItem('sahl_admin_logged', 'false');
      }
    });
    return () => unsub();
  }, []);

  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);

  // Sahl In-place Text Edit State
  const [editingField, setEditingField] = useState<string | null>(null);
  const [tempText, setTempText] = useState('');

  // Coordinates Edit State
  const [editBaseCoordinatesTitle, setEditBaseCoordinatesTitle] = useState('');
  const [editAboutLocationLabel, setEditAboutLocationLabel] = useState('');
  const [editAboutLocationValue, setEditAboutLocationValue] = useState('');
  const [editAboutTonguesLabel, setEditAboutTonguesLabel] = useState('');
  const [editAboutTonguesValue, setEditAboutTonguesValue] = useState('');

  // Credential Station Headers Edit State
  const [editCredentialStationTitle, setEditCredentialStationTitle] = useState('');
  const [editCredentialStationSubtitle, setEditCredentialStationSubtitle] = useState('');

  // Studio Coordinates (Contact) Headers Edit State
  const [editStudioCoordinatesTitle, setEditStudioCoordinatesTitle] = useState('');
  const [editStudioCoordinatesSubtitle, setEditStudioCoordinatesSubtitle] = useState('');
  const [editStudioCoordinatesDescription, setEditStudioCoordinatesDescription] = useState('');

  // Base Position inline editing states
  const [editBasePositionLabel, setEditBasePositionLabel] = useState('');
  const [editBasePositionValue, setEditBasePositionValue] = useState('');

  // Add Custom Social Link Form State
  const [showAddSocialForm, setShowAddSocialForm] = useState(false);
  const [newSocialName, setNewSocialName] = useState('');
  const [newSocialUrl, setNewSocialUrl] = useState('');

  // Editing Social Links State
  const [editingSocialId, setEditingSocialId] = useState<string | null>(null);
  const [tempSocialName, setTempSocialName] = useState('');
  const [tempSocialUrl, setTempSocialUrl] = useState('');

  // Selected Project Lightbox Details
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  const handleNavigateToSection = (section: string) => {
    const sec = section.toLowerCase().trim();
    if (sec === 'achievements') {
      setActiveTab('home');
      setTimeout(() => {
        const el = document.getElementById('achievements-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } else if (sec === 'resume' || sec === 'education' || sec === 'experience' || sec === 'skills') {
      setActiveTab('about');
      setTimeout(() => {
        const el = document.getElementById('credential-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } else if (sec === 'contact') {
      setActiveTab('contact');
      setTimeout(() => {
        const el = document.getElementById('contact-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    } else if (sec === 'gallery' || sec === 'latest video' || sec === 'more works') {
      setActiveTab('gallery');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (sec === 'about') {
      setActiveTab('about');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (sec === 'projects' || sec === 'masterpieces') {
      setActiveTab('masterpieces');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Gallery filters and search query
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [isOldestFirst, setIsOldestFirst] = useState(false);

  // New Work Creation State
  const [newWorkImages, setNewWorkImages] = useState<string[]>([]);
  const [newWorkVideo, setNewWorkVideo] = useState<string | null>(null);
  const [newWorkCategory, setNewWorkCategory] = useState('UI/UX');
  const [newWorkSubtitle, setNewWorkSubtitle] = useState('');
  const [newWorkTitle, setNewWorkTitle] = useState('');
  const [newWorkDesc, setNewWorkDesc] = useState('');
  const [newWorkSoftware, setNewWorkSoftware] = useState(''); // comma/enter separated
  const [newWorkDeliverables, setNewWorkDeliverables] = useState<string[]>(['', '']); // supports up to 4
  const [isNewWorkFeatured, setIsNewWorkFeatured] = useState(false);
  const [isNewWorkGallery, setIsNewWorkGallery] = useState(false);
  const [newWorkUploadType, setNewWorkUploadType] = useState<'image' | 'video'>('image');
  const [imageCount, setImageCount] = useState<number>(1);
  const [newWorkImageUrls, setNewWorkImageUrls] = useState<string[]>(['', '', '', '']);
  const [newWorkVideoUrl, setNewWorkVideoUrl] = useState<string>('');
  
  // New YouTube Video Forum State
  const [ytVideoUrl, setYtVideoUrl] = useState('');
  const [ytVideoTitle, setYtVideoTitle] = useState('');
  const [ytVideoDesc, setYtVideoDesc] = useState('');
  const [ytVideoCategory, setYtVideoCategory] = useState('');
  const [ytVideoDeliverables, setYtVideoDeliverables] = useState('');
  const [ytVideoArmory, setYtVideoArmory] = useState('');

  const [newAchImgUrl, setNewAchImgUrl] = useState<string>('');
  const [newPhraseInput, setNewPhraseInput] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    targetId: string;
    targetType: 'project' | 'achievement' | 'education' | 'skill' | 'phrase' | 'social' | 'category' | 'experience' | 'services';
    targetIndex?: number;
  } | null>(null);

  const [heroImageUrlInput, setHeroImageUrlInput] = useState<string>('');

  // New Achievement State
  const [newAchTitle, setNewAchTitle] = useState('');
  const [newAchDesc, setNewAchDesc] = useState('');
  const [newAchCategory, setNewAchCategory] = useState('');
  const [newAchImg, setNewAchImg] = useState('');

  // Show achievements state
  const [showAllAchievements, setShowAllAchievements] = useState(false);

  // Featured Masterpieces Sliding Carousel index
  const [carouselIndex, setCarouselIndex] = useState(0);

  // Awards & Achievements Carousel sliding state
  const [activeAchIndex, setActiveAchIndex] = useState(0);

  // Automatic slide transition every 5 seconds for achievements
  useEffect(() => {
    if (achievements.length <= 1) return;
    if (selectedProject || zoomImage || isAdminModalOpen) return;
    const interval = setInterval(() => {
      setActiveAchIndex((prev) => (prev + 1) % achievements.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [achievements.length, selectedProject, zoomImage, isAdminModalOpen]);

  // Adjust current slide index if list gets mutated (e.g., deleted or added)
  useEffect(() => {
    if (activeAchIndex >= achievements.length) {
      setActiveAchIndex(0);
    }
  }, [achievements.length, activeAchIndex]);


  // Synchronize the input field with the current image URL (ignoring raw base64 blobs for clean UI)
  useEffect(() => {
    if (sectionTexts?.heroImage) {
      setHeroImageUrlInput(sectionTexts.heroImage.startsWith('data:') ? '' : sectionTexts.heroImage);
    }
  }, [sectionTexts?.heroImage]);

  // Notification / Toast
  const [notification, setNotification] = useState<string | null>(null);

  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('sahl_theme');
    return saved !== 'light';
  });

  // Synchronize HTML & Body class with isDarkMode state
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.remove('light-theme');
      document.body.classList.remove('light-theme');
    } else {
      document.documentElement.classList.add('light-theme');
      document.body.classList.add('light-theme');
    }
  }, [isDarkMode]);

  const triggerNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4500);
  };

  const toggleTheme = () => {
    setIsDarkMode(prev => {
      const next = !prev;
      localStorage.setItem('sahl_theme', next ? 'dark' : 'light');
      triggerNotification(next ? 'Dark Mode Activated' : 'Light Mode Activated');
      return next;
    });
  };

  // Device Likes Limitation Map
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('sahl_liked_map');
    return saved ? JSON.parse(saved) : {};
  });

  // Synchronize Technical SEO metadata dynamically
  usePortfolioSEO(activeTab, selectedProject, sectionTexts);

  // Synchronize dynamic JSON-LD Structured Data system
  useStructuredData({
    activeTab,
    selectedProject,
    sectionTexts,
    projectsList: masterpiecesState,
    galleryItems: galleryState,
    achievements,
    socialLinks
  });

  // ---------------------------------------------------------------------------
  // Production Search Engine, Consent & Analytics Integration
  // ---------------------------------------------------------------------------
  const [showConsentBanner, setShowConsentBanner] = useState(false);
  const previousRouteRef = useRef<string>('');

  // 1. Consent Initializer & Listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const consent = getConsent();
    if (consent.analytics) {
      initializeGoogleAnalytics();
    }
    if (consent.clarity) {
      initializeMicrosoftClarity();
    }

    // Check if consent has already been choice made to open banner if pending
    if (!hasConsentChoiceBeenMade()) {
      setShowConsentBanner(true);
    }

    const handleConsentUpdate = (e: Event) => {
      const updated = (e as CustomEvent).detail;
      if (updated.analytics) initializeGoogleAnalytics();
      if (updated.clarity) initializeMicrosoftClarity();
    };

    window.addEventListener('sahl_consent_updated', handleConsentUpdate);
    return () => window.removeEventListener('sahl_consent_updated', handleConsentUpdate);
  }, []);

  // 2. Automated Page View and Route Change Tracking
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let currentPath = '/';
    let title = 'Sahl Ahmed | Multimedia Designer';
    if (selectedProject) {
      const folder = selectedProject.isGallery ? 'gallery' : 'projects';
      currentPath = `/${folder}/${selectedProject.id}`;
      title = `${selectedProject.title} | Sahl Ahmed`;
    } else {
      if (activeTab === 'home') {
        currentPath = '/';
        title = 'Sahl Ahmed | Home';
      } else if (activeTab === 'masterpieces') {
        currentPath = '/projects';
        title = 'Sahl Ahmed | Projects';
      } else {
        currentPath = `/${activeTab}`;
        title = `Sahl Ahmed | ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`;
      }
    }

    // Page View Tracking
    trackPageView(currentPath, title);

    // Route Change Tracking
    if (previousRouteRef.current && previousRouteRef.current !== currentPath) {
      trackRouteChange(previousRouteRef.current, currentPath);
    }
    previousRouteRef.current = currentPath;
  }, [activeTab, selectedProject]);

  // 3. Project Detail and Gallery Selection Tracking
  useEffect(() => {
    if (selectedProject) {
      if (selectedProject.isGallery) {
        trackGalleryView(selectedProject.id, selectedProject.title, selectedProject.category || '');
      } else {
        trackProjectDetailView(selectedProject.id, selectedProject.title, selectedProject.category || '');
      }
    }
  }, [selectedProject]);

  // 4. Outbound Link Clicks & Resume Downloads global listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleGlobalClick = (e: MouseEvent) => {
      let target = e.target as HTMLElement | null;
      while (target && target.tagName !== 'A') {
        target = target.parentElement;
      }

      if (target && target.tagName === 'A') {
        const href = target.getAttribute('href') || '';
        const isOutbound = href.startsWith('http') && !href.includes(window.location.hostname);
        
        if (isOutbound) {
          // Determine platform label
          let platformLabel = 'External Link';
          if (href.includes('github.com')) platformLabel = 'GitHub';
          else if (href.includes('linkedin.com')) platformLabel = 'LinkedIn';
          else if (href.includes('youtube.com') || href.includes('youtu.be')) platformLabel = 'YouTube';
          else if (href.includes('wa.me') || href.includes('whatsapp.com')) platformLabel = 'WhatsApp';
          else if (href.includes('facebook.com')) platformLabel = 'Facebook';

          trackOutboundLinkClick(href, platformLabel);

          // If the link is likely a resume/cv download or portfolio document
          if (href.toLowerCase().includes('resume') || href.toLowerCase().includes('cv') || href.toLowerCase().includes('portfolio')) {
            trackResumeDownload('PDF');
          }
        }
      }
    };

    window.addEventListener('click', handleGlobalClick, true);
    return () => window.removeEventListener('click', handleGlobalClick, true);
  }, []);

  // 5. Debounced Search Query Analytics (prevents spamming on every keystroke)
  useEffect(() => {
    if (!searchQuery.trim()) return;

    const delayDebounceFn = setTimeout(() => {
      const query = searchQuery.toLowerCase().trim();
      const matchCount = masterpiecesState.filter(p => 
        p.title.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        (p.software || []).some(s => s.toLowerCase().includes(query))
      ).length;

      trackSearchUsage(searchQuery.trim(), matchCount);
    }, 1500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, masterpiecesState]);

  // 1. Dynamic Route synchronization to update URL pathname in browser address bar without reload
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let targetPath = '/';
    if (selectedProject) {
      const folder = selectedProject.isGallery ? 'gallery' : 'projects';
      targetPath = `/${folder}/${selectedProject.id}`;
    } else {
      if (activeTab === 'home') {
        targetPath = '/';
      } else if (activeTab === 'masterpieces') {
        targetPath = '/projects';
      } else {
        targetPath = `/${activeTab}`;
      }
    }

    const currentNormalized = normalizePathname(window.location.pathname);
    const targetNormalized = normalizePathname(targetPath);

    if (currentNormalized !== targetNormalized) {
      window.history.pushState(null, '', targetNormalized);
    }
  }, [activeTab, selectedProject]);

  // 2. Handle popstate browser Back/Forward navigation buttons
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const path = normalizePathname(window.location.pathname);
      if (path === '/') {
        setActiveTab('home');
        setSelectedProject(null);
      } else if (path === '/projects' || path === '/masterpieces') {
        setActiveTab('masterpieces');
        setSelectedProject(null);
      } else if (path === '/gallery') {
        setActiveTab('gallery');
        setSelectedProject(null);
      } else if (path === '/about') {
        setActiveTab('about');
        setSelectedProject(null);
      } else if (path === '/contact') {
        setActiveTab('contact');
        setSelectedProject(null);
      } else if (path === '/achievements') {
        setActiveTab('home');
        setSelectedProject(null);
        setTimeout(() => {
          const el = document.getElementById('achievements-section');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      } else if (path === '/more-works') {
        setActiveTab('gallery');
        setSelectedProject(null);
      } else {
        const projMatch = path.match(/^\/(projects|gallery)\/([a-zA-Z0-9_-]+)$/i);
        if (projMatch) {
          const id = projMatch[2];
          const found = projectsList.find(p => p.id === id);
          if (found) {
            setSelectedProject(found);
            setActiveTab(found.isGallery ? 'gallery' : 'masterpieces');
          }
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [projectsList]);

  // 3. Handle initial mount routing & direct deep-link parsing
  const [hasParsedInitialRoute, setHasParsedInitialRoute] = useState(false);
  useEffect(() => {
    if (hasParsedInitialRoute) return;

    const path = normalizePathname(window.location.pathname);
    if (path === '/') {
      setActiveTab('home');
      setHasParsedInitialRoute(true);
    } else if (path === '/projects' || path === '/masterpieces') {
      setActiveTab('masterpieces');
      setHasParsedInitialRoute(true);
    } else if (path === '/gallery') {
      setActiveTab('gallery');
      setHasParsedInitialRoute(true);
    } else if (path === '/about') {
      setActiveTab('about');
      setHasParsedInitialRoute(true);
    } else if (path === '/contact') {
      setActiveTab('contact');
      setHasParsedInitialRoute(true);
    } else if (path === '/achievements') {
      setActiveTab('home');
      setHasParsedInitialRoute(true);
      setTimeout(() => {
        const el = document.getElementById('achievements-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    } else if (path === '/more-works') {
      setActiveTab('gallery');
      setHasParsedInitialRoute(true);
    } else {
      const projMatch = path.match(/^\/(projects|gallery)\/([a-zA-Z0-9_-]+)$/i);
      if (projMatch) {
        const id = projMatch[2];
        if (projectsList.length > 0) {
          const found = projectsList.find(p => p.id === id);
          if (found) {
            setSelectedProject(found);
            setActiveTab(found.isGallery ? 'gallery' : 'masterpieces');
          }
          setHasParsedInitialRoute(true);
        }
      } else {
        setHasParsedInitialRoute(true);
      }
    }
  }, [projectsList, hasParsedInitialRoute]);

  const handleLikeProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (likedMap[id]) {
      triggerNotification('You have already liked this masterpiece from this device!');
      return;
    }

    const proj = projectsList.find(p => p.id === id);
    if (proj) {
      triggerNotification(`Appreciated "${proj.title}"! Appreciate count updated.`);
      
      const updatedMap = { ...likedMap, [id]: true };
      setLikedMap(updatedMap);
      localStorage.setItem('sahl_liked_map', JSON.stringify(updatedMap));

      if (selectedProject && selectedProject.id === id) {
        setSelectedProject(prev => prev ? { ...prev, likes: prev.likes + 1 } : null);
      }

      try {
        const updatedProj = { ...proj, likes: proj.likes + 1 };
        if (proj.isGallery) {
          await dbSaveGalleryItem(updatedProj);
        } else {
          await dbSaveProject(updatedProj);
        }
      } catch (err) {
        console.error("Failed to save project like count to Firestore:", err);
      }
    }
  };

  // Admin Google Login flow
  const handleAdminGoogleLogin = async () => {
    try {
      triggerNotification('Redirecting to Google Sign-In...');
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      if (user && user.email === 'shsahl1125@gmail.com') {
        setIsAdminLoggedIn(true);
        localStorage.setItem('sahl_admin_logged', 'true');
        setIsAdminModalOpen(false);
        triggerNotification('Success: Welcome back, Admin Sahl!');
      } else {
        triggerNotification('Access Denied: Invalid Admin Account.');
        setIsAdminLoggedIn(false);
        localStorage.setItem('sahl_admin_logged', 'false');
        await signOut(auth);
      }
    } catch (err: any) {
      console.error("Google Sign-In failed:", err);
      triggerNotification(`Google Sign-In failed: ${err.message || 'Check connection'}`);
    }
  };

  const handleAdminLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.warn('Failed to sign out of Firebase Auth:', err);
    }
    setIsAdminLoggedIn(false);
    localStorage.setItem('sahl_admin_logged', 'false');
    triggerNotification('Admin session terminated.');
  };

  // File size limits check (< 1 MB) and auto-compress using Canvas
  const handleImageFileLoad = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (file.size > 1024 * 1024) {
      triggerNotification('Upload Limit Exceeded: Maximum image size is 1 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      if (event.target?.result) {
        const rawBase64 = event.target.result as string;
        try {
          const compressed = await compressImageBase64(rawBase64);
          callback(compressed);
          triggerNotification('Image compressed & synchronized successfully.');
        } catch (err) {
          callback(rawBase64);
          triggerNotification('Asset ready! Synchronized with local state.');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Video size limits check (< 100 MB)
  const handleVideoFileLoad = (e: React.ChangeEvent<HTMLInputElement>, callback: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      triggerNotification('Upload Limit Exceeded: Maximum video size is 100 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        callback(event.target.result as string);
        triggerNotification('Video buffered successfully! Size checked under 100 MB.');
      }
    };
    reader.readAsDataURL(file);
  };

  // Multi-image selection for masterpieces
  const handleMultiImageLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + newWorkImages.length > 4) {
      triggerNotification('Maximum of 4 collage images allowed per masterpiece.');
      return;
    }

    files.forEach((file: any) => {
      if (file.size > 1024 * 1024) {
        triggerNotification(`Skipped "${file.name}": Exceeds 1 MB limit.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = async (evt) => {
        if (evt.target?.result) {
          try {
            const compressed = await compressImageBase64(evt.target.result as string);
            setNewWorkImages(prev => [...prev, compressed]);
            triggerNotification(`Added compressed collage image: ${file.name}`);
          } catch (err) {
            setNewWorkImages(prev => [...prev, evt.target?.result as string]);
          }
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Text edits
  const startEditing = (key: string, initialText: string) => {
    setEditingField(key);
    setTempText(initialText);
  };

  const saveEditedText = async (key: string) => {
    const updated = { ...sectionTexts };
    
    // Deep nested updates
    if (key.startsWith('contactsMeta.')) {
      const metaKey = key.split('.')[1];
      updated.contactsMeta = {
        ...updated.contactsMeta,
        [metaKey]: tempText
      };
    } else {
      (updated as any)[key] = tempText;
    }

    setSectionTexts(updated);
    setEditingField(null);
    triggerNotification('Updated element content successfully.');

    try {
      if (key === 'heroTitle' || key === 'heroSubtitle' || key === 'heroDescription') {
        await dbSaveHero({
          heroTitle: updated.heroTitle,
          heroSubtitle: updated.heroSubtitle,
          heroDescription: updated.heroDescription,
          typewriterPhrases: updated.typewriterPhrases || []
        });
      } else if (key === 'aboutTitle' || key === 'aboutSubtitle' || key === 'aboutDescription' || key === 'aboutQuote') {
        await dbSaveAbout({
          aboutTitle: updated.aboutTitle,
          aboutSubtitle: updated.aboutSubtitle || "YOU'RE HERE? TO KNOW",
          aboutDescription: updated.aboutDescription,
          aboutQuote: updated.aboutQuote,
          baseCoordinatesTitle: updated.baseCoordinatesTitle || 'Base coordinates',
          aboutLocationLabel: updated.aboutLocationLabel || 'Location',
          aboutLocationValue: updated.aboutLocationValue || 'Dhaka, Bangladesh',
          aboutTonguesLabel: updated.aboutTonguesLabel || 'Tongues',
          aboutTonguesValue: updated.aboutTonguesValue || 'Bangla, English, Hindi, Urdu',
          credentialStationTitle: updated.credentialStationTitle || 'CREDENTIAL STATION',
          credentialStationSubtitle: updated.credentialStationSubtitle || 'Education & Software Armory',
          basePositionLabel: updated.basePositionLabel || 'Hey There!',
          basePosition: updated.basePosition || "Let's get creative",
          heroImage: updated.heroImage || ''
        });
      } else if (key.startsWith('contactsMeta.')) {
        await setDoc(doc(db, 'contact', 'info'), cleanUndefined({
          studioCoordinatesTitle: updated.studioCoordinatesTitle || 'STUDIO COORDINATES',
          studioCoordinatesSubtitle: updated.studioCoordinatesSubtitle || 'Initialize Communication',
          studioCoordinatesDescription: updated.studioCoordinatesDescription || "Looking to develop spatial 3D art, high-fidelity UI systems, or customized visual components? Let's initialize connection immediately.",
          contactsMeta: updated.contactsMeta
        }));
      }
      await dbSaveSectionTexts(updated);
    } catch (err) {
      console.error("Failed to save updated texts to Firestore:", err);
    }
  };

  const handleSaveCoordinates = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...sectionTexts,
      baseCoordinatesTitle: editBaseCoordinatesTitle,
      aboutLocationLabel: editAboutLocationLabel,
      aboutLocationValue: editAboutLocationValue,
      aboutTonguesLabel: editAboutTonguesLabel,
      aboutTonguesValue: editAboutTonguesValue
    };
    setSectionTexts(updated);
    setEditingField(null);
    triggerNotification("About coordinates saved successfully.");
    try {
      await dbSaveAbout({
        aboutTitle: updated.aboutTitle,
        aboutSubtitle: updated.aboutSubtitle || "YOU'RE HERE? TO KNOW",
        aboutDescription: updated.aboutDescription,
        aboutQuote: updated.aboutQuote,
        baseCoordinatesTitle: updated.baseCoordinatesTitle,
        aboutLocationLabel: updated.aboutLocationLabel,
        aboutLocationValue: updated.aboutLocationValue,
        aboutTonguesLabel: updated.aboutTonguesLabel,
        aboutTonguesValue: updated.aboutTonguesValue,
        credentialStationTitle: updated.credentialStationTitle || 'CREDENTIAL STATION',
        credentialStationSubtitle: updated.credentialStationSubtitle || 'Education & Software Armory',
        basePositionLabel: updated.basePositionLabel || 'Hey There!',
        basePosition: updated.basePosition || "Let's get creative",
        heroImage: updated.heroImage || ''
      });
      await dbSaveSectionTexts(updated);
    } catch (err) {
      console.error("Failed to save coordinates to Firestore:", err);
    }
  };

  const handleSaveCredentialStationHeaders = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...sectionTexts,
      credentialStationTitle: editCredentialStationTitle,
      credentialStationSubtitle: editCredentialStationSubtitle
    };
    setSectionTexts(updated);
    setEditingField(null);
    triggerNotification("Credential headers updated.");
    try {
      await dbSaveAbout({
        aboutTitle: updated.aboutTitle,
        aboutSubtitle: updated.aboutSubtitle || "YOU'RE HERE? TO KNOW",
        aboutDescription: updated.aboutDescription,
        aboutQuote: updated.aboutQuote,
        baseCoordinatesTitle: updated.baseCoordinatesTitle || 'Base coordinates',
        aboutLocationLabel: updated.aboutLocationLabel || 'Location',
        aboutLocationValue: updated.aboutLocationValue || 'Dhaka, Bangladesh',
        aboutTonguesLabel: updated.aboutTonguesLabel || 'Tongues',
        aboutTonguesValue: updated.aboutTonguesValue || 'Bangla, English, Hindi, Urdu',
        credentialStationTitle: updated.credentialStationTitle,
        credentialStationSubtitle: updated.credentialStationSubtitle,
        basePositionLabel: updated.basePositionLabel || 'Hey There!',
        basePosition: updated.basePosition || "Let's get creative",
        heroImage: updated.heroImage || ''
      });
      await dbSaveSectionTexts(updated);
    } catch (err) {
      console.error("Failed to save credential headers to Firestore:", err);
    }
  };

  const handleSaveStudioCoordinatesHeaders = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...sectionTexts,
      studioCoordinatesTitle: editStudioCoordinatesTitle,
      studioCoordinatesSubtitle: editStudioCoordinatesSubtitle,
      studioCoordinatesDescription: editStudioCoordinatesDescription
    };
    setSectionTexts(updated);
    setEditingField(null);
    triggerNotification("Contact section headers updated.");
    try {
      await setDoc(doc(db, 'contact', 'info'), cleanUndefined({
        studioCoordinatesTitle: updated.studioCoordinatesTitle,
        studioCoordinatesSubtitle: updated.studioCoordinatesSubtitle,
        studioCoordinatesDescription: updated.studioCoordinatesDescription,
        contactsMeta: updated.contactsMeta
      }));
      await dbSaveSectionTexts(updated);
    } catch (err) {
      console.error("Failed to save contact headers to Firestore:", err);
    }
  };

  const handleSaveBasePosition = async (e: React.FormEvent) => {
    e.preventDefault();
    const updated = {
      ...sectionTexts,
      basePositionLabel: editBasePositionLabel,
      basePosition: editBasePositionValue
    };
    setSectionTexts(updated);
    setEditingField(null);
    triggerNotification("Base Position customized.");
    try {
      await dbSaveAbout({
        aboutTitle: updated.aboutTitle,
        aboutSubtitle: updated.aboutSubtitle || "YOU'RE HERE? TO KNOW",
        aboutDescription: updated.aboutDescription,
        aboutQuote: updated.aboutQuote,
        baseCoordinatesTitle: updated.baseCoordinatesTitle || 'Base coordinates',
        aboutLocationLabel: updated.aboutLocationLabel || 'Location',
        aboutLocationValue: updated.aboutLocationValue || 'Dhaka, Bangladesh',
        aboutTonguesLabel: updated.aboutTonguesLabel || 'Tongues',
        aboutTonguesValue: updated.aboutTonguesValue || 'Bangla, English, Hindi, Urdu',
        credentialStationTitle: updated.credentialStationTitle || 'CREDENTIAL STATION',
        credentialStationSubtitle: updated.credentialStationSubtitle || 'Education & Software Armory',
        basePositionLabel: updated.basePositionLabel,
        basePosition: updated.basePosition,
        heroImage: updated.heroImage || ''
      });
      await dbSaveSectionTexts(updated);
    } catch (err) {
      console.error("Failed to save base position to Firestore:", err);
    }
  };

  const handleSaveHeroImageUrl = async () => {
    if (!heroImageUrlInput.trim()) {
      triggerNotification('Please enter a valid Google Drive or web image URL.');
      return;
    }
    const resolvedUrl = getGoogleDriveLink(heroImageUrlInput, 'image');
    const updated = { ...sectionTexts, heroImage: resolvedUrl };
    setSectionTexts(updated);
    triggerNotification('Portrait image URL updated in Firestore database!');
    try {
      await dbSaveAbout({
        aboutTitle: updated.aboutTitle,
        aboutSubtitle: updated.aboutSubtitle || "YOU'RE HERE? TO KNOW",
        aboutDescription: updated.aboutDescription,
        aboutQuote: updated.aboutQuote,
        baseCoordinatesTitle: updated.baseCoordinatesTitle || 'Base coordinates',
        aboutLocationLabel: updated.aboutLocationLabel || 'Location',
        aboutLocationValue: updated.aboutLocationValue || 'Dhaka, Bangladesh',
        aboutTonguesLabel: updated.aboutTonguesLabel || 'Tongues',
        aboutTonguesValue: updated.aboutTonguesValue || 'Bangla, English, Hindi, Urdu',
        credentialStationTitle: updated.credentialStationTitle || 'CREDENTIAL STATION',
        credentialStationSubtitle: updated.credentialStationSubtitle || 'Education & Software Armory',
        basePositionLabel: updated.basePositionLabel || 'Hey There!',
        basePosition: updated.basePosition || "Let's get creative",
        heroImage: updated.heroImage
      });
      await dbSaveSectionTexts(updated);
    } catch (err) {
      console.error('Failed to save updated portrait image URL to Firestore:', err);
      triggerNotification('Database write failed, but layout updated locally.');
    }
  };

  const handleAddCustomSocial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSocialName.trim() || !newSocialUrl.trim()) {
      triggerNotification('Platform name and profile URL link are required.');
      return;
    }
    const newSocial: SocialLink = {
      id: `social-${Date.now()}`,
      name: newSocialName.trim(),
      url: newSocialUrl.trim()
    };
    setSocialLinks(prev => [...prev, newSocial]);
    setNewSocialName('');
    setNewSocialUrl('');
    setShowAddSocialForm(false);
    triggerNotification('Added social connection successfully.');
    try {
      await dbSaveSocial(newSocial);
    } catch (err) {
      console.error("Failed to save social connection to Firestore:", err);
    }
  };

  const handleSaveSocialEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSocialId) return;
    if (!tempSocialName.trim() || !tempSocialUrl.trim()) {
      triggerNotification('Platform name and profile URL link are required.');
      return;
    }
    const updated: SocialLink = {
      id: editingSocialId,
      name: tempSocialName.trim(),
      url: tempSocialUrl.trim()
    };
    setSocialLinks(prev => prev.map(s => s.id === editingSocialId ? updated : s));
    setEditingSocialId(null);
    triggerNotification('Social link updated successfully.');
    try {
      await dbSaveSocial(updated);
    } catch (err) {
      console.error("Failed to save edited social link to Firestore:", err);
    }
  };

  const handleSaveExperience = async (exp: Experience) => {
    try {
      await dbSaveExperience(exp);
      triggerNotification('Experience coordinates saved successfully.');
    } catch (err) {
      console.error("Failed to save experience:", err);
      triggerNotification('Failed to save experience.');
    }
  };

  const handleDuplicateExperience = async (exp: Experience) => {
    try {
      const newId = `exp-${Date.now()}`;
      const duplicate: Experience = {
        ...exp,
        id: newId,
        title: `${exp.title || exp.role} (Copy)`,
        role: `${exp.title || exp.role} (Copy)`,
        sortOrder: experienceList.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await dbSaveExperience(duplicate);
      triggerNotification('Experience duplicated successfully.');
    } catch (err) {
      console.error("Failed to duplicate experience:", err);
      triggerNotification('Failed to duplicate experience.');
    }
  };

  const handleReorderExperiences = async (updatedList: Experience[]) => {
    try {
      setExperienceList(updatedList);
      for (const exp of updatedList) {
        await dbSaveExperience(exp);
      }
      triggerNotification('Timeline sequence updated successfully.');
    } catch (err) {
      console.error("Failed to reorder experiences:", err);
      triggerNotification('Failed to reorder experiences.');
    }
  };

  // Custom Yes/No delete confirmation trigger and execution
  const triggerDelete = (id: string, type: 'project' | 'achievement' | 'education' | 'skill' | 'phrase' | 'social' | 'category' | 'experience' | 'services', index?: number) => {
    setDeleteConfirm({
      isOpen: true,
      targetId: id,
      targetType: type,
      targetIndex: index
    });
  };

  const executeConfirmedDelete = async () => {
    if (!deleteConfirm) return;
    const { targetId, targetType, targetIndex } = deleteConfirm;
    setDeleteConfirm(null);

    try {
      if (targetType === 'project') {
        const pToDelete = projectsList.find(p => p.id === targetId);
        if (pToDelete?.isGallery) {
          await dbDeleteGalleryItem(targetId);
        } else {
          await dbDeleteProject(targetId);
        }
        triggerNotification('Work deleted permanently from database.');
      } else if (targetType === 'achievement') {
        setAchievements(prev => prev.filter(a => a.id !== targetId));
        triggerNotification('Achievement deleted permanently.');
        await dbDeleteAchievement(targetId);
      } else if (targetType === 'education') {
        setEducationList(prev => prev.filter(e => e.id !== targetId));
        triggerNotification('Education item deleted permanently.');
        await dbDeleteEducation(targetId);
      } else if (targetType === 'skill') {
        setSkillItems(prev => prev.filter(s => s.name !== targetId));
        triggerNotification('Skill deleted permanently.');
        await dbDeleteSkill(targetId);
      } else if (targetType === 'experience') {
        setExperienceList(prev => prev.filter(e => e.id !== targetId));
        triggerNotification('Experience item deleted permanently.');
        await dbDeleteExperience(targetId);
      } else if (targetType === 'services') {
        setServicesList(prev => prev.filter(s => s.id !== targetId));
        triggerNotification('Service item deleted permanently.');
        await dbDeleteService(targetId);
      } else if (targetType === 'phrase') {
        const currentPhrases = sectionTexts.typewriterPhrases || ["Multimedia Designer", "UI/UX Designer", "3D Artist", "Creative Technologist"];
        const updatedPhrases = currentPhrases.filter((_, idx) => idx !== targetIndex);
        const updatedTexts = {
          ...sectionTexts,
          typewriterPhrases: updatedPhrases
        };
        setSectionTexts(updatedTexts);
        triggerNotification('Typewriter phrase deleted permanently.');
        await dbSaveHero({
          heroTitle: updatedTexts.heroTitle || '',
          heroSubtitle: updatedTexts.heroSubtitle || '',
          heroDescription: updatedTexts.heroDescription || '',
          typewriterPhrases: updatedPhrases
        });
        await dbSaveSectionTexts(updatedTexts);
      } else if (targetType === 'social') {
        setSocialLinks(prev => prev.filter(s => s.id !== targetId));
        triggerNotification('Social connection deleted.');
        await dbDeleteSocial(targetId);
      } else if (targetType === 'category') {
        await handleDeleteCategory(targetId);
      }
    } catch (err) {
      console.error(`Error deleting ${targetType} from Firestore:`, err);
      triggerNotification(`Failed to complete deletion in Firestore database.`);
    }
  };

  const handleAddTypewriterPhrase = async () => {
    if (!newPhraseInput.trim()) return;
    const currentPhrases = sectionTexts.typewriterPhrases || ["Multimedia Designer", "UI/UX Designer", "3D Artist", "Creative Technologist"];
    if (currentPhrases.includes(newPhraseInput.trim())) {
      triggerNotification('Phrase already exists in animation loop.');
      return;
    }
    const updatedPhrases = [...currentPhrases, newPhraseInput.trim()];
    const updatedTexts = {
      ...sectionTexts,
      typewriterPhrases: updatedPhrases
    };
    setSectionTexts(updatedTexts);
    setNewPhraseInput('');
    triggerNotification('Added new typewriter skill phrase.');
    try {
      await dbSaveHero({
        heroTitle: updatedTexts.heroTitle || '',
        heroSubtitle: updatedTexts.heroSubtitle || '',
        heroDescription: updatedTexts.heroDescription || '',
        typewriterPhrases: updatedPhrases
      });
      await dbSaveSectionTexts(updatedTexts);
    } catch (err) {
      console.error("Failed to save updated typewriter phrases to Firestore:", err);
    }
  };

  // New project post logic
  const handleCreateWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkTitle || !newWorkDesc) {
      triggerNotification('Title and Description are required.');
      return;
    }

    let finalImages: string[] = [];
    let finalVideo: string | undefined = undefined;

    if (newWorkUploadType === 'video') {
      if (!newWorkVideoUrl.trim()) {
        triggerNotification('Please provide a Google Drive video link.');
        return;
      }
      finalVideo = getGoogleDriveLink(newWorkVideoUrl, 'video');
    } else {
      const activeUrls = newWorkImageUrls.slice(0, imageCount).filter(u => u.trim().length > 0);
      if (activeUrls.length === 0) {
        triggerNotification('Please provide at least 1 Google Drive image link.');
        return;
      }
      finalImages = activeUrls.map(url => getGoogleDriveLink(url, 'image'));
    }

    const swArray = newWorkSoftware
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const filteredDeliverables = newWorkDeliverables.filter(d => d.trim().length > 0);

    const docData = {
      title: newWorkTitle,
      subtitle: newWorkSubtitle || (isNewWorkGallery ? 'Work' : 'Featured Masterpiece'),
      description: newWorkDesc,
      fullDescription: newWorkDesc,
      image: finalImages[0] || 'https://lh3.googleusercontent.com/aida-public/AB6AXuDL5GCeX_6FI2QAwGszqXsccQ7tlrULA-x1iolAk0c99XQhINKnl_u51rGso8zZEvZK6frzGJikasfLw6Sg9CQBnJMrGSXU6u8UIu2h05nzr41UacK2BF1LSGKJMf58Oy2Qr73Z_AvewkPy5CU7VhKm4RTJV_61RvqDg2Frk-2XhIb70_mtQlHZDwAi51mpX3a8qtAEGcCJ8mN5P7Mg1QC31VdXfJJFYgfz7Ihs0snvtgqp2gtxmkb-onkfVR0s71WQaqPGooGzzIA',
      images: finalImages,
      imageUrls: finalImages,
      videoUrl: finalVideo,
      modelUrl: '',
      category: newWorkCategory,
      software: swArray,
      softwareUsed: swArray,
      likes: 0,
      featured: !isNewWorkGallery && isNewWorkFeatured,
      deliverables: filteredDeliverables.length > 0 ? filteredDeliverables : ['Creative Vision', 'Technical Design'],
      views: 0,
      isGallery: isNewWorkGallery,
      status: 'published',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    triggerNotification(isNewWorkGallery ? 'Publishing daily practice work...' : 'Publishing masterpiece...');
    
    try {
      if (isNewWorkGallery) {
        await dbAddGalleryItem(docData);
      } else {
        await dbAddProject(docData);
      }
      
      triggerNotification(isNewWorkGallery ? 'Successfully published daily practice work!' : 'Successfully published masterpiece!');

      // Only reset form fields on successful database save
      setNewWorkTitle('');
      setNewWorkDesc('');
      setNewWorkSubtitle('');
      setNewWorkSoftware('');
      setNewWorkImages([]);
      setNewWorkVideo(null);
      setNewWorkVideoUrl('');
      setNewWorkImageUrls(['', '', '', '']);
      setImageCount(1);
      setNewWorkDeliverables(['', '']);
      setIsNewWorkFeatured(false);
      setIsNewWorkGallery(false);

      // Sync manual category if not already in category filter list
      const trimmedCat = newWorkCategory.trim();
      if (trimmedCat && !categories.some(c => c.toLowerCase() === trimmedCat.toLowerCase())) {
        const updatedCats = [...categories, trimmedCat];
        setCategories(updatedCats);
        await dbSaveCategories(updatedCats);
      }
    } catch (err) {
      console.error("Failed to save new project or categories to Firestore:", err);
      triggerNotification('Publish failed. Check internet connection.');
    }
  };

  // Publish YouTube video to gallery / more work section
  const handleCreateYoutubeWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytVideoUrl.trim() || !ytVideoTitle.trim() || !ytVideoDesc.trim()) {
      triggerNotification('YouTube Link, Title and Description are required.');
      return;
    }

    const youtubeId = getYoutubeId(ytVideoUrl);
    if (!youtubeId) {
      triggerNotification('Invalid YouTube URL. Please provide a valid youtube.com or youtu.be link.');
      return;
    }

    const armoryArray = ytVideoArmory
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Parse deliverables (split by newline and clean any leading point formatting)
    const deliverablesArray = ytVideoDeliverables
      .split('\n')
      .map(line => line.trim())
      .map(line => line.replace(/^\d+[\.\-\s]*/, '').trim())
      .filter(line => line.length > 0);

    const thumbnail = `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`;

    const docData = {
      title: ytVideoTitle.trim(),
      subtitle: 'Video',
      description: ytVideoDesc.trim(),
      fullDescription: ytVideoDesc.trim(),
      image: thumbnail,
      images: [thumbnail],
      imageUrls: [thumbnail],
      videoUrl: ytVideoUrl.trim(),
      modelUrl: '',
      category: ytVideoCategory.trim() || 'Video',
      software: armoryArray,
      softwareUsed: armoryArray,
      likes: 0,
      featured: false,
      deliverables: deliverablesArray.length > 0 ? deliverablesArray : ['Creative Vision', 'Technical Design'],
      views: 0,
      isGallery: true,
      status: 'published',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    triggerNotification('Publishing YouTube video to More Works...');

    try {
      await dbAddGalleryItem(docData);
      triggerNotification('Successfully published YouTube video!');

      // Reset fields
      setYtVideoUrl('');
      setYtVideoTitle('');
      setYtVideoDesc('');
      setYtVideoCategory('');
      setYtVideoDeliverables('');
      setYtVideoArmory('');

      // Sync categories
      const trimmedCat = ytVideoCategory.trim();
      if (trimmedCat && !categories.some(c => c.toLowerCase() === trimmedCat.toLowerCase())) {
        const updatedCats = [...categories, trimmedCat];
        setCategories(updatedCats);
        await dbSaveCategories(updatedCats);
      }
    } catch (err) {
      console.error("Failed to save new YouTube video work:", err);
      triggerNotification('Publish failed. Check internet connection.');
    }
  };

  // Add new achievement
  const handleAddAchievement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAchTitle || !newAchDesc) {
      triggerNotification('Achievement title and description are required.');
      return;
    }

    if (!newAchImgUrl.trim()) {
      triggerNotification('Please provide a Google Drive image link.');
      return;
    }

    const resolvedImg = getGoogleDriveLink(newAchImgUrl, 'image');

    const nextAch = {
      title: newAchTitle,
      description: newAchDesc,
      category: newAchCategory || 'Creative Milestone',
      image: resolvedImg
    };

    setNewAchTitle('');
    setNewAchDesc('');
    setNewAchCategory('');
    setNewAchImg('');
    setNewAchImgUrl('');
    triggerNotification('Posting achievement...');

    try {
      await dbAddAchievement(nextAch);
      triggerNotification('Achievement posted successfully.');
    } catch (err) {
      console.error("Failed to save new achievement to Firestore:", err);
    }
  };

  // Dynamic skill update / add
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillMonths, setNewSkillMonths] = useState(1);
  const handleAddSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSkillName) return;

    // Calculate a historic date based on experience months so it automatically increments monthly!
    const date = new Date('2026-07-09');
    date.setMonth(date.getMonth() - newSkillMonths);
    const startStr = date.toISOString().split('T')[0];

    const nextSkill: SkillItem = {
      name: newSkillName,
      experienceStartedDate: startStr,
      comment: 'Specialized weapon'
    };
    setSkillItems(prev => [...prev, nextSkill]);
    setNewSkillName('');
    setNewSkillMonths(1);
    triggerNotification('Added software skill.');

    try {
      await dbSaveSkill(nextSkill);
    } catch (err) {
      console.error("Failed to save new skill to Firestore:", err);
    }
  };

  // Dynamic education update / add
  const [newEduInst, setNewEduInst] = useState('');
  const [newEduDept, setNewEduDept] = useState('');
  const handleAddEducation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEduInst || !newEduDept) return;

    const nextEdu: Education = {
      id: `edu-${Date.now()}`,
      institution: newEduInst,
      department: newEduDept
    };
    setEducationList(prev => [...prev, nextEdu]);
    setNewEduInst('');
    setNewEduDept('');
    triggerNotification('Added education status.');

    try {
      await dbSaveEducation(nextEdu);
    } catch (err) {
      console.error("Failed to save new education item to Firestore:", err);
    }
  };

  // Dynamic custom categories add
  const [newCatVal, setNewCatVal] = useState('');
  const handleAddCategory = async () => {
    if (!newCatVal) return;
    if (categories.includes(newCatVal)) {
      triggerNotification('Category already exists.');
      return;
    }
    const updatedCats = [...categories, newCatVal];
    setCategories(updatedCats);
    setNewCatVal('');
    triggerNotification('Added new category option.');

    try {
      await dbSaveCategories(updatedCats);
    } catch (err) {
      console.error("Failed to save updated categories list to Firestore:", err);
    }
  };

  const handleDeleteCategory = async (catToDelete: string) => {
    if (catToDelete === 'All') {
      triggerNotification('Cannot delete default "All" category.');
      return;
    }
    const updatedCats = categories.filter(c => c !== catToDelete);
    setCategories(updatedCats);
    if (activeFilter === catToDelete) {
      setActiveFilter('All');
    }
    triggerNotification(`Deleted category "${catToDelete}".`);

    try {
      await dbSaveCategories(updatedCats);
    } catch (err) {
      console.error("Failed to save updated categories list to Firestore:", err);
    }
  };

  // WhatsApp redirection for secure contact submission
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactDescription, setContactDescription] = useState('');
  const [contactHire, setContactHire] = useState<'Yes' | 'No'>('Yes');

  const handleGetInTouchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactName || !contactEmail || !contactDescription) {
      triggerNotification('Please fill in Name, Email, and Project Description.');
      return;
    }

    // Format secure brief for WhatsApp
    const briefText = `🔥 Portfolio Briefing - Sahl Ahmed Studio 🔥\n\n` +
      `Client Name: ${contactName}\n` +
      `Client Email: ${contactEmail}\n` +
      `Ready to Hire: ${contactHire}\n` +
      `Project Description:\n${contactDescription}\n\n` +
      `Sent via Sahl Studio encrypted gateway.`;

    const encodedBrief = encodeURIComponent(briefText);
    const waUrl = `https://wa.me/8801949380524?text=${encodedBrief}`;
    
    // Redirect securely
    triggerNotification('Connecting secure WhatsApp line... Handshaking client brief!');

    try {
      await dbSubmitContact({
        name: contactName,
        email: contactEmail,
        description: contactDescription,
        hireOption: contactHire,
        createdAt: new Date().toISOString()
      });
      // Track successful contact form submission (respecting PII)
      trackContactFormSubmission(contactHire === 'Yes' ? 'Hire Interest' : 'General Inquiry', contactDescription.length);
    } catch (err) {
      console.error("Failed to submit contact request to Firestore:", err);
    }

    setTimeout(() => {
      window.open(waUrl, '_blank');
    }, 1000);
  };

  // Masterpieces calculations (only non-gallery items are masterpieces)
  const featuredMasterpieces = useMemo(() => {
    return projectsList.filter(p => p.featured && !p.isGallery);
  }, [projectsList]);

  // Automatic slide transition every 5 seconds for featured masterpieces
  useEffect(() => {
    if (featuredMasterpieces.length <= 1) return;
    if (selectedProject || zoomImage || isAdminModalOpen) return;
    const interval = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % featuredMasterpieces.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [featuredMasterpieces.length, selectedProject, zoomImage, isAdminModalOpen]);

  // Adjust current masterpieces slide index if list gets mutated
  useEffect(() => {
    if (carouselIndex >= featuredMasterpieces.length) {
      setCarouselIndex(0);
    }
  }, [featuredMasterpieces.length, carouselIndex]);

  const masterpiecesOnly = useMemo(() => {
    return projectsList.filter(p => !p.isGallery);
  }, [projectsList]);

  const filteredProjects = useMemo(() => {
    const filtered = projectsList.filter(p => {
      if (!p.isGallery) return false; // Gallery only shows daily practice works
      const matchesFilter = activeFilter === 'All' || p.category.toLowerCase() === activeFilter.toLowerCase();
      const matchesSearch = p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            p.software.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesFilter && matchesSearch;
    });

    return filtered.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return isOldestFirst ? timeA - timeB : timeB - timeA;
    });
  }, [projectsList, activeFilter, searchQuery, isOldestFirst]);

  if (isLoading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-[#07090e] text-[#f1f3f9]' : 'bg-[#f4f6fa] text-[#0f1115] light-theme'} flex flex-col items-center justify-center font-sans transition-colors duration-300`}>
        <div className="relative w-16 h-16 mb-4">
          <div className="absolute inset-0 rounded-full border-t-2 border-primary animate-spin"></div>
          <div className="absolute inset-2 rounded-full border-b-2 border-secondary animate-pulse"></div>
        </div>
        <p className="text-xs font-mono text-primary uppercase tracking-[0.2em] animate-pulse">
          Initializing Sahl Studio Engine...
        </p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-[#07090e] text-[#f1f3f9]' : 'bg-[#f4f6fa] text-[#0f1115] light-theme'} font-sans antialiased selection:bg-primary selection:text-black transition-colors duration-300 overflow-x-hidden`}>
      
      {/* Global Animated Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -80, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[999] w-full max-w-md px-4"
          >
            <div className="bg-gradient-to-r from-primary/95 to-secondary/95 border border-primary/20 shadow-2xl p-4 rounded-2xl flex items-center justify-between gap-3 text-sm backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-white font-bold">Studio Engine</p>
                  <p className="text-white/80 text-xs">{notification}</p>
                </div>
              </div>
              <button onClick={() => setNotification(null)} className="text-white/60 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Header */}
      <header className={`fixed top-0 w-full z-50 transition-colors duration-300 backdrop-blur-md md:backdrop-blur-2xl border-b [transform:translate3d(0,0,0)] [backface-visibility:hidden] ${
        isDarkMode 
          ? 'bg-[#07090e]/80 border-white/5' 
          : 'bg-white/80 border-slate-200/80 shadow-sm'
      }`}>
        <nav className="flex justify-between items-center w-full px-4 md:px-16 py-4 max-w-7xl mx-auto">
          <div 
            onClick={() => setActiveTab('home')} 
            className={`text-xl md:text-2xl font-black tracking-tighter cursor-pointer select-none hover:text-primary transition-colors flex items-center gap-2 ${
              isDarkMode ? 'text-white' : 'text-slate-900'
            }`}
          >
            <span className="hidden xl:inline">SAHL AHMED</span>
            <span className="inline xl:hidden">SAHL</span>
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
          </div>

          {/* Desktop Links */}
          <div className="hidden xl:flex items-center gap-8">
            {[
              { id: 'home', label: 'Home' },
              { id: 'masterpieces', label: 'Masterpieces' },
              { id: 'gallery', label: 'More Works' },
              { id: 'about', label: 'About' },
              { id: 'contact', label: 'Contact' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`relative py-1 font-mono text-xs uppercase tracking-widest transition-all ${
                  activeTab === tab.id ? 'text-primary font-bold' : 'text-white/60 hover:text-white'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div layoutId="navIndicator" className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              className="bg-white/5 border border-white/10 text-white/60 p-2 md:px-3.5 md:py-2 rounded-xl text-xs font-mono hover:bg-white/10 hover:text-white transition-all flex items-center gap-1.5 active:scale-95 [transform:translate3d(0,0,0)] [backface-visibility:hidden]"
              title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#4f46e5]" />}
              <span className="hidden sm:inline font-mono">{isDarkMode ? "LIGHT" : "DARK"}</span>
            </button>

            {/* Admin Authentication Status or Admin Login Trigger */}
            {isAdminLoggedIn ? (
              <div className="flex items-center gap-3 [transform:translate3d(0,0,0)] [backface-visibility:hidden]">
                <span className="hidden md:inline text-[11px] font-mono text-primary bg-primary/10 px-3 py-1.5 rounded-xl border border-primary/20">
                  👑 ADMIN
                </span>
                <button 
                  onClick={() => setIsAiSettingsOpen(true)}
                  className="bg-primary/10 border border-primary/20 text-primary px-3.5 py-1.5 rounded-xl text-xs font-bold hover:bg-primary hover:text-black transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer [transform:translate3d(0,0,0)] [backface-visibility:hidden]"
                  title="AI Assistant Settings"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>AI Settings</span>
                </button>
                <button 
                  onClick={handleAdminLogout}
                  className="bg-red-500/10 border border-red-500/20 text-red-400 px-3.5 py-1.5 rounded-xl text-xs font-bold hover:bg-red-500 hover:text-white transition-all active:scale-95 [transform:translate3d(0,0,0)] [backface-visibility:hidden]"
                >
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAdminModalOpen(true)}
                className="bg-white/5 border border-white/10 text-white/60 p-2 sm:px-4 sm:py-2 rounded-xl text-xs font-mono hover:bg-white/10 hover:text-white transition-all flex items-center gap-1.5 active:scale-95 [transform:translate3d(0,0,0)] [backface-visibility:hidden]"
                title="Admin Portal"
              >
                <Database className="w-4 h-4" />
                <span className="hidden sm:inline">Admin Panel</span>
              </button>
            )}

            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`xl:hidden transition-colors ${isDarkMode ? 'text-white hover:text-primary' : 'text-slate-800 hover:text-primary'}`}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </nav>

        {/* Mobile Navigation Panel */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`xl:hidden border-t transition-colors duration-300 backdrop-blur-2xl overflow-hidden ${
                isDarkMode 
                  ? 'border-white/5 bg-[#07090e]/95' 
                  : 'border-slate-200 bg-white/95 shadow-lg shadow-black/5'
              }`}
            >
              <div className="flex flex-col gap-4 p-6">
                {[
                  { id: 'home', label: 'Home' },
                  { id: 'masterpieces', label: 'Masterpieces' },
                  { id: 'gallery', label: 'More Works' },
                  { id: 'about', label: 'About' },
                  { id: 'contact', label: 'Contact' }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      setMobileMenuOpen(false);
                    }}
                    className={`text-left py-2 font-mono text-sm uppercase tracking-wider transition-colors duration-200 ${
                      activeTab === tab.id 
                        ? 'text-primary font-bold' 
                        : isDarkMode ? 'text-white/60 hover:text-white' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}

                <div className={`border-t ${isDarkMode ? 'border-white/5' : 'border-slate-100'} pt-4 mt-2 flex flex-col gap-3`}>
                  {/* Mobile Theme Toggle */}
                  <button
                    onClick={() => {
                      toggleTheme();
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full py-2.5 rounded-xl text-xs font-mono text-center flex items-center justify-center gap-2 border transition-all ${
                      isDarkMode 
                        ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white' 
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {isDarkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-[#4f46e5]" />}
                    <span>{isDarkMode ? "SWITCH TO LIGHT MODE" : "SWITCH TO DARK MODE"}</span>
                  </button>

                  {isAdminLoggedIn ? (
                    <div className="flex flex-col gap-2">
                      <span className={`text-xs font-mono px-3 py-2 rounded-xl text-center border ${
                        isDarkMode
                          ? 'text-primary bg-primary/5 border-primary/10'
                          : 'text-primary bg-primary/10 border-primary/20'
                      }`}>
                        👑 Admin (Sahl)
                      </span>
                      <button 
                        onClick={() => {
                          handleAdminLogout();
                          setMobileMenuOpen(false);
                        }}
                        className="w-full bg-red-500/10 border border-red-500/20 text-red-400 py-2.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wider text-center"
                      >
                        Logout
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setIsAdminModalOpen(true);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full py-2.5 rounded-xl text-xs font-mono text-center flex items-center justify-center gap-2 border transition-all ${
                        isDarkMode 
                          ? 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white' 
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                      }`}
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>Admin Terminal</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* Main Content Layout */}
      <main className="pt-24 min-h-screen">
        
        {/* VIEW 1: HOME PAGE */}
        {activeTab === 'home' && (
          <div className="px-4 md:px-16 max-w-7xl mx-auto py-12">
            
            {/* Hero Section */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center py-12">
              <div className="lg:col-span-7 flex flex-col justify-center">
                
                {/* Editable Hero Title */}
                <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tighter text-white mb-2 leading-none relative group/edit">
                  {sectionTexts.heroTitle}
                  {isAdminLoggedIn && (
                    <button 
                      onClick={() => startEditing('heroTitle', sectionTexts.heroTitle)}
                      className="absolute -right-10 top-1/2 -translate-y-1/2 p-2 bg-primary/20 text-primary rounded-full hover:bg-primary hover:text-black transition-all"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                </h1>

                {editingField === 'heroTitle' && (
                  <div className="flex gap-2 mb-4 bg-[#0d121f] p-3 rounded-xl border border-white/10">
                    <input 
                      type="text" 
                      value={tempText} 
                      onChange={(e) => setTempText(e.target.value)} 
                      className="bg-black/40 text-white p-2 rounded w-full border border-white/10" 
                    />
                    <button onClick={() => saveEditedText('heroTitle')} className="bg-primary text-black px-4 rounded font-bold"><Save className="w-4 h-4" /></button>
                  </div>
                )}

                {/* Rotating Subtitle */}
                <div className="h-auto mb-6 flex flex-col justify-center">
                  <Typewriter phrases={sectionTexts.typewriterPhrases || ["Multimedia Designer", "UI/UX Designer", "3D Artist", "Creative Technologist"]} />
                  
                  {isAdminLoggedIn && (
                    <div className="mt-4 bg-[#0c101b] border border-primary/20 p-4 rounded-2xl max-w-lg shadow-xl">
                      <p className="text-[10px] font-mono text-primary uppercase tracking-wider mb-2 font-bold flex items-center gap-1">
                        <Sparkles className="w-3.5 h-3.5 animate-spin" /> Manage Typewriter Phrases Loop
                      </p>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {(sectionTexts.typewriterPhrases || ["Multimedia Designer", "UI/UX Designer", "3D Artist", "Creative Technologist"]).map((phrase, pIdx) => (
                          <span key={pIdx} className="bg-white/5 text-[10px] text-white px-2 py-1 rounded-md flex items-center gap-1.5 border border-white/10 group/phrase">
                            <span>{phrase}</span>
                            <button 
                              type="button"
                              onClick={() => triggerDelete(phrase, 'phrase', pIdx)}
                              className="text-red-400 hover:text-red-500 font-bold transition-colors ml-1"
                              title="Remove from animation"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          placeholder="e.g., CGI Animator" 
                          value={newPhraseInput} 
                          onChange={(e) => setNewPhraseInput(e.target.value)}
                          className="bg-black/60 text-xs text-white px-3 py-2 rounded-xl border border-white/10 w-full focus:outline-none focus:border-primary/50"
                        />
                        <button 
                          type="button"
                          onClick={handleAddTypewriterPhrase}
                          className="bg-primary text-black text-xs font-bold font-mono uppercase tracking-wider px-4 py-2 rounded-xl hover:opacity-95"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Editable Description */}
                <div className="relative group/edit pr-6">
                  <p className="text-white/70 text-lg leading-relaxed max-w-xl mb-8">
                    {sectionTexts.heroDescription}
                  </p>
                  {isAdminLoggedIn && (
                    <button 
                      onClick={() => startEditing('heroDescription', sectionTexts.heroDescription)}
                      className="absolute right-0 top-0 p-2 bg-primary/20 text-primary rounded-full hover:bg-primary hover:text-black transition-all"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {editingField === 'heroDescription' && (
                  <div className="flex flex-col gap-2 mb-4 bg-[#0d121f] p-3 rounded-xl border border-white/10">
                    <textarea 
                      value={tempText} 
                      onChange={(e) => setTempText(e.target.value)} 
                      className="bg-black/40 text-white p-2 rounded w-full h-24 border border-white/10" 
                    />
                    <button onClick={() => saveEditedText('heroDescription')} className="bg-primary text-black py-2 rounded font-bold">Save Changes</button>
                  </div>
                )}

                <div className="flex flex-wrap gap-4 items-center">
                  <button 
                    onClick={() => setActiveTab('masterpieces')}
                    className={`bg-gradient-to-r from-primary to-secondary px-8 py-4 rounded-xl font-bold ${isDarkMode ? 'text-black' : 'text-white'} hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.02] transition-all flex items-center gap-2`}
                  >
                    View Masterpieces
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => setActiveTab('contact')}
                    className="bg-white/5 border border-white/10 hover:bg-white/10 px-8 py-4 rounded-xl font-bold transition-all text-white"
                  >
                    Get in Touch
                  </button>
                </div>
              </div>

              {/* Editable Hero Image Portray */}
              <div className="lg:col-span-5 relative">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-secondary/10 blur-3xl opacity-30 rounded-full"></div>
                <div className="relative border border-white/10 p-4 rounded-3xl bg-white/[0.02] backdrop-blur-3xl overflow-hidden aspect-[4/5] shadow-2xl">
                  <img 
                    className="w-full h-full object-cover rounded-2xl grayscale hover:grayscale-0 transition-all duration-700 ease-out shadow-inner" 
                    alt="Sahl Ahmed Portrait"
                    referrerPolicy="no-referrer"
                    src={getProfileImage(sectionTexts.heroImage)}
                    loading="eager"
                    fetchPriority="high"
                  />
                  
                  {isAdminLoggedIn && (
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity p-6 z-10">
                      <p className="text-white text-xs font-mono mb-4 font-bold uppercase tracking-wider text-primary">Manage Portrait Image</p>
                      
                      {/* Option 1: URL Input (Drive/Web) */}
                      <div className="w-full mb-4">
                        <label className="block text-[10px] text-white/50 font-mono mb-1">Google Drive or Web Image Link</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="Paste Drive link or image URL"
                            value={heroImageUrlInput}
                            onChange={(e) => setHeroImageUrlInput(e.target.value)}
                            className="bg-black/60 text-xs text-white px-2 py-1.5 rounded-lg border border-white/10 w-full focus:outline-none focus:border-primary/50 font-mono"
                          />
                          <button
                            type="button"
                            onClick={handleSaveHeroImageUrl}
                            className="bg-primary text-black font-mono text-[10px] font-bold px-3 py-1.5 rounded-lg shrink-0 hover:opacity-90"
                          >
                            Apply
                          </button>
                        </div>
                      </div>

                      <div className="text-[10px] text-white/30 font-mono mb-4 flex items-center gap-2 w-full">
                        <div className="h-[1px] bg-white/10 flex-1"></div>
                        <span>OR</span>
                        <div className="h-[1px] bg-white/10 flex-1"></div>
                      </div>

                      {/* Option 2: Local File Upload */}
                      <div className="w-full text-center">
                        <label className="block text-[10px] text-white/50 font-mono mb-2">Upload Local Image (Max 1 MB)</label>
                        <label className="cursor-pointer bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[10px] font-mono px-4 py-2 rounded-xl transition-all inline-block w-full text-center">
                          Choose Local File...
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={(e) => handleImageFileLoad(e, async (url) => {
                              const updated = { ...sectionTexts, heroImage: url };
                              setSectionTexts(updated);
                              try {
                                await dbSaveSectionTexts(updated);
                                triggerNotification('Portrait updated successfully with local file.');
                              } catch (err) {
                                console.error('Failed to save updated local image to Firestore:', err);
                              }
                            })}
                            className="hidden" 
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  <div className={`absolute bottom-6 left-6 right-6 ${isDarkMode ? 'bg-[#07090e]/95 border-white/10' : 'bg-white border-slate-200/80 shadow-lg shadow-black/5'} border p-4 rounded-xl flex items-center justify-between group`}>
                    {editingField === 'basePosition' ? (
                      <form onSubmit={handleSaveBasePosition} className="flex flex-col gap-1.5 w-full">
                        <div>
                          <label className="text-[8px] text-primary/70 font-mono uppercase tracking-wider block mb-0.5">Label</label>
                          <input 
                            type="text" 
                            value={editBasePositionLabel} 
                            onChange={(e) => setEditBasePositionLabel(e.target.value)} 
                            className={`text-[10px] p-1 rounded border w-full ${isDarkMode ? 'bg-black/60 text-white border-white/10' : 'bg-slate-50 text-slate-900 border-slate-200'}`} 
                            placeholder="Label (e.g. Base Position)"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] text-primary/70 font-mono uppercase tracking-wider block mb-0.5">Value</label>
                          <input 
                            type="text" 
                            value={editBasePositionValue} 
                            onChange={(e) => setEditBasePositionValue(e.target.value)} 
                            className={`text-xs p-1 rounded border w-full font-bold ${isDarkMode ? 'bg-black/60 text-white border-white/10' : 'bg-slate-50 text-slate-900 border-slate-200'}`} 
                            placeholder="Value (e.g. Available Worldwide)"
                          />
                        </div>
                        <div className="flex gap-2 justify-end mt-1">
                          <button type="button" onClick={() => setEditingField(null)} className={`text-[10px] font-mono ${isDarkMode ? 'text-white/50 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}>Cancel</button>
                          <button type="submit" className="bg-primary text-white text-[10px] font-mono px-2 py-0.5 rounded font-bold">Save</button>
                        </div>
                      </form>
                    ) : (
                      <div className="relative w-full pr-8">
                        <p className="text-[10px] text-primary font-mono tracking-widest uppercase">
                          {sectionTexts.basePositionLabel || 'Hey There!'}
                        </p>
                        <p className={`text-sm ${isDarkMode ? 'text-white' : 'text-black'} font-bold`}>
                          {sectionTexts.basePosition || "Let's get creative"}
                        </p>
                        
                        {isAdminLoggedIn && (
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1">
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditBasePositionLabel(sectionTexts.basePositionLabel || "Hey There!");
                                setEditBasePositionValue(sectionTexts.basePosition || "Let's get creative");
                                setEditingField('basePosition');
                              }}
                              className="p-1 bg-primary/20 text-primary rounded hover:bg-primary hover:text-black transition-all"
                              title="Edit coordinates info"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-ping shrink-0"></div>
                  </div>
                </div>
              </div>
            </section>

            {/* Featured Masterpieces Slide Carousel */}
            {featuredMasterpieces.length > 0 && (
              <section className="py-16 border-t border-white/5 overflow-hidden">
                <div className="flex justify-between items-end mb-10">
                  <div>
                    <span className="font-mono text-xs text-primary uppercase tracking-widest block mb-2">DYNAMIC PRESENTATION</span>
                    <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Featured <span className="text-primary">Masterpieces</span></h2>
                  </div>
                </div>

                {/* Animated Masterpiece Card Slider with Left/Right Buttons */}
                <div className="relative flex items-center">
                  {featuredMasterpieces.length > 1 && (
                    <button 
                      onClick={() => setCarouselIndex(prev => (prev === 0 ? featuredMasterpieces.length - 1 : prev - 1))}
                      className="hidden md:block absolute left-0 z-10 p-3 bg-black/60 border border-white/10 rounded-full hover:bg-primary hover:text-black text-white transition-all shadow-lg hover:scale-105"
                      title="Previous Masterpiece"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  )}

                  <div className={`w-full ${featuredMasterpieces.length > 1 ? 'px-0 md:px-16' : ''} min-h-[460px] flex items-center justify-center overflow-hidden`}>
                    <AnimatePresence mode="wait">
                      {featuredMasterpieces.map((p, idx) => {
                        if (idx !== carouselIndex) return null;
                        return (
                          <motion.div
                            key={p.id}
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            transition={{ duration: 0.4 }}
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.2}
                            onDragEnd={(e, info) => {
                              if (info.offset.x < -50) {
                                setCarouselIndex(prev => (prev === featuredMasterpieces.length - 1 ? 0 : prev + 1));
                              } else if (info.offset.x > 50) {
                                setCarouselIndex(prev => (prev === 0 ? featuredMasterpieces.length - 1 : prev - 1));
                              }
                            }}
                            className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 bg-white/[0.01] border border-white/5 p-6 sm:p-8 rounded-3xl touch-pan-y cursor-grab active:cursor-grabbing"
                          >
                            <div className="lg:col-span-7 h-72 sm:h-96 rounded-2xl overflow-hidden relative border border-white/5 select-none">
                              <img 
                                className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity" 
                                src={p.image} 
                                alt={p.title} 
                                onClick={() => setZoomImage(p.image)}
                                draggable="false"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                              {p.videoUrl && (
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                  <Play className="w-12 h-12 text-primary" />
                                </div>
                              )}
                            </div>
                            <div className="lg:col-span-5 flex flex-col justify-between py-2">
                              <div>
                                <span className="text-xs font-mono text-primary uppercase tracking-wider">{p.category}</span>
                                <h3 className="text-2xl sm:text-3xl font-bold text-white mt-1 mb-4">{p.title}</h3>
                                <p className="text-white/70 text-sm leading-relaxed mb-6">{p.description}</p>
                                
                                <div className="flex flex-wrap gap-2 mb-6">
                                  {p.software.map((sw, swIdx) => (
                                    <span key={`${sw}-${swIdx}`} className="px-3 py-1 bg-white/5 border border-white/10 text-[10px] font-mono text-white rounded-md">
                                      {sw}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              
                              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                                <button 
                                  onClick={() => setSelectedProject(p)}
                                  className="text-primary text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:underline"
                                >
                                  View Case Study <ArrowRight className="w-4 h-4" />
                                </button>
                                <div className="flex items-center gap-2">
                                  {isAdminLoggedIn && (
                                    <button 
                                      onClick={(e) => { e.stopPropagation(); triggerDelete(p.id, 'project'); }}
                                      className="p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                                    >
                                      <Trash className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button 
                                    onClick={(e) => handleLikeProject(p.id, e)}
                                    className="flex items-center gap-1 text-xs font-mono text-white/50 hover:text-rose-500 transition-colors"
                                  >
                                    <Heart className="w-4 h-4" />
                                    <span>{p.likes}</span>
                                  </button>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  {featuredMasterpieces.length > 1 && (
                    <button 
                      onClick={() => setCarouselIndex(prev => (prev === featuredMasterpieces.length - 1 ? 0 : prev + 1))}
                      className="hidden md:block absolute right-0 z-10 p-3 bg-black/60 border border-white/10 rounded-full hover:bg-primary hover:text-black text-white transition-all shadow-lg hover:scale-105"
                      title="Next Masterpiece"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                </div>

                {/* Explore All Masterpieces Trigger */}
                <div className="flex justify-center mt-8">
                  <button 
                    onClick={() => setActiveTab('masterpieces')}
                    className="bg-primary text-black font-bold font-mono text-xs uppercase tracking-widest px-6 py-3.5 rounded-xl hover:scale-105 transition-all"
                  >
                    Explore All Masterpieces
                  </button>
                </div>
              </section>
            )}

            {/* Latest Practice Works Section (from More Works / Gallery) */}
            <section className="py-16 border-t border-white/5">
              <div className="flex justify-between items-end mb-10">
                <div>
                  <span className="font-mono text-xs text-primary uppercase tracking-widest block mb-2 font-bold">DAILY EXPERIMENTS</span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Latest <span className="text-primary">Practice Works</span></h2>
                </div>
              </div>

              {projectsList.filter(p => p.isGallery).length === 0 ? (
                <p className="text-xs text-white/40 font-mono text-center py-10">No daily practice works uploaded yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {projectsList
                      .filter(p => p.isGallery)
                      .sort((a, b) => {
                        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        return timeB - timeA;
                      })
                      .slice(0, 3)
                      .map((p) => (
                        <div 
                          key={p.id}
                          onClick={() => setSelectedProject(p)}
                          className="group bg-white/[0.01] border border-white/5 rounded-2xl overflow-hidden hover:border-white/15 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                        >
                          <div>
                            <div className="h-48 relative overflow-hidden">
                              <img 
                                src={p.image} 
                                alt={p.title} 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setZoomImage(p.image);
                                }}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-zoom-in" 
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent"></div>
                              <span className="absolute bottom-3 left-3 text-[9px] font-mono tracking-widest bg-black/60 border border-white/10 px-2 py-0.5 rounded-md text-primary">
                                {p.category.toUpperCase()}
                              </span>
                            </div>
                            <div className="p-4">
                              <span className="text-[9px] font-mono text-white/40 uppercase block mb-0.5">
                                {p.subtitle?.replace('Practice Video', 'Video').replace('Practice Work', 'Work').replace('Practice ', '') || 'Work'}
                              </span>
                              <h4 className="text-base font-bold text-white group-hover:text-primary transition-colors line-clamp-1">{p.title}</h4>
                              <p className="text-white/60 text-xs mt-1.5 line-clamp-2">{p.description}</p>
                            </div>
                          </div>
                          <div className="px-4 pb-4 pt-3 border-t border-white/5 flex items-center justify-between">
                            <div className="flex flex-wrap gap-1">
                              {p.software.slice(0, 2).map((soft, sIdx) => (
                                <span key={`${soft}-${sIdx}`} className="text-[8px] font-mono bg-white/5 text-white/60 px-1 py-0.5 rounded">
                                  {soft}
                                </span>
                              ))}
                            </div>
                            <span className="text-[10px] text-white/30 font-mono">Inspect Specs</span>
                          </div>
                        </div>
                      ))}
                  </div>

                  <div className="flex justify-center mt-10">
                    <button 
                      onClick={() => { setActiveTab('gallery'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                      className="bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 hover:text-primary text-white font-bold text-xs px-6 py-3 rounded-xl transition-all flex items-center gap-2"
                    >
                      See More Works <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </section>
            <section id="achievements-section" className="py-16 border-t border-white/5 overflow-hidden">
              <div className="flex justify-between items-end mb-10">
                <div>
                  <span className="font-mono text-xs text-primary uppercase tracking-widest block mb-2">COMMENDATIONS</span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Awards & <span className="text-secondary">Achievements</span></h2>
                </div>
              </div>

              {achievements.length === 0 ? (
                <p className="text-xs text-white/40 font-mono text-center py-10">No awards or achievements published yet.</p>
              ) : (
                <div className="relative flex items-center">
                  {achievements.length > 1 && (
                    <button 
                      onClick={() => setActiveAchIndex(prev => (prev === 0 ? achievements.length - 1 : prev - 1))}
                      className="hidden md:block absolute left-0 z-10 p-3 bg-black/60 border border-white/10 rounded-full hover:bg-secondary hover:text-black text-white transition-all shadow-lg hover:scale-105"
                      title="Previous Achievement"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                  )}

                  <div className={`w-full ${achievements.length > 1 ? 'px-0 md:px-16' : ''} min-h-[380px] flex items-center justify-center overflow-hidden`}>
                    <AnimatePresence mode="wait">
                      {achievements.map((ach, idx) => {
                        if (idx !== activeAchIndex) return null;
                        return (
                          <motion.div
                            key={ach.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.4 }}
                            drag="x"
                            dragConstraints={{ left: 0, right: 0 }}
                            dragElastic={0.2}
                            onDragEnd={(e, info) => {
                              if (info.offset.x < -50) {
                                setActiveAchIndex(prev => (prev === achievements.length - 1 ? 0 : prev + 1));
                              } else if (info.offset.x > 50) {
                                setActiveAchIndex(prev => (prev === 0 ? achievements.length - 1 : prev - 1));
                              }
                            }}
                            className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 bg-white/[0.01] border border-white/5 p-6 sm:p-8 rounded-3xl touch-pan-y cursor-grab active:cursor-grabbing"
                          >
                            <div className="lg:col-span-6 h-64 sm:h-80 rounded-2xl overflow-hidden relative border border-white/5 select-none">
                              <img 
                                className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity" 
                                src={ach.image} 
                                alt={ach.title} 
                                onClick={() => setZoomImage(ach.image)}
                                draggable="false"
                                loading="lazy"
                                referrerPolicy="no-referrer"
                              />
                              {isAdminLoggedIn && (
                                <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity p-4">
                                  <label className="cursor-pointer bg-primary text-black font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-lg hover:bg-white transition-all text-center">
                                    <span>Upload New Local Image</span>
                                    <input 
                                      type="file" 
                                      accept="image/*" 
                                      onChange={(e) => handleImageFileLoad(e, async (url) => {
                                        const updated = achievements.map(a => a.id === ach.id ? { ...a, image: url } : a);
                                        setAchievements(updated);
                                        const targetAch = updated.find(a => a.id === ach.id);
                                        if (targetAch) {
                                          try {
                                            await dbSaveAchievement(targetAch);
                                            triggerNotification('Achievement image updated.');
                                          } catch (err) {
                                            console.error('Failed to update achievement image:', err);
                                          }
                                        }
                                      })}
                                      className="hidden"
                                    />
                                  </label>
                                </div>
                              )}
                            </div>
                            
                            <div className="lg:col-span-6 flex flex-col justify-between py-2">
                              <div>
                                <span className="text-xs font-mono text-secondary uppercase tracking-widest block mb-2">{ach.category}</span>
                                <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-4">{ach.title}</h3>
                                <p className="text-white/70 text-sm leading-relaxed mb-6">{ach.description}</p>
                              </div>
                              
                              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                                <span className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                                  Slide {activeAchIndex + 1} of {achievements.length}
                                </span>
                                
                                {isAdminLoggedIn && (
                                  <button 
                                    type="button"
                                    onClick={() => triggerDelete(ach.id, 'achievement')}
                                    className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                                    title="Delete achievement"
                                  >
                                    <Trash className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>

                  {achievements.length > 1 && (
                    <button 
                      onClick={() => setActiveAchIndex(prev => (prev === achievements.length - 1 ? 0 : prev + 1))}
                      className="hidden md:block absolute right-0 z-10 p-3 bg-black/60 border border-white/10 rounded-full hover:bg-secondary hover:text-black text-white transition-all shadow-lg hover:scale-105"
                      title="Next Achievement"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  )}
                </div>
              )}

              {/* Add New Achievement Form (Admin Only) */}
              {isAdminLoggedIn && (
                <div className="mt-10 bg-white/[0.02] border border-primary/20 p-6 rounded-2xl">
                  <h3 className="text-sm font-mono text-primary uppercase mb-4 flex items-center gap-2">
                    <Award className="w-4 h-4" /> Post New Achievement (Admin Only)
                  </h3>
                  <form onSubmit={handleAddAchievement} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input 
                      type="text" 
                      placeholder="Achievement Title" 
                      value={newAchTitle} 
                      onChange={(e) => setNewAchTitle(e.target.value)} 
                      className="bg-black/40 text-white p-3 rounded-xl border border-white/10 text-sm" 
                    />
                    <input 
                      type="text" 
                      placeholder="Category (e.g. Awwwards 2026)" 
                      value={newAchCategory} 
                      onChange={(e) => setNewAchCategory(e.target.value)} 
                      className="bg-black/40 text-white p-3 rounded-xl border border-white/10 text-sm" 
                    />
                    <textarea 
                      placeholder="Short description of success" 
                      value={newAchDesc} 
                      onChange={(e) => setNewAchDesc(e.target.value)} 
                      className="bg-black/40 text-white p-3 rounded-xl border border-white/10 text-sm md:col-span-2" 
                    />
                    <div className="md:col-span-2 flex flex-col gap-2">
                      <label className="text-xs font-mono text-white/60">Google Drive Image URL</label>
                      <input 
                        type="text" 
                        placeholder="Paste 'Anyone with the link' Google Drive image sharing link" 
                        value={newAchImgUrl} 
                        onChange={(e) => setNewAchImgUrl(e.target.value)} 
                        className="bg-black/40 text-white p-3 rounded-xl border border-white/10 text-xs focus:border-primary focus:outline-none font-mono" 
                      />
                      {newAchImgUrl && (
                        <div className="text-[10px] font-mono text-white/40 flex items-center gap-1.5 pl-1 overflow-hidden">
                          <span>Direct image source:</span>
                          <span className="text-primary truncate max-w-md">{getGoogleDriveLink(newAchImgUrl, 'image')}</span>
                        </div>
                      )}
                    </div>
                    <button type="submit" className="bg-primary text-black py-3 rounded-xl font-bold text-xs uppercase tracking-widest md:col-span-2 hover:opacity-90">
                      Publish Achievement
                    </button>
                  </form>
                </div>
              )}
            </section>

            <Suspense fallback={<div className="h-48 flex items-center justify-center text-white/40">Loading experience slider...</div>}>
              <HomeExperienceSlider 
                experiences={experienceList}
                isDarkMode={isDarkMode}
              />
            </Suspense>

          </div>
        )}

        {/* VIEW 2: MASTERPIECES TAB */}
        {activeTab === 'masterpieces' && (
          <div className="px-4 md:px-16 max-w-7xl mx-auto py-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
              <div>
                <span className="font-mono text-xs text-primary uppercase tracking-[0.2em] font-semibold block mb-2">EXCLUSIVE SPECS</span>
                <h1 className="text-4xl md:text-5xl font-black mb-2 text-white">The Masterpiece Archive</h1>
                <p className="text-white/60 text-sm max-w-xl">
                  A high-fidelity record of Sahl Ahmed's most complex and celebrated creative achievements. Real-time customizable in-memory database.
                </p>
              </div>

              {isAdminLoggedIn && (
                <div className="mt-4 md:mt-0">
                  <span className="text-xs font-mono text-green-400 bg-green-400/5 px-4 py-2 rounded-xl border border-green-400/20 block">
                    Logged in: Click edit icons or delete directly on cards.
                  </span>
                </div>
              )}
            </div>

            {/* Masterpiece Cards Collection Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {masterpiecesOnly.map((p) => (
                <div 
                  key={p.id} 
                  onClick={() => setSelectedProject(p)}
                  className="bg-white/[0.01] border border-white/5 rounded-3xl p-6 hover:border-white/15 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    {/* Automatic responsive grid photo collage based on image array length */}
                    <div className="mb-6 rounded-2xl overflow-hidden border border-white/5 relative">
                      {p.images && p.images.length > 1 ? (
                        <div className={`grid gap-1 ${
                          p.images.length === 2 ? 'grid-cols-2 h-64' :
                          p.images.length === 3 ? 'grid-cols-3 h-64' :
                          'grid-cols-2 h-72'
                        }`}>
                          {p.images.map((img, i) => (
                            <img 
                              key={i} 
                              src={img} 
                              alt={`Collage visual ${i}`} 
                              onClick={(e) => {
                                e.stopPropagation();
                                setZoomImage(img);
                              }}
                              className="w-full h-full object-cover hover:scale-105 transition-transform" 
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="h-64 relative">
                          <img 
                            src={p.image} 
                            alt={p.title} 
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoomImage(p.image);
                            }}
                            className="w-full h-full object-cover cursor-zoom-in hover:opacity-90 transition-opacity" 
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          {p.videoUrl && (
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                              <Play className="w-10 h-10 text-primary" />
                            </div>
                          )}
                        </div>
                      )}

                      {isAdminLoggedIn && (
                        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <p className="text-white text-[10px] mb-1 font-mono">Change Cover Image (Max 1 MB)</p>
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={(e) => handleImageFileLoad(e, async (url) => {
                              try {
                                const updatedProj = { ...p, image: url };
                                if (p.isGallery) {
                                  await dbSaveGalleryItem(updatedProj);
                                } else {
                                  await dbSaveProject(updatedProj);
                                }
                                triggerNotification("Cover image updated in database.");
                              } catch (err) {
                                console.error("Failed to update project cover image:", err);
                              }
                            })}
                            className="text-[9px] text-white" 
                          />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-primary uppercase tracking-wider">{p.category}</span>
                      <span className="text-xs text-white/40 font-mono">ID: {p.id.substring(0, 8)}</span>
                    </div>

                    <h3 className="text-2xl font-bold text-white mb-3 hover:text-primary transition-colors">{p.title}</h3>
                    <p className="text-white/70 text-sm leading-relaxed mb-6">{p.description}</p>

                    {/* Inline video player if video is uploaded */}
                    {p.videoUrl && (
                      <div className="mb-6 w-full max-w-full overflow-hidden">
                        <CustomVideoPlayer src={p.videoUrl} posterImage={p.image} />
                      </div>
                    )}

                    <div className="mb-6">
                      <h4 className="text-xs font-mono text-secondary uppercase mb-2">Core Deliverables</h4>
                      <div className="flex flex-col gap-1.5">
                        {p.deliverables.map((del, dIdx) => (
                          <div key={dIdx} className="flex items-center gap-2 text-xs text-white/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                            <span>{del}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-white/5 flex justify-between items-center">
                    <div className="flex items-center gap-1.5 text-xs text-white/50 font-mono">
                      <ThumbsUp className="w-3.5 h-3.5 text-primary" />
                      <span>{p.likes} Approvals</span>
                    </div>

                    <div className="flex items-center gap-3">
                      {isAdminLoggedIn && (
                        <button 
                          type="button"
                          onClick={(e) => { e.stopPropagation(); triggerDelete(p.id, 'project'); }}
                          className="bg-red-500/10 text-red-400 p-2 rounded-xl hover:bg-red-500 hover:text-white transition-all"
                          title="Delete masterpiece"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      )}
                      <button 
                        onClick={() => setSelectedProject(p)}
                        className="bg-white/5 hover:bg-white/10 text-white font-bold text-xs px-4 py-2 rounded-xl transition-all"
                      >
                        Inspect specs
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Admin Block to post new Masterpiece */}
            {isAdminLoggedIn && (
              <div className="mt-16 bg-[#0c101b] border border-primary/20 p-8 rounded-3xl">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 font-mono">
                  <Database className="w-5 h-5 text-primary" /> Publish a New Work (Sahl-Only Rigs)
                </h2>
                
                <form onSubmit={handleCreateWork} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Select Destination Section */}
                  <div className="md:col-span-2 flex flex-col gap-2.5">
                    <label className="text-xs font-mono text-white/60">Destination Target Section</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setIsNewWorkGallery(false)}
                        className={`py-3 rounded-xl border text-xs font-bold font-mono tracking-wider transition-all uppercase ${
                          !isNewWorkGallery 
                            ? 'bg-primary/20 border-primary text-primary shadow-lg shadow-primary/10' 
                            : 'bg-black/40 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        Masterpieces Section
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsNewWorkGallery(true)}
                        className={`py-3 rounded-xl border text-xs font-bold font-mono tracking-wider transition-all uppercase ${
                          isNewWorkGallery 
                            ? 'bg-secondary/20 border-secondary text-secondary shadow-lg shadow-secondary/10' 
                            : 'bg-black/40 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        More Works / Gallery Section
                      </button>
                    </div>
                    <p className="text-[10px] font-mono text-white/40">
                      {isNewWorkGallery 
                        ? '✔ Daily experiment or practice work. Will show up ONLY in the Gallery catalog.'
                        : '✔ Celebrated major portfolio. Will show up ONLY in the Masterpieces page and top carousel.'}
                    </p>
                  </div>

                  {/* Select Content Media Payload Type */}
                  <div className="md:col-span-2 flex flex-col gap-2.5">
                    <label className="text-xs font-mono text-white/60">Choose Media Payload Type (Using Google Drive URLs - No size limit)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setNewWorkUploadType('image')}
                        className={`py-3 rounded-xl border text-xs font-bold font-mono tracking-wider transition-all uppercase ${
                          newWorkUploadType === 'image' 
                            ? 'bg-white/10 border-white text-white shadow-lg' 
                            : 'bg-black/40 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        1 to 4 Images (No Size Limits)
                      </button>
                      <button
                        type="button"
                        onClick={() => setNewWorkUploadType('video')}
                        className={`py-3 rounded-xl border text-xs font-bold font-mono tracking-wider transition-all uppercase ${
                          newWorkUploadType === 'video' 
                            ? 'bg-white/10 border-white text-white shadow-lg' 
                            : 'bg-black/40 border-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        1 Video Presentation (No Size Limits)
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono text-white/60">Title of work</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Cybernetic Space Suit" 
                      value={newWorkTitle} 
                      onChange={(e) => setNewWorkTitle(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-primary focus:outline-none" 
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono text-white/60">Subtitle / Related Work</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 3D Character Rig" 
                      value={newWorkSubtitle} 
                      onChange={(e) => setNewWorkSubtitle(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-primary focus:outline-none" 
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono text-white/60">Category (type manually)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. UI/UX, 3D Design, Animation" 
                      value={newWorkCategory} 
                      onChange={(e) => setNewWorkCategory(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-primary focus:outline-none" 
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono text-white/60">Software Used (Comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="Maya, ZBrush, Substance" 
                      value={newWorkSoftware} 
                      onChange={(e) => setNewWorkSoftware(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-primary focus:outline-none" 
                    />
                  </div>

                  <div className="md:col-span-2 flex flex-col gap-2">
                    <label className="text-xs font-mono text-white/60">Description Box</label>
                    <textarea 
                      placeholder="Explain the technical precision, textures, mesh topologies, lighting, and visual outcome..." 
                      value={newWorkDesc} 
                      onChange={(e) => setNewWorkDesc(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-primary focus:outline-none h-32" 
                    />
                  </div>

                  {/* Core deliverables */}
                  <div className="md:col-span-2 flex flex-col gap-3">
                    <p className="text-xs font-mono text-white/60">Core deliverables (Add 2 to 4 bullet points)</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {newWorkDeliverables.map((item, idx) => (
                        <input 
                          key={idx}
                          type="text"
                          placeholder={`Point ${idx + 1}`}
                          value={item}
                          onChange={(e) => {
                            const copy = [...newWorkDeliverables];
                            copy[idx] = e.target.value;
                            setNewWorkDeliverables(copy);
                          }}
                          className="bg-black/40 text-white p-3 rounded-xl border border-white/10 text-xs focus:border-primary focus:outline-none"
                        />
                      ))}
                    </div>
                    <div className="flex gap-2">
                      {newWorkDeliverables.length < 4 && (
                        <button 
                          type="button" 
                          onClick={() => setNewWorkDeliverables(prev => [...prev, ''])}
                          className="text-xs text-primary bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20"
                        >
                          + Add point option
                        </button>
                      )}
                      {newWorkDeliverables.length > 2 && (
                        <button 
                          type="button" 
                          onClick={() => setNewWorkDeliverables(prev => prev.slice(0, -1))}
                          className="text-xs text-red-400 bg-red-400/10 px-3 py-1.5 rounded-lg border border-red-400/20"
                        >
                          - Remove last option
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Featured Flag (Only applicable if Masterpiece) */}
                  {!isNewWorkGallery && (
                    <div className="md:col-span-2 flex items-center gap-3">
                      <input 
                        type="checkbox" 
                        id="featured_check"
                        checked={isNewWorkFeatured}
                        onChange={(e) => setIsNewWorkFeatured(e.target.checked)}
                        className="w-4 h-4 text-primary bg-black border-white/10 rounded focus:ring-primary"
                      />
                      <label htmlFor="featured_check" className="text-xs font-mono text-white/80 cursor-pointer">
                        Mark as Featured Masterpiece (will slide in home page banner)
                      </label>
                    </div>
                  )}

                  {/* Dynamic media upload input */}
                  <div className="md:col-span-2 grid grid-cols-1 gap-6 pt-4 border-t border-white/5">
                    {newWorkUploadType === 'image' ? (
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-xs font-mono text-white/60">How many images do you want to post?</label>
                          <div className="flex gap-2">
                            {[1, 2, 3, 4].map(num => (
                              <button
                                key={num}
                                type="button"
                                onClick={() => setImageCount(num)}
                                className={`w-10 h-10 rounded-xl border text-xs font-bold font-mono flex items-center justify-center transition-all ${
                                  imageCount === num
                                    ? 'bg-primary border-primary text-black'
                                    : 'bg-black/40 border-white/10 text-white/60 hover:text-white'
                                }`}
                              >
                                {num}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-4">
                          {Array.from({ length: imageCount }).map((_, idx) => (
                            <div key={idx} className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-mono text-white/50">Google Drive Image URL {idx + 1}</label>
                              <input 
                                type="text"
                                placeholder="Paste 'Anyone with the link' Google Drive image sharing link"
                                value={newWorkImageUrls[idx] || ''}
                                onChange={(e) => {
                                  const copy = [...newWorkImageUrls];
                                  copy[idx] = e.target.value;
                                  setNewWorkImageUrls(copy);
                                }}
                                className="bg-black/40 text-white p-3 rounded-xl border border-white/10 text-xs focus:border-primary focus:outline-none w-full font-mono"
                              />
                              {newWorkImageUrls[idx] && (
                                <div className="text-[10px] font-mono text-white/40 flex items-center gap-1.5 pl-1 overflow-hidden">
                                  <span>Direct image source:</span>
                                  <span className="text-primary truncate max-w-md">{getGoogleDriveLink(newWorkImageUrls[idx], 'image')}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <label className="text-xs font-mono text-white/60">Google Drive Video URL</label>
                        <input 
                          type="text"
                          placeholder="Paste 'Anyone with the link' Google Drive video sharing link"
                          value={newWorkVideoUrl}
                          onChange={(e) => setNewWorkVideoUrl(e.target.value)}
                          className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-primary focus:outline-none w-full font-mono"
                        />
                        {newWorkVideoUrl && (
                          <div className="text-[10px] font-mono text-white/40 flex items-center gap-1.5 pl-1 overflow-hidden">
                            <span>Embedded player:</span>
                            <span className="text-primary truncate max-w-md">{getGoogleDriveLink(newWorkVideoUrl, 'video')}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <button type="submit" className="md:col-span-2 bg-primary text-black py-4 rounded-xl font-bold font-mono text-xs uppercase tracking-widest hover:opacity-90 mt-4 transition-all">
                    Publish Release
                  </button>
                </form>
              </div>
            )}

          </div>
        )}

        {/* VIEW 3: SEARCHABLE GALLERY VIEW */}
        {activeTab === 'gallery' && (
          <div className="px-4 md:px-16 max-w-7xl mx-auto py-12">
            
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
              <div>
                <span className="font-mono text-xs text-primary uppercase tracking-widest block mb-2">LIVE DIRECTORY</span>
                <h1 className="text-4xl md:text-5xl font-black text-white">Creative Works Catalog</h1>
                <p className="text-white/60 text-sm max-w-md mt-2">
                  Searching by title, tag, software, or category. Optimized dynamically in the local browser buffer.
                </p>
              </div>

              {/* Dynamic Categories Creator (Admin Only) */}
              {isAdminLoggedIn && (
                <div className="bg-[#0c101b] border border-white/10 p-4 rounded-2xl flex flex-col gap-3 max-w-md">
                  <div className="flex gap-2 items-center">
                    <input 
                      type="text" 
                      placeholder="New category name" 
                      value={newCatVal} 
                      onChange={(e) => setNewCatVal(e.target.value)} 
                      className="bg-black/40 text-xs text-white px-3 py-1.5 rounded-lg border border-white/10 focus:outline-none w-full" 
                    />
                    <button onClick={handleAddCategory} className="bg-primary text-black text-xs font-bold px-3 py-1.5 rounded-lg shrink-0">
                      Add Cat
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className="text-[10px] font-mono text-white/40 uppercase block w-full">Current Categories (Click × to delete):</span>
                    {categories.map((c, cIdx) => (
                      <span key={`${c}-${cIdx}`} className="inline-flex items-center gap-1.5 px-2 py-1 bg-white/5 border border-white/10 rounded-md text-[10px] font-mono text-white">
                        {c}
                        {c !== 'All' && (
                          <button
                            type="button"
                            onClick={() => triggerDelete(c, 'category')}
                            className="text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded px-0.5"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
                <div className="relative w-full md:w-80">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40 w-4 h-4" />
                  <input 
                    type="text"
                    placeholder="Search masterpieces..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-xs text-white focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setIsOldestFirst(prev => {
                      const nextVal = !prev;
                      triggerNotification(nextVal ? "Oldest First Mode On" : "Newest First Mode On");
                      return nextVal;
                    });
                  }}
                  className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border font-mono text-xs font-bold transition-all whitespace-nowrap active:scale-95 ${
                    isOldestFirst 
                      ? 'bg-primary/20 border-primary/40 text-primary hover:bg-primary/30' 
                      : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                  }`}
                  title={isOldestFirst ? "Currently sorting Oldest First" : "Currently sorting Newest First"}
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>{isOldestFirst ? "OLDEST FIRST" : "NEWEST FIRST"}</span>
                </button>
              </div>
            </div>

            {/* Dynamic Filter bar */}
            <div className="flex items-center gap-2 overflow-x-auto pb-4 mb-8 custom-scrollbar scrollbar-none no-scrollbar">
              {categories.map((cat, cIdx) => (
                <div key={`${cat}-${cIdx}`} className="relative group/cat flex-shrink-0">
                  <button
                    onClick={() => setActiveFilter(cat)}
                    className={`px-5 py-2.5 rounded-full text-xs font-mono uppercase tracking-wider transition-all ${
                      activeFilter.toLowerCase() === cat.toLowerCase()
                        ? 'bg-primary text-black font-bold'
                        : 'bg-white/5 border border-white/5 text-white/60 hover:text-white hover:bg-white/10'
                    } ${isAdminLoggedIn && cat !== 'All' ? 'pr-9' : ''}`}
                  >
                    {cat}
                  </button>
                  {isAdminLoggedIn && cat !== 'All' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerDelete(cat, 'category');
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-full transition-all"
                      title={`Delete category "${cat}"`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {filteredProjects.length === 0 ? (
              <div className="text-center py-20 border border-white/5 rounded-3xl bg-white/[0.01]">
                <Layers className="w-12 h-12 text-white/20 mx-auto mb-4 animate-bounce" />
                <h3 className="text-lg font-bold text-white font-mono">No matching releases found</h3>
                <p className="text-white/50 text-xs mt-1">Try another tag or search word like "Maya", "Figma", "Rig" or change categories filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {filteredProjects.map((p) => (
                  <div 
                    key={p.id}
                    onClick={() => setSelectedProject(p)}
                    className="group bg-white/[0.01] border border-white/5 rounded-2xl overflow-hidden hover:border-white/15 transition-all duration-300 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="h-56 relative overflow-hidden">
                        <img 
                          src={p.image} 
                          alt={p.title} 
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomImage(p.image);
                          }}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 cursor-zoom-in" 
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        {p.videoUrl && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors pointer-events-none">
                            <div className="p-3.5 bg-black/60 border border-white/10 rounded-full text-primary hover:scale-110 transition-transform shadow-lg backdrop-blur-md">
                              <Play className="w-5 h-5 fill-primary" />
                            </div>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>
                        <span className="absolute bottom-4 left-4 text-[10px] font-mono tracking-widest bg-black/60 border border-white/10 px-2.5 py-1 rounded-md text-primary z-10">
                          {p.category.toUpperCase()}
                        </span>
                      </div>
                      <div className="p-5">
                        <span className="text-[10px] font-mono text-white/40 uppercase block mb-1">
                          {p.subtitle?.replace('Practice Video', 'Video').replace('Practice Work', 'Work').replace('Practice ', '') || 'Work'}
                        </span>
                        <h4 className="text-lg font-bold text-white group-hover:text-primary transition-colors">{p.title}</h4>
                        <p className="text-white/60 text-xs mt-2 line-clamp-2">{p.description}</p>
                      </div>
                    </div>
                    
                    <div className="px-5 pb-5 pt-4 border-t border-white/5 flex items-center justify-between">
                      <div className="flex flex-wrap gap-1">
                        {p.software.slice(0, 2).map((soft, sIdx) => (
                          <span key={`${soft}-${sIdx}`} className="text-[9px] font-mono bg-white/5 text-white/60 px-1.5 py-0.5 rounded">
                            {soft}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        {isAdminLoggedIn && (
                          <button 
                            type="button"
                            onClick={(e) => { e.stopPropagation(); triggerDelete(p.id, 'project'); }}
                            className="p-1.5 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                            title="Delete practice work"
                          >
                            <Trash className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button 
                          onClick={(e) => handleLikeProject(p.id, e)}
                          className="flex items-center gap-1.5 text-xs font-mono text-white/40 hover:text-rose-500 transition-all"
                        >
                          <Heart className="w-3.5 h-3.5" />
                          <span>{p.likes}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {isAdminLoggedIn && (
              <div className="mt-16 bg-[#0c101b] border border-secondary/20 p-8 rounded-3xl">
                <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2 font-mono">
                  <Video className="w-5 h-5 text-secondary" /> Publish a YouTube Video (Admin Rigs)
                </h2>
                
                <form onSubmit={handleCreateYoutubeWork} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-2 md:col-span-2">
                    <label className="text-xs font-mono text-white/60">YouTube Video Link</label>
                    <input 
                      type="text" 
                      placeholder="Paste your YouTube video link here (e.g. https://youtu.be/yspv06M4CF8)" 
                      value={ytVideoUrl} 
                      onChange={(e) => setYtVideoUrl(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-secondary focus:outline-none w-full font-mono" 
                    />
                    {ytVideoUrl && getYoutubeId(ytVideoUrl) && (
                      <div className="text-[10px] font-mono text-white/40 flex items-center gap-1.5 pl-1 overflow-hidden">
                        <span>Direct thumbnail preview:</span>
                        <span className="text-secondary truncate max-w-md">https://img.youtube.com/vi/{getYoutubeId(ytVideoUrl)}/maxresdefault.jpg</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono text-white/60">Video Title</label>
                    <input 
                      type="text" 
                      placeholder="e.g. POTHIK App Concept Introduction" 
                      value={ytVideoTitle} 
                      onChange={(e) => setYtVideoTitle(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-secondary focus:outline-none" 
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono text-white/60">Category (type manually)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. UI/UX, Travel app, 3D Design" 
                      value={ytVideoCategory} 
                      onChange={(e) => setYtVideoCategory(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-secondary focus:outline-none" 
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono text-white/60">Armory / Software Used (Comma separated)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Figma, Maya, After Effects" 
                      value={ytVideoArmory} 
                      onChange={(e) => setYtVideoArmory(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-secondary focus:outline-none font-mono" 
                    />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-mono text-white/60">Deliverables (One per line)</label>
                    <textarea 
                      placeholder="e.g.&#10;New concept&#10;Travel app" 
                      value={ytVideoDeliverables} 
                      onChange={(e) => setYtVideoDeliverables(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-secondary focus:outline-none h-20" 
                    />
                  </div>

                  <div className="md:col-span-2 flex flex-col gap-2">
                    <label className="text-xs font-mono text-white/60">Description Box</label>
                    <textarea 
                      placeholder="Explain the technical precision, design thinking, UX flows, and outcomes..." 
                      value={ytVideoDesc} 
                      onChange={(e) => setYtVideoDesc(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-secondary focus:outline-none h-32" 
                    />
                  </div>

                  <button type="submit" className="md:col-span-2 bg-secondary text-black py-4 rounded-xl font-bold font-mono text-xs uppercase tracking-widest hover:opacity-90 mt-4 transition-all">
                    Publish YouTube Video
                  </button>
                </form>
              </div>
            )}

          </div>
        )}

        {/* VIEW 4: ABOUT PAGE */}
        {activeTab === 'about' && (
          <div className="px-4 md:px-16 max-w-7xl mx-auto py-12">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
              
              {/* Left Column: Sahl Bio */}
              <div className="lg:col-span-5 flex flex-col gap-8">
                <div>
                  {/* Editable About Subtitle */}
                  <div className="relative group/edit inline-block mb-2">
                    <span className="font-mono text-xs text-primary uppercase tracking-[0.2em] font-semibold block">
                      {sectionTexts.aboutSubtitle || "YOU'RE HERE? TO KNOW"}
                    </span>
                    {isAdminLoggedIn && (
                      <button 
                        onClick={() => startEditing('aboutSubtitle', sectionTexts.aboutSubtitle || "YOU'RE HERE? TO KNOW")}
                        className="absolute -right-8 top-1/2 -translate-y-1/2 p-1 bg-primary/20 text-primary rounded-full hover:bg-primary hover:text-black transition-all"
                      >
                        <Edit className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {editingField === 'aboutSubtitle' && (
                    <div className="flex gap-2 mb-4 bg-[#0d121f] p-3 rounded-xl border border-white/10 max-w-sm">
                      <input 
                        type="text" 
                        value={tempText} 
                        onChange={(e) => setTempText(e.target.value)} 
                        className="bg-black/40 text-white p-2 rounded w-full border border-white/10 text-xs font-mono uppercase" 
                      />
                      <button 
                        onClick={() => saveEditedText('aboutSubtitle')} 
                        className="bg-primary text-black px-3 py-1 rounded text-xs font-bold"
                      >
                        Save
                      </button>
                      <button 
                        onClick={() => setEditingField(null)} 
                        className="bg-white/10 text-white px-3 py-1 rounded text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  
                  {/* Editable About Title */}
                  <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-6 tracking-tight relative group/edit">
                    {sectionTexts.aboutTitle}
                    {isAdminLoggedIn && (
                      <button 
                        onClick={() => startEditing('aboutTitle', sectionTexts.aboutTitle)}
                        className="absolute -right-10 top-1/2 -translate-y-1/2 p-2 bg-primary/20 text-primary rounded-full hover:bg-primary hover:text-black transition-all"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                  </h1>

                  {editingField === 'aboutTitle' && (
                    <div className="flex gap-2 mb-4 bg-[#0d121f] p-3 rounded-xl border border-white/10">
                      <input 
                        type="text" 
                        value={tempText} 
                        onChange={(e) => setTempText(e.target.value)} 
                        className="bg-black/40 text-white p-2 rounded w-full border border-white/10" 
                      />
                      <button onClick={() => saveEditedText('aboutTitle')} className="bg-primary text-black px-4 rounded font-bold"><Save className="w-4 h-4" /></button>
                    </div>
                  )}

                  {/* Editable About description */}
                  <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl relative group/edit mb-6">
                    <p className="text-white/70 text-sm sm:text-base leading-relaxed mb-4">
                      {sectionTexts.aboutDescription}
                    </p>
                    {isAdminLoggedIn && (
                      <button 
                        onClick={() => startEditing('aboutDescription', sectionTexts.aboutDescription)}
                        className="absolute right-2 top-2 p-2 bg-primary/20 text-primary rounded-full hover:bg-primary hover:text-black transition-all"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {editingField === 'aboutDescription' && (
                    <div className="flex flex-col gap-2 mb-4 bg-[#0d121f] p-3 rounded-xl border border-white/10">
                      <textarea 
                        value={tempText} 
                        onChange={(e) => setTempText(e.target.value)} 
                        className="bg-black/40 text-white p-2 rounded w-full h-24 border border-white/10" 
                      />
                      <button onClick={() => saveEditedText('aboutDescription')} className="bg-primary text-black py-2 rounded font-bold">Save Changes</button>
                    </div>
                  )}

                  {/* Editable About Quote */}
                  <div className="relative group/edit">
                    <blockquote className="border-l-4 border-primary pl-4 italic text-sm text-white font-semibold my-4">
                      "{sectionTexts.aboutQuote}"
                    </blockquote>
                    {isAdminLoggedIn && (
                      <button 
                        onClick={() => startEditing('aboutQuote', sectionTexts.aboutQuote)}
                        className="absolute right-0 top-0 p-2 bg-primary/20 text-primary rounded-full hover:bg-primary hover:text-black transition-all"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {editingField === 'aboutQuote' && (
                    <div className="flex flex-col gap-2 mb-4 bg-[#0d121f] p-3 rounded-xl border border-white/10">
                      <textarea 
                        value={tempText} 
                        onChange={(e) => setTempText(e.target.value)} 
                        className="bg-black/40 text-white p-2 rounded w-full h-20 border border-white/10" 
                      />
                      <button onClick={() => saveEditedText('aboutQuote')} className="bg-primary text-black py-2 rounded font-bold">Save Quote</button>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-4 bg-white/[0.01] border border-white/5 p-6 rounded-3xl relative">
                  {editingField === 'aboutCoordinates' ? (
                    <form onSubmit={handleSaveCoordinates} className="flex flex-col gap-3">
                      <h3 className="text-xs font-mono text-primary uppercase">Edit Coordinates Form</h3>
                      <div>
                        <label className="text-[9px] font-mono text-white/50 block mb-1">Section Title</label>
                        <input 
                          type="text" 
                          value={editBaseCoordinatesTitle} 
                          onChange={(e) => setEditBaseCoordinatesTitle(e.target.value)} 
                          className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-mono text-white/50 block mb-1">Location Label</label>
                          <input 
                            type="text" 
                            value={editAboutLocationLabel} 
                            onChange={(e) => setEditAboutLocationLabel(e.target.value)} 
                            className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-mono text-white/50 block mb-1">Location Value</label>
                          <input 
                            type="text" 
                            value={editAboutLocationValue} 
                            onChange={(e) => setEditAboutLocationValue(e.target.value)} 
                            className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[9px] font-mono text-white/50 block mb-1">Tongues Label</label>
                          <input 
                            type="text" 
                            value={editAboutTonguesLabel} 
                            onChange={(e) => setEditAboutTonguesLabel(e.target.value)} 
                            className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-mono text-white/50 block mb-1">Tongues Value</label>
                          <input 
                            type="text" 
                            value={editAboutTonguesValue} 
                            onChange={(e) => setEditAboutTonguesValue(e.target.value)} 
                            className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end mt-2">
                        <button type="button" onClick={() => setEditingField(null)} className="bg-white/5 text-white text-xs px-3 py-1 rounded">Cancel</button>
                        <button type="submit" className="bg-primary text-black text-xs font-bold px-4 py-1 rounded">Save Coordinates</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <h3 className={`about-base-coordinates-heading text-sm font-mono uppercase tracking-wider mb-2 ${
                        isDarkMode 
                          ? 'text-secondary' 
                          : 'text-[#007bc2]'
                      }`}>
                        {sectionTexts.baseCoordinatesTitle || 'Base coordinates'}
                      </h3>
                      <div className="flex items-center gap-4 text-xs text-white/80">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase">{sectionTexts.aboutLocationLabel || 'Location'}</p>
                          <p className="font-bold text-white">{sectionTexts.aboutLocationValue || 'Paris / Dubai / Remote'}</p>
                        </div>
                        <div className="w-px h-8 bg-white/10"></div>
                        <div>
                          <p className="text-[10px] text-white/40 uppercase">{sectionTexts.aboutTonguesLabel || 'Tongues'}</p>
                          <p className="font-bold text-white">{sectionTexts.aboutTonguesValue || 'English, French, Arabic'}</p>
                        </div>
                      </div>

                      {isAdminLoggedIn && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditBaseCoordinatesTitle(sectionTexts.baseCoordinatesTitle || "Base coordinates");
                            setEditAboutLocationLabel(sectionTexts.aboutLocationLabel || "Location");
                            setEditAboutLocationValue(sectionTexts.aboutLocationValue || "Dhaka, Bangladesh");
                            setEditAboutTonguesLabel(sectionTexts.aboutTonguesLabel || "Tongues");
                            setEditAboutTonguesValue(sectionTexts.aboutTonguesValue || "Bangla, English, Hindi, Urdu");
                            setEditingField('aboutCoordinates');
                          }}
                          className="absolute right-3 top-3 p-1.5 bg-primary/20 text-primary rounded-full hover:bg-primary hover:text-black transition-all"
                          title="Edit coordinates & tongues"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>

                <Suspense fallback={<div className="h-48 flex items-center justify-center text-white/40">Loading professional experience timeline...</div>}>
                  <ExperienceTimeline
                    experiences={experienceList}
                    isAdminLoggedIn={isAdminLoggedIn}
                    isDarkMode={isDarkMode}
                    onSave={handleSaveExperience}
                    onDelete={(id) => triggerDelete(id, 'experience')}
                    onDuplicate={handleDuplicateExperience}
                    onReorder={handleReorderExperiences}
                  />
                </Suspense>
              </div>

              {/* Right Column: Education & Skills (Replacing old milestones) */}
              <div className="lg:col-span-7 flex flex-col gap-8">
                <div className="relative group/cred">
                  {editingField === 'credentialStationHeaders' ? (
                    <form onSubmit={handleSaveCredentialStationHeaders} className="flex flex-col gap-2 bg-white/[0.02] border border-white/5 p-4 rounded-2xl mb-4">
                      <h3 className="text-xs font-mono text-primary uppercase">Edit Section Header</h3>
                      <div className="grid grid-cols-1 gap-2">
                        <input 
                          type="text" 
                          placeholder="Section Overtitle (e.g. CREDENTIAL STATION)" 
                          value={editCredentialStationTitle} 
                          onChange={(e) => setEditCredentialStationTitle(e.target.value)} 
                          className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full" 
                        />
                        <input 
                          type="text" 
                          placeholder="Section Title (e.g. Education & Software Armory)" 
                          value={editCredentialStationSubtitle} 
                          onChange={(e) => setEditCredentialStationSubtitle(e.target.value)} 
                          className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full font-bold" 
                        />
                      </div>
                      <div className="flex gap-2 justify-end mt-2">
                        <button type="button" onClick={() => setEditingField(null)} className="text-xs text-white/50 hover:text-white">Cancel</button>
                        <button type="submit" className="bg-primary text-black text-xs font-bold px-4 py-1.5 rounded">Save Headers</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <span className="font-mono text-xs text-secondary uppercase tracking-widest block mb-2">
                        {sectionTexts.credentialStationTitle || 'CREDENTIAL STATION'}
                      </span>
                      <h2 className="text-3xl font-bold text-white mb-6">
                        {sectionTexts.credentialStationSubtitle || 'Education & Software Armory'}
                      </h2>

                      {isAdminLoggedIn && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditCredentialStationTitle(sectionTexts.credentialStationTitle || "CREDENTIAL STATION");
                            setEditCredentialStationSubtitle(sectionTexts.credentialStationSubtitle || "Education & Software Armory");
                            setEditingField('credentialStationHeaders');
                          }}
                          className="absolute right-0 top-0 p-1.5 bg-primary/20 text-primary rounded-full hover:bg-primary hover:text-black transition-all"
                          title="Edit credential section headers"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                  
                  <div id="credential-section" className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white/[0.01] border border-white/5 p-6 rounded-3xl">
                    
                    {/* Education Sub-section */}
                    <div>
                      <h3 className={`about-edu-heading text-sm font-mono uppercase mb-4 tracking-widest border-b pb-2 ${
                        isDarkMode 
                          ? 'text-primary border-white/5' 
                          : 'text-[#3b28cc] border-slate-200'
                      }`}>Education Status</h3>
                      <div className="flex flex-col gap-6">
                        {educationList.map((edu) => (
                          <div key={edu.id} className="relative group/edu">
                            <h4 className="text-sm font-bold text-white">{edu.institution}</h4>
                            <p className="text-xs text-white/60 mt-1">{edu.department}</p>
                            
                            {isAdminLoggedIn && (
                              <button 
                                type="button"
                                onClick={() => triggerDelete(edu.id, 'education')}
                                className="absolute right-0 top-0 p-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover/edu:opacity-100"
                                title="Delete education item"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {isAdminLoggedIn && (
                        <div className="mt-6 pt-4 border-t border-white/5 flex flex-col gap-2">
                          <input 
                            type="text" 
                            placeholder="Institution Name" 
                            value={newEduInst} 
                            onChange={(e) => setNewEduInst(e.target.value)} 
                            className="bg-black/40 text-xs text-white p-2 rounded border border-white/10" 
                          />
                          <input 
                            type="text" 
                            placeholder="Department / Subject" 
                            value={newEduDept} 
                            onChange={(e) => setNewEduDept(e.target.value)} 
                            className="bg-black/40 text-xs text-white p-2 rounded border border-white/10" 
                          />
                          <button onClick={handleAddEducation} className="bg-primary/20 text-primary border border-primary/20 py-1.5 rounded text-xs font-bold">
                            + Add Education
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Software Skills & Automatic Month Increment */}
                    <div>
                      <h3 className={`about-skills-heading text-sm font-mono uppercase mb-4 tracking-widest border-b pb-2 ${
                        isDarkMode 
                          ? 'text-secondary border-white/5' 
                          : 'text-[#007bc2] border-slate-200'
                      }`}>Software Skills</h3>
                      <div className="flex flex-col gap-4">
                        {skillItems.map((skill, sIdx) => (
                          <div key={sIdx} className="flex items-center justify-between relative group/skill py-1">
                            <div>
                              <p className="text-xs font-bold text-white">{skill.name}</p>
                              <p className="text-[10px] text-white/40 italic mt-0.5">{skill.comment}</p>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-mono text-primary font-bold">
                                {calculateMonths(skill.experienceStartedDate)} Months Exp
                              </span>
                            </div>

                            {isAdminLoggedIn && (
                              <button 
                                type="button"
                                onClick={() => triggerDelete(skill.name, 'skill')}
                                className="absolute -right-2 top-1/2 -translate-y-1/2 p-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500 hover:text-white transition-all opacity-0 group-hover/skill:opacity-100"
                                title="Delete skill"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Admin add skill */}
                      {isAdminLoggedIn && (
                        <div className="mt-6 pt-4 border-t border-white/5 flex flex-col gap-2">
                          <input 
                            type="text" 
                            placeholder="Software Name" 
                            value={newSkillName} 
                            onChange={(e) => setNewSkillName(e.target.value)} 
                            className="bg-black/40 text-xs text-white p-2 rounded border border-white/10" 
                          />
                          <input 
                            type="number" 
                            placeholder="Current Experience Months" 
                            value={newSkillMonths} 
                            onChange={(e) => setNewSkillMonths(parseInt(e.target.value, 10) || 1)} 
                            className="bg-black/40 text-xs text-white p-2 rounded border border-white/10" 
                          />
                          <button onClick={handleAddSkill} className="bg-secondary/20 text-secondary border border-secondary/20 py-1.5 rounded text-xs font-bold">
                            + Add Software Skill
                          </button>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Niche Click-to-WhatsApp Button */}
                  <div className="mt-6 flex justify-center">
                    <a 
                      href="https://wa.me/8801949380524?text=Hi"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-primary/10 border border-primary/20 text-primary px-8 py-3.5 rounded-xl font-bold font-mono text-xs uppercase tracking-widest hover:bg-primary hover:text-black transition-all flex items-center gap-2"
                    >
                      <Phone className="w-4 h-4" /> Direct Whatsapp Inquiry
                    </a>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* VIEW 5: CONTACT & GET IN TOUCH */}
        {activeTab === 'contact' && (
          <div id="contact-section" className="px-4 md:px-16 max-w-7xl mx-auto py-12">
            
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
              
              {/* Left Side: Contact details */}
              <div className="lg:col-span-5 flex flex-col gap-8">
                <div className="relative group/coord">
                  {editingField === 'studioCoordinatesHeaders' ? (
                    <form onSubmit={handleSaveStudioCoordinatesHeaders} className="flex flex-col gap-2 bg-[#0d121f] p-4 rounded-xl border border-white/10 mb-4">
                      <h3 className="text-xs font-mono text-primary uppercase">Edit Contact Headers</h3>
                      <input 
                        type="text" 
                        value={editStudioCoordinatesTitle} 
                        onChange={(e) => setEditStudioCoordinatesTitle(e.target.value)} 
                        className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full"
                        placeholder="Overtitle"
                      />
                      <input 
                        type="text" 
                        value={editStudioCoordinatesSubtitle} 
                        onChange={(e) => setEditStudioCoordinatesSubtitle(e.target.value)} 
                        className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full font-bold"
                        placeholder="Title"
                      />
                      <textarea 
                        value={editStudioCoordinatesDescription} 
                        onChange={(e) => setEditStudioCoordinatesDescription(e.target.value)} 
                        className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full h-20"
                        placeholder="Description"
                      />
                      <div className="flex gap-2 justify-end mt-1">
                        <button type="button" onClick={() => setEditingField(null)} className="text-xs text-white/50 hover:text-white">Cancel</button>
                        <button type="submit" className="bg-primary text-black text-xs font-bold px-4 py-1 rounded">Save Headers</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <span className="font-mono text-xs text-primary uppercase tracking-widest block mb-2">
                        {sectionTexts.studioCoordinatesTitle || 'STUDIO COORDINATES'}
                      </span>
                      <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-6">
                        {sectionTexts.studioCoordinatesSubtitle || 'Initialize Communication'}
                      </h1>
                      <p className="text-white/70 text-sm leading-relaxed mb-6">
                        {sectionTexts.studioCoordinatesDescription || "Looking to develop spatial 3D art, high-fidelity UI systems, or customized visual components? Let's initialize connection immediately."}
                      </p>

                      {isAdminLoggedIn && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditStudioCoordinatesTitle(sectionTexts.studioCoordinatesTitle || "STUDIO COORDINATES");
                            setEditStudioCoordinatesSubtitle(sectionTexts.studioCoordinatesSubtitle || "Initialize Communication");
                            setEditStudioCoordinatesDescription(sectionTexts.studioCoordinatesDescription || "");
                            setEditingField('studioCoordinatesHeaders');
                          }}
                          className="absolute right-0 top-0 p-1.5 bg-primary/20 text-primary rounded-full hover:bg-primary hover:text-black transition-all"
                          title="Edit contact section text"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Editable delay & preferred channel metadata */}
                <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl flex flex-col gap-4 relative group/edit">
                  {isAdminLoggedIn && (
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button 
                        onClick={() => startEditing('contactsMeta.averageResponseDelay', sectionTexts.contactsMeta.averageResponseDelay)}
                        className="p-1.5 bg-primary/20 text-primary rounded-full hover:bg-primary hover:text-black transition-all"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  <div>
                    <span className="text-[10px] font-mono text-primary uppercase tracking-widest block mb-1">Response Speed</span>
                    <p className="text-sm font-bold text-white">{sectionTexts.contactsMeta.averageResponseDelay}</p>
                  </div>
                  <div className="h-px bg-white/5"></div>
                  <div>
                    <span className="text-[10px] font-mono text-secondary uppercase tracking-widest block mb-1">Preferred Channel</span>
                    <p className="text-sm font-bold text-white">{sectionTexts.contactsMeta.preferredChannel}</p>
                  </div>
                </div>

                {editingField === 'contactsMeta.averageResponseDelay' && (
                  <div className="flex flex-col gap-2 bg-[#0d121f] p-3 rounded-xl border border-white/10">
                    <input 
                      type="text" 
                      value={tempText} 
                      onChange={(e) => setTempText(e.target.value)} 
                      className="bg-black/40 text-xs text-white p-2 rounded border border-white/10" 
                      placeholder="Average Delay Text"
                    />
                    <button onClick={() => saveEditedText('contactsMeta.averageResponseDelay')} className="bg-primary text-black py-1.5 rounded font-bold text-xs">Save</button>
                  </div>
                )}

                {/* Dynamic Social Links Change / Customize section */}
                <div className="bg-white/[0.01] border border-white/5 p-6 rounded-3xl">
                  <h3 className={`contact-socials-heading text-xs font-mono uppercase tracking-widest mb-4 ${
                    isDarkMode 
                      ? 'text-secondary' 
                      : 'text-[#007bc2]'
                  }`}>Direct Secure Connections</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {socialLinks.map((social) => (
                      <div key={social.id} className="relative group/social bg-white/[0.02] border border-white/5 p-3 rounded-xl flex items-center justify-between">
                        {editingSocialId === social.id ? (
                          <form onSubmit={handleSaveSocialEdit} className="flex flex-col gap-2 w-full">
                            <input 
                              type="text" 
                              value={tempSocialName} 
                              onChange={(e) => setTempSocialName(e.target.value)} 
                              className="bg-black/60 text-xs text-white p-1 rounded border border-white/10 w-full" 
                              placeholder="Platform"
                            />
                            <input 
                              type="text" 
                              value={tempSocialUrl} 
                              onChange={(e) => setTempSocialUrl(e.target.value)} 
                              className="bg-black/60 text-xs text-white p-1 rounded border border-white/10 w-full" 
                              placeholder="Profile URL"
                            />
                            <div className="flex gap-2 justify-end mt-1">
                              <button type="button" onClick={() => setEditingSocialId(null)} className="text-[10px] text-white/50">Cancel</button>
                              <button type="submit" className="bg-primary text-black text-[10px] px-2 py-0.5 rounded font-bold">Save</button>
                            </div>
                          </form>
                        ) : (
                          <>
                            <div className="overflow-hidden mr-2">
                              <p className="text-[10px] text-white/40 font-mono">Platform</p>
                              <a href={social.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary hover:underline flex items-center gap-1 truncate max-w-full">
                                {social.name} <ExternalLink className="w-3 h-3 flex-shrink-0" />
                              </a>
                            </div>

                            {isAdminLoggedIn && (
                              <div className="flex gap-1 shrink-0">
                                <button 
                                  type="button"
                                  onClick={() => {
                                    setTempSocialName(social.name);
                                    setTempSocialUrl(social.url);
                                    setEditingSocialId(social.id);
                                  }}
                                  className="p-1 bg-primary/20 text-primary rounded hover:bg-primary hover:text-black transition-all"
                                  title="Edit link"
                                >
                                  <Edit className="w-3 h-3" />
                                </button>
                                <button 
                                  type="button"
                                  onClick={() => triggerDelete(social.id, 'social')}
                                  className="p-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500 hover:text-white transition-all"
                                  title="Delete link"
                                >
                                  <Trash className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  {isAdminLoggedIn && (
                    <div className="mt-4 pt-4 border-t border-white/5">
                      {showAddSocialForm ? (
                        <div className="flex flex-col gap-2.5 bg-black/40 border border-white/10 p-4 rounded-xl">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider">Platform Name</label>
                            <input 
                              type="text"
                              value={newSocialName}
                              onChange={(e) => setNewSocialName(e.target.value)}
                              placeholder="e.g., GitHub, LinkedIn, Facebook"
                              className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full focus:outline-none focus:border-primary"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-mono text-white/50 uppercase tracking-wider">Profile URL Link</label>
                            <input 
                              type="text"
                              value={newSocialUrl}
                              onChange={(e) => setNewSocialUrl(e.target.value)}
                              placeholder="https://..."
                              className="bg-black/60 text-xs text-white p-2 rounded border border-white/10 w-full focus:outline-none focus:border-primary"
                            />
                          </div>
                          <div className="flex gap-2 justify-end mt-1">
                            <button 
                              type="button" 
                              onClick={() => {
                                setShowAddSocialForm(false);
                                setNewSocialName('');
                                setNewSocialUrl('');
                              }} 
                              className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-lg transition-all"
                            >
                              Cancel
                            </button>
                            <button 
                              type="button"
                              onClick={async () => {
                                if (newSocialName.trim() && newSocialUrl.trim()) {
                                  const newSocial: SocialLink = { id: `social-${Date.now()}`, name: newSocialName.trim(), url: newSocialUrl.trim() };
                                  setSocialLinks(prev => [...prev, newSocial]);
                                  triggerNotification('Added social connection successfully.');
                                  await dbSaveSocial(newSocial);
                                  setShowAddSocialForm(false);
                                  setNewSocialName('');
                                  setNewSocialUrl('');
                                } else {
                                  triggerNotification('Please fill in both fields.');
                                }
                              }}
                              className="bg-primary text-black text-[10px] font-mono uppercase tracking-wider px-3 py-1.5 rounded-lg font-bold transition-all hover:opacity-90"
                            >
                              Add Link
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowAddSocialForm(true)}
                          className="w-full bg-primary/20 hover:bg-primary text-primary hover:text-black border border-primary/20 text-[10px] font-mono uppercase tracking-wider py-2 rounded-xl font-bold transition-all"
                        >
                          + Add Custom Social Link
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Side: Get In Touch client form (Redirects to WhatsApp securely) */}
              <div className="lg:col-span-7 bg-[#0c101b] border border-white/5 p-8 rounded-3xl">
                <h2 className="text-xl font-bold text-white mb-2">Get in Touch</h2>
                <p className="text-white/60 text-xs mb-6">Enforcing real WhatsApp handshaking direct to Sahl's secure physical line.</p>
                
                <form onSubmit={handleGetInTouchSubmit} className="flex flex-col gap-5">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Your Name *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="Elena Rostova" 
                      value={contactName} 
                      onChange={(e) => setContactName(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20" 
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Email Address *</label>
                    <input 
                      type="email" 
                      required
                      placeholder="elena@aurallabs.io" 
                      value={contactEmail} 
                      onChange={(e) => setContactEmail(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20" 
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Do you want to hire me for a project? *</label>
                    <select 
                      value={contactHire} 
                      onChange={(e) => setContactHire(e.target.value as any)}
                      className="bg-[#07090e] text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-primary focus:outline-none"
                    >
                      <option value="Yes">Yes, absolutely</option>
                      <option value="No">No, just saying hi</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest">Description *</label>
                    <textarea 
                      required
                      placeholder="Looking to develop a spatial 3D dashboard with fluid normal-map reflections..." 
                      value={contactDescription} 
                      onChange={(e) => setContactDescription(e.target.value)} 
                      className="bg-black/40 text-white p-3.5 rounded-xl border border-white/10 text-sm focus:border-primary focus:outline-none h-28" 
                    />
                  </div>

                  <button type="submit" className="bg-primary text-black py-4 rounded-xl font-bold font-mono text-xs uppercase tracking-widest hover:opacity-90 flex items-center justify-center transition-all">
                    Send
                  </button>
                </form>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* Admin Panel Google Sign-In Modal */}
      <AnimatePresence>
        {isAdminModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[#0c101b] border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl relative text-center"
            >
              <button 
                onClick={() => setIsAdminModalOpen(false)}
                className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 border border-primary/20">
                <Database className="w-6 h-6 text-primary" />
              </div>

              <h2 className="text-xl font-bold text-white mb-2 font-mono tracking-tight">
                Admin Security Terminal
              </h2>
              <p className="text-white/60 text-xs mb-6 max-w-sm mx-auto">
                Access to the administration portal is strictly restricted to verified security keys. Sign in with Google to authenticate your identity.
              </p>

              <button 
                onClick={handleAdminGoogleLogin}
                className="w-full bg-white text-black py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-white/90 transition-all flex items-center justify-center gap-3 shadow-lg active:scale-[0.98]"
              >
                {/* Standard Google SVG Icon */}
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.578-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.227-3.111C18.181 1.451 15.42 0 12.24 0 5.58 0 0 5.37 0 12s5.58 12 12.24 12c6.96 0 11.57-4.89 11.57-11.79 0-.795-.085-1.4-.195-1.925H12.24z"/>
                </svg>
                <span>Continue with Google</span>
              </button>

              <p className="text-[10px] text-white/30 font-mono mt-6 uppercase tracking-widest">
                Protected by Sahl Ahmed Studio
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Masterpiece Inspector / Details Lightbox */}
      <AnimatePresence>
        {selectedProject && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 backdrop-blur-lg z-[9999] flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-[#0c101b] border border-white/10 rounded-3xl w-full max-w-4xl p-6 sm:p-10 shadow-2xl relative my-8"
            >
              <button 
                onClick={() => setSelectedProject(null)}
                className="absolute top-6 right-6 p-2 bg-white/5 hover:bg-white/10 text-white rounded-full transition-all"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* Showcase */}
                <div className="lg:col-span-7 flex flex-col gap-4">
                  <div className={selectedProject.videoUrl ? "relative w-full overflow-hidden" : "rounded-2xl overflow-hidden border border-white/5 relative"}>
                    {selectedProject.videoUrl ? (
                      <CustomVideoPlayer src={selectedProject.videoUrl} posterImage={selectedProject.image} />
                    ) : (
                      <img 
                        src={selectedProject.image} 
                        alt={selectedProject.title} 
                        className="w-full h-auto max-h-[420px] object-cover cursor-zoom-in hover:opacity-90 transition-opacity" 
                        onClick={() => setZoomImage(selectedProject.image)}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>

                  {selectedProject.images && selectedProject.images.length > 1 && (
                    <div className="grid grid-cols-3 gap-2">
                      {selectedProject.images.map((img, i) => (
                        <div key={i} className="h-20 rounded-lg overflow-hidden border border-white/5 cursor-pointer">
                          <img 
                            src={img} 
                            alt={`Thumbnail ${i + 1}`}
                            onClick={() => setZoomImage(img)}
                            className="w-full h-full object-cover hover:scale-110 transition-transform" 
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Details list */}
                <div className="lg:col-span-5">
                  <span className="text-xs font-mono text-primary uppercase tracking-widest">{selectedProject.category}</span>
                  <h2 className="text-3xl font-black text-white mt-1 mb-4 leading-tight">{selectedProject.title}</h2>
                  <p className="text-white/70 text-sm leading-relaxed mb-6">{selectedProject.fullDescription}</p>

                  <div className="flex flex-col gap-4 mb-6">
                    <div>
                      <h4 className="text-xs font-mono text-secondary uppercase mb-1">Deliverables</h4>
                      <div className="flex flex-col gap-1">
                        {selectedProject.deliverables.map((del, index) => (
                          <div key={index} className="flex items-center gap-2 text-xs text-white/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                            <span>{del}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-mono text-secondary uppercase mb-2">Armory</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedProject.software.map((sw, swIdx) => (
                          <span key={`${sw}-${swIdx}`} className="text-[10px] font-mono bg-white/5 text-white border border-white/10 px-2 py-0.5 rounded">
                            {sw}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-6 border-t border-white/5">
                    <button 
                      onClick={(e) => handleLikeProject(selectedProject.id, e)}
                      className="flex items-center gap-1.5 text-xs font-mono text-primary hover:text-rose-500 transition-colors"
                    >
                      <Heart className="w-4 h-4 fill-current" />
                      <span>{selectedProject.likes} Approvals</span>
                    </button>

                    <button 
                      onClick={() => setSelectedProject(null)}
                      className="bg-primary text-black font-bold text-xs font-mono uppercase tracking-widest px-6 py-2.5 rounded-xl hover:opacity-90"
                    >
                      Close specs
                    </button>
                  </div>
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Zoom / Lightbox Modal */}
      <AnimatePresence>
        {zoomImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/95 z-[99999] flex items-center justify-center p-4 cursor-zoom-out"
            onClick={() => setZoomImage(null)}
          >
            <div className="relative max-w-5xl max-h-[90vh]">
              <img src={zoomImage} className="w-full h-full object-contain rounded-xl border border-white/10" alt="Zoomed View" />
              <button 
                onClick={() => setZoomImage(null)}
                className="absolute -top-12 right-0 p-2.5 bg-white/10 text-white hover:text-primary rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Persistent Elegant Footer with Admin Info */}
      <footer className="bg-black py-12 border-t border-white/5 mt-20">
        <div className="max-w-7xl mx-auto px-4 md:px-16 flex flex-col gap-8 md:flex-row justify-between items-center">
          <div className="text-center md:text-left">
            <p className="text-xs text-white/40 font-mono">© 2026 Sahl Ahmed Studio. All rights reserved.</p>
            
            {/* Contact section's Direct Secure Connections */}
            <div className="mt-3 flex flex-col gap-1.5">
              <span className="text-[9px] font-mono text-white/30 uppercase tracking-wider block">Direct Secure Connections</span>
              <div className="flex flex-wrap justify-center md:justify-start gap-3">
                {socialLinks.map((social) => (
                  <a 
                    key={social.id} 
                    href={social.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[11px] font-mono text-primary/80 hover:text-primary transition-all flex items-center gap-1 hover:underline"
                  >
                    {social.name} <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-6 text-xs font-mono">
            {/* Direct WhatsApp Inquiry Button */}
            <a 
              href="https://wa.me/8801949380524?text=Hi"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary/10 hover:bg-primary border border-primary/20 hover:text-black text-primary text-[11px] font-mono font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 animate-pulse"
            >
              <Phone className="w-3.5 h-3.5" /> Direct WhatsApp Inquiry
            </a>

            <div className="flex items-center gap-3 text-white/50">
              <span>Total Views: {views}</span>
              <span>•</span>
              <button onClick={() => { setActiveTab('home'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-primary transition-colors">
                Back to Top
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {deleteConfirm?.isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-[99999] flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="bg-[#0c101b] border border-red-500/20 p-6 sm:p-8 rounded-3xl w-full max-w-sm shadow-2xl relative text-center"
            >
              <div className="w-12 h-12 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-4">
                <Trash className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2 font-mono">Delete Permanently?</h3>
              <p className="text-white/60 text-xs leading-relaxed mb-6">
                Are you sure you want to delete this {deleteConfirm.targetType}? This action cannot be undone and will permanently remove it from the viewers' sight.
              </p>
              
              <div className="grid grid-cols-2 gap-3">
                <button 
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="bg-white/5 hover:bg-white/10 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider font-mono border border-white/5 transition-all"
                >
                  No
                </button>
                <button 
                  type="button"
                  onClick={executeConfirmedDelete}
                  className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-4 rounded-xl text-xs uppercase tracking-wider font-mono transition-all shadow-lg shadow-red-500/15"
                >
                  Yes, Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Ask Sahl AI Button */}
      <AnimatePresence>
        {!isChatOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-6 right-6 z-[9998]"
          >
            <motion.button
              onClick={() => setIsChatOpen(true)}
              whileHover={{ scale: 1.1, rotate: 3 }}
              whileTap={{ scale: 0.9 }}
              animate={{
                y: [0, -6, 0],
              }}
              transition={{
                y: {
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
                scale: { duration: 0.2 },
                rotate: { duration: 0.2 }
              }}
              className="relative p-4 rounded-full bg-gradient-to-r from-primary to-secondary text-white shadow-2xl flex items-center justify-center select-none active:scale-95 group focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
              title="Ask Sahl AI"
              aria-label="Ask Sahl AI Assistant"
            >
              <span className="absolute inset-0 rounded-full border border-white/20 animate-ping opacity-25"></span>
              <Sparkles className="w-6 h-6 animate-pulse" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lazy Loaded Chatbot Component */}
      {isChatOpen && (
        <Suspense fallback={null}>
          <AskSahlAI 
            onClose={() => setIsChatOpen(false)} 
            isDarkMode={isDarkMode} 
            context={chatbotContext} 
            onOpenProject={setSelectedProject}
            onNavigateToSection={handleNavigateToSection}
          />
        </Suspense>
      )}

      {/* AI Settings Modal */}
      {isAiSettingsOpen && (
        <Suspense fallback={null}>
          <AiSettingsModal 
            isOpen={isAiSettingsOpen} 
            onClose={() => setIsAiSettingsOpen(false)} 
            portfolioContext={chatbotContext} 
          />
        </Suspense>
      )}

      {/* Privacy and Cookie Consent Banner */}
      <AnimatePresence>
        {showConsentBanner && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 left-6 right-6 md:left-auto md:max-w-md z-[9999] bg-[#0d121f]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col gap-4"
          >
            <div className="flex gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary self-start">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="flex flex-col gap-1">
                <h4 className="text-sm font-semibold text-white tracking-tight">Privacy & Analytics Consent</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  We use privacy-safe analytics (Google Analytics 4 & Microsoft Clarity) to measure user interactions and improve Sahl's portfolio experience. No personally identifiable data is captured.
                </p>
              </div>
            </div>
            <div className="flex gap-2 justify-end text-xs font-mono">
              <button
                type="button"
                onClick={() => {
                  saveConsent({
                    analytics: false,
                    clarity: false,
                    marketing: false,
                    preferences: false
                  });
                  setShowConsentBanner(false);
                  triggerNotification('Strict Privacy Active (Tracking Blocked)');
                }}
                className="px-3.5 py-2 hover:bg-white/5 border border-white/10 text-white/80 rounded-lg transition-all cursor-pointer"
              >
                Decline All
              </button>
              <button
                type="button"
                onClick={() => {
                  saveConsent({
                    analytics: true,
                    clarity: true,
                    marketing: true,
                    preferences: true
                  });
                  setShowConsentBanner(false);
                  triggerNotification('Consent Applied (Analytics Enabled)');
                }}
                className="px-3.5 py-2 bg-gradient-to-r from-primary to-secondary text-white font-semibold rounded-lg hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/10 cursor-pointer"
              >
                Accept All
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
