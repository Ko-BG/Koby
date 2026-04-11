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

/**
 * ADAK ENTERPRISE COMPLIANCE AI - MASTER SERVER V2.1
 * Updated: April 2026 
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

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50, // Slightly increased for enterprise testing
  message: { message: "Too many attempts. Security lockout active for 15 mins." }
});

app.use(express.static(__dirname));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const dirs = ["./uploads", "./logs", "./backups"];
dirs.forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d); });

// ==========================================
// DATABASE ARCHITECTURE
// ==========================================
mongoose.connect(MONGO_URI)
  .then(() => console.log("💎 DATABASE: Connected to ADAK Secure Cluster"))
  .catch(err => console.error("❌ DATABASE: Connection failed", err));

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: [
      "Compliance Officer", 
      "Auditor", 
      "Testing officer", 
      "Intelligence and Investigations officer", 
      "Education officer", 
      "Results management officer", 
      "Data protection officer"
    ], 
    default: "Compliance Officer" 
  },
  status: { type: String, default: "Active" }
}, { timestamps: true });

const User = mongoose.model("User", UserSchema);

const Document = mongoose.model("Document", new mongoose.Schema({
  name: String,
  department: String,
  fileUrl: String,
  riskScore: Number,
  riskLevel: String,
  summary: String,
  signature: String,
  uploadedBy: String
}, { timestamps: true }));

const Audit = mongoose.model("Audit", new mongoose.Schema({
  action: String,
  user: String,
  department: String,
  severity: String,
  details: String
}, { timestamps: true }));

// ==========================================
// AUTHENTICATION SYSTEM
// ==========================================
app.post("/signup", authLimiter, async (req, res) => {
  try {
    const { email, password, role } = req.body;
    
    if (!email || !password) {
        return res.status(400).json({ message: "Email and Password required" });
    }

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

    const token = jwt.sign(
        { id: user._id, email: user.email, role: user.role }, 
        JWT_SECRET, 
        { expiresIn: "12h" }
    );
    
    await Audit.create({ 
      action: "USER_LOGIN", 
      user: user.email, 
      severity: "Low", 
      details: `Designation: ${user.role} authenticated.` 
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
      details: `Analysis complete. Flags: ${foundKeywords.length}. Score: ${baseScore}`
    });

    io.emit("auditUpdate", audit);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "UPLOAD_PROCESS_FAILED" });
  }
});

// ==========================================
// CORE API ROUTES
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
      details: `Signature Hash: ${hash.substring(0, 12)}...`
    });

    io.emit("auditUpdate", audit);
    res.json({ success: true });
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
  console.log(`📡 Socket Link: [${socket.id}]`);
});

server.listen(PORT, () => {
  console.log(`
  +-------------------------------------------+
  |    ADAK ENTERPRISE COMPLIANCE AI v2.1     |
  +-------------------------------------------+
  | STATUS:     ACTIVE                        |
  | PORT:       ${PORT}                          |
  | ROLES:      Testing, Intel, Education...  |
  +-------------------------------------------+
  `);
});
