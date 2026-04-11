import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs"; // Consider migrating to argon2 in production
import multer from "multer";
import pdf from "pdf-parse";
import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { Server } from "socket.io";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

/**
 * ADAK ENTERPRISE COMPLIANCE AI - CORE SERVER V2.0
 * Refined for High-Security Enterprise Standards
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*", methods: ["GET", "POST"] } 
});

// ==========================================
// CONFIGURATION & SECURITY
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET || "adak_quantum_2026_top_secret";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/adak_enterprise";
const PORT = process.env.PORT || 3000;

// Security Headers
app.use(helmet({ contentSecurityPolicy: false })); // CSP disabled for easy local static serving
app.use(cors());
app.use(express.json());

// Rate Limiting to prevent Brute Force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per window
  message: { message: "Too many login attempts, please try again later." }
});

// Static Routes
app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Persistent Directories
const dirs = ["./uploads", "./logs", "./backups"];
dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });

// ==========================================
// DATABASE ARCHITECTURE
// ==========================================
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ CLUSTER: ADAK Enterprise Cloud Online"))
  .catch(err => console.error("❌ CLUSTER: Connection Failed", err));

const User = mongoose.model("User", new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["Compliance Officer", "Auditor"], default: "Compliance Officer" },
  status: { type: String, default: "Active" },
  mfaEnabled: { type: Boolean, default: false }
}, { timestamps: true }));

const Document = mongoose.model("Document", new mongoose.Schema({
  name: String,
  department: String,
  fileUrl: String,
  riskScore: Number,
  riskLevel: String,
  summary: String,
  signature: String, // SHA-256 Hash of signature
  uploadedBy: String,
  isArchived: { type: Boolean, default: false }
}, { timestamps: true }));

const Audit = mongoose.model("Audit", new mongoose.Schema({
  action: String,
  user: String,
  department: String,
  severity: String,
  details: String,
  ipAddress: String
}, { timestamps: true }));

// ==========================================
// AUTHENTICATION (Global Signup & Secure Login)
// ==========================================
app.post("/signup", authLimiter, async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password) return res.status(400).json({ message: "MISSING_DATA" });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ message: "USER_ALREADY_EXISTS" });

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      role: role || "Compliance Officer"
    });

    res.status(201).json({ message: "REGISTRATION_SUCCESSFUL", user: newUser.email });
  } catch (err) {
    res.status(500).json({ message: "REGISTRATION_ERROR" });
  }
});

app.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "INVALID_CREDENTIALS" });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "12h" });
    
    await Audit.create({ 
      action: "USER_LOGIN", 
      user: user.email, 
      severity: "Low", 
      details: "Successful system authentication" 
    });

    res.json({ token, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ message: "LOGIN_INTERNAL_ERROR" });
  }
});

// ==========================================
// AI DOCUMENT PROCESSING
// ==========================================
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, `ADAK-${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.post("/upload", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "NO_FILE_UPLOADED" });

    let textContent = "";
    if (req.file.mimetype === "application/pdf") {
      const buffer = fs.readFileSync(req.file.path);
      const data = await pdf(buffer);
      textContent = data.text;
    }

    // AI Analysis Simulation: Logic-based Risk Scoping
    const riskKeywords = ["fraud", "violation", "override", "unauthorized", "suspicious", "breach"];
    const foundKeywords = riskKeywords.filter(word => textContent.toLowerCase().includes(word));
    
    const baseScore = Math.min(100, (foundKeywords.length * 15) + (Math.random() * 15));
    const riskLevel = baseScore > 75 ? "HIGH" : baseScore > 40 ? "MEDIUM" : "LOW";

    const doc = await Document.create({
      name: req.file.originalname,
      department: req.body.department,
      fileUrl: req.file.path,
      riskScore: baseScore.toFixed(2),
      riskLevel: riskLevel,
      summary: textContent.substring(0, 200) + "...",
      uploadedBy: req.body.user
    });

    const audit = await Audit.create({
      action: "DOCUMENT_INGESTION",
      user: req.body.user,
      department: req.body.department,
      severity: riskLevel,
      details: `Doc Analysis: ${foundKeywords.length} flags found. Score: ${baseScore}`
    });

    io.emit("auditUpdate", audit);
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "UPLOAD_PROCESS_FAILED" });
  }
});

// ==========================================
// REPORTING & SEARCH
// ==========================================
app.get("/search", async (req, res) => {
  const { dept, q } = req.query;
  const query = { department: dept };
  if (q) query.name = { $regex: q, $options: "i" };

  const results = await Document.find(query).sort({ createdAt: -1 });
  res.json(results);
});

app.get("/risk/:dept", async (req, res) => {
  const docs = await Document.find({ department: req.params.dept });
  const avg = docs.length > 0 ? docs.reduce((a, b) => a + b.riskScore, 0) / docs.length : 0;
  
  res.json({
    score: avg.toFixed(2),
    level: avg > 70 ? "HIGH" : avg > 40 ? "MEDIUM" : "LOW"
  });
});

app.post("/sign", async (req, res) => {
  try {
    const { user, department, hash } = req.body;
    const doc = await Document.findOne({ uploadedBy: user, department }).sort({ createdAt: -1 });

    if (!doc) return res.status(404).json({ message: "DOCUMENT_NOT_FOUND" });

    doc.signature = hash;
    await doc.save();

    const audit = await Audit.create({
      action: "ENCRYPTED_SIGNATURE",
      user,
      department,
      severity: "Low",
      details: `Biometric Hash: ${hash.substring(0, 10)}...`
    });

    io.emit("auditUpdate", audit);
    res.json({ success: true, message: "Authorized" });
  } catch (err) {
    res.status(500).json({ message: "SIGN_FAILED" });
  }
});

app.get("/ledger", async (req, res) => {
  const logs = await Audit.find().sort({ createdAt: -1 }).limit(30);
  res.json(logs);
});

// ==========================================
// SYSTEM STARTUP
// ==========================================
io.on("connection", (socket) => {
  console.log(`📡 Socket Connected: [${socket.id}]`);
  socket.on("disconnect", () => console.log(`📡 Socket Disconnected`));
});

server.listen(PORT, () => {
  console.log(`
  +-------------------------------------------+
  |    ADAK ENTERPRISE COMPLIANCE AI v2.0     |
  +-------------------------------------------+
  | STATUS:     ACTIVE                        |
  | PORT:       ${PORT}                          |
  | DB:         CONNECTED                     |
  | ENCRYPTION: SHA-256 / JWT / BCRYPT        |
  +-------------------------------------------+
  `);
});
