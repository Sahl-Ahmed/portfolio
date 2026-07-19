import { useEffect } from 'react';
import { SEO_CONFIG } from './config';

export interface SEOMetadata {
  title?: string;
  description?: string;
  keywords?: string;
  canonicalUrl?: string;
  robots?: string;
  themeColor?: string;
  author?: string;
  language?: string;
  
  // Open Graph
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  ogType?: string;
  ogSiteName?: string;
  
  // Twitter Cards
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  twitterCard?: string;
}

export function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return "https://sahl-ahmed.web.app";
}

export const DEFAULT_SEO: Required<SEOMetadata> = {
  title: "Sahl Ahmed | Multimedia Designer & UI/UX Developer",
  description: "Official portfolio of Sahl Ahmed showcasing UI/UX design, 3D modeling, 2D projects, graphic design, and other creative projects.",
  keywords: "Sahl Ahmed, portfolio, Multimedia Designer, UI/UX Designer, 3D Artist, Creative Technologist, Bangladesh, Dhaka, designer, POTHIK, design solutions",
  canonicalUrl: getBaseUrl(),
  robots: "index, follow",
  themeColor: "#050505", // Slate/dark theme color
  author: "Sahl Ahmed",
  language: "en",
  
  // OG
  ogTitle: "Sahl Ahmed | Multimedia Designer & UI/UX Developer",
  ogDescription: "Official portfolio of Sahl Ahmed showcasing UI/UX design, 3D modeling, 2D projects, graphic design, and other creative projects.",
  ogImage: "https://lh3.googleusercontent.com/d/1hpeQFOV5RE1KlxiagbL_kaS0aJFJgNu3", // Hero avatar as fallback image
  ogUrl: getBaseUrl(),
  ogType: "website",
  ogSiteName: "Sahl Ahmed Portfolio",
  
  // Twitter
  twitterTitle: "Sahl Ahmed | Multimedia Designer & UI/UX Developer",
  twitterDescription: "Official portfolio of Sahl Ahmed showcasing UI/UX design, 3D modeling, 2D projects, graphic design, and other creative projects.",
  twitterImage: "https://lh3.googleusercontent.com/d/1hpeQFOV5RE1KlxiagbL_kaS0aJFJgNu3",
  twitterCard: "summary_large_image"
};

// Helper to convert Google Drive sharing links to direct asset links
function getGoogleDriveImageLink(url: string | undefined): string {
  if (!url) return 'https://lh3.googleusercontent.com/d/1hpeQFOV5RE1KlxiagbL_kaS0aJFJgNu3';
  const trimmed = url.trim();
  if (trimmed.includes('drive.google.com') || trimmed.includes('docs.google.com')) {
    const match = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
  }
  return trimmed;
}

/**
 * Reusable SEO application helper to update DOM head tags dynamically.
 */
export function normalizePathname(path: string): string {
  let normalized = path.trim().replace(/\/+$/, ""); // remove trailing slashes
  // Check if it's a dynamic project route (e.g., /projects/id or /gallery/id)
  const projMatch = normalized.match(/^\/(projects|gallery)\/([a-zA-Z0-9_-]+)$/i);
  if (projMatch) {
    const routeType = projMatch[1].toLowerCase();
    const id = projMatch[2]; // keep exact casing of project ID
    return `/${routeType}/${id}`;
  }
  // Otherwise, safe to lowercase static routes
  return normalized.toLowerCase() || "/";
}

