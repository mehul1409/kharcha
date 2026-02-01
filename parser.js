const axios = require("axios");
const fs = require("fs");

const SYSTEM_PROMPT = fs.readFileSync("./mcp/prompt.txt", "utf8");

async function parseWithAI(userMessage) {
  console.log(`[AI] ${userMessage}`);

  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage }
        ],
        response_format: { type: "json_object" },
        max_tokens: 256,
        temperature: 0
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const text = res.data?.choices?.[0]?.message?.content;
    if (!text) throw new Error("Empty AI response");

    return JSON.parse(text);
  } catch (err) {
    console.error("AI_ERROR", err.response?.data || err.message);
    throw err;
  }
}

module.exports = parseWithAI;
