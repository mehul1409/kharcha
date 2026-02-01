const axios = require("axios");
const fs = require("fs");

console.log("📄 Loading system prompt...");
const SYSTEM_PROMPT = fs.readFileSync("./mcp/prompt.txt", "utf8");
console.log("✅ System prompt loaded");

async function parseWithAI(userMessage) {
  console.log("🤖 parseWithAI called");
  console.log("🧾 User message:", userMessage);

  try {
    console.log("🚀 Sending request to Groq API...");

    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant", // Updated model ID
        messages: [
          {
            role: "system",
            content: SYSTEM_PROMPT
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        response_format: { type: "json_object" }, 
        max_tokens: 256,
        temperature: 0
      },
// ... rest of your code
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("✅ Groq API response received");
    
    // Groq's response structure follows OpenAI's: res.data.choices[0].message.content
    const text = res.data.choices?.[0]?.message?.content;
    console.log("📝 AI text output:", text);

    if (!text) {
      console.error("❌ No AI text returned");
      throw new Error("No AI text returned");
    }

    // Since we used response_format: { type: "json_object" }, 
    // the output is guaranteed to be a JSON string.
    const parsed = JSON.parse(text);
    console.log("✅ Parsed AI JSON:", parsed);

    return parsed;
  } catch (err) {
    console.error("🔥 parseWithAI ERROR");
    // This logs the actual error message from Groq's server
    console.error(err.response?.data || err.message);
    throw err;
  }
}

module.exports = parseWithAI;