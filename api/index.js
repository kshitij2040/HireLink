const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cors = require("cors");
const bcrypt = require("bcryptjs");


// Load environment variables (only for local development)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const app = express();

// Middleware
app.use(express.json());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "https://hirelink-brown.vercel.app",
    methods: "GET,POST,PUT,DELETE",
  })
);

// MongoDB Connection
const mongooseUri = process.env.MONGODB_URI;
mongoose
  .connect(mongooseUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("Could not connect to MongoDB...", err));

// Job Schema
const jobSchema = new mongoose.Schema({
  title: String,
  description: String,
  link: String,
  postedAt: { type: Date, default: Date.now },
});
const Job = mongoose.model("Job", jobSchema);

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  department: String,
  password: String,
  is_verified: { type: Boolean, default: false },
});
const User = mongoose.model("User", userSchema);

// Middleware to Verify Supabase Token
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token missing or invalid" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const response = await axios.get(`${process.env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_API_KEY,
      },
    });

    if (response.status !== 200) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = response.data;
    next();
  } catch (err) {
    console.error("Error verifying token:", err);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Routes

// Test Route
app.get("/", (req, res) => {
  res.send("Express app is running");
});

// User Registration
app.post("/register", async (req, res) => {
  const { name, email, department, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email, department, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    res.status(500).json({ message: "Error registering user", error });
  }
});

// User Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: "1h" });

    res.status(200).json({ message: "Login successful", token });
  } catch (error) {
    res.status(500).json({ message: "Error during login", error });
  }
});

// Add Job
app.post("/add-job", verifyToken, async (req, res) => {
  const { title, description, link } = req.body;

  if (!title || !description || !link) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const newJob = new Job({ title, description, link });
    await newJob.save();
    res.status(201).json({ message: "Job added successfully!", job: newJob });
  } catch (error) {
    res.status(500).json({ message: "Error adding job", error });
  }
});

// Fetch All Jobs
app.get("/all-jobs", async (req, res) => {
  try {
    const jobs = await Job.find();
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ message: "Error fetching jobs", error });
  }
});

// Fetch Latest Jobs
app.get("/latest-jobs", async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const jobs = await Job.find({ postedAt: { $gte: twentyFourHoursAgo } }).sort({ postedAt: -1 });
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ message: "Error fetching latest jobs", error });
  }
});

// Export the app
module.exports = app;
