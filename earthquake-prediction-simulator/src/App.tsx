import React, { useState, useEffect, useRef } from 'react';
import { Building, Fault, Seismometer, PresetScenario, SimulationState } from './types';
import { PRESET_SEISMOMETERS, FAULT_LINES, SF_BUILDINGS, PRESET_SCENARIOS, SOIL_PROPERTIES } from './data';
import ThreeMap from './components/ThreeMap';
import Seismograph from './components/Seismograph';
import { audio } from './utils/audio';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Play,
  RotateCcw,
  Shield,
  Train,
  Flame,
  Layout,
  Layers,
  FileText,
  Info,
  Clock,
  Volume2,
  VolumeX,
  Building2,
  Anchor,
  Compass,
  Music,
  Radio,
  Zap
} from 'lucide-react';

export default function App() {
  // --- CORE SYSTEM STATE ---
  const [seismometers, setSeismometers] = useState<Seismometer[]>(PRESET_SEISMOMETERS);
  const [buildings, setBuildings] = useState<Building[]>(SF_BUILDINGS);
  const [faults, setFaults] = useState<Fault[]>(FAULT_LINES);
  
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [selectedSensorId, setSelectedSensorId] = useState<string | null>('s-sf-nob');
  const [retrofitLevel, setRetrofitLevel] = useState<'unretrofitted' | 'partial' | 'modern'>('partial');

  const [simState, setSimState] = useState<SimulationState>({
    isPlaying: false,
    timeElapsed: 0,
    epicenter: { x: -65, z: 100 }, // Default near ocean/Daly City
    magnitude: 7.2,
    depth: 10,
    triggerTime: null,
    pWaveSpeed: 20.0, // units per second
    sWaveSpeed: 11.0, // units per second
    isRuptured: false,
    warningStatus: 'clear',
    warningCountdown: 0,
    autoStressAccumulation: false,
  });

  // Sound effects toggles (using standard visual alerts)
  const [sirensActive, setSirensActive] = useState(false);
  const [bartStatus, setBartStatus] = useState<'normal' | 'emergency-brake' | 'slowing'>('normal');
  const [gasValves, setGasValves] = useState<'open' | 'shut-off'>('open');
  const [elevatorsStatus, setElevatorsStatus] = useState<'operating' | 'parked-doors-open'>('operating');

  // Interactive audio states
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [masterVolume, setMasterVolume] = useState(0.5);
  const [ambientHumActive, setAmbientHumActive] = useState(true);

  // Sync audio state to audio manager
  useEffect(() => {
    audio.setMute(isAudioMuted);
  }, [isAudioMuted]);

  useEffect(() => {
    audio.setMasterVolume(masterVolume);
  }, [masterVolume]);

  useEffect(() => {
    if (ambientHumActive && !isAudioMuted) {
      audio.startAmbientHum();
    } else {
      audio.stopAmbientHum();
    }
    return () => {
      audio.stopAmbientHum();
    };
  }, [ambientHumActive, isAudioMuted]);

  // Damage reporting statistics
  const [maxIntenseDistrict, setMaxIntenseDistrict] = useState<string>('N/A');
  const [averageDamage, setAverageDamage] = useState<number>(0);
  const [liquefactionReport, setLiquefactionReport] = useState<string>('');

  // Auto-stress accumulation ticker
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (simState.autoStressAccumulation && !simState.isRuptured) {
      interval = setInterval(() => {
        setFaults((prevFaults) => {
          let triggered = false;
          let activeFault: Fault | null = null;

          const updated = prevFaults.map((f) => {
            const newStress = Math.min(100, f.currentStress + f.slipRate * 8); // speed up slightly for simulation
            if (newStress >= 100 && !triggered) {
              triggered = true;
              activeFault = f;
            }
            return { ...f, currentStress: newStress };
          });

          if (triggered && activeFault) {
            // Find mid point of fault to trigger
            const midCoord = (activeFault as Fault).coordinates[Math.floor((activeFault as Fault).coordinates.length / 2)];
            triggerEarthquake(midCoord.x, midCoord.z, (activeFault as Fault).name);
          }

          return updated;
        });
      }, 400);
    }
    return () => clearInterval(interval);
  }, [simState.autoStressAccumulation, simState.isRuptured, simState.magnitude, simState.depth]);

  // --- TRIGGER RUNTIME EARTHQUAKE ---
  const triggerEarthquake = (x: number, z: number, faultName: string = 'Unknown Fault') => {
    // Reset structural state on a new shake
    const resetBuildings = buildings.map((b) => ({
      ...b,
      damage: 0,
      currentSwayX: 0,
      currentSwayZ: 0,
      currentTiltX: 0,
      currentTiltZ: 0,
    }));
    setBuildings(resetBuildings);

    // Reset seismometers state
    const resetSensors = seismometers.map((s) => ({
      ...s,
      detected: false,
      pWaveTime: null,
      sWaveTime: null,
      mmiMeasured: 1,
      pgaMeasured: 0,
    }));
    setSeismometers(resetSensors);

    // Update simulation status
    setSimState((prev) => ({
      ...prev,
      epicenter: { x, z },
      isRuptured: true,
      triggerTime: Date.now(),
      warningStatus: 'p-wave-detected',
      warningCountdown: 12.0, // placeholder updated by ThreeMap
    }));

    setSirensActive(true);
    setBartStatus('slowing');
    setGasValves('shut-off');
    setElevatorsStatus('parked-doors-open');

    // Play synthetic audio layer
    audio.triggerTectonicFracture();
    audio.startRumble(simState.magnitude);
    audio.startSiren();

    // Automatically select the first sensor that P-wave will hit for nice seismograph visual feedback
    // Daly City sensor is close to San Andreas
    if (x < 0) {
      setSelectedSensorId('s-and-1');
    } else {
      setSelectedSensorId('s-hay-oak');
    }
  };

  // --- RESET SIMULATION ---
  const handleReset = () => {
    setSimState((prev) => ({
      ...prev,
      isRuptured: false,
      triggerTime: null,
      warningStatus: 'clear',
      warningCountdown: 0,
    }));

    const resetBuildings = buildings.map((b) => ({
      ...b,
      damage: 0,
      currentSwayX: 0,
      currentSwayZ: 0,
      currentTiltX: 0,
      currentTiltZ: 0,
    }));
    setBuildings(resetBuildings);

    const resetSensors = seismometers.map((s) => ({
      ...s,
      detected: false,
      pWaveTime: null,
      sWaveTime: null,
      mmiMeasured: 1,
      pgaMeasured: 0,
    }));
    setSeismometers(resetSensors);

    // Restore standard fault stresses slightly
    setFaults([
      { ...FAULT_LINES[0], currentStress: 55 },
      { ...FAULT_LINES[1], currentStress: 38 },
      { ...FAULT_LINES[2], currentStress: 22 },
    ]);

    setSirensActive(false);
    setBartStatus('normal');
    setGasValves('open');
    setElevatorsStatus('operating');
    setAverageDamage(0);
    setMaxIntenseDistrict('N/A');
    setLiquefactionReport('');

    // Stop active simulation audio
    audio.stopRumble();
    audio.stopSiren();
  };

  // --- TRIGGER SENSOR WAVE DETECTION FROM THREE ENGINE ---
  const handleSensorTrigger = (id: string, waveType: 'p' | 's', mmi: number, pga: number) => {
    setSeismometers((prev) =>
      prev.map((s) => {
        if (s.id === id) {
          return {
            ...s,
            detected: true,
            pWaveTime: waveType === 'p' ? Date.now() : s.pWaveTime,
            sWaveTime: waveType === 's' ? Date.now() : s.sWaveTime,
            mmiMeasured: Math.max(s.mmiMeasured, mmi),
            pgaMeasured: Math.max(s.pgaMeasured, pga),
          };
        }
        return s;
      })
    );

    // Early warning response triggers
    if (waveType === 'p') {
      setBartStatus('emergency-brake'); // Slam brakes as soon as seismometer networks confirm P-wave!
    }

    // Play sensor wave detection alert beep
    audio.triggerSensorBeep(waveType);
  };

  // --- UPDATE INDIVIDUAL BUILDING DAMAGE ACCUMULATIONS ---
  const handleBuildingDamage = (id: string, damage: number, tiltX: number, tiltZ: number) => {
    setBuildings((prev) =>
      prev.map((b) => {
        if (b.id === id) {
          // Retrofit damping factors
          let dampFactor = 1.0;
          if (retrofitLevel === 'modern') dampFactor = 0.05; // 95% survival
          if (retrofitLevel === 'partial') dampFactor = 0.5;  // 50% survival

          const calculatedDamage = Math.min(100, damage * dampFactor);

          return {
            ...b,
            damage: calculatedDamage,
            currentTiltX: tiltX * dampFactor,
            currentTiltZ: tiltZ * dampFactor,
          };
        }
        return b;
      })
    );
  };

  // Live damage aggregator effect
  useEffect(() => {
    if (buildings.length === 0) return;
    const avg = buildings.reduce((acc, b) => acc + b.damage, 0) / buildings.length;
    setAverageDamage(avg);

    // Determine highest shaking impact soil zone based on damage
    let fillDamage = 0;
    let bedrockDamage = 0;
    let mudDamage = 0;

    buildings.forEach((b) => {
      if (b.soilType === 'sandy-fill') fillDamage += b.damage;
      else if (b.soilType === 'bedrock') bedrockDamage += b.damage;
      else if (b.soilType === 'mud') mudDamage += b.damage;
    });

    if (fillDamage > mudDamage && fillDamage > bedrockDamage && fillDamage > 10) {
      setMaxIntenseDistrict('Marina & Embarcadero (Landfill)');
      setLiquefactionReport(
        'Severe soil liquefaction occurring along the waterfront. Sandy hydraulic fill loses strength entirely, causing the Millennium Tower and SOMA complexes to settle and lean.'
      );
    } else if (mudDamage > fillDamage && mudDamage > bedrockDamage && mudDamage > 10) {
      setMaxIntenseDistrict('Mission District Alluvial Basin');
      setLiquefactionReport(
        'Amplified low-frequency shaking resonances observed. Saturated silts and clays acting as a slow jelly, placing heavy stress on unretrofitted wood-frame multi-story structures.'
      );
    } else if (avg > 0) {
      setMaxIntenseDistrict('Daly City Bedrock Hills');
      setLiquefactionReport(
        'Bedrock zones (Twin Peaks, Pacific Heights) experienced high-frequency vibration but remained structurally stable. Minimal foundation failures reported on metamorphic rock.'
      );
    } else {
      setMaxIntenseDistrict('N/A');
      setLiquefactionReport('');
    }
  }, [buildings]);

  // Handle countdown tracking from Three.js
  const handleWarningCountdownUpdate = (countdown: number) => {
    setSimState((prev) => {
      let status = prev.warningStatus;
      if (countdown === 0 && prev.isRuptured) {
        status = 'shaking-active';
      }
      return {
        ...prev,
        warningCountdown: countdown,
        warningStatus: status,
      };
    });
  };

  // --- PLACE DYNAMIC SEISMOMETER SENSOR ---
  const handleAddSeismometer = (x: number, z: number) => {
    const nextIndex = seismometers.filter((s) => s.isCustom).length + 1;
    const h = getTerrainHeightHeightOnly(x, z);

    const newSensor: Seismometer = {
      id: `custom-sensor-${nextIndex}`,
      name: `Custom Seismometer (C-SF-${nextIndex})`,
      x,
      z,
      y: h + 1.2,
      isCustom: true,
      detected: false,
      pWaveTime: null,
      sWaveTime: null,
      mmiMeasured: 1,
      pgaMeasured: 0,
    };

    setSeismometers((prev) => [...prev, newSensor]);
    setSelectedSensorId(newSensor.id); // Focus on newly placed sensor
  };

  const getTerrainHeightHeightOnly = (x: number, z: number): number => {
    const isOcean = x < -95 && z > -120;
    const isBay = x > 85 && z < 110;
    const isStrait = z < -100 && z > -145 && x < 35 && x > -110;

    if (isOcean || isBay || isStrait) return -3;

    let height = 1.2;
    const distTwinPeaks = Math.hypot(x - (-30), z - 10);
    if (distTwinPeaks < 45) height += 24 * Math.pow(1 - distTwinPeaks / 45, 1.8);
    const distNobHill = Math.hypot(x - 25, z - (-80));
    if (distNobHill < 35) height += 13 * Math.pow(1 - distNobHill / 35, 1.5);
    const distTelegraph = Math.hypot(x - 48, z - (-115));
    if (distTelegraph < 25) height += 11 * Math.pow(1 - distTelegraph / 25, 1.5);
    return height;
  };

  // --- SCENARIO SELECTOR HANDLER ---
  const handleSelectScenario = (scenario: PresetScenario) => {
    setActivePresetId(scenario.id);
    
    // Auto populate parameters
    setSimState((prev) => ({
      ...prev,
      magnitude: scenario.magnitude,
      depth: scenario.depth,
      epicenter: scenario.epicenter,
    }));

    // Trigger instant rupture simulation for presets
    triggerEarthquake(scenario.epicenter.x, scenario.epicenter.z, scenario.faultName);
  };

  const selectedSensor = seismometers.find((s) => s.id === selectedSensorId) || null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased">
      {/* 1. TOP HEADER & TELEMETRY */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-rose-600/10 text-rose-500 rounded-xl border border-rose-500/20">
            <AlertOctagon className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-wider uppercase text-slate-100">SeismicAlert</h1>
              <span className="bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[9px] font-black tracking-widest px-1.5 py-0.5 rounded uppercase">
                Bay Area EEW Grid
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              San Francisco 3D Earthquake Propagation & Seismometer Warning Simulator
            </p>
          </div>
        </div>

        {/* Live System Telemetry Banner */}
        <div className="flex items-center gap-4 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800 text-[10px] text-slate-400 font-mono">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span>UTC TIME: 08:21:00</span>
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>NETWORK STATUS: ONLINE (6 NODES)</span>
          </div>
        </div>
      </header>

      {/* 2. CORE WORKSPACE */}
      <main className="flex-1 p-5 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-5 xl:gap-6 max-w-[1600px] w-full mx-auto">
        {/* --- LEFT COL: PRESETS & SIM CONTROL (3 COLS) --- */}
        <section className="lg:col-span-3 flex flex-col gap-5">
          {/* Preset Historic Ruptures */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold text-slate-200 tracking-wider uppercase">Historic & Future Presets</h3>
            </div>
            <div className="flex flex-col gap-2">
              {PRESET_SCENARIOS.map((scen) => (
                <button
                  key={scen.id}
                  onClick={() => handleSelectScenario(scen)}
                  className={`text-left p-3 rounded-xl border transition-all text-xs flex flex-col gap-1 ${
                    activePresetId === scen.id && simState.isRuptured
                      ? 'bg-rose-950/40 border-rose-500 text-rose-200'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>{scen.name}</span>
                    <span className="text-[10px] text-rose-400 font-extrabold font-mono">M{scen.magnitude}</span>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>{scen.date}</span>
                    <span className="font-mono text-slate-500">{scen.faultName.split(' ')[0]} Fault</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Manual Parameter controls */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2.5">
              <Layout className="w-4 h-4 text-emerald-400" />
              <h3 className="text-xs font-bold text-slate-200 tracking-wider uppercase">Simulator Parameters</h3>
            </div>

            {/* Slider Magnitude */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">Magnitude (Richter)</span>
                <span className="text-xs font-black font-mono text-rose-500 bg-rose-500/10 px-2 py-0.5 rounded">
                  M {simState.magnitude.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min="3.0"
                max="9.0"
                step="0.1"
                disabled={simState.isRuptured}
                value={simState.magnitude}
                onChange={(e) => setSimState({ ...simState, magnitude: parseFloat(e.target.value) })}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <p className="text-[9px] text-slate-500 font-medium">
                {simState.magnitude >= 8.0
                  ? 'Great Quake: Complete devastation. Equivalent to >1,000 Hiroshima atomic bombs.'
                  : simState.magnitude >= 7.0
                  ? 'Major Rupture: Capable of widespread brick collapses and highway failures.'
                  : simState.magnitude >= 5.0
                  ? 'Moderate Shake: Felt by everyone. Unstable plaster walls and chimneys crack.'
                  : 'Minor Quake: Light vibrations, generally felt but rarely triggers damage.'}
              </p>
            </div>

            {/* Slider Depth */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">Hypocenter Depth</span>
                <span className="text-xs font-black font-mono text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                  {simState.depth} km
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                disabled={simState.isRuptured}
                value={simState.depth}
                onChange={(e) => setSimState({ ...simState, depth: parseInt(e.target.value) })}
                className="w-full accent-amber-500 cursor-pointer"
              />
              <p className="text-[9px] text-slate-500 font-medium">
                {simState.depth <= 8
                  ? 'Shallow Rupture: Concentrates catastrophic ground sways heavily on local surface.'
                  : 'Deep Rupture: Seismic wave energy scatters outward, diminishing surface peak forces.'}
              </p>
            </div>

            {/* Retrofitting toggle */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] text-slate-400 font-bold uppercase tracking-wide">Building Retrofits</span>
              <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setRetrofitLevel('unretrofitted')}
                  className={`px-2 py-1.5 text-[9px] font-black rounded-lg transition-all ${
                    retrofitLevel === 'unretrofitted'
                      ? 'bg-red-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  NONE
                </button>
                <button
                  onClick={() => setRetrofitLevel('partial')}
                  className={`px-2 py-1.5 text-[9px] font-black rounded-lg transition-all ${
                    retrofitLevel === 'partial'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  PARTIAL
                </button>
                <button
                  onClick={() => setRetrofitLevel('modern')}
                  className={`px-2 py-1.5 text-[9px] font-black rounded-lg transition-all ${
                    retrofitLevel === 'modern'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  MODERN
                </button>
              </div>
              <p className="text-[9px] text-slate-500 font-medium">
                {retrofitLevel === 'unretrofitted'
                  ? 'Fragile masonry & brick. High sway yields structural collapse on sandy fills.'
                  : retrofitLevel === 'partial'
                  ? 'Standard brace frames. Key landmarks survive; older apartments tilt.'
                  : 'Base isolation pads & dampers absorbing 95% of shock. Virtually zero damage.'}
              </p>
            </div>

            {/* Rupture execution buttons */}
            <div className="flex gap-2 border-t border-slate-800 pt-3">
              {simState.isRuptured ? (
                <button
                  onClick={handleReset}
                  className="flex-1 flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-bold py-2.5 rounded-xl text-xs shadow-md active:scale-95 transition-all"
                >
                  <RotateCcw className="w-4 h-4" />
                  RESET EARTH
                </button>
              ) : (
                <button
                  onClick={() => {
                    const epic = simState.epicenter || { x: -65, z: 100 };
                    triggerEarthquake(epic.x, epic.z, 'Selected Fault Region');
                  }}
                  className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl text-xs shadow-lg active:scale-95 transition-all border border-rose-500"
                >
                  <Play className="w-4 h-4" />
                  RUPTURE FAULT
                </button>
              )}
            </div>
          </div>

          {/* Fault Stress Accumulator */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-amber-500" />
                <h3 className="text-xs font-bold text-slate-200 tracking-wider uppercase">Tectonic Plate Stress</h3>
              </div>
              <button
                onClick={() => setSimState({ ...simState, autoStressAccumulation: !simState.autoStressAccumulation })}
                className={`px-2 py-0.5 rounded text-[8px] font-black border transition-all ${
                  simState.autoStressAccumulation
                    ? 'bg-amber-600/25 border-amber-500 text-amber-400 animate-pulse'
                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                {simState.autoStressAccumulation ? 'AUTO ACTIVE' : 'AUTO STRESS'}
              </button>
            </div>
            
            <div className="space-y-3">
              {faults.map((f) => (
                <div key={f.id} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[10px] font-semibold text-slate-300">
                    <span>{f.name.split(' ')[0]} Fault Zone</span>
                    <span className={f.currentStress >= 90 ? 'text-red-400 font-bold animate-pulse' : 'text-slate-400 font-mono'}>
                      {f.currentStress.toFixed(0)}% Tension
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${f.currentStress}%`,
                        backgroundColor: f.currentStress >= 90 ? '#f43f5e' : f.currentStress >= 65 ? '#f59e0b' : '#38bdf8',
                      }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-[8.5px] text-slate-500 leading-normal">
                Stresses accumulate slowly due to Pacific Plate movement (slip rate ~30mm/yr). At 100% stress, plates slip, releasing massive S-wave destructive energies.
              </p>
            </div>
          </div>

          {/* Acoustic Seismology & Sound Board */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-rose-500" />
                <h3 className="text-xs font-bold text-slate-200 tracking-wider uppercase">Acoustic Seismology</h3>
              </div>
              <button
                onClick={() => setIsAudioMuted(!isAudioMuted)}
                className={`p-1.5 rounded-lg border transition-all ${
                  isAudioMuted
                    ? 'bg-rose-950/40 border-rose-500 text-rose-400'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title={isAudioMuted ? 'Unmute Audio' : 'Mute Audio'}
              >
                {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Master Volume Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  <span>Master Level</span>
                  <span className="font-mono text-slate-300">{(masterVolume * 100).toFixed(0)}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={masterVolume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setMasterVolume(v);
                      if (v > 0 && isAudioMuted) {
                        setIsAudioMuted(false);
                      }
                    }}
                    className="flex-1 accent-rose-500 h-1 bg-slate-950 rounded-lg appearance-none cursor-pointer"
                  />
                  <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                </div>
              </div>

              {/* Toggle Ambient Hum */}
              <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-2">
                  <Music className="w-4 h-4 text-sky-400" />
                  <div>
                    <div className="font-semibold text-slate-300">55Hz Ground Hum</div>
                    <div className="text-[8.5px] text-slate-500 font-medium">Underground urban resonance</div>
                  </div>
                </div>
                <button
                  onClick={() => setAmbientHumActive(!ambientHumActive)}
                  className={`w-9 h-5 rounded-full p-0.5 transition-all duration-200 outline-none ${
                    ambientHumActive && !isAudioMuted ? 'bg-sky-500' : 'bg-slate-800'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-all duration-200 shadow-sm ${
                      ambientHumActive && !isAudioMuted ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Dynamic Equalizer Visualizer */}
              <div className="bg-slate-950 rounded-xl p-2.5 border border-slate-800/80 flex flex-col gap-1.5">
                <span className="text-[8.5px] text-slate-500 font-black uppercase tracking-widest">Procedural Waveform</span>
                <div className="h-5 flex items-end justify-between gap-[2px] px-1 overflow-hidden">
                  {Array.from({ length: 24 }).map((_, i) => {
                    // Generate a beautiful bouncing bar based on active audio simulation state
                    let height = '15%';
                    let bg = 'bg-slate-800';
                    if (!isAudioMuted) {
                      if (simState.isRuptured) {
                        height = `${20 + Math.random() * 80}%`;
                        bg = simState.warningStatus === 'p-wave-detected' ? 'bg-amber-500' : 'bg-red-500';
                      } else if (ambientHumActive) {
                        height = `${5 + Math.sin((Date.now() / 100) + i) * 10}%`;
                        bg = 'bg-sky-500/80';
                      }
                    }
                    return (
                      <div
                        key={i}
                        className={`w-[3px] rounded-t transition-all duration-150 ${bg}`}
                        style={{ height }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Interactive Acoustic Diagnostics / Manual Sound FX Testing */}
              <div className="flex flex-col gap-1.5 border-t border-slate-800/80 pt-2.5">
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">Acoustic Diagnostics</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (isAudioMuted) setIsAudioMuted(false);
                      audio.triggerTectonicFracture();
                    }}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-[9.5px] text-slate-300 hover:text-white font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                  >
                    <Zap className="w-3 h-3 text-amber-400" />
                    TEST CRACK
                  </button>
                  <button
                    onClick={() => {
                      if (isAudioMuted) setIsAudioMuted(false);
                      audio.triggerSensorBeep('p');
                    }}
                    className="py-1.5 px-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-[9.5px] text-slate-300 hover:text-white font-bold flex items-center justify-center gap-1 active:scale-95 transition-all"
                  >
                    <Radio className="w-3 h-3 text-sky-400" />
                    TEST BEEP
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* --- CENTER COL: INTERACTIVE 3D MAP & EARLY WARNING STATUS (6 COLS) --- */}
        <section className="lg:col-span-6 flex flex-col gap-5 h-[500px] lg:h-auto min-h-[500px] lg:min-h-0">
          {/* Active Early Warning Telemetry Status Banner */}
          <div
            className={`border rounded-2xl p-4 shadow-xl flex items-center justify-between gap-4 transition-all duration-300 ${
              simState.isRuptured
                ? simState.warningStatus === 'p-wave-detected'
                  ? 'bg-amber-950/70 border-amber-500'
                  : 'bg-red-950/70 border-red-500'
                : 'bg-slate-900 border-slate-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-3 rounded-xl border shrink-0 ${
                  simState.isRuptured
                    ? simState.warningStatus === 'p-wave-detected'
                      ? 'bg-amber-600 text-slate-950 border-amber-400 animate-pulse'
                      : 'bg-red-500 text-white border-red-400 animate-ping'
                    : 'bg-slate-950 border-slate-800 text-emerald-400'
                }`}
              >
                {simState.isRuptured ? <AlertTriangle className="w-6 h-6" /> : <Shield className="w-6 h-6" />}
              </div>

              <div>
                <h2 className="text-sm font-black uppercase tracking-wider">
                  {simState.isRuptured
                    ? simState.warningStatus === 'p-wave-detected'
                      ? '⚡ SHAKEALERT: P-WAVE DETECTED'
                      : '⚠️ S-WAVE SHAKING ACTIVE'
                    : '🟢 EEW STATUS: MONITORING'}
                </h2>
                <p className="text-[10px] text-slate-400 font-medium">
                  {simState.isRuptured
                    ? simState.warningStatus === 'p-wave-detected'
                      ? 'Seismometer network confirms rupture. Broadcasting warning alerts.'
                      : 'Violent destructive S-waves sweeping across San Francisco land masses.'
                    : 'All plates locked. Baseline seismometer grids reporting zero tremors.'}
                </p>
              </div>
            </div>

            {simState.isRuptured && simState.warningCountdown > 0 && (
              <div className="flex flex-col items-center bg-slate-950/90 border border-slate-800 px-4 py-2 rounded-xl">
                <span className="text-[9px] text-rose-400 font-black tracking-widest uppercase mb-0.5">S-WAVE ARRIVAL</span>
                <div className="flex items-baseline gap-1 font-mono">
                  <span className="text-2xl font-black text-rose-500 animate-pulse">{simState.warningCountdown.toFixed(1)}</span>
                  <span className="text-xs text-rose-400">s</span>
                </div>
              </div>
            )}
          </div>

          {/* Core 3D WebGL Canvas Component */}
          <div className="flex-1 relative">
            <ThreeMap
              seismometers={seismometers}
              buildings={buildings}
              faults={faults}
              simulationState={simState}
              selectedSensorId={selectedSensorId}
              onSelectSensor={setSelectedSensorId}
              onAddSeismometer={handleAddSeismometer}
              onEpicenterSet={(x, z) => setSimState({ ...simState, epicenter: { x, z } })}
              onSensorTrigger={handleSensorTrigger}
              onBuildingDamage={handleBuildingDamage}
              onWarningCountdownUpdate={handleWarningCountdownUpdate}
            />
          </div>
        </section>

        {/* --- RIGHT COL: LIVE SEISMOGRAPH & EARLY WARNING ACTIONS (3 COLS) --- */}
        <section className="lg:col-span-3 flex flex-col gap-5">
          {/* Automated Safety Shutdown Center */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-xl flex flex-col gap-3.5">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <Volume2 className="w-4 h-4 text-rose-500" />
              <h3 className="text-xs font-bold text-slate-200 tracking-wider uppercase">Automated Warning Systems</h3>
            </div>

            <div className="space-y-2 text-xs">
              {/* BART Trains */}
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl">
                <div className="flex items-center gap-2">
                  <Train className="w-4 h-4 text-sky-400" />
                  <span className="font-semibold text-slate-300">BART Railways</span>
                </div>
                <span
                  className={`px-2 py-0.5 text-[8.5px] font-black rounded uppercase ${
                    bartStatus === 'emergency-brake'
                      ? 'bg-red-500 text-white'
                      : bartStatus === 'slowing'
                      ? 'bg-amber-500 text-slate-950 animate-pulse'
                      : 'bg-slate-900 text-slate-500'
                  }`}
                >
                  {bartStatus === 'emergency-brake'
                    ? 'Emergency Brake'
                    : bartStatus === 'slowing'
                    ? 'Slowing Down'
                    : 'Normal (79mph)'}
                </span>
              </div>

              {/* Gas Isolator Valves */}
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl">
                <div className="flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span className="font-semibold text-slate-300">City Gas Mains</span>
                </div>
                <span
                  className={`px-2 py-0.5 text-[8.5px] font-black rounded uppercase ${
                    gasValves === 'shut-off' ? 'bg-emerald-600/25 text-emerald-400 border border-emerald-500/30' : 'bg-slate-900 text-slate-500'
                  }`}
                >
                  {gasValves === 'shut-off' ? 'ISOLATED' : 'ACTIVE OPEN'}
                </span>
              </div>

              {/* Elevators */}
              <div className="flex items-center justify-between bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-purple-400" />
                  <span className="font-semibold text-slate-300">SOMA Elevators</span>
                </div>
                <span
                  className={`px-2 py-0.5 text-[8.5px] font-black rounded uppercase ${
                    elevatorsStatus === 'parked-doors-open'
                      ? 'bg-yellow-600/25 text-yellow-400 border border-yellow-500/30'
                      : 'bg-slate-900 text-slate-500'
                  }`}
                >
                  {elevatorsStatus === 'parked-doors-open' ? 'PARKED OPEN' : 'OPERATIONAL'}
                </span>
              </div>
            </div>
            <p className="text-[8.5px] text-slate-500 leading-normal">
              Upon P-wave seismic confirmation, early warning relays issue millisecond-speed command interrupts to mitigate post-quake fires, rail derailments, and elevator entrapments.
            </p>
          </div>

          {/* Interactive live seismograph */}
          <Seismograph
            selectedSensor={selectedSensor}
            simulationState={simState}
            epicenter={simState.epicenter}
          />

          {/* Post Quake Damage Report */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 shadow-xl flex flex-col gap-3">
            <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <FileText className="w-4 h-4 text-sky-400" />
              <h3 className="text-xs font-bold text-slate-200 tracking-wider uppercase">Damage & Liquefaction Report</h3>
            </div>

            {averageDamage > 0 ? (
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center bg-slate-950 p-2 rounded-lg">
                  <span className="text-slate-400">Avg Building Damage:</span>
                  <span className={`font-black font-mono ${averageDamage > 40 ? 'text-red-500' : 'text-amber-500'}`}>
                    {averageDamage.toFixed(1)}%
                  </span>
                </div>

                <div className="flex flex-col gap-0.5 bg-slate-950 p-2 rounded-lg">
                  <span className="text-slate-400">Worst Impact District:</span>
                  <span className="font-black text-rose-400">{maxIntenseDistrict}</span>
                </div>

                <div className="bg-slate-950 border border-slate-800/80 p-2.5 rounded-xl text-[10px] text-slate-400 leading-relaxed">
                  {liquefactionReport}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 text-xs">
                No active damages. Trigger a plate rupture to inspect seismic structural impact reports.
              </div>
            )}
          </div>
        </section>
      </main>

      {/* 3. FOOTER */}
      <footer className="border-t border-slate-800 bg-slate-900/40 text-center py-4 text-[10px] text-slate-500">
        SeismicAlert Earthquake Prediction Simulator &copy; 2026. Designed with real-time USGS ShakeAlert telemetry schemas and San Francisco geological soil profiles.
      </footer>
    </div>
  );
}
