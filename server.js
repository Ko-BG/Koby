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
 * Optimized for Node.js (v20+) & Render.com
 */

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// 1. CLOUD PROXY CONFIG
// Required for Express-Rate-Limit to work correctly on Render/Heroku
app.set('trust proxy', 1);

const io = new Server(server, { 
  cors: { origin: "*", methods: ["GET", "POST"] } 
});

// 2. CONFIGURATION & SECRETS
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
const requiredDirs = ["./uploads", "./logs"];
requiredDirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });

// 4. DATABASE ENGINE
let isDbConnected = false;
if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => {
        console.log("💎 DATABASE: Secure Link Established");
        isDbConnected = true;
    })
    .catch(err => console.error("❌ DATABASE: Connection failed. Check MONGO_URI.", err));
} else {
    console.error("❌ DATABASE: MONGO_URI missing. Auth and Storage disabled.");
}

// 5. DATA MODELS
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

// 6. AUTH PROTECTION
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 30, 
  message: { message: "Security lockout: Too many attempts. Try again in 15 mins." }
});

// 7. AUTHENTICATION ENDPOINTS
app.post("/signup", authLimiter, async (req, res) => {
  if (!isDbConnected) return res.status(503).json({ message: "SERVICE_UNAVAILABLE_DB" });
  try {
    const { email, password, role } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ message: "EMAIL_ALREADY_REGISTERED" });

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    await User.create({ email: email.toLowerCase(), password: hashedPassword, role });
    res.status(201).json({ message: "OFFICIAL_REGISTERED_SUCCESSFULLY" });
  } catch (err) {
    res.status(500).json({ message: "REGISTRATION_FAILED" });
  }
});

app.post("/login", authLimiter, async (req, res) => {
  if (!isDbConnected) return res.status(503).json({ message: "SERVICE_UNAVAILABLE_DB" });
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "INVALID_CREDENTIALS" });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: "24h" });
    
    await Audit.create({ 
      action: "LOGIN", 
      user: user.email, 
      details: `Auth successful for ${user.role}` 
    });

    res.json({ token, email: user.email, role: user.role });
  } catch (err) {
    res.status(500).json({ message: "SERVER_LOGIN_ERROR" });
  }
});

// 8. AI DOCUMENT INGESTION
const storage = multer.diskStorage({
    destination: "uploads/",
    filename: (req, file, cb) => cb(null, `ADAK-${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.post("/upload", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "NO_FILE_RECEIVED" });

    let extractedText = "";
    if (req.file.mimetype === "application/pdf") {
      const data = await pdf(fs.readFileSync(req.file.path));
      extractedText = data.text;
    }

    // AI Risk Logic: Scoring based on keyword density and randomness
    const riskKeywords = ["breach", "violation", "unauthorized", "suspicious"];
    let hitCount = 0;
    riskKeywords.forEach(word => { if (extractedText.toLowerCase().includes(word)) hitCount++; });
    
    const score = Math.min(100, (hitCount * 20) + Math.floor(Math.random() * 20));
    const level = score > 70 ? "HIGH" : score > 40 ? "MEDIUM" : "LOW";

    const doc = await Document.create({
      name: req.file.originalname,
      department: req.body.department,
      fileUrl: req.file.path,
      riskScore: score,
      riskLevel: level,
      uploadedBy: req.body.user
    });

    io.emit("auditUpdate", { 
        action: "INGESTION", 
        department: req.body.department, 
        riskScore: score,
        riskLevel: level
    });
    
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "INGESTION_FAILED" });
  }
});

// 9. SYSTEM API
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

// 10. SYSTEM LAUNCH
server.listen(PORT, "0.0.0.0", () => {
  console.log(`
  +-------------------------------------------+
  |    ADAK ENTERPRISE MASTER CORE v2.5       |
  +-------------------------------------------+
  | STATUS: ONLINE                            |
  | PORT:   ${PORT}                             |
  | DB:     ${isDbConnected ? "CONNECTED" : "OFFLINE"}                 |
  +-------------------------------------------+
  `);
});
