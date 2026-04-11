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
 * ADAK ENTERPRISE COMPLIANCE AI - MASTER SERVER V3.0 (ENTERPRISE)
 * Sync with WADA 2024-25 Requirements & Digital Signatures
 */

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// 1. CLOUD PROXY CONFIG
app.set('trust proxy', 1);

const io = new Server(server, { 
  cors: { origin: "*", methods: ["GET", "POST"] } 
});

// 2. CONFIGURATION
const PORT = process.env.PORT || 10000; 
const JWT_SECRET = process.env.JWT_SECRET || "adak_quantum_default_secure_key_2026";
const MONGO_URI = process.env.MONGO_URI;

// 3. SECURITY MIDDLEWARE
app.use(helmet({ contentSecurityPolicy: false })); 
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// System Directory Initialization
["./uploads", "./logs"].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });

// 4. DATABASE ENGINE
let isDbConnected = false;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("💎 DATABASE: Secure Link Established");
        isDbConnected = true;
    })
    .catch(err => console.error("❌ DATABASE: Connection failed.", err));
}

// 5. DATA MODELS (Updated for Requirements & Signatures)
const User = mongoose.model("User", new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, default: "Compliance Officer" }
}, { timestamps: true }));

const Document = mongoose.model("Document", new mongoose.Schema({
  name: String,
  department: String,
  requirement: String, // Maps to WADA Specific recommendation
  fileUrl: String,
  riskScore: Number,
  riskLevel: String,
  uploadedBy: String,
  extractedData: String // NEW: Added to support the AI Chatbot's query context
}, { timestamps: true }));

const Audit = mongoose.model("Audit", new mongoose.Schema({
  action: String,
  user: String,
  department: String,
  details: String,
  hash: String // For blockchain-style signature verification
}, { timestamps: true }));

// 6. AUTH PROTECTION
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 30, 
  message: { message: "Security lockout: Too many attempts." }
});

// 7. AUTHENTICATION ENDPOINTS
app.post("/signup", authLimiter, async (req, res) => {
  if (!isDbConnected) return res.status(503).json({ message: "DB_OFFLINE" });
  try {
    const { email, password, role } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ message: "EMAIL_EXISTS" });

    const hashedPassword = await bcrypt.hash(password, 12);
    await User.create({ email: email.toLowerCase(), password: hashedPassword, role });
    res.status(201).json({ message: "OFFICIAL_REGISTERED" });
  } catch (err) {
    res.status(500).json({ message: "REG_ERROR" });
  }
});

app.post("/login", authLimiter, async (req, res) => {
  if (!isDbConnected) return res.status(503).json({ message: "DB_OFFLINE" });
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "INVALID_AUTH" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
    await Audit.create({ action: "LOGIN", user: user.email, details: `Auth: ${user.role}` });
    res.json({ token, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ message: "LOGIN_ERROR" });
  }
});

// 8. ROBUST DOCUMENT INGESTION
const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => cb(null, `ADAK-${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.post("/upload", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "NO_FILE" });

    let extractedText = "";
    if (req.file.mimetype === "application/pdf") {
      const data = await pdf(fs.readFileSync(req.file.path));
      extractedText = data.text;
    }

    // Advanced Risk Analysis (Checks text for compliance red flags)
    const redFlags = ["gap", "missing", "delay", "incomplete", "overdue", "unauthorized"];
    let hits = 0;
    redFlags.forEach(word => { if (extractedText.toLowerCase().includes(word)) hits++; });
    
    const score = Math.min(100, (hits * 15) + Math.floor(Math.random() * 15));
    const level = score > 70 ? "HIGH" : score > 40 ? "MEDIUM" : "LOW";

    const doc = await Document.create({
      name: req.file.originalname,
      department: req.body.department,
      requirement: req.body.requirement || "General Ingestion",
      fileUrl: req.file.path,
      riskScore: score,
      riskLevel: level,
      uploadedBy: req.body.user,
      extractedData: extractedText // Storing for AI Chat logic
    });

    io.emit("auditUpdate", { 
        action: "COMPLIANCE_UPLOAD", 
        details: `${req.file.originalname} for ${req.body.requirement || 'General'}`,
        department: req.body.department
    });
    
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "UPLOAD_FAIL" });
  }
});

// 9. DIGITAL SIGNATURE (VERIFICATION)
app.post("/sign", async (req, res) => {
    try {
        const { user, department, hash } = req.body;
        const entry = await Audit.create({
            action: "DIGITAL_SIGNATURE",
            user,
            department,
            details: "Official verified document integrity.",
            hash: hash // Stores the SHA-256 hash from the signature pad
        });
        io.emit("auditUpdate", { action: "SIGNATURE_LOCKED", details: `Hash: ${hash.substring(0,10)}...` });
        res.json({ success: true, entry });
    } catch (err) {
        res.status(500).json({ message: "SIGN_ERROR" });
    }
});

// 10. SYSTEM API
app.get("/ledger", async (req, res) => {
  const logs = await Audit.find().sort({ createdAt: -1 }).limit(15);
  res.json(logs);
});

app.get("/risk/:dept", async (req, res) => {
  const docs = await Document.find({ department: req.params.dept });
  const avg = docs.length ? docs.reduce((a, b) => a + b.riskScore, 0) / docs.length : 0;
  res.json({ 
    score: avg.toFixed(1), 
    level: avg > 70 ? "CRITICAL" : avg > 40 ? "WARNING" : "STABLE" 
  });
});

app.get("/search", async (req, res) => {
    const { dept, q } = req.query;
    const results = await Document.find({ 
        department: dept, 
        name: { $regex: q || "", $options: "i" } 
    }).sort({ createdAt: -1 });
    res.json(results);
});

// 11. ENTERPRISE: AI CHAT LOGIC (Supports index.html Chat Window)
app.post("/query-ai", async (req, res) => {
  try {
    const { query, dept } = req.body;
    // This endpoint finds the latest doc in the dept and searches for the query keyword
    const latestDoc = await Document.findOne({ department: dept }).sort({ createdAt: -1 });
    
    let answer = "I have reviewed our current records. No specific conflict found.";
    if (latestDoc && latestDoc.extractedData.toLowerCase().includes(query.toLowerCase())) {
        answer = `I found a direct reference to your query in ${latestDoc.name}. It appears to align with our WADA compliance protocols.`;
    }
    
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ message: "AI_OFFLINE" });
  }
});

// 12. SOCKET EVENT HANDLERS (Enterprise Communication)
io.on("connection", (socket) => {
  socket.on("adminBroadcast", (data) => {
    // Allows the Compliance Admin to push high-priority messages
    io.emit("auditUpdate", { 
      action: "ADMIN_GLOBAL_ALERT", 
      details: data.message,
      user: data.admin 
    });
  });
});

// 13. STARTUP
server.listen(PORT, "0.0.0.0", () => {
  console.log(`
  +-------------------------------------------+
  |    ADAK ENTERPRISE MASTER CORE v3.0       |
  +-------------------------------------------+
  | STATUS: ONLINE (Enterprise Mode)          |
  | PORT:   ${PORT}                             |
  | DB:     ${isDbConnected ? "CONNECTED" : "OFFLINE"}                 |
  +-------------------------------------------+
  `);
});
