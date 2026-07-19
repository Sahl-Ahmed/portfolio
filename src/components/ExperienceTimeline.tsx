import { useState, useMemo } from 'react';
import { 
  Briefcase, 
  Calendar, 
  MapPin, 
  Link as LinkIcon, 
  Globe, 
  Layers, 
  Search, 
  Plus, 
  Trash2, 
  Edit3, 
  Copy, 
  GripVertical, 
  Sparkles,
  Check,
  X,
  Compass
} from 'lucide-react';
import { Experience } from '../types';

interface ExperienceTimelineProps {
  experiences: Experience[];
  isAdminLoggedIn: boolean;
  isDarkMode: boolean;
  onSave: (exp: Experience) => Promise<void>;
  onDelete: (id: string) => void; // Delegates to App's triggerDelete
  onDuplicate: (exp: Experience) => Promise<void>;
  onReorder: (reorderedList: Experience[]) => Promise<void>;
}

export default function ExperienceTimeline({
  experiences,
  isAdminLoggedIn,
  isDarkMode,
  onSave,
  onDelete,
  onDuplicate,
  onReorder
}: ExperienceTimelineProps) {
  // Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmpType, setSelectedEmpType] = useState('All');
  const [selectedSoftware, setSelectedSoftware] = useState('All');

  // Form Editing / Creation States
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Drag and Drop State
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Form Fields
  const [formTitle, setFormTitle] = useState('');
  const [formCompany, setFormCompany] = useState('');
  const [formEmploymentType, setFormEmploymentType] = useState('Full-time');
  const [formLocation, setFormLocation] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSoftwareUsed, setFormSoftwareUsed] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formIsCurrent, setFormIsCurrent] = useState(false);
  const [formWebsite, setFormWebsite] = useState('');

  // Handle Drag & Drop ordering
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // For Firefox compatibility
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const reordered = [...sortedExperiences];
    const [draggedItem] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, draggedItem);

    // Re-assign sortOrder
    const updated = reordered.map((exp, idx) => ({
      ...exp,
      sortOrder: idx
    }));

    setDraggedIndex(null);
    await onReorder(updated);
  };

  // Helper to open form for adding
  const openAddForm = () => {
    setFormTitle('');
    setFormCompany('');
    setFormEmploymentType('Full-time');
    setFormLocation('');
    setFormDescription('');
    setFormSoftwareUsed('');
    setFormStartDate('');
    setFormEndDate('');
    setFormIsCurrent(false);
    setFormWebsite('');
    setIsAdding(true);
    setEditingId(null);
  };

  // Helper to open form for editing
  const openEditForm = (exp: Experience) => {
    setFormTitle(exp.title || exp.role || '');
    setFormCompany(exp.company || '');
    setFormEmploymentType(exp.employmentType || 'Full-time');
    setFormLocation(exp.location || '');
    setFormDescription(exp.description || '');
    
    let softwares = '';
    if (Array.isArray(exp.softwareUsed)) {
      softwares = exp.softwareUsed.join(', ');
    } else if (typeof exp.softwareUsed === 'string') {
      softwares = exp.softwareUsed;
    }
    setFormSoftwareUsed(softwares);
    
    // Parse duration fallback if dates are not populated
    if (exp.startDate) {
      setFormStartDate(exp.startDate);
      setFormEndDate(exp.endDate || '');
      setFormIsCurrent(exp.isCurrent || false);
    } else {
      // Fallback from duration field if existing
      const dur = exp.duration || '';
      const parts = dur.split(' - ');
      setFormStartDate(parts[0] || '2024');
      const isCurr = parts[1] === 'Present';
      setFormIsCurrent(isCurr);
      setFormEndDate(isCurr ? '' : parts[1] || '');
    }
    
    setFormWebsite(exp.website || '');
    setEditingId(exp.id);
    setIsAdding(false);
  };

  // Handle Form Submit (Add or Edit)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formCompany.trim() || !formStartDate.trim()) return;

    const expId = editingId || `exp-${Date.now()}`;
    const durationStr = `${formStartDate} - ${formIsCurrent ? 'Present' : formEndDate || 'N/A'}`;

    const submission: Experience = {
      id: expId,
      title: formTitle.trim(),
      role: formTitle.trim(), // for backwards compatibility
      company: formCompany.trim(),
      employmentType: formEmploymentType,
      location: formLocation.trim() || undefined,
      description: formDescription.trim(),
      softwareUsed: formSoftwareUsed.trim() || undefined,
      startDate: formStartDate.trim(),
      endDate: formIsCurrent ? undefined : (formEndDate.trim() || undefined),
      isCurrent: formIsCurrent,
      duration: durationStr, // for backwards compatibility
      website: formWebsite.trim() || undefined,
      sortOrder: editingId 
        ? (experiences.find(x => x.id === editingId)?.sortOrder ?? experiences.length)
        : experiences.length,
      createdAt: editingId 
        ? (experiences.find(x => x.id === editingId)?.createdAt ?? new Date().toISOString())
        : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await onSave(submission);
    setIsAdding(false);
    setEditingId(null);
  };

  // Sort experiences based on admin ordering first, or fall back to startDate/createdAt
  const sortedExperiences = useMemo(() => {
    return [...experiences].sort((a, b) => {
      if (a.sortOrder !== undefined && b.sortOrder !== undefined) {
        return a.sortOrder - b.sortOrder;
      }
      // Fallback sorting
      const dateA = a.startDate || a.duration || '';
      const dateB = b.startDate || b.duration || '';
      return dateB.localeCompare(dateA);
    });
  }, [experiences]);

  // Extract all unique software tags for the software dropdown filter
  const allAvailableSoftwares = useMemo(() => {
    const set = new Set<string>();
    experiences.forEach(exp => {
      if (Array.isArray(exp.softwareUsed)) {
        exp.softwareUsed.forEach(s => set.add(s));
      } else if (typeof exp.softwareUsed === 'string' && exp.softwareUsed) {
        exp.softwareUsed.split(',').map(s => s.trim()).forEach(s => {
          if (s) set.add(s);
        });
      }
    });
    return Array.from(set).sort();
  }, [experiences]);

  // Filter experiences based on searchQuery, Selected Employment Type, and Selected Software
  const filteredExperiences = useMemo(() => {
    return sortedExperiences.filter(exp => {
      const q = searchQuery.toLowerCase().trim();
      const titleVal = (exp.title || exp.role || '').toLowerCase();
      const companyVal = (exp.company || '').toLowerCase();
      const descVal = (exp.description || '').toLowerCase();
      const locVal = (exp.location || '').toLowerCase();
      const typeVal = (exp.employmentType || '').toLowerCase();
      
      // Parse softwares
      let softwares: string[] = [];
      if (Array.isArray(exp.softwareUsed)) {
        softwares = exp.softwareUsed.map(s => s.toLowerCase());
      } else if (typeof exp.softwareUsed === 'string') {
        softwares = exp.softwareUsed.split(',').map(s => s.trim().toLowerCase());
      }

      // Check search query matches Company, Role, Software, Year/Duration, Location, Employment Type
      const matchesSearch = !q || 
        titleVal.includes(q) ||
        companyVal.includes(q) ||
        descVal.includes(q) ||
        locVal.includes(q) ||
        typeVal.includes(q) ||
        (exp.startDate && exp.startDate.includes(q)) ||
        (exp.endDate && exp.endDate.includes(q)) ||
        (exp.duration && exp.duration.toLowerCase().includes(q)) ||
        softwares.some(sw => sw.includes(q));

      // Match Employment Type
      const matchesEmpType = selectedEmpType === 'All' || exp.employmentType === selectedEmpType;

      // Match Software Filter
      const matchesSoftware = selectedSoftware === 'All' || softwares.includes(selectedSoftware.toLowerCase());

      return matchesSearch && matchesEmpType && matchesSoftware;
    });
  }, [sortedExperiences, searchQuery, selectedEmpType, selectedSoftware]);

  return (
    <div className="w-full mt-10" id="experience-section">
      {/* Visual Header Accent matching Sahl's layout */}
      <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4">
        <div>
          <span className="text-[10px] font-mono tracking-[0.25em] text-primary uppercase block mb-1">
            Timeline Coordinates
          </span>
          <h3 className="text-xl font-bold text-white font-mono flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-primary" /> Professional Experience
          </h3>
        </div>

        {/* Admin Action triggers */}
        {isAdminLoggedIn && !isAdding && !editingId && (
          <button
            onClick={openAddForm}
            className="flex items-center gap-1.5 bg-primary hover:opacity-90 text-black text-xs font-mono font-bold uppercase tracking-wider py-2 px-4 rounded-xl transition-all"
          >
            <Plus className="w-3.5 h-3.5" /> Add Experience
          </button>
        )}
      </div>

      {/* Admin Creating/Editing Inline Glassmorphism Form */}
      {(isAdding || editingId) && (
        <div className="mb-8 p-6 bg-[#070b13]/80 backdrop-blur-md rounded-2xl border border-primary/20 shadow-xl relative animate-fade-in z-20">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
            <h4 className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
              {editingId ? 'Modify Station Coordinates' : 'Initialize New Timeline Unit'}
            </h4>
            <button
              onClick={() => { setIsAdding(false); setEditingId(null); }}
              className="text-white/40 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-white/50 uppercase mb-1">Job Title / Role *</label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Lead UI & 3D Designer"
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-2 px-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-white/50 uppercase mb-1">Company / Organization *</label>
                <input
                  type="text"
                  required
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  placeholder="e.g. Aural Labs"
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-2 px-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-white/50 uppercase mb-1">Employment Type</label>
                <select
                  value={formEmploymentType}
                  onChange={(e) => setFormEmploymentType(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-2 px-3 text-sm focus:border-primary focus:outline-none"
                >
                  <option value="Full-time" className="bg-[#0c101b]">Full-time</option>
                  <option value="Part-time" className="bg-[#0c101b]">Part-time</option>
                  <option value="Freelance" className="bg-[#0c101b]">Freelance</option>
                  <option value="Contract" className="bg-[#0c101b]">Contract</option>
                  <option value="Internship" className="bg-[#0c101b]">Internship</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-white/50 uppercase mb-1">Location</label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="e.g. Dhaka, Bangladesh (Remote)"
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-2 px-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-white/50 uppercase mb-1">Website URL</label>
                <input
                  type="url"
                  value={formWebsite}
                  onChange={(e) => setFormWebsite(e.target.value)}
                  placeholder="https://company.com"
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-2 px-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div>
                <label className="block text-[10px] font-mono text-white/50 uppercase mb-1">Start Year / Date *</label>
                <input
                  type="text"
                  required
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  placeholder="e.g. 2024 or Jan 2024"
                  className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-2 px-3 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              {!formIsCurrent && (
                <div>
                  <label className="block text-[10px] font-mono text-white/50 uppercase mb-1">End Year / Date</label>
                  <input
                    type="text"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    placeholder="e.g. 2025 or Present"
                    className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-2 px-3 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  id="formIsCurrent"
                  checked={formIsCurrent}
                  onChange={(e) => setFormIsCurrent(e.target.checked)}
                  className="w-4 h-4 rounded border-white/10 bg-white/5 text-primary focus:ring-0 cursor-pointer"
                />
                <label htmlFor="formIsCurrent" className="text-xs font-mono text-white/70 select-none cursor-pointer">
                  Current employment
                </label>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-white/50 uppercase mb-1">Armory / Software Used (Comma separated)</label>
              <input
                type="text"
                value={formSoftwareUsed}
                onChange={(e) => setFormSoftwareUsed(e.target.value)}
                placeholder="Figma, Blender, Maya, Photoshop"
                className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-2 px-3 text-sm focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono text-white/50 uppercase mb-1">Responsibilities / Highlights *</label>
              <textarea
                required
                rows={3}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Describe your core contributions, designs, models and systems delivered..."
                className="w-full bg-white/5 border border-white/10 text-white rounded-xl py-2 px-3 text-xs focus:border-primary focus:outline-none font-sans"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/5">
              <button
                type="button"
                onClick={() => { setIsAdding(false); setEditingId(null); }}
                className="bg-white/5 hover:bg-white/10 text-white font-mono text-xs uppercase tracking-wider py-2 px-4 rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-primary hover:opacity-90 text-black font-mono font-bold text-xs uppercase tracking-wider py-2 px-4 rounded-xl transition-all"
              >
                Save Timeline Item
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dynamic Search & Filters Toolbar */}
      <div className="flex flex-col gap-3 mb-8">
        {/* Search Bar - Full Width */}
        <div className="relative w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search experience (role, company, armory, location, year...)"
            className="w-full bg-white/5 border border-white/10 hover:border-white/20 text-white placeholder-white/30 rounded-xl py-2.5 pl-10 pr-4 text-xs focus:border-primary focus:outline-none transition-all font-mono"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white text-[10px]"
            >
              Clear
            </button>
          )}
        </div>

        {/* Dropdowns row underneath */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Employment Type dropdown */}
          <div>
            <select
              value={selectedEmpType}
              onChange={(e) => setSelectedEmpType(e.target.value)}
              className="w-full bg-white/5 border border-white/10 hover:border-white/20 text-white rounded-xl py-2.5 px-3 text-xs focus:border-primary focus:outline-none font-mono cursor-pointer transition-all"
            >
              <option value="All" className="bg-[#0c101b]">All Contracts</option>
              <option value="Full-time" className="bg-[#0c101b]">Full-time</option>
              <option value="Part-time" className="bg-[#0c101b]">Part-time</option>
              <option value="Freelance" className="bg-[#0c101b]">Freelance</option>
              <option value="Contract" className="bg-[#0c101b]">Contract</option>
              <option value="Internship" className="bg-[#0c101b]">Internship</option>
            </select>
          </div>

          {/* Software Tool dropdown */}
          <div>
            <select
              value={selectedSoftware}
              onChange={(e) => setSelectedSoftware(e.target.value)}
              className="w-full bg-white/5 border border-white/10 hover:border-white/20 text-white rounded-xl py-2.5 px-3 text-xs focus:border-primary focus:outline-none font-mono cursor-pointer transition-all"
            >
              <option value="All" className="bg-[#0c101b]">All Software</option>
              {allAvailableSoftwares.map((sw) => (
                <option key={sw} value={sw} className="bg-[#0c101b]">{sw}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Timeline view */}
      {filteredExperiences.length === 0 ? (
        <div className="text-center py-10 bg-white/[0.02] border border-white/5 rounded-2xl">
          <Compass className="w-8 h-8 text-white/20 mx-auto mb-2 animate-spin" />
          <p className="text-xs text-white/40 font-mono">No coordinates found for selected coordinates filters.</p>
        </div>
      ) : (
        <div className="relative pl-6 md:pl-8 border-l border-white/5 space-y-8 py-2">
          {/* Timeline Node Connector Glow */}
          <div className="absolute top-0 bottom-0 left-0 w-[1px] bg-gradient-to-b from-primary/30 via-white/5 to-transparent"></div>

          {filteredExperiences.map((exp, idx) => {
            const indexInMaster = sortedExperiences.findIndex(x => x.id === exp.id);
            
            // Format software used correctly
            let softwares: string[] = [];
            if (Array.isArray(exp.softwareUsed)) {
              softwares = exp.softwareUsed;
            } else if (typeof exp.softwareUsed === 'string' && exp.softwareUsed) {
              softwares = exp.softwareUsed.split(',').map(s => s.trim());
            }

            return (
              <div 
                key={exp.id}
                draggable={isAdminLoggedIn && !editingId}
                onDragStart={(e) => handleDragStart(e, indexInMaster)}
                onDragOver={(e) => handleDragOver(e, indexInMaster)}
                onDrop={(e) => handleDrop(e, indexInMaster)}
                className={`relative group/item transition-all duration-300 ${draggedIndex === indexInMaster ? 'opacity-35 scale-95' : ''}`}
              >
                {/* Timeline Dot Indicator */}
                <span className="absolute -left-[31px] md:-left-[39px] top-1.5 w-3 h-3 rounded-full bg-[#0c101b] border-2 border-primary group-hover/item:scale-125 group-hover/item:bg-primary transition-all shadow-lg shadow-primary/20"></span>

                {/* Card Container */}
                <div className="p-5 md:p-6 bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 rounded-2xl backdrop-blur-md transition-all shadow-xl relative overflow-hidden">
                  
                  {/* Subtle Accent Glow */}
                  <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-[40px] pointer-events-none group-hover/item:bg-primary/10 transition-all"></div>

                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 relative z-10">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-white font-mono group-hover/item:text-primary transition-colors">
                          {exp.title || exp.role}
                        </h4>
                        <span className="text-[9px] font-mono bg-white/5 border border-white/10 text-white/60 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          {exp.employmentType || 'Contract'}
                        </span>
                      </div>

                      <div className="text-xs font-mono text-white/60 flex flex-wrap items-center gap-y-1 gap-x-3">
                        <span className="font-bold text-white">{exp.company}</span>
                        {exp.location && (
                          <span className="flex items-center gap-1 text-white/40 text-[11px]">
                            <MapPin className="w-3 h-3" /> {exp.location}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Duration Coordinates */}
                      <div className="text-right">
                        <span className="text-xs font-mono text-primary flex items-center gap-1 justify-end">
                          <Calendar className="w-3 h-3" /> {exp.startDate ? `${exp.startDate} - ${exp.isCurrent ? 'Present' : exp.endDate || 'N/A'}` : exp.duration}
                        </span>
                      </div>

                      {/* Drag Reorder Handle - Admin Only */}
                      {isAdminLoggedIn && !editingId && (
                        <div className="text-white/30 cursor-grab active:cursor-grabbing hover:text-white p-1 transition-colors" title="Drag to reorder">
                          <GripVertical className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Body description */}
                  <p className="mt-4 text-xs text-white/70 leading-relaxed font-sans font-normal border-t border-white/5 pt-4">
                    {exp.description}
                  </p>

                  {/* Footer section with software tags and URLs */}
                  <div className="mt-5 flex flex-wrap justify-between items-center gap-3 border-t border-white/5 pt-4 relative z-10">
                    
                    {/* Software armory used */}
                    <div className="flex flex-wrap gap-1.5">
                      {softwares.map((sw) => (
                        <span 
                          key={sw}
                          className="text-[9px] font-mono bg-white/5 text-white/80 border border-white/10 hover:border-primary/30 hover:text-primary px-2 py-0.5 rounded transition-all cursor-pointer"
                          onClick={() => setSelectedSoftware(sw === selectedSoftware ? 'All' : sw)}
                        >
                          {sw}
                        </span>
                      ))}
                    </div>

                    {/* Left/Right Actions (Duplicate/Edit/Delete/Link) */}
                    <div className="flex items-center gap-2.5">
                      {exp.website && (
                        <a 
                          href={exp.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white/40 hover:text-primary transition-colors p-1"
                          title="Open Company coordinates"
                        >
                          <Globe className="w-3.5 h-3.5" />
                        </a>
                      )}

                      {/* Admin CRUD actions */}
                      {isAdminLoggedIn && (
                        <div className="flex items-center gap-1.5 border-l border-white/10 pl-2.5 ml-1">
                          <button
                            onClick={() => onDuplicate(exp)}
                            className="text-white/40 hover:text-white transition-colors p-1"
                            title="Duplicate Node"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditForm(exp)}
                            className="text-white/40 hover:text-primary transition-colors p-1"
                            title="Edit Coordinates"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDelete(exp.id)}
                            className="text-white/40 hover:text-red-500 transition-colors p-1"
                            title="Decommission Node"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
