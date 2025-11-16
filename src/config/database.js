// src/config/database.js
const mongoose = require("mongoose");

async function connectDatabase() {
  const uri = process.env.MONGO_URI;

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("✔️ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}

module.exports = connectDatabase;

