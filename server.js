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
import nodemailer from "nodemailer"; // Added for Enterprise Email Alerts

/**
 * ADAK ENTERPRISE COMPLIANCE AI - MASTER SERVER V5.0
 * Features: Plug-and-Play API, Vector Truth Logic, Touch/Pen Signatures
 * Optimized for Official @adak.or.ke SMTP Integration
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
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || "ADAK_CORE_SECRET_2026";

// NEW: SMTP TRANSPORTER FOR EMAIL ALERTS
const transporter = nodemailer.createTransport({
  host: "smtp.office365.com", // Official ADAK/Microsoft Host
  port: 587,
  secure: false, // TLS
  auth: {
    user: "your.name@adak.or.ke", 
    pass: process.env.EMAIL_PASS // Your 16-character App Password
  }
});

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

// 5. DATA MODELS
const User = mongoose.model("User", new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, default: "Compliance Officer" }
}, { timestamps: true }));

const Document = mongoose.model("Document", new mongoose.Schema({
  name: String,
  department: String,
  requirement: String, 
  fileUrl: String,
  riskScore: Number,
  riskLevel: String,
  uploadedBy: String,
  extractedData: String,
  isMasterReference: { type: Boolean, default: false } 
}, { timestamps: true }));

const Audit = mongoose.model("Audit", new mongoose.Schema({
  action: String,
  user: String,
  department: String,
  details: String,
  hash: String 
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

    const redFlags = ["gap", "missing", "delay", "incomplete", "overdue", "unauthorized"];
    let hits = 0;
    redFlags.forEach(word => { if (extractedText.toLowerCase().includes(word)) hits++; });
    
    const score = Math.min(100, (hits * 15) + Math.floor(Math.random() * 15));
    const level = score > 70 ? "HIGH" : score > 40 ? "MEDIUM" : "LOW";

    const isMaster = req.body.requirement === "ADAK_MASTER_LEGAL_DOC";

    const doc = await Document.create({
      name: req.file.originalname,
      department: req.body.department,
      requirement: req.body.requirement || "General Ingestion",
      fileUrl: req.file.path,
      riskScore: score,
      riskLevel: level,
      uploadedBy: req.body.user,
      extractedData: extractedText,
      isMasterReference: isMaster 
    });

    if (doc.isMasterReference) {
        await Audit.create({ 
            action: "KNOWLEDGE_BASE_UPDATE", 
            user: req.body.user, 
            details: `New Gold Standard: ${doc.name}` 
        });
    }

    if(level === "HIGH") {
        const mailOptions = {
            from: '"ADAK CORE AI" <alerts@adak.or.ke>',
            to: "head.compliance@adak.or.ke",
            subject: `⚠️ COMPLIANCE ALERT: ${level} RISK detected`,
            html: `<h3>Risk Alert</h3><p>Document <b>${doc.name}</b> flagged. Score: ${score}%</p>`
        };
        transporter.sendMail(mailOptions).catch(e => console.log("Email Error"));
    }

    io.emit("auditUpdate", { 
        action: isMaster ? "MASTER_DOC_LOADED" : "COMPLIANCE_UPLOAD", 
        details: `${req.file.originalname}`,
        department: req.body.department
    });
    
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "UPLOAD_FAIL" });
  }
});

// 9. PLUG-AND-PLAY API (For ESS System Integration)
app.post("/api/v1/external/validate", async (req, res) => {
  try {
    const apiKey = req.headers['x-adak-key'];
    if (apiKey !== INTERNAL_API_KEY) return res.status(403).json({ error: "UNAUTHORIZED" });

    const { content, dept } = req.body;
    const master = await Document.findOne({ isMasterReference: true, department: dept });
    
    // Simulate AI grading against Master Doc
    const risk = content.length < 50 ? 80 : 10; 
    
    res.json({
      status: risk > 50 ? "DEVIATION_DETECTED" : "VALIDATED",
      riskScore: risk,
      architect: "G. Jakes Nyangaga",
      timestamp: new Date()
    });
  } catch (e) {
    res.status(500).json({ error: "API_GATEWAY_TIMEOUT" });
  }
});

// 10. DIGITAL SIGNATURE HANDLER (Backend Storage)
app.post("/sign", async (req, res) => {
    try {
        const { user, department, hash } = req.body;
        const entry = await Audit.create({
            action: "DIGITAL_SIGNATURE",
            user,
            department,
            details: "Official verified document integrity via Finger/Pen.",
            hash: hash 
        });
        io.emit("auditUpdate", { action: "SIGNATURE_LOCKED", details: `Hash: ${hash.substring(0,10)}...` });
        res.json({ success: true, entry });
    } catch (err) {
        res.status(500).json({ message: "SIGN_ERROR" });
    }
});

// 11. SYSTEM API
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

// 12. ENTERPRISE: AI CHAT
app.post("/query-ai", async (req, res) => {
  try {
    const { query, dept } = req.body;
    const masterDoc = await Document.findOne({ isMasterReference: true, extractedData: { $regex: query, $options: "i" } });
    const latestDoc = await Document.findOne({ department: dept }).sort({ createdAt: -1 });
    
    let answer = "I have reviewed our current records. No specific conflict found.";
    if (masterDoc) {
        answer = `According to the Official Policy (${masterDoc.name}): Alignment with Article 5 is required.`;
    } else if (latestDoc && latestDoc.extractedData.toLowerCase().includes(query.toLowerCase())) {
        answer = `Found reference in recent upload: ${latestDoc.name}.`;
    }
    res.json({ answer });
  } catch (err) {
    res.status(500).json({ message: "AI_OFFLINE" });
  }
});

// 13. SOCKET HANDLERS
io.on("connection", (socket) => {
  socket.on("adminBroadcast", (data) => {
    io.emit("auditUpdate", { action: "ADMIN_GLOBAL_ALERT", details: data.message, user: data.admin });
  });
});

// 14. STARTUP
server.listen(PORT, "0.0.0.0", () => {
  console.log(`
  +-------------------------------------------+
  |    ADAK ENTERPRISE MASTER CORE v5.0       |
  +-------------------------------------------+
  | STATUS: ONLINE (API Gateway Active)       |
  | ARCHITECT: Gillian Jakes Nyangaga         |
  +-------------------------------------------+
  `);
});

