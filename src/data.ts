import { Project, Service, Achievement, Education, SkillItem, SocialLink } from './types';

export const initialProjects: Project[] = [
  {
    id: 'nebula-os',
    title: 'Nebula OS Design System',
    subtitle: 'Featured Masterpiece',
    description: 'A comprehensive 3D-integrated design system built for the next generation of spatial computing.',
    fullDescription: 'Nebula OS represents a futuristic blueprint for spatial computing and immersive operating systems. Designed to harmonize intricate 3D volumetric user interfaces with physical space, this masterpiece features responsive holographic widgets, layered translucency with realistic index of refraction, and a state-of-the-art cinematic workspace layout.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDDJA9HWOW0iNL9X4sdqF3C7iapfbV2eL5liTW02hx1-bQTzfb7omCQ7J_Z-SieZbsl3L2oML-0Ibi0tCXAz0S-Mnt41EnQgNGM3Z1QlY0CyXo-1Hi4JYdGz-zPAvG-PFokfvVdWtf6A9mDbOLKnvHRFK28zwXRbLzSGwFI0dTNbNf19H29LvCbscCSFyrJxGf3ye72meRof2eEhOtwjg2CTF8kQxiezF98mnhB7K7t0XsCV-_0Hje9Id7GlV6jzBtgWyAHXHI2JEU',
    images: [
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDDJA9HWOW0iNL9X4sdqF3C7iapfbV2eL5liTW02hx1-bQTzfb7omCQ7J_Z-SieZbsl3L2oML-0Ibi0tCXAz0S-Mnt41EnQgNGM3Z1QlY0CyXo-1Hi4JYdGz-zPAvG-PFokfvVdWtf6A9mDbOLKnvHRFK28zwXRbLzSGwFI0dTNbNf19H29LvCbscCSFyrJxGf3ye72meRof2eEhOtwjg2CTF8kQxiezF98mnhB7K7t0XsCV-_0Hje9Id7GlV6jzBtgWyAHXHI2JEU',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuB5wOODgZdFJ0fczBZNbFbAZbNzRrBF1L7ZiCTzrzTtGCYGo8G2ihry1vgBW5sRvxYOgJv43LHOD8G-bMVZUISwIJxG6dRpBZ8Ffh1h7rztxttq9OY4NKY7XjOjmIcEYZI4u0zJzcwB2wAcEOjSuEiHNSdE9JTMXkwEjKkZ3Gu_5BZHncA9NCIXYXuDcqxY-7a-eQivbCDURUlvSug9hxApcnfhxZx5Enzb4HHfYNVYxhLlIsgwZX4POnDo9cYSDW9tHs6rcZb7mt8',
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDm3SLdxAmJcCl4iP8OD1AXcbOQ4uc856ftugV62AxKBYfu_pF04DW87r1Uub9sB5-8-DlsqwI6P2crJlM3xBi0OhiquK7d3wRBxWXaPPeJjYngYkA2vjHbned1aftfMlnH-bX0b05ECz8yoaff1eQcp9xcbwS-bayFs4S0IC9VE2w-6sOUlph099hmZNTa35tei8JLeuHgTZjmLRNhjD2zmFIx-UAXDMMz-Wfc3FHn-zKUpAUVxBQV0MoET-33Qrdm3xr7ZC48vqc'
    ],
    category: 'UI/UX',
    software: ['Maya', 'After Effects', 'Figma'],
    likes: 428,
    featured: true,
    deliverables: ['Spatial Design System', 'Component Guidelines', 'Interactive Motion Assets', 'Holographic Prototypes'],
    views: 1250
  },
  {
    id: 'velocity-mobile',
    title: 'Velocity Mobile',
    subtitle: 'App Design',
    description: 'Reimagining car rental through a luxury-first lens for elite clientele.',
    fullDescription: 'Velocity Mobile is a bespoke high-end car rental application created for premium clients seeking instant access to rare electric luxury sedans, supercars, and hypercars. The design boasts high-resolution atmospheric photography, glowing frosted glass cards (glassmorphism), neon cyan accents, and razor-sharp minimalist typography.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB5wOODgZdFJ0fczBZNbFbAZbNzRrBF1L7ZiCTzrzTtGCYGo8G2ihry1vgBW5sRvxYOgJv43LHOD8G-bMVZUISwIJxG6dRpBZ8Ffh1h7rztxttq9OY4NKY7XjOjmIcEYZI4u0zJzcwB2wAcEOjSuEiHNSdE9JTMXkwEjKkZ3Gu_5BZHncA9NCIXYXuDcqxY-7a-eQivbCDURUlvSug9hxApcnfhxZx5Enzb4HHfYNVYxhLlIsgwZX4POnDo9cYSDW9tHs6rcZb7mt8',
    images: [
      'https://lh3.googleusercontent.com/aida-public/AB6AXuB5wOODgZdFJ0fczBZNbFbAZbNzRrBF1L7ZiCTzrzTtGCYGo8G2ihry1vgBW5sRvxYOgJv43LHOD8G-bMVZUISwIJxG6dRpBZ8Ffh1h7rztxttq9OY4NKY7XjOjmIcEYZI4u0zJzcwB2wAcEOjSuEiHNSdE9JTMXkwEjKkZ3Gu_5BZHncA9NCIXYXuDcqxY-7a-eQivbCDURUlvSug9hxApcnfhxZx5Enzb4HHfYNVYxhLlIsgwZX4POnDo9cYSDW9tHs6rcZb7mt8'
    ],
    category: 'UI/UX',
    software: ['Figma', 'Photoshop'],
    likes: 312,
    featured: true,
    deliverables: ['iOS & Android Design', 'Interactive Prototypes', 'Brand Guidelines'],
    views: 890
  },
  {
    id: 'sentinel-one',
    title: 'Sentinel One Mechanical Rig',
    subtitle: '3D Art Rigging',
    description: 'High-fidelity character design and rigging for a narrative-driven game set in a cyberpunk metropolis.',
    fullDescription: 'Sentinel One is a cinematic 3D character design of a security robot patroller created in a neon-drenched futuristic setting. Modeled meticulously with deep mechanical layers, the robot features glowing amber ocular lenses, textured carbon fiber panels, and realistic surface wear.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDm3SLdxAmJcCl4iP8OD1AXcbOQ4uc856ftugV62AxKBYfu_pF04DW87r1Uub9sB5-8-DlsqwI6P2crJlM3xBi0OhiquK7d3wRBxWXaPPeJjYngYkA2vjHbned1aftfMlnH-bX0b05ECz8yoaff1eQcp9xcbwS-bayFs4S0IC9VE2w-6sOUlph099hmZNTa35tei8JLeuHgTZjmLRNhjD2zmFIx-UAXDMMz-Wfc3FHn-zKUpAUVxBQV0MoET-33Qrdm3xr7ZC48vqc',
    category: '3D Design',
    software: ['Maya', 'Substance Painter', 'ZBrush'],
    likes: 519,
    featured: true,
    deliverables: ['3D Character Concept', 'High-Poly Sculpting', 'Full Animation Rig'],
    views: 1840
  },
  {
    id: 'prism-architecture',
    title: 'Prism Architecture',
    subtitle: 'Web Design',
    description: 'Minimalist portal for an award-winning architectural practice featuring brutalist elements.',
    fullDescription: 'Prism Architecture portal is an award-winning portfolio website developed for a leading European architecture firm. Adopting an asymmetric bento grid structure, the website highlights dramatic architectural photography.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCwfSxAKtqhc-jmiyFrN4FHiOn8FULo3YisiLJ0YRjtI1MSljceO8Ou18J4oBhim-WkvB8R-lEib206o8vExeXnkp3c24NCIxB26VAH54ZH1rtK7O2xKc6J_m88sfcgsCrH8knpkYIa_SbX9LAqL038MFMjdUjkSYe3GvX3C4dYAk6fBpeoYoQ0-GhJacLfUIy2rPhGXcYVL8ONQSRVWH3iA_Ccm-bgg0Rm8_42ou0MILWjSAjMOeLrkOhHBQbZC0FBMkxhyCq4d90',
    category: 'Graphic Design',
    software: ['InDesign', 'Photoshop', 'Figma'],
    likes: 289,
    deliverables: ['Desktop & Mobile Web App', 'Brand Identity', 'Layout Templates'],
    views: 450
  },
  {
    id: 'liquid-obsidian',
    title: 'Liquid Obsidian',
    subtitle: '3D Art / Motion',
    description: 'A high-fidelity 3D abstract render of flowing metallic liquid in deep violet and neon blue.',
    fullDescription: 'Liquid Obsidian is an abstract digital sculpture exploration featuring hyper-realistic physics simulations of organic metallic liquids. Rendered with cinematic lighting.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDL5GCeX_6FI2QAwGszqXsccQ7tlrULA-x1iolAk0c99XQhINKnl_u51rGso8zZEvZK6frzGJikasfLw6Sg9CQBnJMrGSXU6u8UIu2h05nzr41UacK2BF1LSGKJMf58Oy2Qr73Z_AvewkPy5CU7VhKm4RTJV_61RvqDg2Frk-2XhIb70_mtQlHZDwAi51mpX3a8qtAEGcCJ8mN5P7Mg1QC31VdXfJJFYgfz7Ihs0snvtgqp2gtxmkb-onkfVR0s71WQaqPGooGzzIA',
    category: '3D Design',
    software: ['Maya', 'Octane Render', 'Cinema 4D'],
    likes: 624,
    deliverables: ['4K Render Art Collection', '60fps Ambient Video Loops'],
    views: 2110,
    isGallery: false
  },
  {
    id: 'gallery-logo-grids',
    title: 'Golden Ratio Logo Grids',
    subtitle: 'Daily Practice Work',
    description: 'Precise geometric constructions using divine proportions for logo design explorations.',
    fullDescription: 'An extensive practice exploring golden ratio circles, layout geometry, and brand mark alignments for luxury design agencies.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDDJA9HWOW0iNL9X4sdqF3C7iapfbV2eL5liTW02hx1-bQTzfb7omCQ7J_Z-SieZbsl3L2oML-0Ibi0tCXAz0S-Mnt41EnQgNGM3Z1QlY0CyXo-1Hi4JYdGz-zPAvG-PFokfvVdWtf6A9mDbOLKnvHRFK28zwXRbLzSGwFI0dTNbNf19H29LvCbscCSFyrJxGf3ye72meRof2eEhOtwjg2CTF8kQxiezF98mnhB7K7t0XsCV-_0Hje9Id7GlV6jzBtgWyAHXHI2JEU',
    category: 'Graphic Design',
    software: ['Illustrator', 'Figma'],
    likes: 84,
    deliverables: ['12 Vector Marks', 'Grid Guidelines Template'],
    views: 180,
    isGallery: true
  },
  {
    id: 'gallery-volumetric-shader',
    title: 'Atmospheric Abstract Shader',
    subtitle: 'Daily Practice Work',
    description: 'Volumetric mist and noise calculations for organic abstract compositions.',
    fullDescription: 'Custom noise-based glass shader with dynamic volumetric depth and light refraction indices.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB5wOODgZdFJ0fczBZNbFbAZbNzRrBF1L7ZiCTzrzTtGCYGo8G2ihry1vgBW5sRvxYOgJv43LHOD8G-bMVZUISwIJxG6dRpBZ8Ffh1h7rztxttq9OY4NKY7XjOjmIcEYZI4u0zJzcwB2wAcEOjSuEiHNSdE9JTMXkwEjKkZ3Gu_5BZHncA9NCIXYXuDcqxY-7a-eQivbCDURUlvSug9hxApcnfhxZx5Enzb4HHfYNVYxhLlIsgwZX4POnDo9cYSDW9tHs6rcZb7mt8',
    category: '3D Design',
    software: ['Cinema 4D', 'Redshift'],
    likes: 95,
    deliverables: ['Custom Material Shader', '3D Scene File'],
    views: 215,
    isGallery: true
  },
  {
    id: 'gallery-motion-components',
    title: 'Motion System Component Library',
    subtitle: 'Daily Practice Work',
    description: 'Developing high-fidelity micro-interactions for complex design tokens.',
    fullDescription: 'Bespoke CSS/Tailwind transition variables and motion layout models for interactive web cards.',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDDJA9HWOW0iNL9X4sdqF3C7iapfbV2eL5liTW02hx1-bQTzfb7omCQ7J_Z-SieZbsl3L2oML-0Ibi0tCXAz0S-Mnt41EnQgNGM3Z1QlY0CyXo-1Hi4JYdGz-zPAvG-PFokfvVdWtf6A9mDbOLKnvHRFK28zwXRbLzSGwFI0dTNbNf19H29LvCbscCSFyrJxGf3ye72meRof2eEhOtwjg2CTF8kQxiezF98mnhB7K7t0XsCV-_0Hje9Id7GlV6jzBtgWyAHXHI2JEU',
    category: 'UI/UX',
    software: ['React', 'Framer Motion'],
    likes: 102,
    deliverables: ['Interactive Playground', 'Tailwind Config Preset'],
    views: 310,
    isGallery: true
  }
];

