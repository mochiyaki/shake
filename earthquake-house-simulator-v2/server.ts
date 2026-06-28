import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config();

// Shared Gemini client setup (using process.env.GEMINI_API_KEY)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

/**
 * Robust JSON extraction and parser for Gemini responses
 * Strips out markdown enclosures, finds structural brackets, and escapes newlines inside values
 */
function cleanAndParseJson(text: string): any {
  if (!text) return {};
  
  let cleaned = text.trim();
  
  // Remove markdown code blocks if the model wrapped the JSON
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  
  cleaned = cleaned.trim();
  
  // Find first '{' and last '}' to isolate the JSON object from footnotes/other text
  const startIdx = cleaned.indexOf("{");
  const endIdx = cleaned.lastIndexOf("}");
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }
  
  // Clean up potential trailing commas before closing braces/brackets (unsupported in JSON.parse)
  cleaned = cleaned.replace(/,\s*([\]}])/g, "$1");
  
  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    // If parsing fails, try escaping raw control characters (newlines) inside double-quoted values
    try {
      const nonValuedNewlines = cleaned.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, p1) => {
        return '"' + p1.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
      });
      return JSON.parse(nonValuedNewlines);
    } catch (err2) {
      console.error("JSON parsing error. Original text was:", text);
      console.error("Attempted clean text was:", cleaned);
      throw new Error("Failed to parse structured JSON from Gemini response: " + err.message);
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: AI Structural Consultant Chat
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, houseConfig } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required." });
      }

      // Format current design parameters into the system prompt context
      const configStr = houseConfig 
        ? `
CURRENT DESIGN PARAMETERS IN SIMULATOR:
- Building Material: ${houseConfig.material} (Elastic Modulus: ${houseConfig.elasticity || 'Standard'}, Ductility: ${houseConfig.ductility || 'Standard'})
- Number of Stories: ${houseConfig.stories} floors
- Seismic Techniques: ${houseConfig.techniques && houseConfig.techniques.length > 0 ? houseConfig.techniques.join(", ") : "None (Fixed base)"}
- Earthquake Magnitude (Richter Scale): ${houseConfig.magnitude}
- Simulation Outcome: ${houseConfig.outcome || "Not simulated yet"}`
        : "No active simulation parameters.";

      const systemInstruction = `You are a world-class Seismic Structural Engineering Expert and Earthquake-Proof Design Consultant. Your goal is to guide students, architects, and builders in creating buildings that can withstand catastrophic earthquakes.

Here is the user's current house configuration under simulation:
${configStr}

Instructions:
1. Keep your tone encouraging, objective, professional, and educational.
2. Discuss the physical principles behind the performance. For example:
   - Mention structural resonance: taller structures have longer natural periods.
   - Explain how Unreinforced Masonry (URM) is brittle and fails under shear stress.
   - Explain how Base Isolation decoupled the house from high-frequency ground motion, reducing lateral acceleration.
   - Discuss how Tuned Mass Dampers counteract building sway through counter-momentum.
   - Highlight the value of Cross Bracing (tensile strength) or Shear Walls (stiffness).
3. Offer constructive recommendations on what they should change in their simulator or techniques to survive a higher magnitude earthquake.
4. Keep answers clean, beautifully structured in Markdown, with short paragraphs and scannable bullet points. Do not mention system files, code, or internal database mechanisms. Use clear, humble, human-readable language.`;

      // Structure messages for Gemini API chat
      // Map frontend message format to Gemini content parts
      const contents = messages.map((m: any) => {
        return {
          role: m.role === "assistant" ? "model" as const : "user" as const,
          parts: [{ text: m.content }],
        };
      });

      // Call the Gemini API securely server-side
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        },
      });

      res.json({ content: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ 
        error: "Failed to communicate with the AI consultant. Please verify your Gemini API key in Settings > Secrets.",
        details: error.message 
      });
    }
  });

  // API Route: Seismic Damage Repair Research Agent with Search Grounding
  app.post("/api/research", async (req, res) => {
    try {
      const { 
        material, 
        stories, 
        techniques, 
        magnitude, 
        stressPct, 
        collapsed, 
        collapseReason, 
        damageCost 
      } = req.body;

      const prompt = `Conduct real-world web research and compile a professional, itemized procurement list for structural repairs and seismic retrofitting based on the following earthquake simulation results:

SIMULATED BUILDING PROFILE & DAMAGE STATE:
- Structural Material: ${material || "Concrete"}
- Building Height: ${stories || 3} stories
- Applied Seismic Engineering Techniques: ${techniques && techniques.length > 0 ? techniques.join(", ") : "None (fixed base)"}
- Earthquake Intensity: Richter Magnitude ${magnitude || 7.2}
- Peak Stress Level: ${stressPct || 0}% of structural capacity
- Collapse Outcome: ${collapsed ? "COLLAPSED (" + (collapseReason || "structural shear overload") + ")" : "SURVIVED (Intact but with localized structural fatigue/cracks)"}
- Project Damage Cost Estimate: $${damageCost || 0}k

RESEARCH MANDATE:
1. Conduct active Google web searches for actual structural repair materials, steel reinforcement bars, specialized anchoring systems, structural epoxy, carbon fiber sheets, seismic damper replacement parts, or elastomeric base isolation bearings that match the building's material (${material}) and design techniques.
2. Locate ACTUAL commercial suppliers, specialty hardware vendors, or construction material distributors (e.g. Simpson Strong-Tie, McMaster-Carr, Grainger, US Concrete, Earthquake Protection Systems, or other real building product manufacturers). Do NOT use generic placeholder names.
3. Fetch or estimate REALISTIC, current commercial pricing found in search results with proper units (e.g. per linear foot, per bag, per unit).
4. Outline estimated quantities based on a ${stories}-story building with a ${stressPct}% stress impact.
5. Formulate key expert advice on structural repairs needed for this damage profile (e.g. epoxy injection for concrete shear cracks, column strengthening, damper servicing, or foundational retrofitting).

Return the compiled list as a JSON object adhering exactly to the specified JSON schema.`;

      const repairItemSchema = {
        type: Type.OBJECT,
        properties: {
          name: {
            type: Type.STRING,
            description: "Name of the repair item or material, e.g. High-Grade Portland Concrete, Steel Rebar No. 5, Simpson Strong-Tie Epoxy, Carbon Fiber Wrap.",
          },
          category: {
            type: Type.STRING,
            description: "Category of repair, e.g. Structural Reinforcement, Masonry & Concrete, Dampers & Isolation, Tool & Equipment, Labor Oversight.",
          },
          description: {
            type: Type.STRING,
            description: "Detailed description of the repair item and how it fits the earthquake damage profile.",
          },
          supplier: {
            type: Type.STRING,
            description: "Name of a real, active commercial supplier or manufacturer found via Google Search (e.g., McMaster-Carr, Grainger, Home Depot, Simpson Strong-Tie, Earthquake Protection Systems, US Concrete).",
          },
          price: {
            type: Type.STRING,
            description: "Real-time cost range with units (e.g., '$45.00 - $55.00 per 80lb bag' or '$120.00 each'). Must reflect actual pricing found.",
          },
          estimatedQuantity: {
            type: Type.STRING,
            description: "Estimated amount required for repair, appropriately scaled for a building of this number of stories and damage level.",
          },
          justification: {
            type: Type.STRING,
            description: "Brief professional structural engineering explanation of why this item is critical for repairing the damage or reinforcing the building.",
          },
          urgency: {
            type: Type.STRING,
            description: "Urgency rating: 'High', 'Medium', or 'Low'.",
          }
        },
        required: ["name", "category", "description", "supplier", "price", "estimatedQuantity", "justification", "urgency"]
      };

      const researchResponseSchema = {
        type: Type.OBJECT,
        properties: {
          totalEstimatedCostRange: {
            type: Type.STRING,
            description: "Overall combined procurement and repair cost range, e.g. '$12,500 - $18,200'.",
          },
          overallConditionAssessment: {
            type: Type.STRING,
            description: "A professional structural assessment summarizing the damage severity and immediate safety actions required.",
          },
          expertRepairAdvice: {
            type: Type.STRING,
            description: "Key structural advice or engineering best-practices for repairing these specific failure modes (such as shear cracking, column bending, base movement).",
          },
          repairItems: {
            type: Type.ARRAY,
            items: repairItemSchema,
            description: "An array of specific repair materials, retrofit elements, and equipment with live pricing and real suppliers.",
          }
        },
        required: ["totalEstimatedCostRange", "overallConditionAssessment", "expertRepairAdvice", "repairItems"]
      };

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: "You are a professional Forensic Structural Engineer and Disaster Recovery Construction Estimator. Perform thorough search queries to collect real, verified material specifications, pricing ranges, and active vendor names. Compile this data into high-fidelity structured reports.",
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: researchResponseSchema,
          temperature: 0.2,
        }
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const sources = chunks ? chunks.map((c: any) => {
        return {
          title: c.web?.title || "Search Reference",
          url: c.web?.uri || ""
        };
      }).filter((s: any) => s.url) : [];

      let payload = {};
      try {
        payload = cleanAndParseJson(response.text || "{}");
      } catch (parseError: any) {
        console.error("JSON parse error from Gemini text response:", response.text);
        throw new Error("Failed to parse structured JSON from Gemini response: " + parseError.message);
      }

      res.json({
        ...payload,
        sources
      });

    } catch (error: any) {
      console.error("Gemini Research API Error:", error);
      res.status(500).json({ 
        error: "Failed to perform real-time structural repair research. Please verify your Gemini API key in Settings > Secrets.",
        details: error.message 
      });
    }
  });

  // Health check API
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // Vite middleware for dev mode, static files for prod mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // SPA Fallback
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
