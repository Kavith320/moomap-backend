const mongoose = require('mongoose');
const dns = require('dns');

console.log("⚙️ System Diagnostics:");
console.log("Node Executable:", process.execPath);
console.log("Node Version:", process.version);
console.log("Platform:", process.platform);

console.log("\n🌐 Environment Variables:");
Object.keys(process.env).forEach(key => {
  const upper = key.toUpperCase();
  if (upper.includes("NODE") || upper.includes("PROXY") || upper.includes("SSL") || upper.includes("MONGO") || upper.includes("CONDA") || upper.includes("PATH")) {
    // Redact password from MONGO_URI if printed
    let val = process.env[key];
    if (upper.includes("MONGO_URI") && val) {
      val = val.replace(/:([^@]+)@/, ":[REDACTED]@");
    }
    console.log(`  ${key}=${val}`);
  }
});

console.log("\n🔍 Resolving DNS for MongoDB Atlas...");
dns.resolveTxt('cluster0.lhlcqlm.mongodb.net', (err, addresses) => {
  if (err) {
    console.error("❌ DNS TXT Resolution Error:", err);
  } else {
    console.log("✔️ DNS TXT Resolution Success:", addresses);
  }

  dns.resolveSrv('_mongodb._tcp.cluster0.lhlcqlm.mongodb.net', (err, srvs) => {
    if (err) {
      console.error("❌ DNS SRV Resolution Error:", err);
      return;
    }
    console.log("✔️ DNS SRV Resolution Success:", srvs);

    const uri = "mongodb+srv://sendtokavith_db_user:OAeIW55L9BYGZCw3@cluster0.lhlcqlm.mongodb.net/moomap?retryWrites=true&w=majority";
    console.log("\n📡 Connecting to MongoDB Atlas...");
    mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000
    })
    .then(() => {
      console.log("✔️ MongoDB Connection Success!");
      process.exit(0);
    })
    .catch(err => {
      console.error("❌ MongoDB Connection Error:");
      console.error(err);
      process.exit(1);
    });
  });
});