export const initialAchievements: Achievement[] = [
  {
    id: 'ach-1',
    title: 'Interactive Design of the Year 2025',
    description: 'Received top award for Nebula OS 3D volumetric design system, praised for human spatial interaction.',
    category: 'International Design Awards',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCwfSxAKtqhc-jmiyFrN4FHiOn8FULo3YisiLJ0YRjtI1MSljceO8Ou18J4oBhim-WkvB8R-lEib206o8vExeXnkp3c24NCIxB26VAH54ZH1rtK7O2xKc6J_m88sfcgsCrH8knpkYIa_SbX9LAqL038MFMjdUjkSYe3GvX3C4dYAk6fBpeoYoQ0-GhJacLfUIy2rPhGXcYVL8ONQSRVWH3iA_Ccm-bgg0Rm8_42ou0MILWjSAjMOeLrkOhHBQbZC0FBMkxhyCq4d90'
  },
  {
    id: 'ach-2',
    title: 'Top 3D Specialist Pioneer',
    description: 'Acknowledged as one of the key developers creating unified tactile models for EV dashboards.',
    category: 'Automotive Digital Summit',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDm3SLdxAmJcCl4iP8OD1AXcbOQ4uc856ftugV62AxKBYfu_pF04DW87r1Uub9sB5-8-DlsqwI6P2crJlM3xBi0OhiquK7d3wRBxWXaPPeJjYngYkA2vjHbned1aftfMlnH-bX0b05ECz8yoaff1eQcp9xcbwS-bayFs4S0IC9VE2w-6sOUlph099hmZNTa35tei8JLeuHgTZjmLRNhjD2zmFIx-UAXDMMz-Wfc3FHn-zKUpAUVxBQV0MoET-33Qrdm3xr7ZC48vqc'
  },
  {
    id: 'ach-3',
    title: 'Creative Coding Excellence Badge',
    description: 'Awarded for performance-optimized WebGL integration with Framer Motion transitions.',
    category: 'Awwwards Conference',
    image: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDDJA9HWOW0iNL9X4sdqF3C7iapfbV2eL5liTW02hx1-bQTzfb7omCQ7J_Z-SieZbsl3L2oML-0Ibi0tCXAz0S-Mnt41EnQgNGM3Z1QlY0CyXo-1Hi4JYdGz-zPAvG-PFokfvVdWtf6A9mDbOLKnvHRFK28zwXRbLzSGwFI0dTNbNf19H29LvCbscCSFyrJxGf3ye72meRof2eEhOtwjg2CTF8kQxiezF98mnhB7K7t0XsCV-_0Hje9Id7GlV6jzBtgWyAHXHI2JEU'
  }
];

