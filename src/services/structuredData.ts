import { Project, Achievement, SocialLink, SectionTexts } from '../types';
import { getBaseUrl } from './seo';

/**
 * Interface representing all dynamic states required for JSON-LD structured data generation.
 */
export interface StructuredDataInput {
  activeTab: 'home' | 'masterpieces' | 'gallery' | 'about' | 'contact';
  selectedProject: Project | null;
  sectionTexts: SectionTexts;
  projectsList: Project[];
  galleryItems: Project[];
  achievements: Achievement[];
  socialLinks: SocialLink[];
}

/**
 * Helper to escape single quotes or characters safely to avoid breaking JSON.
 */
function safeJson(obj: any): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (error) {
    console.error("Failed to stringify JSON-LD:", error);
    return "{}";
  }
}

/**
 * Main Structured Data (JSON-LD) Generator Service.
 */
export function generateStructuredData(input: StructuredDataInput): any[] {
  const baseUrl = getBaseUrl();
  const personId = `${baseUrl}/#person`;
  const websiteId = `${baseUrl}/#website`;

  // 1. Dynamic Social Profiles Map
  const socialsMap: Record<string, string> = {
    facebook: 'https://www.facebook.com/shsahlahmed',
    youtube: 'https://www.youtube.com/@ShaholAhmed-006',
    linkedin: 'https://www.linkedin.com/in/sahl-ahmed-7637a940b/',
    github: 'https://github.com/Sahl-Ahmed',
  };

  // Override or add based on Firestore social links
  input.socialLinks.forEach(link => {
    const nameLower = link.name.toLowerCase();
    socialsMap[nameLower] = link.url;
  });

  const sameAsUrls = Object.values(socialsMap).filter(url => url && url.startsWith('http'));

  // 2. Person Schema (Single consistent identity entity)
  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": personId,
    "name": input.sectionTexts.heroTitle || "Sahl Ahmed",
    "image": input.sectionTexts.heroImage || "https://lh3.googleusercontent.com/d/1hpeQFOV5RE1KlxiagbL_kaS0aJFJgNu3",
    "jobTitle": input.sectionTexts.heroSubtitle || "Multimedia Designer & UI/UX Developer",
    "description": input.sectionTexts.aboutDescription || "Official portfolio of Sahl Ahmed showcasing UI/UX design, 3D modeling, 2D projects, graphic design, and other creative projects.",
    "url": baseUrl,
    "email": "shsahl1125@gmail.com",
    "nationality": {
      "@type": "Country",
      "name": "Bangladesh"
    },
    "homeLocation": {
      "@type": "Place",
      "name": input.sectionTexts.aboutLocationValue || "Dhaka, Bangladesh"
    },
    "knowsLanguage": (input.sectionTexts.aboutTonguesValue || "Bangla, English, Hindi, Urdu")
      .split(",")
      .map(lang => lang.trim())
      .filter(Boolean),
    "sameAs": sameAsUrls,
    "knowsAbout": [
      "UI/UX Design",
      "3D Spatial Modeling",
      "Graphic Design",
      "Motion Graphics",
      "Interactive Prototypes",
      "WebGL & Three.js"
    ]
  };

  // 3. WebSite Schema
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": websiteId,
    "url": baseUrl,
    "name": `${input.sectionTexts.heroTitle || "Sahl Ahmed"} Portfolio`,
    "description": input.sectionTexts.heroDescription || "Official portfolio showcasing UI/UX design, 3D modeling, 2D projects, graphic design, and other creative projects.",
    "inLanguage": "en",
    "publisher": { "@id": personId },
    "author": { "@id": personId },
    "potentialAction": {
      "@type": "SearchAction",
      "target": `${baseUrl}/?search={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };

  const schemas: any[] = [personSchema, websiteSchema];

  // 4. Breadcrumb Schema (dynamically generated for any public state)
  const breadcrumbList: any[] = [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": baseUrl
    }
  ];

  if (input.selectedProject) {
    const isGallery = input.selectedProject.isGallery;
    const parentFolder = isGallery ? "gallery" : "projects";
    const parentName = isGallery ? "Gallery" : "Projects";
    
    breadcrumbList.push({
      "@type": "ListItem",
      "position": 2,
      "name": parentName,
      "item": `${baseUrl}/${parentFolder}`
    });

    breadcrumbList.push({
      "@type": "ListItem",
      "position": 3,
      "name": input.selectedProject.title,
      "item": `${baseUrl}/${parentFolder}/${input.selectedProject.id}`
    });
  } else if (input.activeTab !== "home") {
    let tabName = "Home";
    let tabFolder = "";

    if (input.activeTab === "masterpieces") {
      tabName = "Projects";
      tabFolder = "projects";
    } else if (input.activeTab === "gallery") {
      tabName = "Gallery";
      tabFolder = "gallery";
    } else if (input.activeTab === "about") {
      tabName = "About";
      tabFolder = "about";
    } else if (input.activeTab === "contact") {
      tabName = "Contact";
      tabFolder = "contact";
    }

    if (tabFolder) {
      breadcrumbList.push({
        "@type": "ListItem",
        "position": 2,
        "name": tabName,
        "item": `${baseUrl}/${tabFolder}`
      });
    }
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${baseUrl}/${input.selectedProject ? (input.selectedProject.isGallery ? 'gallery/' + input.selectedProject.id : 'projects/' + input.selectedProject.id) : (input.activeTab === 'home' ? '' : input.activeTab)}#breadcrumbs`,
    "itemListElement": breadcrumbList
  };
  schemas.push(breadcrumbSchema);

  // 5. CreativeWork Schema (for selected/active dynamic project page)
  if (input.selectedProject) {
    const proj = input.selectedProject;
    const cleanImage = proj.image && (proj.image.startsWith('http') || proj.image.startsWith('/'))
      ? proj.image
      : "https://lh3.googleusercontent.com/d/1hpeQFOV5RE1KlxiagbL_kaS0aJFJgNu3";

    const creativeWorkSchema = {
      "@context": "https://schema.org",
      "@type": "CreativeWork",
      "@id": `${baseUrl}/${proj.isGallery ? 'gallery' : 'projects'}/${proj.id}#creativework`,
      "name": proj.title,
      "headline": proj.subtitle,
      "description": proj.description || proj.fullDescription,
      "text": proj.fullDescription,
      "image": cleanImage,
      "genre": proj.category || "Design",
      "author": { "@id": personId },
      "creator": { "@id": personId },
      "publisher": { "@id": personId },
      "dateCreated": proj.createdAt || "2026-07-17",
      "dateModified": proj.updatedAt || proj.createdAt || "2026-07-17",
      "creativeWorkStatus": proj.featured ? "Featured" : "Standard",
      "keywords": [
        ...(proj.software || []),
        ...(proj.deliverables || []),
        proj.category
      ].filter(Boolean).join(", ")
    };
    schemas.push(creativeWorkSchema);
  }

  // 6. CollectionPage Schema
  if (input.activeTab === "masterpieces" || input.activeTab === "gallery" || input.activeTab === "home") {
    let collectionName = "Masterpieces Portfolio";
    let collectionDesc = "Sahl Ahmed's most complex, award-winning, and high-fidelity creative masterpieces.";
    let pageUrl = `${baseUrl}/projects`;

    if (input.activeTab === "gallery") {
      collectionName = "Creative Gallery & Daily Practice Works";
      collectionDesc = "A record of daily high-fidelity practice models, creative explorations, and immersive travel concepts like POTHIK.";
      pageUrl = `${baseUrl}/gallery`;
    } else if (input.activeTab === "home") {
      collectionName = "Sahl Ahmed Portfolio Main Collections";
      collectionDesc = "Unified catalog of UI/UX, 3D, and graphic design masterpieces created by Sahl Ahmed.";
      pageUrl = baseUrl;
    }

    const collectionPageSchema = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${pageUrl}#collection`,
      "name": collectionName,
      "description": collectionDesc,
      "url": pageUrl,
      "author": { "@id": personId },
      "publisher": { "@id": personId }
    };
    schemas.push(collectionPageSchema);
  }

  // CollectionPage Schema for Achievements / More Works
  const achievementsUrl = `${baseUrl}/achievements`;
  const achievementsCollectionPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${achievementsUrl}#collection`,
    "name": "Professional Creative Achievements | Sahl Ahmed",
    "description": "An award-winning timeline of Sahl Ahmed's global recognitions, design conference badges, and summit certifications.",
    "url": achievementsUrl,
    "author": { "@id": personId }
  };
  schemas.push(achievementsCollectionPage);

  const moreWorksUrl = `${baseUrl}/more-works`;
  const moreWorksCollectionPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${moreWorksUrl}#collection`,
    "name": "More Works & Interactive Playground | Sahl Ahmed",
    "description": "Exploration of experimental design components, 3D shader files, and motion config presets.",
    "url": moreWorksUrl,
    "author": { "@id": personId }
  };
  schemas.push(moreWorksCollectionPage);

  // 7. ItemList Schema (Latest Projects, Featured Projects, Achievements, Gallery Items, Videos)
  
  // Featured & Latest Projects ItemList
  const featuredProjs = input.projectsList.filter(p => p.featured && !p.isGallery);
  if (featuredProjs.length > 0) {
    const featuredListSchema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${baseUrl}/#featured-projects-list`,
      "name": "Featured Projects",
      "description": "Sahl Ahmed's most high-profile creative masterpieces highlighted for outstanding design quality.",
      "numberOfItems": featuredProjs.length,
      "author": { "@id": personId },
      "itemListElement": featuredProjs.map((p, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "url": `${baseUrl}/projects/${p.id}`,
        "name": p.title
      }))
    };
    schemas.push(featuredListSchema);
  }

  // Latest Projects ItemList
  if (input.projectsList.length > 0) {
    const latestProjs = [...input.projectsList]
      .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
      .slice(0, 5);

    const latestListSchema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${baseUrl}/#latest-projects-list`,
      "name": "Latest Projects",
      "description": "The most recently completed professional design and development projects.",
      "numberOfItems": latestProjs.length,
      "author": { "@id": personId },
      "itemListElement": latestProjs.map((p, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "url": `${baseUrl}/projects/${p.id}`,
        "name": p.title
      }))
    };
    schemas.push(latestListSchema);
  }

  // Gallery Items ItemList
  if (input.galleryItems.length > 0) {
    const galleryListSchema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${baseUrl}/#gallery-items-list`,
      "name": "Gallery Items",
      "description": "Daily digital practice creations, low-poly exercises, and travel software mockups.",
      "numberOfItems": input.galleryItems.length,
      "author": { "@id": personId },
      "itemListElement": input.galleryItems.map((p, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "url": `${baseUrl}/gallery/${p.id}`,
        "name": p.title
      }))
    };
    schemas.push(galleryListSchema);
  }

  // Achievements ItemList
  if (input.achievements.length > 0) {
    const achievementsListSchema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${baseUrl}/#achievements-list`,
      "name": "Achievements",
      "description": "Chronological history of design awards, badges, and honors.",
      "numberOfItems": input.achievements.length,
      "author": { "@id": personId },
      "itemListElement": input.achievements.map((a, idx) => ({
        "@type": "ListItem",
        "position": idx + 1,
        "name": a.title,
        "description": a.description
      }))
    };
    schemas.push(achievementsListSchema);
  }

  // Video Content Schema (Project videos or general embedded items, e.g. POTHIK)
  const videoProjects = [...input.projectsList, ...input.galleryItems].filter(p => p.videoUrl);
  if (videoProjects.length > 0) {
    const videoListSchema = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${baseUrl}/#videos-list`,
      "name": "Videos",
      "description": "Exhibition of project animations, walkthrough videos, and user experience demos.",
      "numberOfItems": videoProjects.length,
      "author": { "@id": personId },
      "itemListElement": videoProjects.map((p, idx) => {
        // Parse YouTube thumbnail / ID if possible
        let embedUrl = p.videoUrl;
        const ytMatch = p.videoUrl?.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i);
        if (ytMatch && ytMatch[1]) {
          embedUrl = `https://www.youtube.com/embed/${ytMatch[1]}`;
        }
        return {
          "@type": "VideoObject",
          "position": idx + 1,
          "name": p.title,
          "description": p.description || p.fullDescription,
          "thumbnailUrl": p.image || `https://img.youtube.com/vi/${ytMatch ? ytMatch[1] : 'default'}/maxresdefault.jpg`,
          "uploadDate": p.createdAt || "2026-07-17",
          "contentUrl": p.videoUrl,
          "embedUrl": embedUrl,
          "interactionStatistic": {
            "@type": "InteractionCounter",
            "interactionType": { "@type": "LikeAction" },
            "userInteractionCount": p.likes || 0
          }
        };
      })
    };
    schemas.push(videoListSchema);
  }

  return schemas;
}

/**
 * React Hook to dynamically inject JSON-LD structured data into the document <head>.
 * This updates automatically whenever the input dependencies or Firestore data change.
 */
export function useStructuredData(input: StructuredDataInput) {
  if (typeof window === 'undefined') return;

  const updateScript = () => {
    const schemas = generateStructuredData(input);
    
    // Select or create script tag
    let scriptElement = document.getElementById('structured-data-ld-json') as HTMLScriptElement;
    if (!scriptElement) {
      scriptElement = document.createElement('script');
      scriptElement.id = 'structured-data-ld-json';
      scriptElement.type = 'application/ld+json';
      document.head.appendChild(scriptElement);
    }

    // Wrap the entire dynamic collection of schemas in a robust @graph envelope
    const graphEnvelope = {
      "@context": "https://schema.org",
      "@graph": schemas
    };

    scriptElement.text = safeJson(graphEnvelope);
  };

  // Re-run the generation whenever input states update
  updateScript();
}
