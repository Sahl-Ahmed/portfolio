/**
 * Centralized SEO, Analytics, and Search Engine Integration Configuration Service.
 * Acts as the single source of truth for keys, verification tokens, and integration statuses.
 * 
 * Supports:
 * - Google Search Console (Verification meta tag, HTML verification filename & content, DNS records)
 * - Bing Webmaster Tools (Verification meta tag, XML verification filename & content, DNS records)
 * - Google Analytics 4 (Measurement ID, dynamic toggle, event queues)
 * - Microsoft Clarity (Project ID, dynamic toggle)
 * - IndexNow (API Key, automated endpoint dispatcher, change log)
 * - Privacy-Aware User Consent System (Cookies / Analytics permission management)
 */

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
  clarity: boolean;
  preferences: boolean;
  timestamp: string;
}

export interface VerificationConfig {
  metaContent: string;
  htmlFileName: string;
  htmlFileContent: string;
  xmlFileName: string;
  xmlFileContent: string;
  dnsTxtRecord: string;
}

export interface IntegrationConfig {
  googleSearchConsole: VerificationConfig;
  bingWebmaster: VerificationConfig;
  googleAnalytics: {
    measurementId: string;
    isActive: boolean;
  };
  microsoftClarity: {
    projectId: string;
    isActive: boolean;
  };
  indexNow: {
    apiKey: string;
    keyLocation: string; // URL where search engines can find the key file
    isActive: boolean;
  };
}

// ---------------------------------------------------------------------------
// 1. Centralized Configuration
// ---------------------------------------------------------------------------
const viteEnv = (import.meta as any).env || {};

export const SEO_CONFIG: IntegrationConfig = {
  googleSearchConsole: {
    // PLACEHOLDER: Enter Google Search Console Verification Meta Tag content (e.g. "g-xxxxx...")
    metaContent: viteEnv.VITE_GSC_VERIFICATION_META || "",
    // PLACEHOLDER: Enter the exact Google HTML file name (e.g. "google123456789.html")
    htmlFileName: viteEnv.VITE_GSC_VERIFICATION_HTML_FILE || "google-verification-placeholder.html",
    // PLACEHOLDER: Content inside the HTML verification file
    htmlFileContent: viteEnv.VITE_GSC_VERIFICATION_HTML_CONTENT || "google-site-verification: google-verification-placeholder.html",
    xmlFileName: "",
    xmlFileContent: "",
    // PLACEHOLDER: DNS TXT verification record value (e.g. "google-site-verification=xxxxx")
    dnsTxtRecord: viteEnv.VITE_GSC_DNS_RECORD || "google-site-verification=your_dns_verification_placeholder_value"
  },
  bingWebmaster: {
    // PLACEHOLDER: Enter Bing Verification Meta Tag content
    metaContent: viteEnv.VITE_BING_VERIFICATION_META || "",
    htmlFileName: "",
    htmlFileContent: "",
    // PLACEHOLDER: Bing XML File name (normally BingSiteAuth.xml)
    xmlFileName: viteEnv.VITE_BING_VERIFICATION_XML_FILE || "BingSiteAuth.xml",
    // PLACEHOLDER: Bing XML File verification content
    xmlFileContent: viteEnv.VITE_BING_VERIFICATION_XML_CONTENT || `<?xml version="1.0"?><users><user>your_bing_auth_code_placeholder</user></users>`,
    // PLACEHOLDER: DNS TXT verification record value (e.g. "MS=xxxxx")
    dnsTxtRecord: viteEnv.VITE_BING_DNS_RECORD || "MS=your_bing_dns_verification_placeholder_value"
  },
  googleAnalytics: {
    // PLACEHOLDER: Enter Google Analytics GA4 Measurement ID (e.g., "G-XXXXXXXXXX")
    measurementId: viteEnv.VITE_GA_MEASUREMENT_ID || "",
    get isActive() {
      // Must not be a placeholder and requires active user consent
      return Boolean(this.measurementId) && getConsent().analytics;
    }
  },
  microsoftClarity: {
    // PLACEHOLDER: Enter Microsoft Clarity Project ID (e.g., "abcdefghij")
    projectId: viteEnv.VITE_CLARITY_PROJECT_ID || "",
    get isActive() {
      // Must not be a placeholder and requires active user consent
      return Boolean(this.projectId) && getConsent().clarity;
    }
  },
  indexNow: {
    // PLACEHOLDER: Enter IndexNow API Key (minimum 8 character hex string)
    apiKey: viteEnv.VITE_INDEXNOW_API_KEY || "",
    get keyLocation() {
      // Location where search engines can find the api key to authenticate
      const base = typeof window !== 'undefined' ? window.location.origin : "https://sahl-ahmed.web.app";
      return `${base}/${this.apiKey}.txt`;
    },
    get isActive() {
      return Boolean(this.apiKey) && this.apiKey.length >= 8;
    }
  }
};

