/**
 * Reusable and privacy-safe Analytics Service.
 * Interfaces with Google Analytics 4 (GA4) dynamically, respecting user privacy consent.
 * 
 * Automatically redacts and prevents collecting any personally identifiable information (PII)
 * like emails, phone numbers, or user names from query strings or inputs.
 */

import { SEO_CONFIG } from './config';

// Safe check to verify if ga/gtag is ready
function getGtag() {
  if (typeof window !== "undefined" && window.gtag && SEO_CONFIG.googleAnalytics.isActive) {
    return window.gtag;
  }
  return null;
}

/**
 * Sanitizes input text or URLs to prevent accidental capture of Personally Identifiable Information (PII).
 * Redacts email addresses, potential phone numbers, and query tokens.
 */
export function sanitizePII(input: string): string {
  if (!input) return "";
  let sanitized = input;
  
  // 1. Redact email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  sanitized = sanitized.replace(emailRegex, "[REDACTED_EMAIL]");
  
  // 2. Redact phone numbers (simple pattern for numbers with 7 to 15 digits)
  const phoneRegex = /\+?[0-9]{3,4}[- ]?[0-9]{3,4}[- ]?[0-9]{4,6}/g;
  sanitized = sanitized.replace(phoneRegex, "[REDACTED_PHONE]");

  return sanitized;
}

/**
 * Tracks a custom event in Google Analytics.
 * Gracefully acts as a silent helper when analytics is inactive or consent is pending.
 */
export function trackEvent(eventName: string, params: Record<string, any> = {}) {
  const gtag = getGtag();
  
  // Clean PII from all parameters before sending
  const cleanParams: Record<string, any> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      cleanParams[key] = sanitizePII(value);
    } else {
      cleanParams[key] = value;
    }
  }

  // Inject additional standard context
  cleanParams.non_interaction = cleanParams.non_interaction ?? false;
  cleanParams.timestamp = new Date().toISOString();

  if (gtag) {
    gtag("event", eventName, cleanParams);
    if (process.env.NODE_ENV !== "production") {
      console.log(`[Analytics:GA4] Event tracked: ${eventName}`, cleanParams);
    }
  } else {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[Analytics:Buffered/Disabled] Event skipped (Consent or Key missing): ${eventName}`, cleanParams);
    }
  }
}

// ---------------------------------------------------------------------------
// Unified Trackers for Requested Application Events
// ---------------------------------------------------------------------------

/**
 * 1. Track standard page view or manual tab/route transition.
 */
export function trackPageView(pagePath: string, pageTitle: string) {
  const path = sanitizePII(pagePath);
  trackEvent("page_view", {
    page_path: path,
    page_title: pageTitle,
    page_location: typeof window !== "undefined" ? window.location.href : ""
  });
}

/**
 * 2. Track explicit route changes (such as tab switching or virtual route routing).
 */
export function trackRouteChange(fromRoute: string, toRoute: string) {
  trackEvent("route_change", {
    from_route: sanitizePII(fromRoute),
    to_route: sanitizePII(toRoute)
  });
}

/**
 * 3. Track when a visitor lands on a non-existent route or state.
 */
export function track404Page(attemptedPath: string) {
  trackEvent("404_view", {
    attempted_path: sanitizePII(attemptedPath)
  });
}

/**
 * 4. Track when a project detail card or modal is opened.
 */
export function trackProjectDetailView(projectId: string, projectTitle: string, category: string) {
  trackEvent("project_detail_view", {
    project_id: projectId,
    project_title: projectTitle,
    category: category
  });
}

/**
 * 5. Track when a user expands or browses the interactive creative gallery.
 */
export function trackGalleryView(itemId: string, itemTitle: string, category: string) {
  trackEvent("gallery_item_view", {
    item_id: itemId,
    item_title: itemTitle,
    category: category
  });
}

/**
 * 6. Track successful contact form submissions.
 * Does NOT collect email or name to respect PII constraints.
 */
export function trackContactFormSubmission(subject: string, messageLength: number) {
  trackEvent("contact_form_submission", {
    message_subject_category: sanitizePII(subject),
    message_length: messageLength
  });
}

/**
 * 7. Track clicks on external social or outbound design platform links.
 */
export function trackOutboundLinkClick(destinationUrl: string, platformLabel: string) {
  trackEvent("outbound_click", {
    destination_url: destinationUrl,
    platform_label: platformLabel
  });
}

/**
 * 8. Track downloads of Sahl's professional Resume or CV.
 */
export function trackResumeDownload(fileType: string = "PDF") {
  trackEvent("resume_download", {
    file_type: fileType,
    download_timestamp: new Date().toISOString()
  });
}

/**
 * 9. Track plays of embedded projects or tutorial videos.
 */
export function trackVideoPlay(videoUrl: string, projectTitle: string, videoPlatform: "youtube" | "drive" | "direct") {
  trackEvent("video_play", {
    video_url: videoUrl,
    project_title: projectTitle,
    platform: videoPlatform
  });
}

/**
 * 10. Track when a user performs a search filter across masterpieces or gallery items.
 */
export function trackSearchUsage(query: string, resultCount: number) {
  trackEvent("search_usage", {
    search_query: sanitizePII(query),
    results_count: resultCount
  });
}

/**
 * 11. Track when the AI Assistant chatbot interface is opened.
 */
export function trackAiChatbotOpen() {
  trackEvent("ai_chatbot_open", {
    non_interaction: false
  });
}

/**
 * 12. Track when a conversation is first started with Sahl's Smart AI.
 * Fires once per session on the first message sent by the user.
 */
export function trackAiChatbotConversationStarted() {
  trackEvent("ai_chatbot_conversation_started", {
    start_timestamp: new Date().toISOString()
  });
}
