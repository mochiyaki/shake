import React, { useEffect, useRef, useState } from 'react';
import { MATERIALS, TECHNIQUES, HouseConfig, SimulationMetrics } from '../types';
import { RotateCw, Maximize2, ShieldAlert, CheckCircle2, AlertTriangle, Eye, HelpCircle, Flame } from 'lucide-react';

interface SimulatorProps {
  config: HouseConfig;
  onSimulationFinished: (metrics: SimulationMetrics) => void;
  isShaking: boolean;
  setIsShaking: (shake: boolean) => void;
}

export default function EarthquakeSimulator({
  config,
  onSimulationFinished,
  isShaking,
  setIsShaking
}: SimulatorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Camera angles (radians) inside Refs for 60 FPS rotation without React re-renders
  const yawRef = useRef<number>(-0.6); // Horizontal rotation
  const pitchRef = useRef<number>(0.3); // Vertical rotation
  const zoomRef = useRef<number>(1.2);
  const autoRotateRef = useRef<boolean>(false);
  
  // Keep standard states for zoom slider and orbit button UI ONLY
  const [zoom, setZoom] = useState<number>(1.2);
  const [autoRotate, setAutoRotate] = useState<boolean>(false);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const showHeatmapRef = useRef<boolean>(true);
  
  // Tracking drag state
  const isDraggingRef = useRef<boolean>(false);
  const previousMouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Physics simulation references
  const animationFrameId = useRef<number | null>(null);
  const timeRef = useRef<number>(0);
  
  // Real-time metrics React state (only updated once on collapse or simulation finished)
  const [metrics, setMetrics] = useState<SimulationMetrics>({
    maxSway: 0,
    maxShear: 0,
    stressPct: 0,
    collapsed: false,
    collapseReason: '',
    frequencies: []
  });

  // DOM Refs for high-performance direct HUD updates
  const swayValRef = useRef<HTMLSpanElement | null>(null);
  const shearValRef = useRef<HTMLSpanElement | null>(null);
  const stressValRef = useRef<HTMLSpanElement | null>(null);
  const stressBarRef = useRef<HTMLDivElement | null>(null);
  const safetyBadgeRef = useRef<HTMLSpanElement | null>(null);
  const simProgressTextRef = useRef<HTMLSpanElement | null>(null);
  const simProgressBarRef = useRef<HTMLDivElement | null>(null);
  const simProgressContainerRef = useRef<HTMLDivElement | null>(null);

  // Dynamic values for physics
  const floorDisplacementsRef = useRef<number[]>([]);
  const damperSwayRef = useRef<number>(0); // top floor damper swing offset
  const cracksRef = useRef<Array<{ floor: number; x: number; y: number; length: number; angle: number; intensity: number }>>([]);
  const brokenBracesRef = useRef<Record<number, boolean>>({});
  const collapseRatioRef = useRef<number>(0); // 0 (intact) to 1 (collapsed)
  const baseOffsetRef = useRef<number>(0); // Base isolation movement

  // Sync state values with refs for usage inside animation loop
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    autoRotateRef.current = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    showHeatmapRef.current = showHeatmap;
  }, [showHeatmap]);

  const prevConfigRef = useRef(config);
  const prevIsShakingRef = useRef(isShaking);

  // Initialize and reset simulation states when config changes or a new shake is triggered
  useEffect(() => {
    const configChanged = 
      prevConfigRef.current.stories !== config.stories ||
      prevConfigRef.current.material !== config.material ||
      JSON.stringify(prevConfigRef.current.techniques) !== JSON.stringify(config.techniques) ||
      prevConfigRef.current.magnitude !== config.magnitude;
      
    const startedShaking = isShaking && !prevIsShakingRef.current;

    // Only reset if configuration changed OR we started a new shaking simulation
    if (configChanged || startedShaking) {
      floorDisplacementsRef.current = Array(config.stories + 1).fill(0);
      damperSwayRef.current = 0;
      cracksRef.current = [];
      brokenBracesRef.current = {};
      collapseRatioRef.current = 0;
      baseOffsetRef.current = 0;
      timeRef.current = 0;

      // Reset HUD text and bars directly in the DOM
      if (swayValRef.current) swayValRef.current.textContent = '0.0 mm';
      if (shearValRef.current) shearValRef.current.textContent = '0 kN';
      if (stressValRef.current) {
        stressValRef.current.textContent = '0%';
        stressValRef.current.className = 'font-mono font-bold text-emerald-400';
      }
      if (stressBarRef.current) {
        stressBarRef.current.style.width = '0%';
        stressBarRef.current.className = 'h-full bg-emerald-500';
      }
      if (safetyBadgeRef.current) {
        safetyBadgeRef.current.textContent = 'SAFE';
        safetyBadgeRef.current.className = 'text-xs px-2.5 py-0.5 rounded-full border font-mono font-medium text-green-500 bg-green-950 border-green-800';
      }
      if (simProgressContainerRef.current) {
        simProgressContainerRef.current.style.display = isShaking ? 'block' : 'none';
      }
      if (simProgressTextRef.current) {
        simProgressTextRef.current.textContent = 'TEST TIMELINE: 0%';
      }
      if (simProgressBarRef.current) {
        simProgressBarRef.current.style.width = '0%';
      }

      setMetrics({
        maxSway: 0,
        maxShear: 0,
        stressPct: 0,
        collapsed: false,
        collapseReason: '',
        frequencies: []
      });
    }

    // Always keep simulation progress visibility synchronized
    if (simProgressContainerRef.current) {
      simProgressContainerRef.current.style.display = isShaking ? 'block' : 'none';
    }

    prevConfigRef.current = config;
    prevIsShakingRef.current = isShaking;
  }, [config, isShaking]);

  // Handle Dragging to rotate (directly updates Refs for 60 FPS performance)
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDraggingRef.current = true;
    previousMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - previousMouseRef.current.x;
    const deltaY = e.clientY - previousMouseRef.current.y;
    
    yawRef.current += deltaX * 0.007;
    pitchRef.current = Math.max(-0.2, Math.min(1.2, pitchRef.current + deltaY * 0.007));
    
    previousMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUpOrLeave = () => {
    isDraggingRef.current = false;
  };

  // Main Render and Physics loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let localMaxSway = 0;
    let localMaxShear = 0;
    let localMaxStress = 0;
    let hasCollapsed = false;
    let collapseReasonStr = '';

    const materialInfo = MATERIALS[config.material];
    const hasBracing = config.techniques.includes('bracing');
    const hasWalls = config.techniques.includes('walls');
    const hasIsolation = config.techniques.includes('isolation');
    const hasDamper = config.techniques.includes('damper');

    // Trigger calculation parameters
    const totalMass = config.stories * 50000 * materialInfo.density; // kg
    const baseStiffness = (1.5 - materialInfo.stiffness * 0.8) * 1000000; // N/m (softer material sways more)
    
    const render = () => {
      // Clear with background color
      ctx.fillStyle = '#0b0f19'; // Rich deep dark
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Auto-rotation (updates Ref directly, no React state change)
      if (autoRotateRef.current && !isDraggingRef.current) {
        yawRef.current += 0.003;
      }

      // Time advance if shaking
      if (isShaking) {
        timeRef.current += 0.055;
        const progress = Math.min(100, (timeRef.current / 12) * 100);
        
        // Update simulation progress directly in DOM
        if (simProgressTextRef.current) {
          simProgressTextRef.current.textContent = `TEST TIMELINE: ${Math.round(progress)}%`;
        }
        if (simProgressBarRef.current) {
          simProgressBarRef.current.style.width = `${progress}%`;
        }
        
        if (progress >= 100) {
          setIsShaking(false);
          if (simProgressContainerRef.current) {
            simProgressContainerRef.current.style.display = 'none';
          }
          const finalMetrics = {
            maxSway: parseFloat(localMaxSway.toFixed(1)),
            maxShear: parseFloat(localMaxShear.toFixed(0)),
            stressPct: Math.min(100, Math.round(localMaxStress)),
            collapsed: hasCollapsed,
            collapseReason: collapseReasonStr,
            frequencies: [1.2 + (5 - config.stories) * 0.3, 0.8]
          };
          setMetrics(finalMetrics);
          onSimulationFinished(finalMetrics);
        }
      }

      const t = timeRef.current;
      const mag = config.magnitude;

      // 1. Calculate Earthquake Force (Acceleration Wave)
      // Compound wave with main S-wave burst around t = 3 to 7
      let groundMotion = 0;
      if (isShaking) {
        const envelope = Math.exp(-0.08 * Math.pow(t - 5.5, 2)); // Bell curve centered around 5.5s
        groundMotion = mag * 16 * Math.sin(t * 1.8) * Math.cos(t * 0.6) * envelope;
        
        // Add high-frequency noise
        groundMotion += mag * 3 * Math.sin(t * 4.5) * envelope;
      }

      // 2. Structural Response Calculations
      const isolationFactor = hasIsolation ? 0.15 : 1.0;
      const dampingRatio = 0.02 + (materialInfo.ductility * 0.08) + 
                          (hasIsolation ? 0.15 : 0) + 
                          (hasDamper ? 0.20 : 0);

      // Sway propagation up the building (multi-degree of freedom)
      const swayAmplitude = isShaking 
        ? groundMotion * isolationFactor * (1.2 - dampingRatio * 0.8)
        : 0;

      // Base offset due to isolation movement
      if (hasIsolation && isShaking) {
        baseOffsetRef.current = groundMotion * 0.9 * Math.cos(t * 0.3);
      } else if (!isShaking) {
        baseOffsetRef.current += (0 - baseOffsetRef.current) * 0.1; // slow center
      }

      // Calculate floor displacements (whiplash effect)
      for (let f = 1; f <= config.stories; f++) {
        const heightMultiplier = Math.pow(f / config.stories, 1.4); // whip on top floors
        const resonance = 1 + Math.sin(t * (1.5 - config.stories * 0.15)) * (config.stories * 0.12);
        
        let relativeSway = swayAmplitude * heightMultiplier * resonance;
        
        // Stiffening effects
        if (hasBracing) relativeSway *= 0.6;
        if (hasWalls) relativeSway *= 0.45;

        // Apply physical elasticity
        if (config.material === 'bamboo') {
          relativeSway *= 1.3; // super flexible
        } else if (config.material === 'masonry') {
          relativeSway *= 0.4; // brittle, cracks instead of swaying
        }

        // Dampening absorption
        if (hasDamper) {
          relativeSway *= 0.55;
        }

        // Apply to ref
        if (!hasCollapsed) {
          floorDisplacementsRef.current[f] = relativeSway;
        }
      }

      // Base shear force estimation (kN)
      const baseDisplacement = Math.abs(floorDisplacementsRef.current[1] || 0);
      const estimatedShear = isShaking
        ? (baseDisplacement * baseStiffness * 0.005 * (1 + config.stories * 0.15) * (hasIsolation ? 0.2 : 1.0)) / 1000
        : 0;
      localMaxShear = Math.max(localMaxShear, estimatedShear);

      // 3. Stress & Failure Assessment
      let buildingStress = 0;
      if (isShaking) {
        // Stress grows with height, magnitude, density (mass), stiffness (brittle masonry)
        const stiffnessWeight = materialInfo.density * (1.2 + (1.0 - materialInfo.ductility) * 1.5);
        const rawStress = mag * (1.1 + config.stories * 0.35) * stiffnessWeight;

        // Protection discounts
        let mitigation = 1.0;
        if (hasIsolation) mitigation *= 0.20; // 80% reduction
        if (hasDamper) mitigation *= 0.60; // 40% reduction
        if (hasBracing) mitigation *= 0.70; // 30% reduction
        if (hasWalls) mitigation *= 0.55; // 45% reduction

        buildingStress = rawStress * mitigation * 8.5; // Scale to 100 max
        localMaxStress = Math.max(localMaxStress, buildingStress);
      }

      // Material limits for collapse
      const failureLimits: Record<string, number> = {
        masonry: 40,
        concrete: 70,
        timber: 80,
        bamboo: 85,
        steel: 95,
        sma: 110
      };

      const limit = failureLimits[config.material];
      if (buildingStress > limit && !hasCollapsed) {
        hasCollapsed = true;
        collapseReasonStr = `The structure experienced structural stress (${Math.round(buildingStress)}%) exceeding the limit of ${materialInfo.name} (${limit}%). `;
        
        if (config.material === 'masonry') {
          collapseReasonStr += "Brittle brick structures fail immediately under lateral shear waves as they cannot bend.";
        } else if (config.material === 'concrete') {
          collapseReasonStr += "Extreme lateral forces cracked and sheared the concrete columns, inducing structural pancaking.";
        } else {
          collapseReasonStr += "The structural yield limit was surpassed, inducing elastic deformation failure and collapse.";
        }

        // Trigger React state update ONCE upon collapse (safe from loops)
        setMetrics((prev) => ({
          ...prev,
          collapsed: true,
          collapseReason: collapseReasonStr,
          stressPct: Math.min(100, Math.round(buildingStress))
        }));
      }

      // If collapsed, building crumbles downwards
      if (hasCollapsed) {
        collapseRatioRef.current = Math.min(1.0, collapseRatioRef.current + 0.03);
        
        // Slowly squash the building height
        for (let f = 1; f <= config.stories; f++) {
          // Slide floors sideways and squish vertically
          floorDisplacementsRef.current[f] += (Math.sin(f) * 15 * collapseRatioRef.current - floorDisplacementsRef.current[f]) * 0.1;
        }
      }

      // Max drift/sway estimation
      const maxDisplacement = Math.max(...floorDisplacementsRef.current.map(Math.abs));
      localMaxSway = Math.max(localMaxSway, maxDisplacement * 4.2); // scale to mm

      // Damper Pendulum Physics
      if (hasDamper) {
        const topSway = floorDisplacementsRef.current[config.stories] || 0;
        // Sway out of phase
        damperSwayRef.current += (-topSway * 1.5 - damperSwayRef.current) * 0.25;
      }

      // Generate Cracks dynamically based on stress
      if (isShaking && buildingStress > 15 && (config.material === 'masonry' || config.material === 'concrete')) {
        if (Math.random() < 0.08 && cracksRef.current.length < 15) {
          cracksRef.current.push({
            floor: Math.floor(Math.random() * config.stories) + 1,
            x: (Math.random() - 0.5) * 50,
            y: (Math.random() - 0.5) * 20,
            length: 10 + Math.random() * 20,
            angle: (Math.random() - 0.5) * 0.6,
            intensity: Math.random()
          });
        }
      }

      // Break braces if stress is high
      if (hasBracing && buildingStress > 45) {
        for (let f = 1; f <= config.stories; f++) {
          if (!brokenBracesRef.current[f] && Math.random() < 0.02 * (buildingStress / 45)) {
            brokenBracesRef.current[f] = true;
          }
        }
      }

      // 4. DRAWING COORDINATE SETUP & 3D ROTATION ENGINE
      const center_x = canvas.width / 2;
      const center_y = canvas.height / 2 + 80 - (config.stories * 25); // shift down based on heights
      const scale = zoomRef.current;
      const camera_dist = 400;

      // Rotation matrix values
      const cos_yaw = Math.cos(yawRef.current);
      const sin_yaw = Math.sin(yawRef.current);
      const cos_pitch = Math.cos(pitchRef.current);
      const sin_pitch = Math.sin(pitchRef.current);

      // Helper: 3D point to 2D projection
      const project = (x: number, y: number, z: number) => {
        // Translate ground shake
        const shakeX = isShaking ? groundMotion * 1.2 : 0;
        
        // Rotate around Y (yaw)
        const rx1 = x * cos_yaw - z * sin_yaw;
        const rz1 = x * sin_yaw + z * cos_yaw;
        const ry1 = y;

        // Rotate around X (pitch)
        const rx2 = rx1;
        const ry2 = ry1 * cos_pitch - rz1 * sin_pitch;
        const rz2 = ry1 * sin_pitch + rz1 * cos_pitch;

        // Apply perspective projection
        const persp = 350 / (camera_dist + rz2);
        
        return {
          x: center_x + (rx2 + shakeX) * persp * scale,
          y: center_y - ry2 * persp * scale,
          z: rz2
        };
      };

      // 5. DRAWING ELEMENTS (Back to Front depth sorting)
      
      // Draw grid ground plane
      const gridSize = 140;
      const gridCount = 8;
      ctx.strokeStyle = 'rgba(74, 85, 104, 0.25)';
      ctx.lineWidth = 1;
      
      for (let i = -gridCount; i <= gridCount; i++) {
        // Parallel X lines
        const p1 = project(-gridSize, 0, (i * gridSize) / gridCount);
        const p2 = project(gridSize, 0, (i * gridSize) / gridCount);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        // Parallel Z lines
        const p3 = project((i * gridSize) / gridCount, 0, -gridSize);
        const p4 = project((i * gridSize) / gridCount, 0, gridSize);
        ctx.beginPath();
        ctx.moveTo(p3.x, p3.y);
        ctx.lineTo(p4.x, p4.y);
        ctx.stroke();
      }

      // Highlight epicenter epicenter rings under shake
      if (isShaking) {
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.4 * Math.sin(t * 10)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const r1 = project(-30, 0, -30);
        const r2 = project(30, 0, 30);
        // Draw epicentral glowing ellipses
        for (let rad = 20; rad <= 120; rad += 30) {
          const intensity = (1 - (rad / 120)) * 0.4;
          ctx.strokeStyle = `rgba(239, 68, 68, ${intensity * (Math.abs(groundMotion) / 10)})`;
          ctx.beginPath();
          for (let th = 0; th <= Math.PI * 2; th += 0.2) {
            const gx = Math.cos(th) * rad;
            const gz = Math.sin(th) * rad;
            const gp = project(gx, 0, gz);
            if (th === 0) ctx.moveTo(gp.x, gp.y);
            else ctx.lineTo(gp.x, gp.y);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }

      // Draw sliding base isolator plate if Base Isolation is present
      const W = 70;
      const D = 70;
      const H = 40; // Floor height

      if (hasIsolation) {
        // Draw the fixed concrete sub-base
        ctx.fillStyle = '#1a202c';
        ctx.strokeStyle = '#4a5568';
        ctx.lineWidth = 2;

        const subP1 = project(-W - 10, -10, -D - 10);
        const subP2 = project(W + 10, -10, -D - 10);
        const subP3 = project(W + 10, -10, D + 10);
        const subP4 = project(-W - 10, -10, D + 10);

        ctx.beginPath();
        ctx.moveTo(subP1.x, subP1.y);
        ctx.lineTo(subP2.x, subP2.y);
        ctx.lineTo(subP3.x, subP3.y);
        ctx.lineTo(subP4.x, subP4.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Draw Rolling Rubber Bearings/Cylinders
        const bearings = [
          { x: -W + 15, z: -D + 15 },
          { x: W - 15, z: -D + 15 },
          { x: W - 15, z: D - 15 },
          { x: -W + 15, z: D - 15 },
        ];

        bearings.forEach((b) => {
          // Cylinder coordinates
          const bX = b.x + baseOffsetRef.current * 0.5;
          const bY = -5;
          const bZ = b.z;

          const bp = project(bX, bY, bZ);
          
          ctx.beginPath();
          ctx.arc(bp.x, bp.y, 8 * scale * (250 / (camera_dist + bp.z)), 0, Math.PI * 2);
          ctx.fillStyle = '#ef4444'; // Glowing isolator core
          ctx.shadowBlur = isShaking ? 8 : 0;
          ctx.shadowColor = '#ef4444';
          ctx.fill();
          ctx.shadowBlur = 0; // reset
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }

      // 6. DRAW THE HOUSE
      // Calculate coordinates of all nodes
      const floorNodes: Array<Array<{ x: number; y: number; z: number }>> = [];

      for (let f = 0; f <= config.stories; f++) {
        const floorY = f * H * (1 - collapseRatioRef.current * 0.85); // Compress under collapse
        const sway = floorDisplacementsRef.current[f] || 0;
        
        // Base plate offset (rigid body motion if base isolated)
        const isolatorShift = hasIsolation ? baseOffsetRef.current : 0;

        // Vertices for the 4 corners of the floor
        const nodes = [
          { x: -W + sway + isolatorShift, y: floorY, z: -D }, // Back Left
          { x: W + sway + isolatorShift, y: floorY, z: -D },  // Back Right
          { x: W + sway + isolatorShift, y: floorY, z: D },   // Front Right
          { x: -W + sway + isolatorShift, y: floorY, z: D }    // Front Left
        ];
        floorNodes.push(nodes);
      }

      // Draw Floor Plates (Bottom-Up)
      for (let f = 0; f <= config.stories; f++) {
        const nodes = floorNodes[f];
        const projNodes = nodes.map(n => project(n.x, n.y, n.z));

        // Draw solid floor slab
        ctx.fillStyle = f === 0 
          ? 'rgba(45, 55, 72, 0.85)' // heavy foundation slab
          : 'rgba(26, 32, 44, 0.85)';
        
        ctx.beginPath();
        ctx.moveTo(projNodes[0].x, projNodes[0].y);
        ctx.lineTo(projNodes[1].x, projNodes[1].y);
        ctx.lineTo(projNodes[2].x, projNodes[2].y);
        ctx.lineTo(projNodes[3].x, projNodes[3].y);
        ctx.closePath();
        ctx.fill();

        // Edge perimeter lines
        ctx.strokeStyle = config.material === 'masonry' ? '#78350f' : '#cbd5e0';
        ctx.lineWidth = f === 0 ? 3 : 2;
        ctx.stroke();
        
        // Draw masonry brick texture inside walls if URM
        if (config.material === 'masonry' && f > 0) {
          ctx.fillStyle = 'rgba(139, 92, 26, 0.15)';
          ctx.beginPath();
          const prevProj = floorNodes[f-1].map(n => project(n.x, n.y, n.z));
          // Draw solid side walls
          ctx.moveTo(prevProj[3].x, prevProj[3].y);
          ctx.lineTo(projNodes[3].x, projNodes[3].y);
          ctx.lineTo(projNodes[2].x, projNodes[2].y);
          ctx.lineTo(prevProj[2].x, prevProj[2].y);
          ctx.closePath();
          ctx.fill();
        }
      }

      // Draw Vertical Columns & Structural Walls & Bracing
      for (let f = 1; f <= config.stories; f++) {
        const lowerNodes = floorNodes[f - 1];
        const upperNodes = floorNodes[f];

        const lProj = lowerNodes.map(n => project(n.x, n.y, n.z));
        const uProj = upperNodes.map(n => project(n.x, n.y, n.z));

        // Determine stress color of the floor columns
        let floorStressFactor = (buildingStress / 100) * (f / config.stories);
        if (hasCollapsed) floorStressFactor = 1.0;
        
        const stressColor = hasCollapsed 
          ? '#ef4444' 
          : floorStressFactor > 0.7 
            ? '#f59e0b' // high Orange
            : floorStressFactor > 0.4
              ? '#facc15' // Yellow
              : materialInfo.beamColor;

        // Draw vertical columns
        for (let c = 0; c < 4; c++) {
          ctx.strokeStyle = stressColor;
          ctx.lineWidth = config.material === 'concrete' ? 5 : config.material === 'steel' ? 4 : 3;
          ctx.beginPath();
          ctx.moveTo(lProj[c].x, lProj[c].y);
          
          // Bend columns under high sway to show elasticity
          const midX = (lProj[c].x + uProj[c].x) / 2;
          const midY = (lProj[c].y + uProj[c].y) / 2;
          const deltaX = uProj[c].x - lProj[c].x;
          
          // If bamboo/timber/steel, columns bow elegantly, if concrete/masonry, they bend/fail rigidly
          if (config.material === 'bamboo' || config.material === 'steel') {
            ctx.quadraticCurveTo(midX - deltaX * 0.15, midY, uProj[c].x, uProj[c].y);
          } else {
            ctx.lineTo(uProj[c].x, uProj[c].y);
          }
          ctx.stroke();
        }

        // Draw Shear Walls if enabled (semi-transparent concrete panels on left/right walls)
        if (hasWalls) {
          ctx.fillStyle = `rgba(100, 110, 130, ${0.45 - (buildingStress / 300)})`;
          ctx.strokeStyle = '#475569';
          ctx.lineWidth = 1;
          
          // Left Wall Panel (Nodes 0 -> 3)
          ctx.beginPath();
          ctx.moveTo(lProj[0].x, lProj[0].y);
          ctx.lineTo(uProj[0].x, uProj[0].y);
          ctx.lineTo(uProj[3].x, uProj[3].y);
          ctx.lineTo(lProj[3].x, lProj[3].y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Right Wall Panel (Nodes 1 -> 2)
          ctx.beginPath();
          ctx.moveTo(lProj[1].x, lProj[1].y);
          ctx.lineTo(uProj[1].x, uProj[1].y);
          ctx.lineTo(uProj[2].x, uProj[2].y);
          ctx.lineTo(lProj[2].x, lProj[2].y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }

        // Draw Cross Bracing if enabled
        if (hasBracing) {
          ctx.lineWidth = 2;
          const isBraceBroken = brokenBracesRef.current[f] || false;

          // Draw diagonals
          const drawBraceLine = (p1: any, p2: any) => {
            if (isBraceBroken) {
              // Draw snapped brace in halves
              const mx = (p1.x + p2.x) / 2;
              const my = (p1.y + p2.y) / 2;
              ctx.strokeStyle = '#ef4444';
              
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(mx - 5, my + 5);
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(mx + 5, my - 5);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
              
              // Draw mini spark particle
              if (Math.random() < 0.1 && isShaking) {
                ctx.fillStyle = '#fbbf24';
                ctx.fillRect(mx + (Math.random() - 0.5) * 10, my + (Math.random() - 0.5) * 10, 3, 3);
              }
            } else {
              ctx.strokeStyle = '#22c55e'; // safe brace green
              ctx.beginPath();
              ctx.moveTo(p1.x, p1.y);
              ctx.lineTo(p2.x, p2.y);
              ctx.stroke();
            }
          };

          // Left side wall (0 -> 3 diagonals)
          drawBraceLine(lProj[0], uProj[3]);
          drawBraceLine(lProj[3], uProj[0]);

          // Right side wall (1 -> 2 diagonals)
          drawBraceLine(lProj[1], uProj[2]);
          drawBraceLine(lProj[2], uProj[1]);
        }
      }

      // Draw cracks on Masonry/Concrete walls
      cracksRef.current.forEach((crack) => {
        const floorIndex = crack.floor;
        if (floorIndex > config.stories) return;

        // Base coord of this floor wall center
        const lowerNodes = floorNodes[floorIndex - 1];
        const upperNodes = floorNodes[floorIndex];
        
        // Let's project middle wall nodes
        const lp = project((lowerNodes[3].x + lowerNodes[2].x)/2 + crack.x, (lowerNodes[3].y + upperNodes[3].y)/2 + crack.y, 0);
        
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1.5 + crack.intensity * 1.5;
        ctx.beginPath();
        ctx.moveTo(lp.x, lp.y);
        
        // Zig-zag crack drawing
        let curX = lp.x;
        let curY = lp.y;
        for (let s = 0; s < 4; s++) {
          curX += Math.cos(crack.angle + s) * (crack.length / 4);
          curY += Math.sin(crack.angle + s) * (crack.length / 4);
          ctx.lineTo(curX, curY);
        }
        ctx.stroke();
      });

      // Draw Pitched Roof on top of the last floor
      const topNodes = floorNodes[config.stories];
      const tProj = topNodes.map(n => project(n.x, n.y, n.z));
      
      // Calculate apex (center raised up)
      const roofSway = floorDisplacementsRef.current[config.stories] || 0;
      const roofShift = hasIsolation ? baseOffsetRef.current : 0;
      const apexY = (config.stories * H + 30) * (1 - collapseRatioRef.current * 0.85);
      const apexProj = project(roofSway + roofShift, apexY, 0);

      // Back roof facet
      ctx.fillStyle = '#9b2c2c'; // Red clay shingles
      ctx.beginPath();
      ctx.moveTo(tProj[0].x, tProj[0].y);
      ctx.lineTo(tProj[1].x, tProj[1].y);
      ctx.lineTo(apexProj.x, apexProj.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#742a2a';
      ctx.stroke();

      // Front roof facet
      ctx.fillStyle = '#c53030';
      ctx.beginPath();
      ctx.moveTo(tProj[3].x, tProj[3].y);
      ctx.lineTo(tProj[2].x, tProj[2].y);
      ctx.lineTo(apexProj.x, apexProj.y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#9b2c2c';
      ctx.stroke();

      // Draw Tuned Mass Damper (Top Floor Pendulum) if active
      if (hasDamper) {
        // Suspend hook from the top floor ceiling / roof base
        const roofBaseY = config.stories * H * (1 - collapseRatioRef.current * 0.85);
        const hookX = (topNodes[0].x + topNodes[2].x) / 2;
        const hookZ = (topNodes[0].z + topNodes[2].z) / 2;
        
        const hookProj = project(hookX, roofBaseY, hookZ);

        // Damper ball suspension coordinates (swaying dynamically out of phase)
        const ballX = hookX + damperSwayRef.current * 0.45;
        const ballY = roofBaseY - 25 * (1 - collapseRatioRef.current);
        const ballProj = project(ballX, ballY, hookZ);

        // Suspension cable
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(hookProj.x, hookProj.y);
        ctx.lineTo(ballProj.x, ballProj.y);
        ctx.stroke();

        // Massive metal ball
        ctx.fillStyle = '#38bdf8'; // Sky blue glowing alloy
        ctx.beginPath();
        ctx.arc(ballProj.x, ballProj.y, 7 * scale, 0, Math.PI * 2);
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#38bdf8';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // 6.5 VISUAL HEATMAP OVERLAY (Sustained/Dynamic Stress concentrations at foundation, joints, and floors)
      if (showHeatmapRef.current) {
        // Foundation Heatmap (f = 0)
        // High shear stress at the base
        const fNodes = floorNodes[0];
        if (fNodes) {
          const fProj = fNodes.map(n => project(n.x, n.y, n.z));
          const stressF = buildingStress / 100;
          
          // Draw a thermal boundary/radial fill around foundation
          ctx.fillStyle = `rgba(239, 68, 68, ${0.12 + stressF * 0.28})`;
          ctx.shadowBlur = 10 + stressF * 15;
          ctx.shadowColor = '#ef4444';
          ctx.beginPath();
          ctx.moveTo(fProj[0].x, fProj[0].y);
          ctx.lineTo(fProj[1].x, fProj[1].y);
          ctx.lineTo(fProj[2].x, fProj[2].y);
          ctx.lineTo(fProj[3].x, fProj[3].y);
          ctx.closePath();
          ctx.fill();
          ctx.shadowBlur = 0; // reset
          
          // Outer red perimeter showing shear field
          ctx.strokeStyle = `rgba(239, 68, 68, ${0.3 + stressF * 0.5})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Floors and Joints Heatmap
        for (let f = 1; f <= config.stories; f++) {
          const lowerNodes = floorNodes[f - 1];
          const upperNodes = floorNodes[f];
          if (!lowerNodes || !upperNodes) continue;

          const lProj = lowerNodes.map(n => project(n.x, n.y, n.z));
          const uProj = upperNodes.map(n => project(n.x, n.y, n.z));

          // Bending/Shear stress is typically higher on lower levels and near connections
          const floorStressFactor = Math.min(100, buildingStress * (1.15 - f * 0.15));
          const stressPct = Math.max(5, Math.min(100, floorStressFactor));

          // Compute color for floor and columns
          let color = '#10b981'; // green
          let r = 16, g = 185, b = 129;
          if (stressPct > 70) {
            color = '#ef4444'; // red
            r = 239; g = 68; b = 68;
          } else if (stressPct > 30) {
            color = '#f59e0b'; // orange/yellow
            r = 245; g = 158; b = 11;
          }

          // 1. Draw glowing columns indicating stress paths
          for (let c = 0; c < 4; c++) {
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.75)`;
            ctx.lineWidth = (config.material === 'concrete' ? 7 : 5) * scale;
            ctx.beginPath();
            ctx.moveTo(lProj[c].x, lProj[c].y);
            
            const midX = (lProj[c].x + uProj[c].x) / 2;
            const midY = (lProj[c].y + uProj[c].y) / 2;
            const deltaX = uProj[c].x - lProj[c].x;
            
            if (config.material === 'bamboo' || config.material === 'steel') {
              ctx.quadraticCurveTo(midX - deltaX * 0.15, midY, uProj[c].x, uProj[c].y);
            } else {
              ctx.lineTo(uProj[c].x, uProj[c].y);
            }
            ctx.stroke();
            
            // Outer glowing aura for columns
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.25)`;
            ctx.lineWidth = (config.material === 'concrete' ? 14 : 10) * scale;
            ctx.stroke();
          }

          // 2. Draw Floor Slab thermal overlay
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.15 + (stressPct / 100) * 0.2})`;
          ctx.beginPath();
          ctx.moveTo(uProj[0].x, uProj[0].y);
          ctx.lineTo(uProj[1].x, uProj[1].y);
          ctx.lineTo(uProj[2].x, uProj[2].y);
          ctx.lineTo(uProj[3].x, uProj[3].y);
          ctx.closePath();
          ctx.fill();

          // 3. Draw Joint stress spheres (where beams connect to columns)
          for (let c = 0; c < 4; c++) {
            const jointX = uProj[c].x;
            const jointY = uProj[c].y;
            
            // Draw localized stress circles
            ctx.beginPath();
            ctx.arc(jointX, jointY, (5 + (stressPct / 100) * 8) * scale, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.shadowBlur = 10 + (stressPct / 100) * 15;
            ctx.shadowColor = color;
            ctx.fill();
            ctx.shadowBlur = 0; // reset
            
            // Draw high-stress ripple
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.45)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(jointX, jointY, (10 + (stressPct / 100) * 15) * scale, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      // 7. HIGH PERFORMANCE DIRECT DOM HUD UPDATES (ZERO React state lag)
      if (swayValRef.current) {
        swayValRef.current.textContent = `${localMaxSway.toFixed(1)} mm`;
        if (localMaxSway > 120) {
          swayValRef.current.className = 'font-mono font-semibold text-red-400';
        } else {
          swayValRef.current.className = 'font-mono font-semibold text-emerald-400';
        }
      }
      if (shearValRef.current) {
        shearValRef.current.textContent = `${localMaxShear.toFixed(0)} kN`;
      }
      const roundedStress = Math.min(100, Math.round(buildingStress));
      if (stressValRef.current) {
        stressValRef.current.textContent = `${roundedStress}%`;
        if (roundedStress > 80) {
          stressValRef.current.className = 'font-mono font-bold text-red-400';
        } else if (roundedStress > 40) {
          stressValRef.current.className = 'font-mono font-bold text-yellow-400';
        } else {
          stressValRef.current.className = 'font-mono font-bold text-emerald-400';
        }
      }
      if (stressBarRef.current) {
        stressBarRef.current.style.width = `${roundedStress}%`;
        stressBarRef.current.className = `h-full transition-all duration-75 ${
          roundedStress > 80 ? 'bg-red-500' : roundedStress > 40 ? 'bg-yellow-500' : 'bg-emerald-500'
        }`;
      }
      if (safetyBadgeRef.current) {
        let label = 'SAFE';
        let colorClass = 'text-green-500 bg-green-950 border-green-800';
        if (hasCollapsed) {
          label = 'COLLAPSED';
          colorClass = 'text-red-500 bg-red-950 border-red-800';
        } else if (roundedStress > 75) {
          label = 'CRITICAL';
          colorClass = 'text-orange-500 bg-orange-950 border-orange-800 animate-pulse';
        } else if (roundedStress > 40) {
          label = 'STRESSED';
          colorClass = 'text-yellow-500 bg-yellow-950 border-yellow-800';
        }
        safetyBadgeRef.current.textContent = label;
        safetyBadgeRef.current.className = `text-xs px-2.5 py-0.5 rounded-full border font-mono font-medium ${colorClass}`;
      }

      // Continue animation loop
      animationFrameId.current = requestAnimationFrame(render);
    };

    // Kickstart
    render();

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [isShaking, config]);

  // Dynamic status indicators
  const getSafetyLevel = () => {
    if (metrics.collapsed) return { label: 'COLLAPSED', color: 'text-red-500 bg-red-950 border-red-800' };
    if (metrics.stressPct > 75) return { label: 'CRITICAL', color: 'text-orange-500 bg-orange-950 border-orange-800 animate-pulse' };
    if (metrics.stressPct > 40) return { label: 'STRESSED', color: 'text-yellow-500 bg-yellow-950 border-yellow-800' };
    return { label: 'SAFE', color: 'text-green-500 bg-green-950 border-green-800' };
  };

  const safety = getSafetyLevel();

  return (
    <div className="flex flex-col h-full bg-[#0d1321] rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
      {/* Simulation Stage Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-[#0b0f19]">
        <div className="flex items-center gap-2">
          <Maximize2 className="h-4 w-4 text-emerald-400 animate-pulse" />
          <h3 className="font-sans font-medium text-slate-200 tracking-tight text-sm">3D Seismic Testing Chamber</h3>
        </div>
        <div className="flex items-center gap-2">
          <span ref={safetyBadgeRef} className={`text-xs px-2.5 py-0.5 rounded-full border font-mono font-medium ${safety.color}`}>
            {safety.label}
          </span>
        </div>
      </div>

      {/* Main Interactive Canvas Stage */}
      <div className="relative flex-1 bg-[#0b0f19] cursor-grab active:cursor-grabbing">
        <canvas
          ref={canvasRef}
          width={600}
          height={380}
          className="w-full h-full block"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={handleMouseUpOrLeave}
        />

        {/* Rotation Help Alert overlay */}
        <div className="absolute top-3 left-3 bg-[#0d1321]/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5 select-none pointer-events-none">
          <Eye className="h-3 w-3 text-sky-400" />
          <span>Click & Drag to rotate building in 3D</span>
        </div>

        {/* Heatmap Legend Overlay */}
        {showHeatmap && (
          <div className="absolute top-14 left-3 bg-slate-950/85 backdrop-blur-md border border-slate-800/80 p-2.5 rounded-lg text-[10px] space-y-1.5 shadow-xl font-mono select-none pointer-events-none z-10">
            <div className="text-slate-300 font-bold uppercase tracking-wider text-[8px] border-b border-slate-800/60 pb-1">
              Stress Heatmap Scale
            </div>
            <div className="flex flex-col gap-1 text-[9px]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_5px_#ef4444]" />
                <span className="text-slate-400">Critical &gt;70% (Joint Yield)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_5px_#f59e0b]" />
                <span className="text-slate-400">Warning 30%-70% (Plastic)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_5px_#10b981]" />
                <span className="text-slate-400">Elastic &lt;30% (Intact)</span>
              </div>
            </div>
          </div>
        )}

        {/* Real-time HUD stats display */}
        <div className="absolute bottom-4 left-4 bg-slate-950/80 backdrop-blur-md border border-slate-800 p-4 rounded-xl min-w-[210px] space-y-2.5 shadow-2xl">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-800 pb-1">
            Structural Metrics HUD
          </div>
          
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Building Drift:</span>
            <span ref={swayValRef} className={`font-mono font-semibold ${metrics.maxSway > 120 ? 'text-red-400' : 'text-emerald-400'}`}>
              {metrics.maxSway} mm
            </span>
          </div>

          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400">Base Shear:</span>
            <span ref={shearValRef} className="font-mono text-slate-300 font-semibold">
              {metrics.maxShear} kN
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Dynamic Stress:</span>
              <span ref={stressValRef} className={`font-mono font-bold ${metrics.stressPct > 80 ? 'text-red-400' : metrics.stressPct > 40 ? 'text-yellow-400' : 'text-emerald-400'}`}>
                {metrics.stressPct}%
              </span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div 
                ref={stressBarRef}
                className={`h-full transition-all duration-75 ${
                  metrics.stressPct > 80 ? 'bg-red-500' : metrics.stressPct > 40 ? 'bg-yellow-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${metrics.stressPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Active Protection Badges overlay */}
        <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
          {config.techniques.map((techId) => {
            const tech = TECHNIQUES[techId];
            return (
              <span key={techId} className="bg-emerald-950/90 text-emerald-400 text-[10px] font-mono px-2 py-1 rounded border border-emerald-800/50 flex items-center gap-1 shadow-lg">
                <CheckCircle2 className="h-3 w-3" />
                {tech.name}
              </span>
            );
          })}
          {config.techniques.length === 0 && (
            <span className="bg-red-950/90 text-red-400 text-[10px] font-mono px-2 py-1 rounded border border-red-900/50 flex items-center gap-1 shadow-lg">
              <AlertTriangle className="h-3 w-3 animate-pulse" />
              Fixed Base (No Protections)
            </span>
          )}
        </div>

        {/* Dynamic collapse pop-up screen */}
        {metrics.collapsed && (
          <div className="absolute inset-0 bg-red-950/65 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center animate-fade-in">
            <div className="bg-slate-950/90 border border-red-500 p-6 rounded-2xl max-w-sm shadow-2xl space-y-4">
              <ShieldAlert className="h-12 w-12 text-red-500 mx-auto animate-bounce" />
              <h4 className="font-sans font-bold text-slate-100 text-lg">STRUCTURAL COLLAPSE</h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                {metrics.collapseReason}
              </p>
              <div className="text-[11px] text-slate-400 bg-red-950/40 border border-red-900 p-2 rounded-lg leading-tight font-mono">
                Stress peaked at {metrics.stressPct}%! Limit for {MATERIALS[config.material].name} is {config.material === 'masonry' ? 40 : config.material === 'concrete' ? 70 : config.material === 'timber' ? 80 : 85}%.
              </div>
              <button
                onClick={() => {
                  setIsShaking(false);
                  
                  // Reset physics and collapse state back to pristine values
                  floorDisplacementsRef.current = Array(config.stories + 1).fill(0);
                  damperSwayRef.current = 0;
                  cracksRef.current = [];
                  brokenBracesRef.current = {};
                  collapseRatioRef.current = 0;
                  baseOffsetRef.current = 0;
                  timeRef.current = 0;
                  
                  // Clear HUD display values in the DOM immediately
                  if (swayValRef.current) swayValRef.current.textContent = '0.0 mm';
                  if (shearValRef.current) shearValRef.current.textContent = '0 kN';
                  if (stressValRef.current) {
                    stressValRef.current.textContent = '0%';
                    stressValRef.current.className = 'font-mono font-bold text-emerald-400';
                  }
                  if (stressBarRef.current) {
                    stressBarRef.current.style.width = '0%';
                    stressBarRef.current.className = 'h-full bg-emerald-500';
                  }
                  if (safetyBadgeRef.current) {
                    safetyBadgeRef.current.textContent = 'SAFE';
                    safetyBadgeRef.current.className = 'text-xs px-2.5 py-0.5 rounded-full border font-mono font-medium text-green-500 bg-green-950 border-green-800';
                  }

                  setMetrics({
                    maxSway: 0,
                    maxShear: 0,
                    stressPct: 0,
                    collapsed: false,
                    collapseReason: '',
                    frequencies: []
                  });
                }}
                className="w-full bg-red-600 hover:bg-red-500 text-white font-sans text-xs font-semibold py-2 px-4 rounded-lg transition-colors cursor-pointer"
              >
                Acknowledge Failure & Reset
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Interactive simulation controls & seismic timeline */}
      <div className="bg-[#0b0f19] border-t border-slate-800 px-5 py-3 space-y-3">
        <div ref={simProgressContainerRef} style={{ display: isShaking ? 'block' : 'none' }} className="space-y-1">
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-ping" />
              SEISMIC WAVES PROPAGATING (S-WAVE ACTIVE)
            </span>
            <span ref={simProgressTextRef}>TEST TIMELINE: 0%</span>
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
            <div 
              ref={simProgressBarRef}
              className="bg-red-500 h-full transition-all duration-75"
              style={{ width: '0%' }}
            />
          </div>
        </div>

        {/* View Controls Toolbar */}
        <div className="flex justify-between items-center text-xs">
          <div className="flex items-center gap-3 text-slate-400">
            <span className="font-mono text-[10px]">Camera:</span>
            <button 
              onClick={() => { yawRef.current = -0.6; pitchRef.current = 0.3; setZoom(1.2); }}
              className="hover:text-slate-200 cursor-pointer flex items-center gap-1 border border-slate-800 px-2 py-0.5 rounded bg-[#0d1321]"
              title="Reset View"
            >
              <RotateCw className="h-3 w-3" />
              <span>Reset</span>
            </button>
            <button 
              onClick={() => setAutoRotate(!autoRotate)}
              className={`cursor-pointer px-2 py-0.5 rounded border border-slate-800 ${autoRotate ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800' : 'bg-[#0d1321] text-slate-400'}`}
            >
              Orbit Auto
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-slate-400">
              <span>Zoom:</span>
              <input 
                type="range" 
                min="0.8" 
                max="2.0" 
                step="0.1" 
                value={zoom}
                onChange={(e) => setZoom(parseFloat(e.target.value))}
                className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
