require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");

const Balance = require("./models/balance");
const Expense = require("./models/expense");
const parseWithAI = require("./parser");

console.log("🚀 Starting Telegram Expense Bot...");

// ================= DB =================
(async () => {
    try {
        console.log("🔌 Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB connected");
    } catch (err) {
        console.error("❌ MongoDB connection failed", err);
        process.exit(1);
    }
})();

// ================= BOT =================
console.log("🤖 Initializing Telegram bot...");
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

// ================= REGISTER COMMANDS =================
bot.setMyCommands([
    { command: "start", description: "👋 Start the bot" },
    { command: "balance", description: "💰 Show current balance" },
    { command: "reset", description: "♻️ Reset bank & cash to zero" },
    { command: "help", description: "ℹ️ How to use the bot" },
    { command: "stats", description: "📊 Show expense statistics" }
]);

// ================= HELPERS =================
async function ensureBalance(userId) {
    await Balance.updateOne(
        { userId },
        { $setOnInsert: { userId } },
        { upsert: true }
    );
}

function sendHelp(chatId) {
    return bot.sendMessage(
        chatId,
        `🤖 *Expense Tracker Bot – Help*
  
  📌 *Available Commands*
  /balance  – 💰 Show current balance  
  /reset    – ♻️ Reset bank & cash to zero  
  /help     – ℹ️ Show this help message  
  /stats    – 📊 Show expense statistics  
  
  ━━━━━━━━━━━━━━━━━━━━━━
  📊 *Stats Command Usage*
  ━━━━━━━━━━━━━━━━━━━━━━
  
  ➡️ *Overall stats (all time)*  
  \`/stats\`
  
  ➡️ *Date-wise stats*  
  \`/stats from YYYY-MM-DD to YYYY-MM-DD\`
  
  🧪 *Examples*  
  • \`/stats from 2024-01-01 to 2024-01-31\`  
  • \`/stats from 2024-02-01 to 2024-02-15\`
  
  ━━━━━━━━━━━━━━━━━━━━━━
  📝 *You can also type messages like*
  ━━━━━━━━━━━━━━━━━━━━━━
  • cash se 50 kharcha  
  • bank se 200 kam karo  
  • salary 20000 aayi  
  • bank balance 5000 set karo  
  • food ke 40 kharch hue (cash)  
  
  🌐 *Languages Supported*
  Hindi • English • Hinglish  
  
  Just type naturally 😄`,
        { parse_mode: "Markdown" }
    );
}

// ================= SLASH COMMANDS =================

bot.onText(/^\/start(@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
  
    await ensureBalance(userId);
  
    return bot.sendMessage(
      chatId,
  `👋 *Welcome to Expense Tracker Bot!*
  
  Main aapka daily kharcha aur income track karne me madad karta hoon 💰
  
  👉 *Start karne ke liye* bas normal language me likho:
  • cash se 50 kharcha
  • salary 20000 aayi
  • bank balance 5000 set karo
  
  👇 *More details ke liye button dabao*`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "ℹ️ Help", callback_data: "SHOW_HELP" }
            ]
          ]
        }
      }
    );
  });

  bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
  
    if (query.data === "SHOW_HELP") {
      sendHelp(chatId);
    }
  
    // loading spinner hataane ke liye
    bot.answerCallbackQuery(query.id);
  });
  
  

// /balance
bot.onText(/^\/balance(@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    await ensureBalance(userId);
    const bal = await Balance.findOne({ userId });

    return bot.sendMessage(
        chatId,
        `💰 Bank: ₹${bal.bank}\n💵 Cash: ₹${bal.cash}`
    );
});

// /reset
bot.onText(/^\/reset(@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    await Balance.findOneAndUpdate(
        { userId },
        { $set: { bank: 0, cash: 0 } },
        { upsert: true }
    );

    return bot.sendMessage(
        chatId,
        "♻️ Balance reset successful\n💰 Bank: ₹0\n💵 Cash: ₹0"
    );
});

// /help
bot.onText(/^\/help(@\w+)?$/, (msg) => {
    return sendHelp(msg.chat.id);
});

bot.onText(/^\/stats(@\w+)?(.*)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const args = match[2]?.trim(); // text after /stats

    try {
        // ---------- DATE PARSING ----------
        let fromDate = null;
        let toDate = null;

        // Expected format: from YYYY-MM-DD to YYYY-MM-DD
        const dateRegex = /from\s+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i;
        const dateMatch = args.match(dateRegex);

        if (dateMatch) {
            fromDate = new Date(dateMatch[1]);
            toDate = new Date(dateMatch[2]);
            toDate.setHours(23, 59, 59, 999);
        }

        // ---------- QUERY ----------
        const matchStage = { userId };

        if (fromDate || toDate) {
            matchStage.createdAt = {};
            if (fromDate) matchStage.createdAt.$gte = fromDate;
            if (toDate) matchStage.createdAt.$lte = toDate;
        }

        // ---------- AGGREGATION ----------
        const stats = await Expense.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    total: { $sum: "$amount" }
                }
            }
        ]);

        const totalExpense = stats[0]?.total || 0;

        // ---------- CATEGORY BREAKUP ----------
        const byCategory = await Expense.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: "$category",
                    total: { $sum: "$amount" }
                }
            }
        ]);

        // ---------- WALLET BREAKUP ----------
        const byWallet = await Expense.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: "$wallet",
                    total: { $sum: "$amount" }
                }
            }
        ]);

        // ---------- RESPONSE ----------
        let response = `📊 *Expense Stats*\n`;

        if (fromDate && toDate) {
            response += `🗓 From ${dateMatch[1]} to ${dateMatch[2]}\n\n`;
        } else {
            response += `🗓 Overall (All Time)\n\n`;
        }

        response += `💸 *Total Expense:* ₹${totalExpense}\n\n`;

        if (byCategory.length) {
            response += `📂 *By Category*\n`;
            byCategory.forEach(c => {
                response += `• ${c._id || "general"}: ₹${c.total}\n`;
            });
            response += `\n`;
        }

        if (byWallet.length) {
            response += `💼 *By Wallet*\n`;
            byWallet.forEach(w => {
                response += `• ${w._id}: ₹${w.total}\n`;
            });
        }

        return bot.sendMessage(chatId, response, { parse_mode: "Markdown" });

    } catch (err) {
        console.error("STATS ERROR:", err);
        return bot.sendMessage(chatId, "⚠️ Could not fetch stats");
    }
});


