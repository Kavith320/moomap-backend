// src/config/database.js
const mongoose = require("mongoose");

async function connectDatabase() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    console.error("❌ MONGO_URI is not set in .env");
    throw new Error("MONGO_URI missing");
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000, // avoid hanging forever
    });

    console.log("✔️ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    throw err;
  }
}

module.exports = connectDatabase;
