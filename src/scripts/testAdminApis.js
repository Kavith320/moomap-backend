// src/scripts/testAdminApis.js
require("dotenv").config();
const port = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${port}`;

async function runTests() {
  console.log("🚦 Starting programmatic admin API verification tests...");
  console.log(`🔗 Target URL: ${BASE_URL}\n`);

  let adminToken = "";
  let userToken = "";
  const testMobile = "0779999999";
  const testPassword = "testpassword123";
  let testUserId = "";

  // Helper for requests
  async function api(path, options = {}) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    return res;
  }

  try {
    // ----------------------------------------------------
    // TEST 1: Check server health
    // ----------------------------------------------------
    console.log("➡️ Test 1: Verifying server health endpoint...");
    const healthRes = await api("/health");
    if (healthRes.status !== 200) {
      throw new Error(`Health check failed with status: ${healthRes.status}`);
    }
    const healthData = await healthRes.json();
    console.log(`✅ Server is healthy: ${healthData.message}`);
    console.log(`   Database status: ${healthData.status}\n`);

    // ----------------------------------------------------
    // TEST 2: Admin Login
    // ----------------------------------------------------
    console.log("➡️ Test 2: Logging in as the seeded Admin user...");
    const adminMobile = process.env.ADMIN_MOBILE || "0771234567";
    const adminPass = process.env.ADMIN_PASSWORD || "admin1234";

    const loginRes = await api("/api/users/login", {
      method: "POST",
      body: JSON.stringify({ mobile: adminMobile, password: adminPass }),
    });

    if (loginRes.status !== 200) {
      throw new Error(`Admin login failed with status: ${loginRes.status}`);
    }
    const loginData = await loginRes.json();
    adminToken = loginData.token;
    console.log("✅ Admin logged in successfully!");
    console.log(`   User profile: ${loginData.user.firstName} ${loginData.user.lastName}\n`);

    // ----------------------------------------------------
    // TEST 3: Access Admin Stats API
    // ----------------------------------------------------
    console.log("➡️ Test 3: Fetching admin statistics...");
    const statsRes = await api("/api/admin/stats", {
      headers: { "Authorization": `Bearer ${adminToken}` },
    });
    if (statsRes.status !== 200) {
      throw new Error(`Fetching stats failed with status: ${statsRes.status}`);
    }
    const statsData = await statsRes.json();
    console.log("✅ Admin stats loaded successfully!");
    console.log(`   Counts -> Users: ${statsData.counts.users}, Cattle: ${statsData.counts.cattles}, Collars: ${statsData.counts.devices}`);
    console.log(`   Health -> DB: ${statsData.health.database}, MQTT: ${statsData.health.mqtt}\n`);

    // ----------------------------------------------------
    // TEST 4: Create User via Admin API
    // ----------------------------------------------------
    console.log("➡️ Test 4: Creating a standard test user via Admin API...");
    const createUserRes = await api("/api/admin/users", {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}` },
      body: JSON.stringify({
        firstName: "Test",
        lastName: "CattleOwner",
        mobile: testMobile,
        password: testPassword,
        nicNo: "123456789V",
        role: "user",
      }),
    });

    if (createUserRes.status !== 201) {
      const err = await createUserRes.json();
      throw new Error(`Creating user failed with status: ${createUserRes.status}, error: ${JSON.stringify(err)}`);
    }
    const createdUserData = await createUserRes.json();
    testUserId = createdUserData.userId || createdUserData._id;
    console.log(`✅ Test user created successfully with ID: ${testUserId}\n`);

    // ----------------------------------------------------
    // TEST 5: Authenticate as the newly created standard user
    // ----------------------------------------------------
    console.log("➡️ Test 5: Logging in as the standard user...");
    const userLoginRes = await api("/api/users/login", {
      method: "POST",
      body: JSON.stringify({ mobile: testMobile, password: testPassword }),
    });

    if (userLoginRes.status !== 200) {
      throw new Error(`Standard user login failed with status: ${userLoginRes.status}`);
    }
    const userLoginData = await userLoginRes.json();
    userToken = userLoginData.token;
    console.log("✅ Standard user logged in successfully!\n");

    // ----------------------------------------------------
    // TEST 6: Verify standard user cannot access Admin endpoints
    // ----------------------------------------------------
    console.log("➡️ Test 6: Verifying role security (Standard user requesting Admin stats)...");
    const unauthorizedRes = await api("/api/admin/stats", {
      headers: { "Authorization": `Bearer ${userToken}` },
    });
    if (unauthorizedRes.status !== 403) {
      throw new Error(`Security vulnerability: Standard user got status ${unauthorizedRes.status} instead of 403 (Forbidden)`);
    }
    console.log("✅ Security check passed: Standard user request was rejected with 403 Forbidden!\n");

    // ----------------------------------------------------
    // TEST 7: Register Collar and Simulate Telemetry
    // ----------------------------------------------------
    console.log("➡️ Test 7: Registering a new device collar & simulating telemetry...");
    const deviceId = "TESTVERIFY999";
    
    // Register collar
    const registerDeviceRes = await api("/api/admin/devices", {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}` },
      body: JSON.stringify({ deviceId, type: "slave", group: "cc", notes: "Programmatic verification collar" }),
    });
    
    if (registerDeviceRes.status !== 201) {
      throw new Error(`Registering device failed with status: ${registerDeviceRes.status}`);
    }
    console.log("✅ Collar TESTVERIFY999 registered successfully.");

    // Simulate telemetry
    const simRes = await api(`/api/admin/devices/${deviceId}/telemetry`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${adminToken}` },
      body: JSON.stringify({
        lat: 6.95,
        lon: 79.95,
        batteryPercent: 92,
        batteryVoltage: 4.18,
      }),
    });

    if (simRes.status !== 200) {
      throw new Error(`Simulating telemetry failed with status: ${simRes.status}`);
    }
    console.log("✅ Simulated telemetry packet successfully injected!");

    // Verify it was logged in historical telemetry
    const telRes = await api(`/api/admin/telemetries?deviceId=${deviceId}`, {
      headers: { "Authorization": `Bearer ${adminToken}` },
    });
    const telData = await telRes.json();
    if (telData.telemetries.length === 0) {
      throw new Error("Simulated telemetry was not found in database logs.");
    }
    console.log(`✅ Telemetry log verified! Record timestamp: ${telData.telemetries[0].timestamp}\n`);

    // ----------------------------------------------------
    // TEST 8: Cleanup Resources (Delete collar and user)
    // ----------------------------------------------------
    console.log("➡️ Test 8: Cleaning up test resources...");
    
    // Delete Collar
    const delDeviceRes = await api(`/api/admin/devices/${deviceId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${adminToken}` },
    });
    if (delDeviceRes.status !== 200) {
      console.warn(`⚠️ Warning: Failed to clean up device: ${delDeviceRes.status}`);
    } else {
      console.log("✅ Test collar device deleted successfully.");
    }

    // Delete User
    const delUserRes = await api(`/api/admin/users/${testUserId}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${adminToken}` },
    });
    if (delUserRes.status !== 200) {
      console.warn(`⚠️ Warning: Failed to clean up user: ${delUserRes.status}`);
    } else {
      console.log("✅ Test user deleted successfully.");
    }

    console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY! ADMIN API INTEGRATION IS VERIFIED AND SECURE.");
    process.exit(0);

  } catch (err) {
    console.error("\n❌ VERIFICATION TEST FAILED:");
    console.error(err.message);
    process.exit(1);
  }
}

// Wait 2 seconds for server to settle, then run
setTimeout(runTests, 2000);
