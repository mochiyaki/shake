export interface Seismometer {
  id: string;
  name: string;
  x: number; // -150 to 150 coordinates
  z: number; // -150 to 150 coordinates
  y: number; // elevated position on terrain
  isCustom: boolean;
  detected: boolean;
  pWaveTime: number | null; // epoch ms when P-wave was detected
  sWaveTime: number | null; // epoch ms when S-wave was detected
  mmiMeasured: number; // MMI scale value measured (1-12)
  pgaMeasured: number; // Peak Ground Acceleration in g
}

export interface Fault {
  id: string;
  name: string;
  color: string;
  coordinates: { x: number; z: number }[]; // line path representing the fault in 3D scene
  currentStress: number; // 0 to 100
  slipRate: number; // stress added per second
}

export interface Building {
  id: string;
  name: string;
  type: 'residential' | 'commercial' | 'landmark' | 'infrastructure';
  stories: number;
  height: number;
  x: number;
  z: number;
  y: number; // terrain base elevation
  soilType: 'bedrock' | 'sandy-fill' | 'mud';
  damage: number; // 0 to 100%
  currentSwayX: number;
  currentSwayZ: number;
  currentTiltX: number;
  currentTiltZ: number;
  color: string;
  width: number;
  depth: number;
}

export interface PresetScenario {
  id: string;
  name: string;
  date: string;
  magnitude: number;
  depth: number; // km (1 - 30)
  epicenter: { x: number; z: number };
  faultName: string;
  description: string;
}

export interface SimulationState {
  isPlaying: boolean;
  timeElapsed: number; // simulation timer in ms
  epicenter: { x: number; z: number } | null;
  magnitude: number;
  depth: number;
  triggerTime: number | null; // epoch ms when rupture occurred
  pWaveSpeed: number; // units per second in 3D coordinate space
  sWaveSpeed: number; // units per second in 3D coordinate space
  isRuptured: boolean;
  warningStatus: 'clear' | 'p-wave-detected' | 'shaking-active' | 'ended';
  warningCountdown: number; // seconds remaining before S-wave hits downtown
  autoStressAccumulation: boolean;
}
