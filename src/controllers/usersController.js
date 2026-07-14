const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// ---------------- REGISTER ----------------
exports.createUser = async (req, res) => {
  try {
    const { firstName, lastName, gender, mobile, nicNo, address, password } = req.body;

    // Backend generates userId automatically
    // 5-digit numeric userId as a string: "12345"
    const userId = String(Math.floor(10000 + Math.random() * 90000));

    // Input validation
    if (!firstName || !lastName || !mobile || !password) {
      return res.status(400).json({
        error: "firstName, lastName, mobile, and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters long" });
    }

    if (!/^\d{10,15}$/.test(mobile)) {
      return res.status(400).json({ error: "Mobile must be 10-15 digits" });
    }

    // Check if mobile already exists
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(409).json({ error: "Mobile already in use" });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Create user in MongoDB
    const user = await User.create({
      _id: userId,
      firstName,
      lastName,
      gender,
      mobile,
      nicNo,
      address,
      password: hashed,
    });

    // convert to JSON to leverage mongoose transform hook
    const userJson = user.toJSON();

    res.status(201).json({
      message: "User registered",
      user: userJson,
    });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ error: "Failed to register user" });
  }
};

// ---------------- LOGIN ----------------
exports.loginUser = async (req, res) => {
  try {
    const { mobile, password } = req.body;
    if (!mobile || !password) {
      return res.status(400).json({ error: "Mobile and password required" });
    }

    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, mobile: user.mobile },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        userId: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        mobile: user.mobile,
      },
    });
  } catch (err) {
    console.error("Error logging in:", err);
    res.status(500).json({ error: "Login failed" });
  }
};

// ---------------- READ (GET PROFILE) ----------------
exports.getUser = async (req, res) => {
  try {
    const myUserId = req.user.userId;

    const user = await User.findById(myUserId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Failed to fetch user data" });
  }
};

// ---------------- UPDATE ----------------
exports.updateUser = async (req, res) => {
  try {
    const myUserId = req.user.userId;
    const { firstName, lastName, gender, mobile, nicNo, address, password } = req.body;

    const user = await User.findById(myUserId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (gender !== undefined) user.gender = gender;
    if (nicNo !== undefined) user.nicNo = nicNo;
    if (address !== undefined) user.address = address;

    if (mobile !== undefined && mobile !== user.mobile) {
      // Check if mobile already exists for another user
      const existingUser = await User.findOne({ mobile });
      if (existingUser) {
        return res.status(409).json({ error: "Mobile already in use" });
      }
      user.mobile = mobile;
    }

    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    res.json({ message: "User updated", user });
  } catch (err) {
    console.error("Error updating user:", err);
    res.status(500).json({ error: "Failed to update user" });
  }
};

// ---------------- DELETE ----------------
exports.deleteUser = async (req, res) => {
  try {
    const myUserId = req.user.userId;

    const user = await User.findByIdAndDelete(myUserId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "User deleted" });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
};