export const initialEducation: Education[] = [
  {
    id: 'edu-1',
    institution: 'Gobelins Paris School of L’image',
    department: 'M.S. in Spatial Design & Volumetric Prototyping'
  },
  {
    id: 'edu-2',
    institution: 'Dubai Institute of Design & Innovation',
    department: 'B.Des. in Interactive Design & Computational Art'
  }
];

export const initialSkills: SkillItem[] = [
  {
    name: 'Figma Pro',
    experienceStartedDate: '2022-07-09', // Let's compute months based on this
    comment: 'Design tokens and unified variables'
  },
  {
    name: 'Autodesk Maya',
    experienceStartedDate: '2021-01-09',
    comment: 'Volumetric low-overhead modeling'
  },
  {
    name: 'After Effects',
    experienceStartedDate: '2020-03-09',
    comment: 'Lottie micro-interaction mappings'
  },
  {
    name: 'Cinema 4D',
    experienceStartedDate: '2021-06-09',
    comment: 'Organic metallic liquid meshes'
  },
  {
    name: 'React / TS / Tailwind v4',
    experienceStartedDate: '2023-01-09',
    comment: 'Clean frontend UI structure'
  }
];

export const initialSocials: SocialLink[] = [
  { id: 'soc-1', name: 'Facebook', url: 'https://www.facebook.com/shsahlahmed' },
  { id: 'soc-2', name: 'YouTube', url: 'https://www.youtube.com/@ShaholAhmed-006' },
  { id: 'soc-3', name: 'LinkedIn', url: 'https://www.linkedin.com/in/sahl-ahmed-7637a940b/' },
  { id: 'soc-4', name: 'GitHub', url: 'https://github.com/Sahl-Ahmed' }
];