// ================= NORMAL MESSAGE HANDLER =================
bot.on("message", async (msg) => {
    try {
        if (msg.chat.type !== "private") return;
        if (!msg.text) return;

        const chatId = msg.chat.id;
        const userId = msg.from.id.toString();
        const text = msg.text.trim();
        const lowerText = text.toLowerCase();

        // 🚫 ABSOLUTE BLOCK: Slash commands never go to AI
        if (text.startsWith("/")) {
            console.log("ℹ️ Slash command ignored by AI:", text);
            return;
        }

        // 🆘 HELP WORDS – NEVER GO TO AI
        if (
            lowerText === "help" ||
            lowerText === "commands" ||
            lowerText === "menu"
        ) {
            return sendHelp(chatId);
        }

        console.log("📩 Message:", text);

        // ---------- AI PARSE ----------
        const intent = await parseWithAI(text);
        console.log("🎯 AI Intent:", intent);

        if (!intent || !intent.intent) {
            return bot.sendMessage(chatId, "❌ Samajh nahi aaya, dobara bolo");
        }

        await ensureBalance(userId);

        // ---------- SWITCH ----------
        switch (intent.intent) {

            // ===== SET BALANCE =====
            case "set_balance": {
                if (intent.bank == null && intent.cash == null) {
                    return bot.sendMessage(chatId, "❌ Amount missing");
                }

                await Balance.findOneAndUpdate(
                    { userId },
                    {
                        $set: {
                            ...(intent.bank != null && { bank: intent.bank }),
                            ...(intent.cash != null && { cash: intent.cash })
                        }
                    }
                );

                return bot.sendMessage(chatId, "✅ Balance set successfully");
            }

            // ===== EXPENSE =====
            case "expense": {
                if (!intent.amount || intent.amount <= 0) {
                    return bot.sendMessage(chatId, "❌ Invalid expense amount");
                }

                const wallet = intent.wallet || "cash";

                await Expense.create({
                    userId,
                    amount: intent.amount,
                    wallet,
                    category: intent.category || "general",
                    rawMessage: text
                });

                const balance = await Balance.findOneAndUpdate(
                    { userId },
                    { $inc: { [wallet]: -intent.amount } },
                    { new: true }
                );

                return bot.sendMessage(
                    chatId,
                    `✅ Expense saved\n💰 Bank: ₹${balance.bank}\n💵 Cash: ₹${balance.cash}`
                );
            }

            // ===== INCOME =====
            case "income": {
                if (!intent.amount || intent.amount <= 0) {
                    return bot.sendMessage(chatId, "❌ Invalid income amount");
                }

                // 🔐 STRICT BUSINESS RULE
                if (intent.wallet && intent.wallet !== "bank") {
                    return bot.sendMessage(
                        chatId,
                        "❌ Income cash me nahi hoti.\nAgar kharcha hai to bolo: 'cash se 40 kharcha'"
                    );
                }

                const balance = await Balance.findOneAndUpdate(
                    { userId },
                    { $inc: { bank: intent.amount } },
                    { new: true }
                );

                return bot.sendMessage(
                    chatId,
                    `✅ Income added\n💰 Bank: ₹${balance.bank}\n💵 Cash: ₹${balance.cash}`
                );
            }

            // ===== SHOW BALANCE (AI) =====
            case "show_balance": {
                const bal = await Balance.findOne({ userId });

                return bot.sendMessage(
                    chatId,
                    `💰 Bank: ₹${bal.bank}\n💵 Cash: ₹${bal.cash}`
                );
            }

            // ===== RESET BALANCE (AI) =====
            case "reset_balance": {
                await Balance.findOneAndUpdate(
                    { userId },
                    { $set: { bank: 0, cash: 0 } },
                    { upsert: true }
                );

                return bot.sendMessage(
                    chatId,
                    "♻️ Balance reset successful\n💰 Bank: ₹0\n💵 Cash: ₹0"
                );
            }

            default:
                return bot.sendMessage(chatId, "❌ Unknown command");
        }

    } catch (err) {
        console.error("🔥 BOT ERROR:", err);
        bot.sendMessage(msg.chat.id, "⚠️ Something went wrong");
    }
});