export function updateSEOMetadata(metadata: SEOMetadata) {
  if (typeof document === 'undefined') return;

  const getOrSetMeta = (name: string, value: string, isProperty = false) => {
    const attribute = isProperty ? 'property' : 'name';
    let element = document.querySelector(`meta[${attribute}="${name}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, name);
      document.head.appendChild(element);
    }
    element.setAttribute('content', value);
  };

  const getOrSetLink = (rel: string, href: string) => {
    let element = document.querySelector(`link[rel="${rel}"]`);
    if (!element) {
      element = document.createElement('link');
      element.setAttribute('rel', rel);
      document.head.appendChild(element);
    }
    element.setAttribute('href', href);
  };

  // 1. Title
  const finalTitle = metadata.title || DEFAULT_SEO.title;
  document.title = finalTitle;

  // 2. Language attribute on HTML tag
  const finalLang = metadata.language || DEFAULT_SEO.language;
  document.documentElement.setAttribute('lang', finalLang);

  // 3. Core Meta tags
  getOrSetMeta('description', metadata.description || DEFAULT_SEO.description);
  getOrSetMeta('keywords', metadata.keywords || DEFAULT_SEO.keywords);
  getOrSetMeta('robots', metadata.robots || DEFAULT_SEO.robots);
  getOrSetMeta('theme-color', metadata.themeColor || DEFAULT_SEO.themeColor);
  getOrSetMeta('author', metadata.author || DEFAULT_SEO.author);

  // 4. Canonical URL normalization (uppercase/lowercase and trailing slashes)
  let canonicalOrigin = getBaseUrl();
  let currentUrl = getBaseUrl();
  if (typeof window !== 'undefined') {
    const cleanPath = normalizePathname(window.location.pathname);
    canonicalOrigin = `${window.location.origin}${cleanPath === '/' ? '' : cleanPath}`;
    currentUrl = `${window.location.origin}${cleanPath === '/' ? '' : cleanPath}`;
  }
  const finalCanonical = metadata.canonicalUrl || canonicalOrigin;
  getOrSetLink('canonical', finalCanonical);

  // 5. Open Graph tags
  getOrSetMeta('og:title', metadata.ogTitle || finalTitle, true);
  getOrSetMeta('og:description', metadata.ogDescription || metadata.description || DEFAULT_SEO.ogDescription, true);
  getOrSetMeta('og:image', metadata.ogImage || DEFAULT_SEO.ogImage, true);
  getOrSetMeta('og:url', metadata.ogUrl || currentUrl, true);
  getOrSetMeta('og:type', metadata.ogType || DEFAULT_SEO.ogType, true);
  getOrSetMeta('og:site_name', metadata.ogSiteName || DEFAULT_SEO.ogSiteName, true);

  // 6. Twitter Card tags
  getOrSetMeta('twitter:title', metadata.twitterTitle || finalTitle);
  getOrSetMeta('twitter:description', metadata.twitterDescription || metadata.description || DEFAULT_SEO.twitterDescription);
  getOrSetMeta('twitter:image', metadata.twitterImage || DEFAULT_SEO.twitterImage);
  getOrSetMeta('twitter:card', metadata.twitterCard || DEFAULT_SEO.twitterCard);

  // 7. Search Engine Verification Tags (Placeholders / Configurable)
  getOrSetMeta('google-site-verification', SEO_CONFIG.googleSearchConsole.metaContent || 'your_gsc_verification_tag_placeholder');
  getOrSetMeta('msvalidate.01', SEO_CONFIG.bingWebmaster.metaContent || 'your_bing_verification_tag_placeholder');
}

/**
 * Custom React Hook for Dynamic Portfolio SEO.
 * Synchronizes document meta headers dynamically with tab switching and selected project state.
 */
export function usePortfolioSEO(
  activeTab: 'home' | 'masterpieces' | 'gallery' | 'about' | 'contact',
  selectedProject: any | null,
  sectionTexts: any
) {
  useEffect(() => {
    let metadata: SEOMetadata = {};

    if (selectedProject) {
      const title = `${selectedProject.title} | Sahl Ahmed`;
      const description = selectedProject.description || selectedProject.fullDescription || DEFAULT_SEO.description;
      const imageUrl = getGoogleDriveImageLink(selectedProject.image);
      const category = selectedProject.category || "";
      const software = selectedProject.softwareUsed?.join(', ') || selectedProject.software?.join(', ') || "";
      const keywords = `${category ? category + ', ' : ''}${software ? software + ', ' : ''}${selectedProject.title}, Sahl Ahmed project, portfolio`;

      metadata = {
        title,
        description,
        keywords: `${keywords}, ${DEFAULT_SEO.keywords}`,
        ogTitle: title,
        ogDescription: description,
        ogImage: imageUrl,
        ogType: "article",
        twitterTitle: title,
        twitterDescription: description,
        twitterImage: imageUrl,
      };
    } else {
      switch (activeTab) {
        case 'home':
          const homeTitle = "Sahl Ahmed | Multimedia Designer & UI/UX Developer";
          const homeDesc = sectionTexts?.heroDescription || DEFAULT_SEO.description;
          const homeImg = getGoogleDriveImageLink(sectionTexts?.heroImage);
          metadata = {
            title: homeTitle,
            description: homeDesc,
            ogImage: homeImg,
            twitterImage: homeImg,
          };
          break;
        case 'masterpieces':
          const mpTitle = "Featured Masterpieces | Sahl Ahmed";
          const mpDesc = "Explore premium high-fidelity digital designs, spatial 3D models, and custom-engineered user interfaces crafted by Sahl Ahmed.";
          const mpKeywords = "masterpieces, UI/UX design, 3D spatial art, Figma, Blender, high fidelity, Sahl Ahmed portfolio";
          metadata = {
            title: mpTitle,
            description: mpDesc,
            keywords: `${mpKeywords}, ${DEFAULT_SEO.keywords}`,
            ogTitle: mpTitle,
            ogDescription: mpDesc,
          };
          break;
        case 'gallery':
          const galTitle = "Creative Gallery & Daily Practice | Sahl Ahmed";
          const galDesc = "A curated collection of daily design practice works, low-poly models, travel concepts like POTHIK, and interactive creations by Sahl Ahmed.";
          const galKeywords = "design practice, travel concepts, POTHIK, interactive low-poly, 3D works, daily art, Sahl Ahmed gallery";
          metadata = {
            title: galTitle,
            description: galDesc,
            keywords: `${galKeywords}, ${DEFAULT_SEO.keywords}`,
            ogTitle: galTitle,
            ogDescription: galDesc,
          };
          break;
        case 'about':
          const abTitle = "About Sahl Ahmed | Credentials & Software Armory";
          const abDesc = sectionTexts?.aboutDescription || "Learn about Sahl Ahmed's design philosophy, credentials station, education background, software skills, and full professional timeline.";
          const abKeywords = "Sahl Ahmed bio, credentials station, software armory, education background, professional history, Blender, Figma, Unity";
          const abImg = getGoogleDriveImageLink(sectionTexts?.heroImage);
          metadata = {
            title: abTitle,
            description: abDesc,
            keywords: `${abKeywords}, ${DEFAULT_SEO.keywords}`,
            ogTitle: abTitle,
            ogDescription: abDesc,
            ogImage: abImg,
            twitterImage: abImg,
          };
          break;
        case 'contact':
          const conTitle = "Contact Sahl Ahmed | Initialize Communication";
          const conDesc = sectionTexts?.studioCoordinatesDescription || DEFAULT_SEO.description;
          const conKeywords = "contact Sahl Ahmed, project consultation, secure communication, WhatsApp designer, hire 3D artist, hire UI designer";
          metadata = {
            title: conTitle,
            description: conDesc,
            keywords: `${conKeywords}, ${DEFAULT_SEO.keywords}`,
            ogTitle: conTitle,
            ogDescription: conDesc,
          };
          break;
        default:
          metadata = DEFAULT_SEO;
      }
    }

    updateSEOMetadata(metadata);
  }, [activeTab, selectedProject, sectionTexts]);
}