// ---------------------------------------------------------------------------
// 2. Privacy-Aware Consent System
// ---------------------------------------------------------------------------
const CONSENT_STORAGE_KEY = "sahl-portfolio-user-consent";

const DEFAULT_CONSENT: ConsentState = {
  analytics: false,
  marketing: false,
  clarity: false,
  preferences: false,
  timestamp: ""
};

/**
 * Get current user consent state from LocalStorage.
 * Prioritizes active choices, otherwise defaults to false (strict privacy-first).
 */
export function getConsent(): ConsentState {
  if (typeof window === "undefined") return DEFAULT_CONSENT;
  try {
    const saved = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to parse consent configuration:", e);
  }
  return DEFAULT_CONSENT;
}

/**
 * Save user consent state and trigger appropriate integrations dynamically.
 */
export function saveConsent(consent: Partial<ConsentState>) {
  if (typeof window === "undefined") return;
  const current = getConsent();
  const updated: ConsentState = {
    ...current,
    ...consent,
    timestamp: new Date().toISOString()
  };

  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(updated));
    
    // Dispatch system-wide event for real-time initializer hook bindings
    window.dispatchEvent(new CustomEvent("sahl_consent_updated", { detail: updated }));
    
    // Dynamically trigger initialization if consented
    if (updated.analytics) {
      initializeGoogleAnalytics();
    }
    if (updated.clarity) {
      initializeMicrosoftClarity();
    }
  } catch (e) {
    console.error("Failed to save consent choice:", e);
  }
}

/**
 * Helper to check if any user selection is saved.
 * Returns true if the user has explicitly accepted or declined.
 */
export function hasConsentChoiceBeenMade(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CONSENT_STORAGE_KEY) !== null;
}

// ---------------------------------------------------------------------------
// 3. Google Analytics 4 Script Injector & Tracker
// ---------------------------------------------------------------------------
let isGaInitialized = false;

export function initializeGoogleAnalytics() {
  if (typeof window === "undefined" || isGaInitialized) return;
  
  const { measurementId, isActive } = SEO_CONFIG.googleAnalytics;
  if (!isActive || !measurementId) {
    console.info("Google Analytics is prepared but currently disabled (Missing ID or Pending Consent).");
    return;
  }

  try {
    // 1. Inject script tags
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);

    // 2. Setup global gtag function
    window.dataLayer = window.dataLayer || [];
    window.gtag = function() {
      window.dataLayer.push(arguments);
    };
    
    window.gtag("js", new Date());
    window.gtag("config", measurementId, {
      send_page_view: true, // Automate base page view tracking
      anonymize_ip: true,   // Privacy-first IP anonymization
      cookie_flags: "SameSite=None;Secure"
    });

    isGaInitialized = true;
    console.log("Google Analytics 4 initialized successfully with Measurement ID:", measurementId);
  } catch (e) {
    console.error("Error initializing Google Analytics script:", e);
  }
}

// Global typing declarations
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
    clarity: (...args: any[]) => void;
  }
}

// ---------------------------------------------------------------------------
// 4. Microsoft Clarity Script Injector
// ---------------------------------------------------------------------------
let isClarityInitialized = false;

export function initializeMicrosoftClarity() {
  if (typeof window === "undefined" || isClarityInitialized) return;

  const { projectId, isActive } = SEO_CONFIG.microsoftClarity;
  if (!isActive || !projectId) {
    console.info("Microsoft Clarity is prepared but currently disabled (Missing ID or Pending Consent).");
    return;
  }

  try {
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", projectId);

    isClarityInitialized = true;
    console.log("Microsoft Clarity initialized successfully with Project ID:", projectId);
  } catch (e) {
    console.error("Error initializing Microsoft Clarity:", e);
  }
}
