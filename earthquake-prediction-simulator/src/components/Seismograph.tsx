import React, { useEffect, useRef, useState } from 'react';
import { Seismometer, SimulationState } from '../types';
import { Activity, ShieldAlert, Wifi, Info } from 'lucide-react';

interface SeismographProps {
  selectedSensor: Seismometer | null;
  simulationState: SimulationState;
  epicenter: { x: number; z: number } | null;
}

export default function Seismograph({
  selectedSensor,
  simulationState,
  epicenter,
}: SeismographProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataPointsRef = useRef<number[]>([]);
  const [currentPga, setCurrentPga] = useState(0);
  const [maxPga, setMaxPga] = useState(0);
  const [currentMmi, setCurrentMmi] = useState(1);
  const [waveStatus, setWaveStatus] = useState<'quiescent' | 'p-wave-vibration' | 's-wave-shaking'>('quiescent');

  // Fill initial quiescent noise
  useEffect(() => {
    dataPointsRef.current = Array(200).fill(0).map(() => (Math.random() - 0.5) * 0.015);
    setMaxPga(0);
  }, [selectedSensor?.id]);

  // Seismograph render loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      animId = requestAnimationFrame(render);

      const dPoints = dataPointsRef.current;
      let nextAmp = (Math.random() - 0.5) * 0.015; // default quiescent micro-noise
      let status: 'quiescent' | 'p-wave-vibration' | 's-wave-shaking' = 'quiescent';
      let pga = 0;

      if (simulationState.isRuptured && simulationState.triggerTime && epicenter && selectedSensor) {
        const dtMs = Date.now() - simulationState.triggerTime;
        const dtSec = dtMs / 1000;
        const dist = Math.hypot(selectedSensor.x - epicenter.x, selectedSensor.z - epicenter.z);

        const pArrival = dist / simulationState.pWaveSpeed;
        const sArrival = dist / simulationState.sWaveSpeed;

        if (dtSec >= sArrival) {
          // S-wave shaking is active
          status = 's-wave-shaking';
          const tS = dtSec - sArrival; // seconds since S-wave hit
          const decay = Math.max(0, 1 - tS / 15) * Math.max(0.1, 75 / (dist + 40));
          
          // Exponential shake sizing based on magnitude
          const ampRatio = Math.pow(10, simulationState.magnitude - 5.0) / 100;
          const soilAmp = 1.2; // default scale
          
          pga = ampRatio * soilAmp * decay * (Math.sin(dtSec * 16) + Math.cos(dtSec * 23) * 0.5);
          nextAmp = pga + (Math.random() - 0.5) * 0.05 * decay; // add high-freq fuzz
        } else if (dtSec >= pArrival) {
          // P-wave compression vibration
          status = 'p-wave-vibration';
          const tP = dtSec - pArrival; // seconds since P-wave hit
          const decay = Math.max(0, 1 - tP / 12);
          const ampRatio = Math.pow(10, simulationState.magnitude - 5.5) / 350; // much smaller
          
          pga = ampRatio * decay * (Math.sin(dtSec * 45) + (Math.random() - 0.5) * 0.1);
          nextAmp = pga;
        }
      }

      // Roll buffer
      dPoints.shift();
      dPoints.push(nextAmp);

      // Digital values update
      const pgaVal = Math.abs(pga);
      setCurrentPga(pgaVal);
      if (pgaVal > maxPga) {
        setMaxPga(pgaVal);
      }
      setWaveStatus(status);

      // Calculate live MMI
      if (status === 's-wave-shaking') {
        let mmi = Math.round(3.0 * Math.log10(pgaVal * 980) - 0.5);
        setCurrentMmi(Math.max(1, Math.min(12, mmi)));
      } else if (status === 'p-wave-vibration') {
        setCurrentMmi(2);
      } else {
        setCurrentMmi(1);
      }

      // --- DRAW CANVAS GRID AND WAVE ---
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Background graph paper style
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Horizontal grid lines
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const gridCount = 8;
      for (let i = 1; i < gridCount; i++) {
        const y = (canvas.height / gridCount) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();

        // Acceleration label markers (e.g. +0.5g, -0.5g)
        if (i === 2 || i === 6) {
          ctx.fillStyle = '#475569';
          ctx.font = '8px monospace';
          const gLabel = i === 2 ? '+0.5g' : '-0.5g';
          ctx.fillText(gLabel, 10, y - 4);
        }
      }

      // Vertical scrolling lines (representing time steps)
      const scrollStep = 20;
      const offset = (Date.now() / 50) % scrollStep;
      for (let x = -offset; x < canvas.width; x += scrollStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      // Center baseline
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      // Plot seismogram wave line
      ctx.beginPath();
      ctx.lineWidth = 2;
      
      let lineColor = '#10b981'; // Green (Quiescent)
      if (status === 'p-wave-vibration') {
        lineColor = '#facc15'; // Yellow (P-wave)
      } else if (status === 's-wave-shaking') {
        lineColor = '#ef4444'; // Red (S-wave)
      }
      ctx.strokeStyle = lineColor;

      // Draw path through data points
      const stepWidth = canvas.width / (dPoints.length - 1);
      for (let i = 0; i < dPoints.length; i++) {
        const x = i * stepWidth;
        // Map amplitude range [-1.2g, +1.2g] to canvas height
        const amplitudeFactor = canvas.height * 0.38; // scale factor
        const y = canvas.height / 2 - dPoints[i] * amplitudeFactor;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Draw seismograph "needle tip" blinking circle at the right edge
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      const lastY = canvas.height / 2 - dPoints[dPoints.length - 1] * canvas.height * 0.38;
      ctx.arc(canvas.width - 2, lastY, 4, 0, Math.PI * 2);
      ctx.fill();
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [simulationState.isRuptured, simulationState.triggerTime, simulationState.magnitude, selectedSensor?.id, maxPga]);

  // Reset max record on rupture resets
  useEffect(() => {
    if (!simulationState.isRuptured) {
      setMaxPga(0);
    }
  }, [simulationState.isRuptured]);

  const mmiRoman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
  const mmiDescriptions = [
    'Not felt except by a very few under especially favorable conditions.',
    'Felt only by a few persons at rest, especially on upper floors of buildings.',
    'Felt quite noticeably by persons indoors, especially on upper floors.',
    'Dishware, windows, doors disturbed; walls make cracking sound. Sensation like heavy truck striking building.',
    'Felt by nearly everyone; many awakened. Some dishes, windows broken; unstable objects overturned.',
    'Felt by all, many frightened. Some heavy furniture moved; a few instances of fallen plaster. Damage slight.',
    'Damage negligible in buildings of good design and construction; slight to moderate in well-built ordinary structures.',
    'Damage slight in specially designed structures; considerable damage in ordinary substantial buildings with partial collapse.',
    'Damage considerable in specially designed structures; well-designed frame structures thrown out of plumb. Ground cracked.',
    'Some well-built wooden structures destroyed; most masonry and frame structures destroyed. Landslides considerable.',
    'Few, if any, masonry structures remain standing. Bridges destroyed. Broad fissures in ground.',
    'Total damage. Waves seen on ground surfaces. Lines of sight and level distorted. Objects thrown upward into air.'
  ];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4" id="seismograph-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 tracking-wide">Live Seismograph Readout</h3>
            <p className="text-[10px] text-slate-400 font-medium">
              {selectedSensor ? selectedSensor.name : 'Select a sensor on the 3D map'}
            </p>
          </div>
        </div>
        
        {selectedSensor && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-950 border border-slate-800 text-[10px] text-slate-400 font-semibold">
            <Wifi className="w-3 h-3 text-emerald-400" />
            ONLINE
          </div>
        )}
      </div>

      {selectedSensor ? (
        <div className="flex flex-col gap-4">
          {/* Seismogram scroll grid */}
          <div className="relative border border-slate-800 rounded-xl overflow-hidden bg-slate-950">
            <canvas
              ref={canvasRef}
              width={500}
              height={140}
              className="w-full h-[140px] block"
            />
            {/* Real-time status badge overlay */}
            <div className="absolute top-3 right-3 flex gap-2">
              <span
                className={`px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded shadow-sm border ${
                  waveStatus === 's-wave-shaking'
                    ? 'bg-red-500 text-white border-red-400 animate-bounce'
                    : waveStatus === 'p-wave-vibration'
                    ? 'bg-yellow-500 text-slate-950 border-yellow-300 animate-pulse'
                    : 'bg-slate-900 text-slate-400 border-slate-800'
                }`}
              >
                {waveStatus === 's-wave-shaking'
                  ? '⚠️ S-Wave Shaking'
                  : waveStatus === 'p-wave-vibration'
                  ? '⚡ P-Wave Compression'
                  : '🟢 Quiescent Noise'}
              </span>
            </div>
          </div>

          {/* Seismometer digital panel stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Current PGA</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className={`text-xl font-black font-mono transition-colors ${waveStatus === 's-wave-shaking' ? 'text-red-500' : 'text-slate-100'}`}>
                  {currentPga.toFixed(3)}
                </span>
                <span className="text-[10px] text-slate-500 font-bold font-mono">g</span>
              </div>
              <p className="text-[8px] text-slate-500 font-medium mt-1">Peak Ground Accel.</p>
            </div>

            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Max Recorded</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black font-mono text-amber-500">
                  {maxPga.toFixed(3)}
                </span>
                <span className="text-[10px] text-slate-500 font-bold font-mono">g</span>
              </div>
              <p className="text-[8px] text-slate-500 font-medium mt-1">Peak Acceleration</p>
            </div>

            <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex flex-col justify-between">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mercalli Rating</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-black font-mono text-rose-500">
                  {mmiRoman[currentMmi - 1]}
                </span>
                <span className="text-[10px] text-slate-500 font-semibold">MMI</span>
              </div>
              <p className="text-[8px] text-slate-500 font-medium mt-1">Intensity Level</p>
            </div>
          </div>

          {/* MMI Description & Soil Info */}
          <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col gap-2.5">
            <div className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">MMI {mmiRoman[currentMmi - 1]} Shaking Impact</span>
                <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                  {mmiDescriptions[currentMmi - 1]}
                </p>
              </div>
            </div>
          </div>

          {/* Educational P-wave vs S-wave Section */}
          <div className="bg-slate-950/50 border border-slate-800 p-3.5 rounded-xl">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Info className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] font-extrabold text-sky-400 uppercase tracking-wider">Science: Why Predictable?</span>
            </div>
            <p className="text-[10.5px] text-slate-400 leading-relaxed">
              <strong>P-Waves (Primary)</strong> travel at ~6 km/s, compressing the ground with virtually zero damage. 
              <strong>S-Waves (Secondary)</strong> travel at ~3.5 km/s, shearing side-to-side causing destructive shaking. 
              Because seismometers detect the fast-moving P-wave instantly, we can transmit warnings at the speed of light, alerting cities seconds 
              <em>before</em> S-wave shaking arrives.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-slate-950 border border-slate-800 rounded-xl">
          <Activity className="w-10 h-10 text-slate-600 mb-3 animate-pulse" />
          <p className="text-xs text-slate-400 max-w-[240px]">
            Please click on a **seismometer antenna icon** on the 3D map to view its live scrolling wave graph, peak ground forces, and shock readings.
          </p>
        </div>
      )}
    </div>
  );
}
