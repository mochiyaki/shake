import React, { useState, useEffect, useRef } from 'react';
import { MATERIALS, TECHNIQUES, HouseConfig, SimulationMetrics, MaterialType, SeismicTechnique, Message } from './types';
import EarthquakeSimulator from './components/EarthquakeSimulator';
import { generateDraftRepairEstimation } from './utils/draftEstimator';
import { 
  Building2, 
  Sparkles, 
  Send, 
  HelpCircle, 
  Wrench, 
  ShieldCheck, 
  Coins, 
  Info, 
  Play, 
  Activity, 
  ChevronRight, 
  Layers, 
  CheckCircle2, 
  Flame, 
  RotateCcw,
  User,
  Bot,
  Search,
  Loader2,
  ExternalLink,
  AlertTriangle,
  FileText
} from 'lucide-react';

export default function App() {
  // 1. Structural Configuration State
  const [config, setConfig] = useState<HouseConfig>({
    material: 'concrete',
    stories: 3,
    techniques: [],
    magnitude: 7.2
  });

  // 2. Active shaking trigger
  const [isShaking, setIsShaking] = useState<boolean>(false);

  // 3. Live and Finished metrics
  const [liveMetrics, setLiveMetrics] = useState<SimulationMetrics>({
    maxSway: 0,
    maxShear: 0,
    stressPct: 0,
    collapsed: false,
    collapseReason: '',
    frequencies: [1.5, 0.8]
  });

  // 4. Financial Damage Calculations
  const [estCost, setEstCost] = useState<{ buildCost: number; damageCost: number }>({
    buildCost: 180,
    damageCost: 0
  });

  // 5. Chat & Advisor States
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I am **Sentinel**, your Seismic Structural AI Advisor. 🏢💥\n\nI have loaded your 3D test house. Let's design something that can withstand heavy earthquakes!\n\n**To get started:**\n1. Select a construction material (e.g., *Structural Steel* or *Bamboo*).\n2. Toggle seismic engineering techniques like **Base Isolation** or **Tuned Mass Dampers**.\n3. Adjust the **Earthquake Magnitude** slider.\n4. Click **▶ TRIGGER SEISMIC WAVE** to observe physical stress propagation in real-time.\n\n*How can I help you configure or reinforce this structure today?*",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // 6. Seismic Repair Research States
  const [activeTab, setActiveTab] = useState<'advisor' | 'research'>('advisor');
  const [researchResult, setResearchResult] = useState<any | null>(null);
  const [isResearching, setIsResearching] = useState<boolean>(false);
  const [researchError, setResearchError] = useState<string | null>(null);

  // Compute active repair data (using draft estimation if live results aren't loaded yet)
  const activeRepairData = researchResult || (liveMetrics.stressPct > 0 ? generateDraftRepairEstimation(config, liveMetrics, estCost.damageCost) : null);

  const triggerRepairResearch = async () => {
    setIsResearching(true);
    setResearchError(null);
    setActiveTab('research');
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          material: MATERIALS[config.material].name,
          stories: config.stories,
          techniques: config.techniques.map(t => TECHNIQUES[t].name),
          magnitude: config.magnitude,
          stressPct: liveMetrics.stressPct,
          collapsed: liveMetrics.collapsed,
          collapseReason: liveMetrics.collapseReason,
          damageCost: estCost.damageCost,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setResearchResult(data);
      } else {
        throw new Error(data.error || "Failed to compile repair list.");
      }
    } catch (err: any) {
      console.error(err);
      setResearchError(err.message || "Failed to connect to the repair research agent. Verify your Gemini API key in Settings > Secrets.");
    } finally {
      setIsResearching(false);
    }
  };

  // Clear research when config changes or new shake starts
  useEffect(() => {
    setResearchResult(null);
    setResearchError(null);
  }, [config, isShaking]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isGenerating]);

  // Recalculate construction costs dynamically
  useEffect(() => {
    const materialObj = MATERIALS[config.material];
    // Base floor cost: Wood/Bamboo ($40k/floor), Brick ($50k/floor), Concrete ($65k/floor), Steel ($85k/floor), SMA ($150k/floor)
    let floorUnitCost = 55;
    if (config.material === 'bamboo') floorUnitCost = 25;
    else if (config.material === 'timber') floorUnitCost = 40;
    else if (config.material === 'masonry') floorUnitCost = 35;
    else if (config.material === 'steel') floorUnitCost = 85;
    else if (config.material === 'sma') floorUnitCost = 160;

    let totalBuild = floorUnitCost * config.stories;

    // Add technique surcharges
    config.techniques.forEach((t) => {
      if (t === 'bracing') totalBuild += 15;
      if (t === 'walls') totalBuild += 25;
      if (t === 'isolation') totalBuild += 55;
      if (t === 'damper') totalBuild += 45;
    });

    // Calculate simulated damage based on stress & structural metrics
    let damageFactor = 0;
    if (liveMetrics.collapsed) {
      damageFactor = 1.0; // 100% loss
    } else {
      // Scale damage with peak stress
      damageFactor = Math.pow(liveMetrics.stressPct / 100, 2) * 0.75;
    }

    const totalDamage = Math.round(totalBuild * damageFactor);

    setEstCost({
      buildCost: totalBuild,
      damageCost: totalDamage
    });
  }, [config, liveMetrics.collapsed, liveMetrics.stressPct]);

  // Handle Simulation End Event
  const handleSimulationFinished = (metrics: SimulationMetrics) => {
    setLiveMetrics(metrics);
    // Automatic AI analysis disabled per user request to prevent automatic error alerts when API keys are not loaded
  };

  // Secure Server-side API Communication with Gemini
  const triggerAIChat = async (userPrompt: string, isSilentSystemPrompt = false) => {
    if (isGenerating) return;

    // Append to messages visible to user only if NOT a system-triggered automatic background analysis
    let updatedMessages = [...messages];
    if (!isSilentSystemPrompt) {
      const userMsg: Message = {
        id: Math.random().toString(),
        role: 'user',
        content: userPrompt,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      updatedMessages = [...messages, userMsg];
      setMessages(updatedMessages);
    }

    setIsGenerating(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: updatedMessages,
          houseConfig: {
            material: MATERIALS[config.material].name,
            elasticity: MATERIALS[config.material].stiffness,
            ductility: MATERIALS[config.material].ductility,
            stories: config.stories,
            techniques: config.techniques.map(t => TECHNIQUES[t].name),
            magnitude: config.magnitude,
            outcome: liveMetrics.collapsed ? `Collapsed (${liveMetrics.collapseReason})` : `Survived (Stress: ${liveMetrics.stressPct}%)`
          }
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.content) {
        setMessages((prev) => [
          ...prev,
          {
            id: Math.random().toString(),
            role: 'assistant',
            content: data.content,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      } else {
        throw new Error(data.error || "Communication failure");
      }
    } catch (err: any) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          role: 'assistant',
          content: `⚠️ **Error:** ${err.message || "I encountered an issue analyzing your simulation. Please verify that your server is running and the Gemini API key is valid."}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const msg = inputMessage;
    setInputMessage('');
    triggerAIChat(msg);
  };

  // Toggle techniques helpers
  const handleToggleTechnique = (tech: SeismicTechnique) => {
    setConfig(prev => {
      const alreadyHas = prev.techniques.includes(tech);
      if (alreadyHas) {
        return { ...prev, techniques: prev.techniques.filter(t => t !== tech) };
      } else {
        return { ...prev, techniques: [...prev.techniques, tech] };
      }
    });
  };

  // Helper preset questions for education
  const presetQuestions = [
    { text: "Why is Unreinforced Masonry dangerous?", icon: "🧱" },
    { text: "How does Base Isolation act as a low-pass filter?", icon: "🩺" },
    { text: "What is resonance in multi-story skyscrapers?", icon: "🏙️" },
    { text: "Can wood/bamboo survive massive earthquakes?", icon: "🎋" }
  ];

  return (
    <div id="app-container" className="w-full min-h-screen bg-[#070a13] text-slate-100 font-sans p-4 md:p-6 flex flex-col gap-5 overflow-x-hidden">
      
      {/* Bento Header */}
      <header id="app-header" className="flex flex-col sm:flex-row justify-between items-center bg-[#0d1321] border border-slate-800 p-4 rounded-2xl gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-900/30">
            <Activity className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">QUAKE-SIM <span className="text-indigo-400">v4.0</span></h1>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Interactive 3D Seismic Resilience Modeling</p>
          </div>
        </div>
        
        <div className="flex gap-6 items-center w-full sm:w-auto justify-between sm:justify-end">
          <div className="text-left sm:text-right">
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Current Simulation Status</p>
            <p className={`text-xs font-mono font-bold tracking-wide ${isShaking ? 'text-red-400 animate-pulse' : 'text-emerald-400'}`}>
              {isShaking ? '⚠️ EARTHQUAKE SIMULATION IN PROGRESS' : '● STABLE: READY FOR TESTING'}
            </p>
          </div>
          <div className="hidden sm:block h-10 w-px bg-slate-800" />
          <button 
            id="reset-state-btn"
            onClick={() => {
              setConfig({ material: 'concrete', stories: 3, techniques: [], magnitude: 7.2 });
              setIsShaking(false);
              setLiveMetrics({ maxSway: 0, maxShear: 0, stressPct: 0, collapsed: false, collapseReason: '', frequencies: [1.5, 0.8] });
            }}
            className="flex items-center gap-1 bg-[#1a2035] hover:bg-[#252d4a] text-slate-300 hover:text-white px-4 py-2 rounded-xl text-xs font-semibold transition-colors border border-slate-800 cursor-pointer"
          >
            <RotateCcw className="h-3.. w-3" />
            <span>Reset Demo</span>
          </button>
        </div>
      </header>

      {/* Bento Main Layout Grid */}
      <main id="app-bento-grid" className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-5">
        
        {/* Left Column: 3D Chamber Viewport (Spans 8 cols on desktop) */}
        <section id="simulator-viewport-section" className="col-span-1 md:col-span-8 flex flex-col gap-5">
          
          <div className="flex-1 h-[420px] md:h-auto min-h-[380px]">
            <EarthquakeSimulator 
              config={config} 
              onSimulationFinished={handleSimulationFinished}
              isShaking={isShaking}
              setIsShaking={setIsShaking}
            />
          </div>

          {/* Controls Bento Cell: Material, Stories, Magnitude controls */}
          <div id="controls-bento-cell" className="bg-[#0d1321] border border-slate-800 rounded-3xl p-5 space-y-5">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-indigo-400" />
                <h2 className="font-sans font-bold text-slate-200 text-sm">Seismic Design Controls</h2>
              </div>
              <span className="text-[10px] text-indigo-400 font-mono">Bento Lab Space</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">
              {/* Material Dropdown Cards (6 cols) */}
              <div className="sm:col-span-7 space-y-3">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  1. Core Structural Material
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.values(MATERIALS).map((mat) => {
                    const isSelected = config.material === mat.id;
                    return (
                      <button
                        key={mat.id}
                        onClick={() => setConfig(prev => ({ ...prev, material: mat.id }))}
                        className={`text-left p-3 rounded-xl transition-all border duration-150 flex flex-col justify-between h-[90px] relative overflow-hidden group cursor-pointer ${
                          isSelected 
                            ? 'bg-indigo-950/45 border-indigo-500/70 shadow-lg shadow-indigo-950/50' 
                            : 'bg-[#090d16] hover:bg-slate-900 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span 
                              className="w-2.5 h-2.5 rounded-full" 
                              style={{ backgroundColor: mat.color }} 
                            />
                            <p className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                              {mat.name.split(' (')[0]}
                            </p>
                          </div>
                          <p className="text-[9px] text-slate-400 mt-1 leading-tight line-clamp-2">
                            {mat.description}
                          </p>
                        </div>
                        <div className="flex justify-between items-center text-[8px] font-mono mt-1 pt-1 border-t border-slate-800/40 w-full text-slate-500">
                          <span>Cost: <b className="text-slate-300">{mat.cost}</b></span>
                          <span>Ductility: <b className="text-slate-300">{Math.round(mat.ductility * 100)}%</b></span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Stories & S-Wave Magnitude controls (5 cols) */}
              <div className="sm:col-span-5 space-y-5">
                {/* Stories level */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-indigo-400" />
                      2. Building Height
                    </label>
                    <span className="text-xs font-mono font-bold bg-indigo-950 text-indigo-300 px-2.5 py-0.5 rounded border border-indigo-900">
                      {config.stories} Stories
                    </span>
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        onClick={() => setConfig(prev => ({ ...prev, stories: s }))}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border cursor-pointer ${
                          config.stories === s 
                            ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-900/30' 
                            : 'bg-[#090d16] hover:bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        {s}F
                      </button>
                    ))}
                  </div>
                </div>

                {/* Magnitude Intensity Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Flame className="h-3.5 w-3.5 text-red-400" />
                      3. Earthquake Magnitude
                    </label>
                    <span className="text-xs font-mono font-bold text-red-400 bg-red-950/40 border border-red-900/60 px-2.5 py-0.5 rounded">
                      M {config.magnitude.toFixed(1)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <input 
                      type="range" 
                      min="1.0" 
                      max="10.0" 
                      step="0.1" 
                      value={config.magnitude}
                      onChange={(e) => setConfig(prev => ({ ...prev, magnitude: parseFloat(e.target.value) }))}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-red-500"
                    />
                    <div className="flex justify-between text-[8px] font-mono text-slate-500">
                      <span>M1.0 (Micro)</span>
                      <span>M5.0 (Moderate)</span>
                      <span>M7.0 (Major)</span>
                      <span>M10.0 (Extreme)</span>
                    </div>
                  </div>
                </div>

                {/* Trigger Button */}
                <button
                  onClick={() => setIsShaking(true)}
                  disabled={isShaking}
                  className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    isShaking 
                      ? 'bg-red-900/30 text-red-500 border border-red-900/50 cursor-not-allowed'
                      : 'bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white shadow-lg shadow-red-950/40 border border-red-500/30'
                  }`}
                >
                  <Play className={`h-4 w-4 fill-white ${isShaking ? 'animate-ping' : ''}`} />
                  <span>{isShaking ? 'SHAKING GROUND ACTIVE...' : 'TRIGGER SEISMIC WAVE'}</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: AI Consultant & Protective Techniques Bento */}
        <section id="ai-consult-and-techniques-section" className="col-span-1 md:col-span-4 flex flex-col gap-5">
          
          {/* Tabbed AI Sentinel Chat & Repair Agent (Bento Card) */}
          <div id="ai-advisor-card" className="bg-[#0b0f1a] border border-indigo-500/20 rounded-3xl flex flex-col h-[520px] shadow-2xl relative overflow-hidden">
            
            {/* Tab selection header */}
            <div className="flex border-b border-indigo-500/20 bg-indigo-950/20 shrink-0">
              <button 
                onClick={() => setActiveTab('advisor')}
                className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 border-r border-indigo-500/10 cursor-pointer transition-all ${
                  activeTab === 'advisor' 
                    ? 'bg-[#0d1321] text-indigo-300 border-b-2 border-b-indigo-500' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                }`}
              >
                <Bot className="h-3.5 w-3.5" />
                <span>Sentinel Chat</span>
              </button>
              <button 
                onClick={() => setActiveTab('research')}
                className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all relative ${
                  activeTab === 'research' 
                    ? 'bg-[#0d1321] text-indigo-300 border-b-2 border-b-indigo-500' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                }`}
              >
                <Search className="h-3.5 w-3.5" />
                <span>Repair Agent</span>
                {liveMetrics.stressPct > 0 && !researchResult && (
                  <span className="absolute top-3.5 right-4 w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
                )}
              </button>
            </div>

            {/* Tab 1: Sentinel Advisor Chat */}
            {activeTab === 'advisor' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Advisor Header */}
                <div className="p-3 border-b border-indigo-500/10 flex items-center justify-between bg-indigo-950/10 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold shadow-md shadow-indigo-900/40">
                      <Bot className="h-3 w-3 text-white" />
                    </div>
                    <p className="text-xs font-bold text-slate-300">AI Design Consultant</p>
                  </div>
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                </div>

                {/* Chat History Area */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                  {messages.map((m) => {
                    const isAI = m.role === 'assistant';
                    return (
                      <div 
                        key={m.id} 
                        className={`flex gap-2 max-w-[90%] ${isAI ? 'self-start' : 'self-end ml-auto flex-row-reverse'}`}
                      >
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                          isAI ? 'bg-indigo-950 border border-indigo-800 text-indigo-400' : 'bg-slate-800 text-slate-200'
                        }`}>
                          {isAI ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                        </div>

                        <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                          isAI 
                            ? 'bg-slate-900/90 border border-slate-800 text-slate-300 rounded-tl-none prose prose-invert max-w-full' 
                            : 'bg-indigo-600 text-white rounded-tr-none'
                        }`}>
                          {m.content.split('\n').map((para, idx) => {
                            let formatted = para;
                            formatted = formatted.replace(/\*\*(.*?)\*\*/g, '$1');
                            formatted = formatted.replace(/\*(.*?)\*/g, '$1');
                            return <p key={idx} className={idx > 0 ? 'mt-2' : ''}>{formatted}</p>;
                          })}
                          <span className="block text-[8px] text-slate-500 mt-1.5 text-right font-mono">
                            {m.timestamp}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {isGenerating && (
                    <div className="flex gap-2 max-w-[80%] self-start items-center">
                      <div className="w-6 h-6 rounded-full bg-indigo-950 border border-indigo-800 text-indigo-400 flex items-center justify-center shrink-0">
                        <Bot className="h-3 w-3 animate-spin" />
                      </div>
                      <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-2xl rounded-tl-none text-xs text-indigo-300 flex items-center gap-1.5">
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" />
                        </span>
                        <span>Sentinel is analyzing design stress...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Quick Presets Carousel */}
                <div className="px-3 py-1.5 border-t border-slate-800/40 bg-[#090d16] overflow-x-auto whitespace-nowrap flex gap-1.5 shrink-0 scrollbar-none">
                  {presetQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => triggerAIChat(q.text)}
                      className="bg-[#121929] hover:bg-indigo-950 hover:text-indigo-300 transition-colors border border-slate-800 hover:border-indigo-900 text-slate-400 text-[10px] px-2.5 py-1 rounded-lg inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>{q.icon}</span>
                      <span>{q.text}</span>
                    </button>
                  ))}
                </div>

                {/* Chat input form */}
                <form onSubmit={handleSendMessage} className="p-3 bg-slate-950 flex gap-2 border-t border-slate-800 shrink-0">
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Ask Sentinel structural advice..."
                    className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl p-2.5 transition-colors cursor-pointer"
                    title="Send to Advisor"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>
            )}

            {/* Tab 2: Seismic Repair Procurement Research Agent */}
            {activeTab === 'research' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {isResearching ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 bg-slate-950/40">
                    <Loader2 className="h-10 w-10 text-indigo-400 animate-spin" />
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-slate-200">Seismic Repair Agent Active</p>
                      <p className="text-xs text-indigo-300 animate-pulse leading-relaxed">Scraping real-world construction prices & verified suppliers...</p>
                    </div>
                    <div className="w-48 h-1 bg-slate-800 rounded-full overflow-hidden relative">
                      <div className="h-full bg-indigo-500 rounded-full animate-pulse" style={{ width: '70%' }} />
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">Querying Home Depot, McMaster-Carr, Grainger, Specialty Seismic Vendors</span>
                  </div>
                ) : researchError ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
                    <AlertTriangle className="h-10 w-10 text-red-400" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-200">Research Failed</p>
                      <p className="text-[11px] text-red-400 leading-normal max-w-xs">{researchError}</p>
                    </div>
                    <button 
                      onClick={triggerRepairResearch}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer transition-colors"
                    >
                      Retry Real-Time Search
                    </button>
                  </div>
                ) : !activeRepairData ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
                    <Search className="h-10 w-10 text-indigo-400" />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-slate-200">Procurement & Supplier Agent</p>
                      <p className="text-[11px] text-slate-400 max-w-xs leading-normal">
                        Analyze current actual or simulated building damage and compile an itemized list of materials, real-time prices, and active suppliers found live on the web.
                      </p>
                    </div>
                    <button 
                      onClick={triggerRepairResearch}
                      disabled={isShaking || liveMetrics.stressPct === 0}
                      className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                        isShaking || liveMetrics.stressPct === 0
                          ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-950/30'
                      }`}
                    >
                      <Search className="h-3.5 w-3.5" />
                      <span>{liveMetrics.stressPct === 0 ? "Trigger Wave to Run" : "Run Repair Research"}</span>
                    </button>
                    {liveMetrics.stressPct === 0 && (
                      <p className="text-[9px] text-slate-500 leading-snug">
                        *Please trigger an earthquake seismic wave first to compute physical damage stress parameters.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Header indicating Draft vs Verified Search */}
                    {activeRepairData.isDraft ? (
                      <div className="px-3.5 py-2.5 bg-amber-950/20 border-b border-amber-500/15 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 shrink-0">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Preliminary Draft Estimate</span>
                          </div>
                          <p className="text-[9px] text-slate-400">Standard material specs & estimated pricing model</p>
                        </div>
                        <button 
                          onClick={triggerRepairResearch}
                          disabled={isShaking}
                          className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap shadow-md shadow-indigo-950/40"
                        >
                          <Search className="h-2.5 w-2.5" />
                          <span>Verify Live Prices & Suppliers</span>
                        </button>
                      </div>
                    ) : (
                      <div className="px-3.5 py-2.5 bg-emerald-950/30 border-b border-emerald-500/15 flex items-center gap-1.5 shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Verified Live Web Research Complete</span>
                      </div>
                    )}

                    {/* Summary statistics */}
                    <div className="p-3.5 bg-indigo-950/30 border-b border-indigo-500/10 space-y-1.5 shrink-0">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Est. Procurement Budget</span>
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-900 px-2 py-0.5 rounded">
                          {activeRepairData.totalEstimatedCostRange}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-normal font-semibold">
                        {activeRepairData.overallConditionAssessment}
                      </p>
                    </div>

                    {/* Scrollable lists */}
                    <div className="flex-1 overflow-y-auto p-3.5 space-y-4 scrollbar-thin">
                      <div className="space-y-1.5">
                        <h4 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          Expert Repair Strategy
                        </h4>
                        <p className="text-[10.5px] text-slate-400 leading-normal bg-slate-900/40 p-2.5 border border-slate-800/60 rounded-xl italic">
                          "{activeRepairData.expertRepairAdvice}"
                        </p>
                      </div>

                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Itemized Procurement List</h4>
                        <div className="space-y-2.5">
                          {activeRepairData.repairItems?.map((item: any, idx: number) => (
                            <div key={idx} className="bg-[#090d16] border border-slate-800/80 p-3 rounded-xl space-y-2">
                              <div className="flex justify-between items-start gap-2">
                                <div className="space-y-1">
                                  <h5 className="text-xs font-bold text-slate-200 leading-tight">{item.name}</h5>
                                  <div className="flex flex-wrap gap-1">
                                    <span className="inline-block text-[8px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                                      {item.category}
                                    </span>
                                    <span className={`inline-block text-[8px] font-bold px-1.5 py-0.5 rounded ${
                                      item.urgency === 'High' 
                                        ? 'bg-red-950/60 text-red-400 border border-red-900/40' 
                                        : item.urgency === 'Medium'
                                          ? 'bg-orange-950/60 text-orange-400 border border-orange-900/40'
                                          : 'bg-indigo-950/60 text-indigo-400 border border-indigo-900/40'
                                    }`}>
                                      {item.urgency} Urgency
                                    </span>
                                    {activeRepairData.isDraft && (
                                      <span className="inline-block text-[8px] font-bold bg-amber-950/40 text-amber-400 border border-amber-900/30 px-1.5 py-0.5 rounded">
                                        Draft Est.
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-xs font-mono font-bold text-emerald-400">{item.price}</p>
                                  <p className="text-[9px] text-slate-500 font-mono">Qty: {item.estimatedQuantity}</p>
                                </div>
                              </div>

                              <p className="text-[10.5px] text-slate-400 leading-normal">
                                {item.description}
                              </p>

                              <p className="text-[10px] text-indigo-300 leading-normal bg-[#0a0f1d] p-2 rounded-lg border border-indigo-950/40">
                                <strong className="text-indigo-400">Engineering Use: </strong>{item.justification}
                              </p>

                              <div className="text-[9.5px] border-t border-slate-800/50 pt-2 flex justify-between items-center text-slate-400">
                                <span>
                                  Supplier: <strong className="text-slate-300 font-medium">{item.supplier}</strong>
                                </span>
                                <span className="text-[9px] text-indigo-400 font-mono italic">
                                  {activeRepairData.isDraft ? 'Draft Database' : 'Verified Search'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Sources groundings */}
                      {!activeRepairData.isDraft && activeRepairData.sources && activeRepairData.sources.length > 0 && (
                        <div className="border-t border-slate-800/60 pt-3 space-y-1.5">
                          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Verified Supplier Sources</h4>
                          <div className="flex flex-col gap-1.5">
                            {activeRepairData.sources.slice(0, 4).map((src: any, idx: number) => (
                              <a 
                                key={idx} 
                                href={src.url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-[10px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 hover:underline truncate"
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span className="truncate">{src.title}</span>
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Seismic Isolation Techniques (Bento Card) */}
          <div id="techniques-card" className="bg-[#0d1321] border border-slate-800 rounded-3xl p-5 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                4. Seismic Engineering Techniques
              </label>
              <span className="text-[9px] bg-emerald-950/40 text-emerald-400 border border-emerald-900 px-1.5 py-0.5 rounded font-mono">
                Mitigation Add-ons
              </span>
            </div>

            <p className="text-[10.5px] text-slate-400 leading-snug">
              Install advanced dampeners or vibration-decoupling components. Check options below to bolster structural resistance:
            </p>

            <div className="space-y-2.5">
              {Object.values(TECHNIQUES).map((tech) => {
                const isSelected = config.techniques.includes(tech.id);
                return (
                  <button
                    key={tech.id}
                    onClick={() => handleToggleTechnique(tech.id)}
                    className={`w-full text-left p-3 rounded-xl transition-all border duration-150 flex items-start gap-3 cursor-pointer ${
                      isSelected 
                        ? 'bg-emerald-950/30 border-emerald-500/50 shadow-md shadow-emerald-950/45' 
                        : 'bg-[#090d16] hover:bg-slate-900 border-slate-800'
                    }`}
                  >
                    <div className="mt-0.5">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        isSelected ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-700 bg-slate-900'
                      }`}>
                        {isSelected && <CheckCircle2 className="h-3 w-3 text-slate-950" />}
                      </div>
                    </div>
                    
                    <div className="flex-1">
                      <div className="flex justify-between items-center">
                        <p className={`text-xs font-bold ${isSelected ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {tech.name}
                        </p>
                        <span className="text-[9px] font-mono text-slate-500">
                          Cost: <b className="text-slate-400">+{tech.cost}</b>
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 leading-normal">
                        {tech.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

        </section>
      </main>

      {/* Bottom Row Bento Cards: Integrity Stats & Socioeconomic/Repair Costs */}
      <footer id="app-footer-bento" className="grid grid-cols-1 sm:grid-cols-12 gap-5 mb-2">
        
        {/* Structural Integrity Stats Cell */}
        <div id="integrity-stats-cell" className="col-span-1 sm:col-span-4 bg-[#0d1321] border border-slate-800 rounded-3xl p-5 flex flex-col justify-between min-h-[140px]">
          <div className="flex justify-between items-center">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Dynamic Stability</p>
            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <div className="flex items-end gap-2.5 my-2">
            <h2 className={`text-3xl font-mono font-bold tracking-tight ${
              liveMetrics.collapsed 
                ? 'text-red-500' 
                : liveMetrics.stressPct > 75 
                  ? 'text-orange-500 animate-pulse' 
                  : 'text-emerald-400'
            }`}>
              {liveMetrics.collapsed ? '0.0' : (100 - liveMetrics.stressPct).toFixed(1)}
              <span className="text-sm font-sans font-medium text-slate-400 ml-0.5">%</span>
            </h2>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border mb-1.5 ${
              liveMetrics.collapsed 
                ? 'bg-red-950 text-red-400 border-red-900' 
                : liveMetrics.stressPct > 75 
                  ? 'bg-orange-950 text-orange-400 border-orange-900 animate-pulse' 
                  : 'bg-emerald-950 text-emerald-400 border-emerald-900'
            }`}>
              {liveMetrics.collapsed ? 'COLLAPSED' : liveMetrics.stressPct > 75 ? 'CRITICAL' : 'OPTIMAL'}
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] text-slate-400">
              <span>Seismic Load Threshold</span>
              <span className="font-mono text-slate-300">
                {liveMetrics.collapsed ? 'FAILED' : `${liveMetrics.maxShear} kN`}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-300 ${
                  liveMetrics.collapsed 
                    ? 'bg-red-500 w-full' 
                    : 'bg-emerald-500'
                }`}
                style={{ width: liveMetrics.collapsed ? '100%' : `${100 - liveMetrics.stressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Economic / Damage Estimate Cell */}
        <div id="repair-estimates-cell" className="col-span-1 sm:col-span-4 bg-[#0d1321] border border-slate-800 rounded-3xl p-5 flex flex-col justify-between min-h-[140px]">
          <div className="flex justify-between items-center">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Project Damage Cost</p>
            <Coins className="h-3.5 w-3.5 text-slate-500" />
          </div>
          <div className="flex items-end justify-between gap-2 my-2">
            <div className="flex items-end gap-2">
              <h2 className={`text-3xl font-mono font-bold ${estCost.damageCost > 0 ? 'text-amber-500' : 'text-slate-100'}`}>
                ${estCost.damageCost}
                <span className="text-sm font-sans font-medium text-slate-400 ml-0.5">k</span>
              </h2>
              <span className="text-[10px] text-slate-400 mb-1 leading-normal">
                of ${estCost.buildCost}k value
              </span>
            </div>
            {estCost.damageCost > 0 && (
              <button 
                onClick={triggerRepairResearch}
                disabled={isResearching}
                className="bg-indigo-650 hover:bg-indigo-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg border border-indigo-500/20 flex items-center gap-1 cursor-pointer transition-all shrink-0 hover:scale-[1.03] active:scale-[0.98]"
                title="Research material costs and real suppliers"
              >
                {isResearching ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : (
                  <Search className="h-2.5 w-2.5" />
                )}
                <span>Research Fixes</span>
              </button>
            )}
          </div>
          <div className="flex gap-4 text-[10px] text-slate-400 border-t border-slate-800/40 pt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <span>Build Cost: ${estCost.buildCost}k</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${estCost.damageCost > 0 ? 'bg-amber-400' : 'bg-slate-700'}`} />
              <span>Damage: {Math.round((estCost.damageCost / (estCost.buildCost || 1)) * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Dynamic Structural Analysis HUD Card */}
        <div id="seismic-education-hud" className="col-span-1 sm:col-span-4 bg-[#0d1321] border border-slate-800 rounded-3xl p-5 flex flex-col justify-between min-h-[140px]">
          <div className="flex justify-between items-center">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Acoustic & Vibration Data</p>
            <Info className="h-3.5 w-3.5 text-slate-500" />
          </div>
          
          <div className="space-y-2 my-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Natural Resonance:</span>
              <span className="font-mono text-indigo-400">{(1.5 - config.stories * 0.15).toFixed(2)} Hz</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Max S-Wave Drift:</span>
              <span className="font-mono text-slate-300">{liveMetrics.maxSway} mm</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">Damping Coefficient:</span>
              <span className="font-mono text-emerald-400">
                {(0.02 + MATERIALS[config.material].ductility * 0.08 + (config.techniques.includes('isolation') ? 0.15 : 0) + (config.techniques.includes('damper') ? 0.20 : 0)).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="text-[9.5px] text-indigo-300 bg-indigo-950/25 px-2.5 py-1.5 rounded-xl border border-indigo-900/40">
            {liveMetrics.collapsed ? (
              <span className="text-red-300">⚠️ Resonated frequency caused column shearing.</span>
            ) : liveMetrics.stressPct > 0 ? (
              <span>💡 Damping absorb is mitigating structural shear strain.</span>
            ) : (
              <span>💡 Select parameters and run to see wave spectrums.</span>
            )}
          </div>
        </div>

      </footer>
    </div>
  );
}
