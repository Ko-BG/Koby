import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import pdf from "pdf-parse";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import dotenv from "dotenv";

/**
 * ADAK ENTERPRISE COMPLIANCE AI - MASTER SERVER V2.5
 * Optimized for Render.com & High-Security Compliance
 */

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// 1. RENDER PROXY CONFIG
app.set('trust proxy', 1);

const io = new Server(server, { 
  cors: { origin: "*", methods: ["GET", "POST"] } 
});

// 2. CONFIGURATION & SECRETS
const PORT = process.env.PORT || 10000; 
const JWT_SECRET = process.env.JWT_SECRET || "adak_quantum_default_secure_key_2026";
const MONGO_URI = process.env.MONGO_URI;

// 3. MIDDLEWARE STACK
app.use(helmet({ contentSecurityPolicy: false })); // Allow external CDN scripts
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Create required directories
["./uploads", "./logs"].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });

// 4. DATABASE CONNECTIVITY
let dbStatus = false;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("💎 DATABASE: Connected to ADAK Secure Cluster");
        dbStatus = true;
    })
    .catch(err => console.error("❌ DATABASE: Connection failed", err));
} else {
    console.warn("⚠️ WARNING: MONGO_URI is missing. Authentication will be disabled.");
}

// 5. DATABASE SCHEMAS
const User = mongoose.model("User", new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, default: "Compliance Officer" }
}, { timestamps: true }));

const Document = mongoose.model("Document", new mongoose.Schema({
  name: String,
  department: String,
  fileUrl: String,
  riskScore: Number,
  riskLevel: String,
  uploadedBy: String
}, { timestamps: true }));

const Audit = mongoose.model("Audit", new mongoose.Schema({
  action: String,
  user: String,
  department: String,
  details: String
}, { timestamps: true }));

// 6. SECURITY RATE LIMITING
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 20, 
  message: { message: "Security lockout: Too many attempts. Try again in 15 minutes." }
});

// 7. AUTHENTICATION ROUTES
app.post("/signup", authLimiter, async (req, res) => {
  if (!dbStatus) return res.status(503).json({ message: "DB_OFFLINE" });
  try {
    const { email, password, role } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ message: "USER_ALREADY_EXISTS" });

    const hashedPassword = await bcrypt.hash(password, 12);
    await User.create({ email: email.toLowerCase(), password: hashedPassword, role });
    res.status(201).json({ message: "REGISTRATION_SUCCESSFUL" });
  } catch (err) {
    res.status(500).json({ message: "REGISTRATION_ERROR" });
  }
});

app.post("/login", authLimiter, async (req, res) => {
  if (!dbStatus) return res.status(503).json({ message: "DB_OFFLINE" });
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "INVALID_CREDENTIALS" });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "12h" });
    
    await Audit.create({ action: "USER_LOGIN", user: user.email, details: `Role: ${user.role}` });
    res.json({ token, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ message: "LOGIN_INTERNAL_ERROR" });
  }
});

// 8. FILE PROCESSING
const upload = multer({ dest: "uploads/" });
app.post("/upload", upload.single("document"), async (req, res) => {
  try {
    let text = "";
    if (req.file.mimetype === "application/pdf") {
      const data = await pdf(fs.readFileSync(req.file.path));
      text = data.text;
    }

    const score = Math.floor(Math.random() * 100); // Simulated AI Analysis
    const level = score > 70 ? "HIGH" : score > 40 ? "MEDIUM" : "LOW";

    const doc = await Document.create({
      name: req.file.originalname,
      department: req.body.department,
      fileUrl: req.file.path,
      riskScore: score,
      riskLevel: level,
      uploadedBy: req.body.user
    });

    io.emit("auditUpdate", { action: "DOC_UPLOAD", department: req.body.department, riskScore: score });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "UPLOAD_FAILED" });
  }
});

// 9. API ENDPOINTS
app.get("/ledger", async (req, res) => {
  const logs = await Audit.find().sort({ createdAt: -1 }).limit(10);
  res.json(logs);
});

app.get("/risk/:dept", async (req, res) => {
  const docs = await Document.find({ department: req.params.dept });
  const avg = docs.length ? docs.reduce((a, b) => a + b.riskScore, 0) / docs.length : 0;
  res.json({ score: avg.toFixed(1), level: avg > 60 ? "HIGH" : "LOW" });
});

app.get("/search", async (req, res) => {
    const { dept, q } = req.query;
    const results = await Document.find({ 
        department: dept, 
        name: { $regex: q || "", $options: "i" } 
    });
    res.json(results);
});

// 10. STARTUP
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 ADAK MASTER SERVER ONLINE AT PORT ${PORT}`);
});
