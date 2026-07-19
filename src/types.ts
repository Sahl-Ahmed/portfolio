export interface Project {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  fullDescription: string;
  image: string; // fallback single image or first image
  images?: string[]; // support up to 4 images
  videoUrl?: string; // supports local/remote video url
  category: string; // custom category string to support dynamic categorization
  software: string[];
  likes: number;
  liked?: boolean;
  featured?: boolean;
  client?: string;
  year?: string;
  deliverables: string[];
  views?: number;
  isGallery?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  category: string;
  image: string;
}

export interface Education {
  id: string;
  institution: string;
  department: string;
}

export interface SkillItem {
  name: string;
  experienceStartedDate: string; // date of start to calculate experience months automatically
  comment?: string;
}

export interface SocialLink {
  id: string;
  name: string;
  url: string;
}

export interface Service {
  id: string;
  title: string;
  description: string;
  icon: string;
  skills: string[];
  basePrice: number;
}

export interface Experience {
  id: string;
  title: string;
  role?: string; // backwards compatibility alias for title
  company: string;
  employmentType?: string;
  location?: string;
  description: string;
  softwareUsed?: string;
  startDate: string;
  endDate?: string;
  isCurrent?: boolean;
  website?: string;
  sortOrder?: number;
  createdAt?: string;
  updatedAt?: string;
  duration?: string; // backwards compatibility alias for UI
}

export interface Message {
  id: string;
  name: string;
  email: string;
  serviceType: string;
  message: string;
  budget?: number;
  createdAt: string;
  status: 'new' | 'archived';
  hireOption?: 'Yes' | 'No';
}

export interface SectionTexts {
  heroTitle: string;
  heroSubtitle: string;
  heroDescription: string;
  aboutTitle: string;
  aboutSubtitle?: string;
  aboutDescription: string;
  aboutQuote: string;
  contactsMeta: {
    averageResponseDelay: string;
    preferredChannel: string;
    whatsappNumber: string;
  };
  basePosition?: string;
  basePositionLabel?: string;
  studioCoordinatesTitle?: string;
  studioCoordinatesSubtitle?: string;
  studioCoordinatesDescription?: string;
  aboutLocationLabel?: string;
  aboutLocationValue?: string;
  aboutTonguesLabel?: string;
  aboutTonguesValue?: string;
  credentialStationTitle?: string;
  credentialStationSubtitle?: string;
  typewriterPhrases?: string[];
  baseCoordinatesTitle?: string;
  heroImage?: string;
}


