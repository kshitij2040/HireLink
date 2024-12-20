const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cors = require("cors");
const bcrypt = require("bcryptjs");

// Load environment variables from .env file
require("dotenv").config();

const app = express();

// Middleware
app.use(express.json());

// Updated CORS Configuration
// Added proper handling for allowed origins and preflight requests
const allowedOrigins = [
  "https://hirelink-brown.vercel.app", // Frontend deployment URL
  "http://localhost:3000",            // Local development
];

app.use(
  cors({
    origin: ["https://hirelink-brown.vercel.app"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

// Added preflight request handling globally
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "https://hirelink-brown.vercel.app");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.sendStatus(204);
});


// MongoDB Connection
const mongooseUri = process.env.MONGODB_URI;
mongoose
  .connect(mongooseUri, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("Could not connect to MongoDB...", err);
    process.exit(1); // Exit if MongoDB connection fails
  });

// Job Schema
const jobSchema = new mongoose.Schema({
  title: String,
  description: String,
  link: String,
  postedAt: { type: Date, default: Date.now },
});
const Job = mongoose.model("Job", jobSchema);

// User Schema for authentication
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
    // Use Supabase API to verify the token
    const supabaseURL = process.env.SUPABASE_URL;
    const supabaseApiKey = process.env.SUPABASE_API_KEY;
    const response = await axios.get(`${supabaseURL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseApiKey,
      },
    });

    if (response.status !== 200) {
      return res.status(401).json({ message: "Invalid token" });
    }

    req.user = response.data;
    next();
  } catch (err) {
    console.error("Error verifying token:", err);
    return res.status(401).json({ message: "Invalid or check expired token" });
  }
};

// Routes

// Test route
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

    res.status(200).json({ message: "Login successful", user });
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
    // Create a new job object and save it to the database
    const job = new Job({ title, description, link });
    await job.save();
    res.status(201).json({ message: "Job added successfully", job });
  } catch (err) {
    res.status(500).json({ message: "Error adding job", err });
  }
});

// Fetch all jobs (exclude jobs older than 30 days)
app.get("/all-jobs", async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); 
    const jobs = await Job.find({ postedAt: { $gte: thirtyDaysAgo } }).sort({ postedAt: -1 }); 
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ message: "Error fetching jobs", error });
  }
});

// Fetch jobs posted in the last 24 hours
app.get("/latest-jobs", async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const jobs = await Job.find({ postedAt: { $gte: twentyFourHoursAgo } }).sort({ postedAt: -1 });
    res.status(200).json(jobs);
  } catch (error) {
    res.status(500).json({ message: "Error fetching latest jobs", error });
  }
});

// Export the app (do not use app.listen for Vercel)
module.exports = app;
