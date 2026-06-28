export type MaterialType = 'masonry' | 'concrete' | 'steel' | 'timber' | 'bamboo' | 'sma';

export interface MaterialProps {
  id: MaterialType;
  name: string;
  description: string;
  stiffness: number; // rigid vs flexible
  ductility: number; // ability to deform without crumbling
  strength: number; // load capacity
  density: number; // weight contribution
  cost: string;
  color: string;
  beamColor: string;
}

export const MATERIALS: Record<MaterialType, MaterialProps> = {
  masonry: {
    id: 'masonry',
    name: 'Unreinforced Masonry (Brick)',
    description: 'Brittle with poor tensile strength. Very stiff but prone to immediate shear failure.',
    stiffness: 0.9,
    ductility: 0.1,
    strength: 0.3,
    density: 0.8,
    cost: 'Low',
    color: '#e06666',
    beamColor: '#b45f06'
  },
  concrete: {
    id: 'concrete',
    name: 'Reinforced Concrete',
    description: 'Excellent compressive strength with steel rebars for tension. Strong but heavy.',
    stiffness: 0.7,
    ductility: 0.4,
    strength: 0.7,
    density: 0.9,
    cost: 'Medium',
    color: '#999999',
    beamColor: '#666666'
  },
  steel: {
    id: 'steel',
    name: 'Structural Steel Frame',
    description: 'Highly ductile and robust. Sways significantly under forces but rarely crumbles.',
    stiffness: 0.4,
    ductility: 0.9,
    strength: 0.9,
    density: 0.6,
    cost: 'High',
    color: '#6fa8dc',
    beamColor: '#3d85c6'
  },
  timber: {
    id: 'timber',
    name: 'Timber Frame (Wood)',
    description: 'Lightweight with natural elasticity. Resilient under moderate seismic forces.',
    stiffness: 0.5,
    ductility: 0.7,
    strength: 0.5,
    density: 0.3,
    cost: 'Medium',
    color: '#e6b8af',
    beamColor: '#a61c00'
  },
  bamboo: {
    id: 'bamboo',
    name: 'Bamboo Frame',
    description: 'Extremely lightweight, flexible, and sustainable. Incredible tension-to-weight ratio.',
    stiffness: 0.3,
    ductility: 0.8,
    strength: 0.6,
    density: 0.2,
    cost: 'Low',
    color: '#b6d7a8',
    beamColor: '#38761d'
  },
  sma: {
    id: 'sma',
    name: 'Shape Memory Alloys (SMA)',
    description: 'Smart materials that absorb heavy stress and return to original shape perfectly.',
    stiffness: 0.6,
    ductility: 0.95,
    strength: 0.95,
    density: 0.7,
    cost: 'Very High',
    color: '#d5a6bd',
    beamColor: '#741b47'
  }
};

export type SeismicTechnique = 'isolation' | 'damper' | 'bracing' | 'walls';

export interface TechniqueProps {
  id: SeismicTechnique;
  name: string;
  description: string;
  stiffnessMod: number; // Stiffens structure
  dampingMod: number; // Absorbs sway energy
  isolationMod: number; // Decouples from ground motion
  strengthMod: number; // Adds structural capacity
  cost: string;
}

export const TECHNIQUES: Record<SeismicTechnique, TechniqueProps> = {
  bracing: {
    id: 'bracing',
    name: 'Cross Bracing',
    description: 'Diagonal steel trusses that resist lateral shear. Highly visible structural reinforcing.',
    stiffnessMod: 0.4,
    dampingMod: 0.05,
    isolationMod: 0,
    strengthMod: 0.3,
    cost: 'Low'
  },
  walls: {
    id: 'walls',
    name: 'Shear Walls',
    description: 'Rigid concrete vertical walls that block structural twist and sway.',
    stiffnessMod: 0.6,
    dampingMod: 0.02,
    isolationMod: 0,
    strengthMod: 0.4,
    cost: 'Medium'
  },
  isolation: {
    id: 'isolation',
    name: 'Base Isolation bearings',
    description: 'Flexible rubber pads or sliding rollers that decouple building foundation from shaking ground.',
    stiffnessMod: -0.2, // loosens base connection
    dampingMod: 0.3,
    isolationMod: 0.8,
    strengthMod: 0,
    cost: 'High'
  },
  damper: {
    id: 'damper',
    name: 'Tuned Mass Damper',
    description: 'A heavy pendulum suspended on top stories that sways out of phase to neutralize motion.',
    stiffnessMod: 0,
    dampingMod: 0.5,
    isolationMod: 0,
    strengthMod: 0,
    cost: 'High'
  }
};

export interface HouseConfig {
  material: MaterialType;
  stories: number;
  techniques: SeismicTechnique[];
  magnitude: number; // Richter scale 1.0 - 10.0
}

export interface SimulationMetrics {
  maxSway: number; // max drift in mm
  maxShear: number; // base shear in kN
  stressPct: number; // stress 0 - 100
  collapsed: boolean;
  collapseReason: string;
  frequencies: number[]; // response spectrum
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
