const express = require("express");
const router = express.Router();
const { GoogleGenerativeAI } = require("@google/generative-ai");

router.post("/chat", async (req, res) => {
  try {
    const { prompt, patientMetrics } = req.body;

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: "GEMINI_API_KEY not found in .env file" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const systemInstruction = `
      You are an experienced virtual medical assistant in the StepWell application.
      Your task is to analyze the patient's metrics and provide concise, clear, and safe recommendations.
      Here are the patient's current metrics:
      - Blood Pressure: ${patientMetrics?.bp?.sys || '?'} / ${patientMetrics?.bp?.dia || '?'} mmHg
      - Blood Glucose: ${patientMetrics?.glucose?.value || '?'} mmol/L
      - SpO2: ${patientMetrics?.spo2?.value || '?'}%
      - Heart Rate: ${patientMetrics?.hr?.value || '?'} bpm
      - Weight: ${patientMetrics?.weight?.value || '?'} kg
      
      Answer the patient's question based on this data. Be concise, do not make definitive medical diagnoses, and always remind the user of the importance of an in-person consultation with a doctor.
      IMPORTANT REGARDING FORMATTING: Do NOT use ANY Markdown formatting. Do NOT use asterisks (**) for bold text. Use standard plain text with simple newlines only.
    `;

    const result = await model.generateContent(`${systemInstruction}\n\nQuestion: ${prompt}`);
    const response = await result.response;
    const text = response.text();

    res.json({ text });

  } catch (err) {
    console.error("AI Error:", err);
    res.status(500).json({ error: "Error communicating with the AI model" });
  }
});

module.exports = router;