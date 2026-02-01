const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true },
    intent: String,
    amount: Number,
    category: String,
    wallet: String,
    rawMessage: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);
