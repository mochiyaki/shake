import { HouseConfig, SimulationMetrics } from '../types';

export interface DraftRepairItem {
  name: string;
  category: string;
  urgency: 'High' | 'Medium' | 'Low';
  price: string;
  estimatedQuantity: string;
  description: string;
  justification: string;
  supplier: string;
}

export interface DraftRepairResult {
  totalEstimatedCostRange: string;
  overallConditionAssessment: string;
  expertRepairAdvice: string;
  repairItems: DraftRepairItem[];
  isDraft: boolean;
}

export function generateDraftRepairEstimation(
  config: HouseConfig,
  metrics: SimulationMetrics,
  damageCost: number
): DraftRepairResult {
  const isCollapsed = metrics.collapsed;
  const stress = metrics.stressPct;
  const stories = config.stories;
  const material = config.material;

  // 1. Calculate realistic cost range
  let lowCost = Math.round(damageCost * 0.85);
  let highCost = Math.round(damageCost * 1.15);
  if (lowCost === 0) lowCost = Math.round(stress * 0.4);
  if (highCost === 0) highCost = Math.round(stress * 0.6 + 2);

  const totalEstimatedCostRange = `$${lowCost}k - $${highCost}k`;

  // 2. Formulate Overall Assessment
  let overallConditionAssessment = "";
  let expertRepairAdvice = "";

  if (isCollapsed) {
    overallConditionAssessment = `CRITICAL FAILURE: Complete structural collapse of the ${stories}-story ${getMaterialFriendlyName(material)} structure under a Magnitude ${config.magnitude} earthquake.`;
    expertRepairAdvice = "Immediate safety evacuation and site lockdown required. Frame has buckled, yielding joints fully. Recommend absolute demolition followed by foundation reinforcement, base isolation retrofitting, and lightweight structural steel redesign.";
  } else if (stress > 70) {
    overallConditionAssessment = `SEVERE STRUCTURAL DAMAGE: The ${stories}-story structure sustained high-intensity stress (${stress.toFixed(0)}%) with widespread hairline yielding. Joints and columns are near plastic deform limit.`;
    expertRepairAdvice = "High risk of collapse in minor aftershocks. Restrict building occupancy immediately. Priority is localized epoxy injection, carbon fiber polymer wrapping around column connection nodes, and bracing expansion.";
  } else if (stress > 30) {
    overallConditionAssessment = `MODERATE DEFECTS: Stable but micro-fractured ${stories}-story structure. Elastic stress thresholds peaked at ${stress.toFixed(0)}% at foundation shear interfaces.`;
    expertRepairAdvice = "Minor structural drift detected. Clear cracks along primary partition planes and joint interfaces. Recommend tension bolt retorquing, joint dampening checks, and structural steel plate bracing.";
  } else {
    overallConditionAssessment = `STABLE / WELL SECURED: Structure sustained minor elastic vibrations (${stress.toFixed(0)}% peak stress) under Magnitude ${config.magnitude} shock wave.`;
    expertRepairAdvice = "No urgent structural remediation. Minor aesthetic repair of localized cosmetic cracks. System functioned perfectly in the elastic zone. Maintenance checks on tuned dampeners recommended.";
  }

  // 3. Assemble dynamic repair item list
  const repairItems: DraftRepairItem[] = [];

  // Material-specific items
  if (material === 'masonry') {
    repairItems.push({
      name: "Fiber-Reinforced Polymeric (FRP) Mesh & High-Tensile Epoxy",
      category: "Structural Reinforcement",
      urgency: stress > 60 ? "High" : "Medium",
      price: "$195.00 / roll (Draft Est.)",
      estimatedQuantity: `${stories * 4} rolls`,
      description: "Glass/carbon fibers embedded in high-grade polymer matrices to wrap and strengthen brittle masonry walls.",
      justification: "Unreinforced brick lacks tensile flex capability. Polymeric mesh binds exterior faces, preventing shear diagonal cracking and crumbling.",
      supplier: "GCP Applied Technologies / McMaster-Carr"
    });
    repairItems.push({
      name: "Stainless Steel Thru-Wall Helical Tension Ties",
      category: "Wall-to-Diaphragm Ties",
      urgency: stress > 40 ? "High" : "Medium",
      price: "$22.00 / tie (Draft Est.)",
      estimatedQuantity: `${stories * 24} units`,
      description: "Stainless steel mechanical anchor ties driven through outer brick courses to bond inner framing elements.",
      justification: "Ensures brick veneer doesn't peel or delaminate from the floor and roof diaphragms during out-of-phase shaking.",
      supplier: "Simpson Strong-Tie Supply"
    });
    repairItems.push({
      name: "Type S High-Strength Non-Shrink Structural Mortar",
      category: "Masonry Grouting",
      urgency: "Medium",
      price: "$14.50 / 80lb bag (Draft Est.)",
      estimatedQuantity: `${stories * 15} bags`,
      description: "Specially formulated aggregate masonry mortar with high bonding resistance.",
      justification: "To tuckpoint and restore degraded joints and fill hairline masonry shear micro-fractures.",
      supplier: "QUIKRETE Pro Commercial"
    });
  } else if (material === 'concrete') {
    repairItems.push({
      name: "High-Tensile Carbon Fiber Wrap (CFRP Grid)",
      category: "Column/Joint Wrapping",
      urgency: stress > 60 ? "High" : "Medium",
      price: "$275.00 / grid (Draft Est.)",
      estimatedQuantity: `${stories * 6} packages`,
      description: "Composite carbon fiber system used to wrap concrete column bases and joints for shear reinforcement.",
      justification: "Confines the concrete columns, vastly improving ductility and energy dissipation under heavy plastic load cycles.",
      supplier: "Sika Corporation Industrial"
    });
    repairItems.push({
      name: "Structural Crack Sealing Epoxy Injection Resin",
      category: "Foundation & Beam Grouting",
      urgency: stress > 30 ? "High" : "Medium",
      price: "$48.00 / cartridge (Draft Est.)",
      estimatedQuantity: `${stories * 8} cartridges`,
      description: "Super low viscosity, deep penetrating epoxy resin designed to fill internal concrete fractures.",
      justification: "Restores core structural integrity and protects internal steel rebars from atmospheric oxidation and rust.",
      supplier: "Simpson Strong-Tie / Grainger"
    });
  } else if (material === 'steel') {
    repairItems.push({
      name: "A325 Heavy-Hex Structural Framing Bolts",
      category: "Joint Fasteners",
      urgency: stress > 50 ? "High" : "Medium",
      price: "$3.50 / unit (Draft Est.)",
      estimatedQuantity: `${stories * 40} units`,
      description: "High-strength quenched and tempered steel fasteners with structural hex washers.",
      justification: "To replace sheared or over-torqued framing bolts along beam-column intersection gussets.",
      supplier: "Fastenal Corporation"
    });
    repairItems.push({
      name: "ASTM A36 Steel Gusset Plates (3/8 in. Thick)",
      category: "Joint Plate Reinforcements",
      urgency: stress > 70 ? "High" : "Medium",
      price: "$92.00 / plate (Draft Est.)",
      estimatedQuantity: `${stories * 8} plates`,
      description: "Structural grade steel plate elements for reinforcing portal frame connections.",
      justification: "Increases stress transmission surface area at joint intersections to prevent local frame buckling.",
      supplier: "McMaster-Carr Industrial"
    });
  } else if (material === 'timber') {
    repairItems.push({
      name: "Heavy-Duty Galvanized Structural Tie Plates & Hurricane Ties",
      category: "Framing Connections",
      urgency: stress > 50 ? "High" : "Medium",
      price: "$8.50 / plate (Draft Est.)",
      estimatedQuantity: `${stories * 30} plates`,
      description: "High-strength timber connectors with precise pre-drilled fastening layouts.",
      justification: "Secures joists to vertical studs, resisting high vertical acceleration forces and uplift.",
      supplier: "Simpson Strong-Tie / Home Depot"
    });
    repairItems.push({
      name: "Structural Timber Framing Screws (SDWS/SDWC)",
      category: "Fasteners",
      urgency: "Medium",
      price: "$68.00 / box of 50 (Draft Est.)",
      estimatedQuantity: `${stories * 4} boxes`,
      description: "Double-barrier coated heavy-duty structural wood screws.",
      justification: "Provides extreme lateral shear hold-down and prevents wood member splits.",
      supplier: "FastenMaster Supply"
    });
  } else if (material === 'bamboo') {
    repairItems.push({
      name: "High-Tensile Braided Polyester/Nylon Lashings",
      category: "Joint Ties",
      urgency: "High",
      price: "$16.00 / roll (Draft Est.)",
      estimatedQuantity: `${stories * 8} rolls`,
      description: "Specially treated non-elastic synthetic braided ropes with high UV resilience.",
      justification: "To retie, reinforce, and tighten column-to-beam joints. Lightweight framework depends entirely on tight friction nodes.",
      supplier: "Local Marine & Utility Hardware"
    });
    repairItems.push({
      name: "Treated Guadua Structural Bamboo Poles (3in x 10ft)",
      category: "Frame Members",
      urgency: stress > 65 ? "High" : "Medium",
      price: "$32.00 / pole (Draft Est.)",
      estimatedQuantity: `${stories * 6} poles`,
      description: "Premium structural-grade cured bamboo poles with boron treatment for rot resistance.",
      justification: "To swap out minor cracked bamboo struts that buckled during severe sway cycles.",
      supplier: "Specialty Bamboo Importers / Growers"
    });
  } else if (material === 'sma') {
    repairItems.push({
      name: "Superelastic Nitinol (Ni-Ti) Wire & Rod Elements",
      category: "Smart Tensioners",
      urgency: "Medium",
      price: "$150.00 / meter (Draft Est.)",
      estimatedQuantity: `${stories * 5} meters`,
      description: "Shape Memory Alloy wires displaying pseudoelastic properties under strain.",
      justification: "Used as self-centering tension elements that expand under load and contract back to original lengths.",
      supplier: "SAES Getters / Dynalloy"
    });
  }

  // Technique specific items
  if (config.techniques.includes('isolation')) {
    repairItems.push({
      name: "Lead-Rubber Bearing & Elastomeric Isolator Core Retrofit Kits",
      category: "Base Isolation Maintenance",
      urgency: stress > 60 ? "High" : "Low",
      price: "$2,200.00 / bearing (Draft Est.)",
      estimatedQuantity: "4 bearings",
      description: "Alternate layers of vulcanized rubber and steel plates with a solid high-purity lead cylinder core.",
      justification: "Ensures structural decoupling interface remains flexible and returns perfectly to rest position.",
      supplier: "Dynamic Isolation Systems (DIS)"
    });
  }

  if (config.techniques.includes('damper')) {
    repairItems.push({
      name: "Viscous Fluid Damper Cylinder Seal Kit & High-Viscosity Silicone Fluid",
      category: "Tuned Mass Damper Maintenance",
      urgency: stress > 50 ? "High" : "Low",
      price: "$480.00 / cylinder (Draft Est.)",
      estimatedQuantity: "1 kit",
      description: "Specialized hydraulic seal components and synthetic high-viscosity damping oil.",
      justification: "Tuned Mass Dampers rely on fluid cylinder resistance to convert kinetic sway to thermal dissipation.",
      supplier: "Taylor Devices Inc."
    });
  }

  if (config.techniques.includes('bracing')) {
    repairItems.push({
      name: "Heavy Tension-Rod Turnbuckle Assemblies",
      category: "Diagonal Bracing",
      urgency: "Medium",
      price: "$135.00 / unit (Draft Est.)",
      estimatedQuantity: `${stories * 4} units`,
      description: "Double end threaded tension rods with adjusting hex couplers.",
      justification: "Allows easy recalibration and retensioning of diagonal braces to stiffen cross frames.",
      supplier: "McMaster-Carr / Fastenal"
    });
  }

  return {
    totalEstimatedCostRange,
    overallConditionAssessment,
    expertRepairAdvice,
    repairItems,
    isDraft: true
  };
}

function getMaterialFriendlyName(material: string): string {
  switch (material) {
    case 'masonry': return 'Unreinforced Brick Masonry';
    case 'concrete': return 'Reinforced Concrete';
    case 'steel': return 'Structural Steel Frame';
    case 'timber': return 'Timber Wood Frame';
    case 'bamboo': return 'Sustainable Bamboo Frame';
    case 'sma': return 'Smart Shape Memory Alloy (SMA)';
    default: return 'Custom Frame';
  }
}