export const initialSectionTexts = {
  heroTitle: 'Sahl Ahmed',
  heroSubtitle: 'Multidisciplinary Creator',
  heroDescription: 'Turning imagination into meaningful digital experiences through thoughtful design, motion, storytelling, and innovation.',
  aboutTitle: 'The Visionary',
  aboutSubtitle: "YOU'RE HERE? TO KNOW",
  aboutDescription: 'Sahl Ahmed is an award-winning multidisciplinary creator, blending hyper-detailed 3D assets, procedural motion graphics, and ultra-crisp responsive layouts.',
  aboutQuote: 'True premium digital experiences do not come from automated templates; they come from intentional visual pairings and geometric architectural rhythm.',
  contactsMeta: {
    averageResponseDelay: 'Average delay: Under 4 Hours',
    preferredChannel: 'Preferred channel: WhatsApp Direct',
    whatsappNumber: '01949380524'
  },
  basePosition: "Let's get creative",
  basePositionLabel: 'Hey There!',
  studioCoordinatesTitle: 'STUDIO COORDINATES',
  studioCoordinatesSubtitle: 'Initialize Communication',
  studioCoordinatesDescription: "Looking to develop spatial 3D art, high-fidelity UI systems, or customized visual components? Let's initialize connection immediately.",
  aboutLocationLabel: 'Location',
  aboutLocationValue: 'Dhaka, Bangladesh',
  aboutTonguesLabel: 'Tongues',
  aboutTonguesValue: 'Bangla, English, Hindi, Urdu',
  credentialStationTitle: 'CREDENTIAL STATION',
  credentialStationSubtitle: 'Education & Software Armory',
  typewriterPhrases: ["Multimedia Designer", "UI/UX Designer", "3D Artist", "Creative Technologist"]
};
