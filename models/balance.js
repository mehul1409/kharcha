const mongoose = require("mongoose");

const balanceSchema = new mongoose.Schema(
  {
    userId: { type: String, unique: true, index: true },
    bank: { type: Number, default: 0 },
    cash: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Balance", balanceSchema);
