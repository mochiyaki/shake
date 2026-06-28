import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
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
