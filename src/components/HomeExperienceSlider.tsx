import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Briefcase, 
  Calendar, 
  MapPin, 
  ChevronLeft, 
  ChevronRight, 
  Globe, 
  Sparkles,
  Cpu
} from 'lucide-react';
import { Experience } from '../types';

interface HomeExperienceSliderProps {
  experiences: Experience[];
  isDarkMode: boolean;
}

export default function HomeExperienceSlider({
  experiences,
  isDarkMode
}: HomeExperienceSliderProps) {
  // Sort experiences: Newest first!
  // Current jobs (isCurrent === true) come first, then sorted by startDate descending, then by createdAt descending.
  const sortedExperiences = useMemo(() => {
    return [...experiences].sort((a, b) => {
      // 1. Current jobs first
      if (a.isCurrent && !b.isCurrent) return -1;
      if (!a.isCurrent && b.isCurrent) return 1;

      // 2. Start date descending
      const dateA = a.startDate || '';
      const dateB = b.startDate || '';
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }

      // 3. Fallback to createdAt descending (ensures the absolute newest added is first!)
      const createdA = a.createdAt || '';
      const createdB = b.createdAt || '';
      return createdB.localeCompare(createdA);
    });
  }, [experiences]);

  const [activeIndex, setActiveIndex] = useState(0);

  // If a new experience is added, reset to the first index so the newest is displayed first immediately!
  const prevExperiencesLength = useRef(experiences.length);
  const prevFirstId = useRef<string | null>(sortedExperiences[0]?.id || null);

  useEffect(() => {
    const currentFirstId = sortedExperiences[0]?.id || null;
    if (experiences.length !== prevExperiencesLength.current || currentFirstId !== prevFirstId.current) {
      setActiveIndex(0);
      prevExperiencesLength.current = experiences.length;
      prevFirstId.current = currentFirstId;
    }
  }, [experiences, sortedExperiences]);

  // 8 Seconds Auto-slide transition loop
  useEffect(() => {
    if (sortedExperiences.length <= 1) return;

    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev === sortedExperiences.length - 1 ? 0 : prev + 1));
    }, 8000);

    return () => clearInterval(timer);
  }, [sortedExperiences.length, activeIndex]); // Recalculate or reset timer when activeIndex change occurs to give full 8s

  const handlePrev = () => {
    if (sortedExperiences.length <= 1) return;
    setActiveIndex((prev) => (prev === 0 ? sortedExperiences.length - 1 : prev - 1));
  };

  const handleNext = () => {
    if (sortedExperiences.length <= 1) return;
    setActiveIndex((prev) => (prev === sortedExperiences.length - 1 ? 0 : prev + 1));
  };

  if (sortedExperiences.length === 0) {
    return (
      <div className="text-center py-12 bg-white/[0.01] border border-white/5 rounded-3xl" id="home-experience-slider">
        <Briefcase className="w-8 h-8 text-white/20 mx-auto mb-2 animate-pulse" />
        <p className="text-xs text-white/40 font-mono">No experiences published yet.</p>
      </div>
    );
  }

  return (
    <section id="home-experience-slider" className="py-16 border-t border-white/5 overflow-hidden">
      {/* Header coordinates matching Sahl's layout */}
      <div className="flex justify-between items-end mb-10">
        <div>
          <span className="font-mono text-xs text-primary uppercase tracking-widest block mb-2">
            EXPERIENCE TRACK
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Professional <span className="text-secondary">Expedition</span>
          </h2>
        </div>
      </div>

      <div className="relative flex items-center">
        {/* Previous Button - Hidden on Mobile, Visible on MD+ */}
        {sortedExperiences.length > 1 && (
          <button 
            onClick={handlePrev}
            className="hidden md:flex absolute left-0 z-10 p-3 bg-black/60 border border-white/10 rounded-full hover:bg-secondary hover:text-black text-white transition-all shadow-lg hover:scale-105 items-center justify-center cursor-pointer"
            title="Previous Experience"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        {/* Carousel Container */}
        <div className={`w-full ${sortedExperiences.length > 1 ? 'px-0 md:px-16' : ''} min-h-[300px] flex items-center justify-center overflow-hidden`}>
          <AnimatePresence mode="wait">
            {sortedExperiences.map((exp, idx) => {
              if (idx !== activeIndex) return null;

              // Parse software armory
              let softwares: string[] = [];
              if (Array.isArray(exp.softwareUsed)) {
                softwares = exp.softwareUsed;
              } else if (typeof exp.softwareUsed === 'string' && exp.softwareUsed) {
                softwares = exp.softwareUsed.split(',').map(s => s.trim());
              }

              return (
                <motion.div
                  key={exp.id}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={(e, info) => {
                    // Touch swipe guestures for mobile
                    if (info.offset.x < -60) {
                      handleNext();
                    } else if (info.offset.x > 60) {
                      handlePrev();
                    }
                  }}
                  className="w-full bg-white/[0.01] hover:bg-white/[0.02] border border-white/5 p-6 sm:p-8 rounded-3xl touch-pan-y cursor-grab active:cursor-grabbing relative overflow-hidden transition-all duration-300 group"
                >
                  {/* Cosmic Accent Radial Glow */}
                  <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[60px] pointer-events-none group-hover:bg-primary/10 transition-all duration-500"></div>

                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 relative z-10">
                    <div className="space-y-4 flex-1">
                      {/* Company & Role */}
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <span className="text-[10px] font-mono tracking-widest bg-primary/10 text-primary border border-primary/20 px-2.5 py-0.5 rounded-full uppercase font-bold">
                            {exp.employmentType || 'Contract'}
                          </span>
                          {exp.isCurrent && (
                            <span className="text-[9px] font-mono tracking-wider bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full uppercase flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span> Active Station
                            </span>
                          )}
                        </div>

                        <h3 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-none">
                          {exp.title || exp.role}
                        </h3>

                        <p className="text-sm font-mono text-white/50 mt-1 flex items-center gap-2">
                          <span className="text-secondary font-bold text-sm">{exp.company}</span>
                          {exp.location && (
                            <span className="flex items-center gap-1 text-white/30 text-xs">
                              • <MapPin className="w-3.5 h-3.5 text-primary" /> {exp.location}
                            </span>
                          )}
                        </p>
                      </div>

                      {/* Responsibilities */}
                      <p className="text-white/70 text-sm leading-relaxed font-sans max-w-3xl">
                        {exp.description}
                      </p>

                      {/* Tool Armory Tags */}
                      {softwares.length > 0 && (
                        <div className="pt-2">
                          <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest block mb-2">Software Armory</span>
                          <div className="flex flex-wrap gap-1.5">
                            {softwares.map((sw) => (
                              <span 
                                key={sw}
                                className="text-[10px] font-mono bg-white/5 text-white/80 border border-white/10 px-2 py-1 rounded hover:border-primary/40 hover:text-primary transition-all cursor-default"
                              >
                                {sw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Timeline coordinates badge */}
                    <div className="lg:text-right flex lg:flex-col items-start lg:items-end justify-between lg:justify-start gap-4">
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 min-w-[160px] text-center lg:text-right">
                        <span className="text-[9px] font-mono text-white/40 uppercase block mb-1">Timeframe</span>
                        <span className="text-sm font-mono text-primary font-bold flex items-center justify-center lg:justify-end gap-1.5">
                          <Calendar className="w-4 h-4 text-secondary" /> 
                          {exp.startDate ? `${exp.startDate} - ${exp.isCurrent ? 'Present' : exp.endDate || 'N/A'}` : exp.duration}
                        </span>
                      </div>

                      {exp.website && (
                        <a
                          href={exp.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs font-mono text-white/40 hover:text-primary transition-all border border-white/10 hover:border-primary/20 bg-white/[0.02] px-3.5 py-2 rounded-xl"
                        >
                          <Globe className="w-3.5 h-3.5" /> Orbit Hub
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Indicator Index Dots */}
                  <div className="flex items-center justify-between mt-8 pt-4 border-t border-white/5 relative z-10 text-[10px] font-mono text-white/30 uppercase tracking-widest">
                    <span>
                      EXPEDITION {activeIndex + 1} of {sortedExperiences.length}
                    </span>

                    {/* Dot array indicator */}
                    <div className="flex items-center gap-1.5">
                      {sortedExperiences.map((_, dotIdx) => (
                        <button
                          key={dotIdx}
                          onClick={() => setActiveIndex(dotIdx)}
                          className={`w-1.5 h-1.5 rounded-full transition-all cursor-pointer ${
                            dotIdx === activeIndex ? 'bg-primary w-4' : 'bg-white/20 hover:bg-white/40'
                          }`}
                          title={`Navigate to slide ${dotIdx + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Next Button - Hidden on Mobile, Visible on MD+ */}
        {sortedExperiences.length > 1 && (
          <button 
            onClick={handleNext}
            className="hidden md:flex absolute right-0 z-10 p-3 bg-black/60 border border-white/10 rounded-full hover:bg-secondary hover:text-black text-white transition-all shadow-lg hover:scale-105 items-center justify-center cursor-pointer"
            title="Next Experience"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
    </section>
  );
}
