import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Sparkles, 
  Database, 
  Cpu, 
  Sliders, 
  RefreshCw, 
  Play, 
  Check, 
  AlertCircle,
  Settings,
  Flame,
  HelpCircle
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

interface AiSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioContext: any;
}

const DEFAULT_PROMPT = `You are Ask Sahl AI.
You represent Sahl Ahmed professionally.
Only answer using information available inside the Portfolio Knowledge Engine.
Never invent information.
Never guess.
Never hallucinate.
Never answer using public internet knowledge.
Always search the Portfolio Knowledge Engine first.
If information cannot be found, reply politely:
"I'm sorry, I couldn't find that information in Sahl Ahmed's portfolio. Would you like to know something else?"
Reply using the visitor's language.
Keep responses professional.`;

const DEFAULT_SETTINGS = {
  enabled: true,
  model: 'gemini-3.5-flash',
  temperature: 0.7,
  maxOutputTokens: 1000,
  topP: 0.95,
  topK: 40,
  systemPrompt: DEFAULT_PROMPT,
  aiProvider: 'auto',
  groqModel: 'llama-3.3-70b-versatile'
};

export default function AiSettingsModal({ isOpen, onClose, portfolioContext }: AiSettingsModalProps) {
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState('gemini-3.5-flash');
  const [temperature, setTemperature] = useState(0.7);
  const [maxOutputTokens, setMaxOutputTokens] = useState(1000);
  const [topP, setTopP] = useState(0.95);
  const [topK, setTopK] = useState(40);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [aiProvider, setAiProvider] = useState('auto');
  const [groqModel, setGroqModel] = useState('llama-3.3-70b-versatile');

  // Statuses
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Tester State
  const [testQuery, setTestQuery] = useState('What software do you use most?');
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const fetchConfig = async () => {
      setLoading(true);
      try {
        const configSnap = await getDoc(doc(db, 'settings', 'ai_config'));
        if (configSnap.exists()) {
          const data = configSnap.data();
          setEnabled(data.enabled !== undefined ? data.enabled : true);
          setModel(data.model || 'gemini-3.5-flash');
          setTemperature(data.temperature !== undefined ? data.temperature : 0.7);
          setMaxOutputTokens(data.maxOutputTokens || 1000);
          setTopP(data.topP !== undefined ? data.topP : 0.95);
          setTopK(data.topK || 40);
          setSystemPrompt(data.systemPrompt || DEFAULT_PROMPT);
          setAiProvider(data.aiProvider || 'auto');
          setGroqModel(data.groqModel || 'llama-3.3-70b-versatile');
        } else {
          // Initialize defaults
          await setDoc(doc(db, 'settings', 'ai_config'), DEFAULT_SETTINGS);
          setEnabled(true);
          setModel('gemini-3.5-flash');
          setTemperature(0.7);
          setMaxOutputTokens(1000);
          setTopP(0.95);
          setTopK(40);
          setSystemPrompt(DEFAULT_PROMPT);
          setAiProvider('auto');
          setGroqModel('llama-3.3-70b-versatile');
        }
      } catch (err) {
        console.error("Error loading AI settings from Firestore:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [isOpen]);

  const handleSave = async () => {
    setSaving(true);
    setSuccess(false);
    try {
      await setDoc(doc(db, 'settings', 'ai_config'), {
        enabled,
        model,
        temperature: Number(temperature),
        maxOutputTokens: Number(maxOutputTokens),
        topP: Number(topP),
        topK: Number(topK),
        systemPrompt,
        aiProvider,
        groqModel
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Error saving AI settings:", err);
      alert("Failed to save AI configuration. Please verify Firestore rules.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm("Are you sure you want to reset all AI settings to default values?")) {
      setEnabled(DEFAULT_SETTINGS.enabled);
      setModel(DEFAULT_SETTINGS.model);
      setTemperature(DEFAULT_SETTINGS.temperature);
      setMaxOutputTokens(DEFAULT_SETTINGS.maxOutputTokens);
      setTopP(DEFAULT_SETTINGS.topP);
      setTopK(DEFAULT_SETTINGS.topK);
      setSystemPrompt(DEFAULT_SETTINGS.systemPrompt);
      setAiProvider(DEFAULT_SETTINGS.aiProvider);
      setGroqModel(DEFAULT_SETTINGS.groqModel);
    }
  };

  const handleTestAI = async () => {
    if (!testQuery.trim()) return;
    setTesting(true);
    setTestResult(null);

    // Create temporary session ID for the test
    const testSessionId = "test_admin_session_" + Date.now();

    try {
      // First initialize session
      await fetch('/api/session/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: testSessionId })
      });

      // Submit message
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: testQuery,
          sessionId: testSessionId,
          context: portfolioContext
        })
      });

      if (!response.ok) {
        throw new Error("Failed to process chat message");
      }

      const data = await response.json();
      setTestResult(data);
    } catch (err: any) {
      console.error("Error testing AI assistant:", err);
      setTestResult({
        error: true,
        text: `Error: ${err.message || "Unknown error occurred. Please make sure the dev server is fully up and running."}`
      });
    } finally {
      setTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[9999] flex items-center justify-center p-4 overflow-y-auto">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="bg-[#0b0f19] border border-white/10 rounded-3xl w-full max-w-4xl shadow-2xl relative text-white flex flex-col max-h-[90vh] font-sans"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-white/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center border border-white/10">
                <Settings className="w-5 h-5 text-black" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-mono tracking-tight uppercase">AI Settings Panel</h3>
                <p className="text-[11px] text-white/50 font-mono">Configure & refine Ask Sahl AI assistant</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-white/60">
                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                <span className="text-xs font-mono">Loading configurations from Firestore...</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Form: Settings */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Enable/Disable AI Toggle */}
                  <div className="bg-white/5 border border-white/5 p-4 rounded-2xl flex items-center justify-between gap-4">
                    <div>
                      <h4 className="text-xs font-bold font-mono tracking-wider uppercase">Enable AI Assistant</h4>
                      <p className="text-[10px] text-white/40 mt-1">When disabled, visitors will be politely notified Sahl is offline.</p>
                    </div>
                    <button
                      onClick={() => setEnabled(!enabled)}
                      className={`relative w-12 h-6 rounded-full transition-all flex items-center p-0.5 cursor-pointer select-none ${
                        enabled ? 'bg-primary' : 'bg-white/10'
                      }`}
                    >
                      <motion.div 
                        layout 
                        className={`w-5 h-5 rounded-full shadow bg-black transition-all ${
                          enabled ? 'ml-6 bg-black' : 'ml-0 bg-white/40'
                        }`} 
                      />
                    </button>
                  </div>

                  {/* Settings Grid */}
                  <div className="space-y-4">
                    {/* AI Provider Selection */}
                    <div>
                      <label className="block text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1.5 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-primary" /> AI Provider Options
                      </label>
                      <select 
                        value={aiProvider} 
                        onChange={(e) => setAiProvider(e.target.value)}
                        className="w-full bg-[#111625] border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-primary focus:outline-none"
                      >
                        <option value="auto">Auto (Deterministic Cache ➔ Groq ➔ Gemini Fallback)</option>
                        <option value="groq">Groq Only</option>
                        <option value="gemini">Gemini Only</option>
                      </select>
                      <p className="text-[9px] text-white/40 mt-1">
                        {aiProvider === 'auto' && "AUTO Mode: 1. Search Portfolio Engine. 2. Return exact answers directly. 3. Call Groq. 4. Fallback/Retry Gemini on any Groq error."}
                        {aiProvider === 'groq' && "GROQ Mode: Route reasoning requests directly and only to Groq."}
                        {aiProvider === 'gemini' && "GEMINI Mode: Route reasoning requests directly and only to Google Gemini."}
                      </p>
                    </div>

                    {/* Groq Settings */}
                    {['auto', 'groq'].includes(aiProvider) && (
                      <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
                        <div className="text-[10px] font-bold font-mono uppercase tracking-wider text-primary/80">Groq Provider Settings</div>
                        <div>
                          <label className="block text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1 flex items-center gap-1">
                            <Cpu className="w-3 h-3 text-primary" /> Groq Model
                          </label>
                          <select 
                            value={groqModel} 
                            onChange={(e) => setGroqModel(e.target.value)}
                            className="w-full bg-[#111625] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                          >
                            <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile (Default / Rich reasoning)</option>
                            <option value="llama-3.1-8b-instant">llama-3.1-8b-instant (Fast response)</option>
                            <option value="mixtral-8x7b-32768">mixtral-8x7b-32768 (High context MOE)</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-mono uppercase tracking-wider text-white/30 mb-1">
                            Or Custom Groq Model Identifier
                          </label>
                          <input 
                            type="text" 
                            value={groqModel}
                            onChange={(e) => setGroqModel(e.target.value)}
                            placeholder="e.g. llama-3.3-70b-specdec"
                            className="w-full bg-[#111625] border border-white/10 rounded-xl px-3 py-1.5 text-xs font-mono focus:border-primary focus:outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* Gemini Settings */}
                    {['auto', 'gemini'].includes(aiProvider) && (
                      <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-3">
                        <div className="text-[10px] font-bold font-mono uppercase tracking-wider text-primary/80">Gemini Provider Settings</div>
                        <div>
                          <label className="block text-[10px] font-mono uppercase tracking-wider text-white/40 mb-1 flex items-center gap-1">
                            <Cpu className="w-3 h-3 text-primary" /> Gemini Model Selection
                          </label>
                          <select 
                            value={model} 
                            onChange={(e) => setModel(e.target.value)}
                            className="w-full bg-[#111625] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                          >
                            <option value="gemini-3.5-flash">gemini-3.5-flash (Standard & Fast)</option>
                            <option value="gemini-flash-latest">gemini-flash-latest (Lightweight)</option>
                            <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra Fast & Light)</option>
                            <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Advanced Reasoning)</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Temperature Slider */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[11px] font-mono uppercase tracking-wider text-white/50 flex items-center gap-1.5">
                          <Flame className="w-3.5 h-3.5 text-primary" /> Temperature: <span className="text-primary font-bold font-mono">{temperature}</span>
                        </label>
                        <span className="text-[9px] text-white/30 font-mono">Creative (1.0) vs Balanced (0.0)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input 
                          type="range" 
                          min="0" 
                          max="1.0" 
                          step="0.1" 
                          value={temperature} 
                          onChange={(e) => setTemperature(parseFloat(e.target.value))}
                          className="flex-1 accent-primary bg-white/5 h-1.5 rounded-full cursor-pointer"
                        />
                        <input 
                          type="number" 
                          min="0" 
                          max="1.0" 
                          step="0.1" 
                          value={temperature} 
                          onChange={(e) => setTemperature(parseFloat(e.target.value))}
                          className="w-16 bg-[#111625] border border-white/10 rounded-lg px-2 py-1 text-center text-xs font-mono"
                        />
                      </div>
                    </div>

                    {/* Max Tokens & Parameters Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1.5">
                          Max Tokens
                        </label>
                        <input 
                          type="number" 
                          value={maxOutputTokens} 
                          onChange={(e) => setMaxOutputTokens(parseInt(e.target.value) || 100)}
                          className="w-full bg-[#111625] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1.5">
                          Top P
                        </label>
                        <input 
                          type="number" 
                          min="0" 
                          max="1.0" 
                          step="0.01" 
                          value={topP} 
                          onChange={(e) => setTopP(parseFloat(e.target.value) || 0.95)}
                          className="w-full bg-[#111625] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1.5">
                          Top K
                        </label>
                        <input 
                          type="number" 
                          min="1" 
                          max="100" 
                          value={topK} 
                          onChange={(e) => setTopK(parseInt(e.target.value) || 40)}
                          className="w-full bg-[#111625] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Editable System Prompt */}
                    <div>
                      <label className="block text-[11px] font-mono uppercase tracking-wider text-white/50 mb-1.5 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-primary" /> Editable System Prompt
                      </label>
                      <textarea 
                        value={systemPrompt} 
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        rows={8}
                        className="w-full bg-[#111625] border border-white/10 rounded-xl p-3.5 text-[11px] font-mono focus:border-primary focus:outline-none resize-y leading-relaxed custom-scrollbar"
                        placeholder="Define how the AI represents Sahl, responds, and bounds limits..."
                      />
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <button 
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-primary text-black px-6 py-2.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wider hover:opacity-95 active:scale-95 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      {saving ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" /> Saving...
                        </>
                      ) : success ? (
                        <>
                          <Check className="w-4 h-4" /> Saved!
                        </>
                      ) : (
                        "Save Configurations"
                      )}
                    </button>
                    <button 
                      onClick={handleReset}
                      type="button"
                      className="bg-white/5 border border-white/10 text-white hover:bg-white/10 px-5 py-2.5 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Reset Defaults
                    </button>
                  </div>
                </div>

                {/* Right Form: Live AI Assistant Tester */}
                <div className="lg:col-span-5 bg-white/5 border border-white/5 p-5 rounded-2xl flex flex-col h-full min-h-[420px]">
                  <div className="flex items-center justify-between border-b border-white/5 pb-3 mb-4">
                    <h4 className="text-xs font-bold font-mono tracking-wider uppercase flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-primary animate-pulse" /> Test AI Console
                    </h4>
                    <span className="text-[9px] text-white/30 font-mono uppercase tracking-wider">Interactive Playground</span>
                  </div>

                  <p className="text-[10px] text-white/40 mb-4 leading-normal">
                    Enter any query below to test response generation, routing, and language styling. The test will clearly indicate if the response is returned from <strong>Firestore Cache (Deterministic / Offline)</strong> or <strong>Google Gemini (Active AI Reasoning)</strong>.
                  </p>

                  {/* Input form */}
                  <div className="space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={testQuery}
                          onChange={(e) => setTestQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleTestAI()}
                          placeholder="e.g. What is Sahl's WhatsApp?"
                          className="flex-1 bg-[#111625] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono focus:border-primary focus:outline-none"
                        />
                        <button 
                          onClick={handleTestAI}
                          disabled={testing || !testQuery.trim()}
                          className="bg-primary hover:opacity-95 text-black p-2.5 rounded-xl font-mono text-xs flex items-center justify-center active:scale-95 disabled:opacity-50 cursor-pointer"
                          title="Run Test"
                        >
                          {testing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-black" />}
                        </button>
                      </div>

                      {/* Display Output */}
                      <div className="bg-[#080b12] border border-white/5 rounded-xl p-4 min-h-[200px] max-h-[300px] overflow-y-auto text-xs font-mono custom-scrollbar leading-relaxed">
                        {testing ? (
                          <div className="flex flex-col items-center justify-center py-12 gap-2 text-white/40">
                            <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                            <span>Processing testing payload...</span>
                          </div>
                        ) : testResult ? (
                          <div className="space-y-3">
                            {/* Source metadata badge */}
                            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                              <span className="text-[9px] text-white/40 uppercase">Resolution Source:</span>
                              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                                testResult.source === 'cache' 
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                  : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                              }`}>
                                {testResult.source === 'cache' ? '⚡ Firestore Cache' : '🤖 Google Gemini'}
                              </span>
                            </div>

                            {/* Response content */}
                            <div className="whitespace-pre-line text-white/90">
                              {testResult.text}
                            </div>

                            {/* Suggestion Chips */}
                            {testResult.suggestions && testResult.suggestions.length > 0 && (
                              <div className="pt-2 border-t border-white/5 space-y-1.5">
                                <div className="text-[9px] text-white/40 uppercase">Generated Chips:</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {testResult.suggestions.map((chip: string, idx: number) => (
                                    <span 
                                      key={idx} 
                                      className="bg-white/5 border border-white/5 text-[9px] px-2 py-1 rounded-md text-white/70"
                                    >
                                      {chip}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12 text-white/30 gap-1.5">
                            <AlertCircle className="w-5 h-5 text-white/20" />
                            <span>Test results will render here</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-white/40">
                        <Database className="w-3.5 h-3.5" />
                        <span>Connected to: Sahl's Knowledge Engine</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
