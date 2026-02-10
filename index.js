require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
//
const Balance = require("./models/balance");
const Expense = require("./models/expense");
const parseWithAI = require("./parser");

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
})();

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

const processedMessages = new Set();

bot.setMyCommands([
    { command: "start", description: "👋 Start the bot" },
    { command: "balance", description: "💰 Show current balance" },
    { command: "reset", description: "♻️ Reset bank & cash to zero" },
    { command: "help", description: "ℹ️ How to use the bot" },
    { command: "stats", description: "📊 Show expense statistics" }
]);

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

/balance  – Show balance  
/reset    – Reset balance  
/help     – Show help  
/stats    – Expense stats  

Stats formats:
\`/stats\`
\`/stats from YYYY-MM-DD to YYYY-MM-DD\``,
        { parse_mode: "Markdown" }
    );
}

bot.onText(/^\/start(@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    console.log(`[USER:${userId}] /start`);

    await ensureBalance(userId);

    return bot.sendMessage(
        chatId,
        `👋 Welcome to Expense Tracker Bot!

For more details use /help`,
        {
            reply_markup: {
                inline_keyboard: [[{ text: "ℹ️ Help", callback_data: "SHOW_HELP" }]]
            }
        }
    );
});

bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id.toString();

    console.log(`[USER:${userId}] CALLBACK ${query.data}`);

    if (query.data === "SHOW_HELP") sendHelp(chatId);
    bot.answerCallbackQuery(query.id);
});

bot.onText(/^\/balance(@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    console.log(`[USER:${userId}] /balance`);

    await ensureBalance(userId);
    const bal = await Balance.findOne({ userId });

    return bot.sendMessage(chatId, `Bank: ₹${bal.bank}\nCash: ₹${bal.cash}`);
});

bot.onText(/^\/reset(@\w+)?$/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();

    console.log(`[USER:${userId}] /reset`);

    await Balance.findOneAndUpdate(
        { userId },
        { $set: { bank: 0, cash: 0 } },
        { upsert: true }
    );

    await Expense.deleteMany({ userId });

    return bot.sendMessage(chatId, "Balance reset & expenses cleared");
});

bot.onText(/^\/help(@\w+)?$/, (msg) => {
    const userId = msg.from.id.toString();
    console.log(`[USER:${userId}] /help`);
    return sendHelp(msg.chat.id);
});

bot.onText(/^\/stats(@\w+)?(.*)$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id.toString();
    const args = match[2]?.trim() || "";
  
    console.log(`[USER:${userId}] /stats ${args}`);
  
    let fromDate = null;
    let toDate = null;
  
    const m = args.match(/from\s+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/i);
    if (m) {
      fromDate = new Date(m[1]);
      toDate = new Date(m[2]);
      toDate.setHours(23, 59, 59, 999);
    }
  
    const matchStage = { userId };
    if (fromDate || toDate) {
      matchStage.createdAt = {};
      if (fromDate) matchStage.createdAt.$gte = fromDate;
      if (toDate) matchStage.createdAt.$lte = toDate;
    }
  
    const expenses = await Expense.find(matchStage)
      .sort({ createdAt: -1 })
      .limit(25);
  
    const totalAgg = await Expense.aggregate([
      { $match: matchStage },
      { $group: { _id: null, sum: { $sum: "$amount" } } }
    ]);
  
    const byCategory = await Expense.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: "$category",
          total: { $sum: "$amount" }
        }
      },
      { $sort: { total: -1 } }
    ]);
  
    const total = totalAgg[0]?.sum || 0;
  
    let response = `📊 *Expense Stats*\n`;
  
    if (fromDate && toDate) {
      response += `🗓 ${m[1]} → ${m[2]}\n\n`;
    } else {
      response += `🗓 All Time\n\n`;
    }
  
    response += `💸 *Total Expense:* ₹${total}\n\n`;
  
    if (byCategory.length) {
      response += `📂 *By Category*\n`;
      byCategory.forEach(c => {
        response += `• ${c._id || "general"}: ₹${c.total}\n`;
      });
      response += `\n`;
    }
  
    if (!expenses.length) {
      response += `No expenses found.`;
      return bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
    }
  
    response += `🧾 *Recent Expenses*\n`;
    expenses.forEach((e, i) => {
      response += `${i + 1}. ₹${e.amount} | ${e.category || "general"} | ${e.wallet}\n`;
    });
  
    if (expenses.length === 25) {
      response += `\n_(Showing last 25 expenses)_`;
    }
  
    return bot.sendMessage(chatId, response, { parse_mode: "Markdown" });
  });
  

bot.on("message", async (msg) => {
    try {
        if (!msg.text || msg.chat.type !== "private") return;

        const messageId = msg.message_id;

        if (processedMessages.has(messageId)) {
            return;
        }

        processedMessages.add(messageId);

        setTimeout(() => processedMessages.delete(messageId), 5 * 60 * 1000);

        const userId = msg.from.id.toString();
        const text = msg.text.trim();
        const lower = text.toLowerCase();

        console.log(`[USER:${userId}] ${text}`);

        if (text.startsWith("/")) return;
        if (lower === "help" || lower === "menu" || lower === "commands") {
            return sendHelp(msg.chat.id);
        }

        const intent = await parseWithAI(text);
        if (!intent?.intent) return;

        await ensureBalance(userId);

        if (intent.intent === "expense") {
            const wallet = intent.wallet || "cash";
            await Expense.create({
                userId,
                amount: intent.amount,
                wallet,
                category: intent.category || "general"
            });
            const bal = await Balance.findOneAndUpdate(
                { userId },
                { $inc: { [wallet]: -intent.amount } },
                { new: true }
            );
            return bot.sendMessage(msg.chat.id, `Bank: ₹${bal.bank}\nCash: ₹${bal.cash}`);
        }

        if (intent.intent === "income") {
            const bal = await Balance.findOneAndUpdate(
                { userId },
                { $inc: { bank: intent.amount } },
                { new: true }
            );
            return bot.sendMessage(msg.chat.id, `Bank: ₹${bal.bank}\nCash: ₹${bal.cash}`);
        }

        if (intent.intent === "set_balance") {
            await Balance.findOneAndUpdate(
                { userId },
                { $set: { ...(intent.bank != null && { bank: intent.bank }), ...(intent.cash != null && { cash: intent.cash }) } }
            );
            return bot.sendMessage(msg.chat.id, "Balance updated");
        }

        if (intent.intent === "show_balance") {
            const bal = await Balance.findOne({ userId });
            return bot.sendMessage(msg.chat.id, `Bank: ₹${bal.bank}\nCash: ₹${bal.cash}`);
        }

        if (intent.intent === "reset_balance") {
            await Balance.findOneAndUpdate(
                { userId },
                { $set: { bank: 0, cash: 0 } },
                { upsert: true }
            );
            await Expense.deleteMany({ userId });
            return bot.sendMessage(msg.chat.id, "Balance & expenses reset");
        }

    } catch (err) {
        console.error(err);
    }
});
