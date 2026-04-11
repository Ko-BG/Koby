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

/**
 * ADAK ENTERPRISE COMPLIANCE AI - CORE SERVER
 * Built for 2026 Enterprise Deployment Standards
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*", methods: ["GET", "POST"] } 
});

// ==========================================
// SYSTEM CONFIGURATION
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET || "adak_quantum_encryption_key_2026";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/adak_compliance";
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE STACK
// ==========================================
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve HTML from root
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Directory Initialization
const requiredFolders = ["./uploads", "./logs"];
requiredFolders.forEach(folder => {
  if (!fs.existsSync(folder)) fs.mkdirSync(folder);
});

// ==========================================
// DATABASE ARCHITECTURE
// ==========================================
mongoose.connect(MONGO_URI)
  .then(() => console.log("💎 DATABASE: Connected to ADAK Secure Cluster"))
  .catch(err => console.error("❌ DATABASE: Connection failed", err));

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["Compliance Officer", "Auditor"], default: "Compliance Officer" },
  lastLogin: { type: Date, default: Date.now }
});

const DocumentSchema = new mongoose.Schema({
  name: String,
  department: String,
  fileUrl: String,
  hash: String,
  riskScore: Number,
  status: { type: String, default: "Pending Analysis" },
  signature: String,
  uploadedBy: String,
  createdAt: { type: Date, default: Date.now }
});

const AuditSchema = new mongoose.Schema({
  action: String,
  user: String,
  department: String,
  details: String,
  severity: { type: String, default: "Low" },
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model("User", UserSchema);
const Document = mongoose.model("Document", DocumentSchema);
const Audit = mongoose.model("Audit", AuditSchema);

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
const logger = (msg) => {
  const logEntry = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync("./logs/server.log", logEntry);
};

// ==========================================
// AUTHENTICATION SYSTEM (Global Signup)
// ==========================================
app.post("/signup", async (req, res) => {
  try {
    const { email, password, role } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).send("User already registered in the system.");

    const hashedPassword = await bcrypt.hash(password, 12);
    await User.create({ email, password: hashedPassword, role });
    
    logger(`NEW_USER_REGISTERED: ${email}`);
    res.status(201).send("REGISTRATION_SUCCESSFUL");
  } catch (error) {
    res.status(500).send("System encountered an error during signup.");
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "8h" });
    user.lastLogin = Date.now();
    await user.save();

    res.json({ token, email: user.email, role: user.role });
  } catch (error) {
    res.status(500).json({ message: "Login failed" });
  }
});

// ==========================================
// CORE COMPLIANCE API
// ==========================================
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.post("/upload", upload.single("document"), async (req, res) => {
  try {
    let content = "";
    if (req.file.mimetype === "application/pdf") {
      const buffer = fs.readFileSync(req.file.path);
      const data = await pdf(buffer);
      content = data.text;
    }

    // AI Mock Logic: Determine risk based on content length and keywords
    const keywords = ["violation", "breach", "warning", "non-compliant"];
    let matchCount = 0;
    keywords.forEach(word => { if (content.toLowerCase().includes(word)) matchCount++; });

    const riskScore = Math.min(100, (matchCount * 25) + (Math.random() * 20));
    const riskLevel = riskScore > 75 ? "high" : riskScore > 40 ? "medium" : "low";

    const doc = await Document.create({
      name: req.file.originalname,
      department: req.body.department,
      fileUrl: req.file.path,
      riskScore,
      uploadedBy: req.body.user,
      status: "Verified"
    });

    const auditEntry = await Audit.create({
      action: "FILE_INGESTION",
      user: req.body.user,
      department: req.body.department,
      details: `Document ${req.file.originalname} analyzed with score ${riskScore}`,
      severity: riskLevel
    });

    io.emit("auditUpdate", auditEntry);
    res.json(doc);
  } catch (error) {
    console.error(error);
    res.status(500).send("File processing failed.");
  }
});

app.get("/search", async (req, res) => {
  const { dept, q } = req.query;
  const filter = { department: dept };
  if (q) filter.name = { $regex: q, $options: "i" };
  
  const results = await Document.find(filter).sort({ createdAt: -1 });
  res.json(results);
});

app.get("/risk/:dept", async (req, res) => {
  const docs = await Document.find({ department: req.params.dept });
  const total = docs.reduce((acc, curr) => acc + curr.riskScore, 0);
  const avg = docs.length > 0 ? (total / docs.length).toFixed(1) : 0;
  
  res.json({
    score: avg,
    level: avg > 70 ? "HIGH" : avg > 40 ? "MEDIUM" : "LOW"
  });
});

app.post("/sign", async (req, res) => {
  const { user, department, hash } = req.body;
  const doc = await Document.findOne({ uploadedBy: user, department }).sort({ createdAt: -1 });
  
  if (doc) {
    doc.signature = hash;
    await doc.save();
    
    const audit = await Audit.create({
      action: "DIGITAL_SIGNATURE",
      user,
      department,
      details: `Hash: ${hash.substring(0, 16)}...`,
      severity: "low"
    });
    
    io.emit("auditUpdate", audit);
    res.json({ success: true });
  } else {
    res.status(404).send("No document found to sign.");
  }
});

app.get("/ledger", async (req, res) => {
  const logs = await Audit.find().sort({ timestamp: -1 }).limit(25);
  res.json(logs);
});

// ==========================================
// STARTUP
// ==========================================
io.on("connection", (socket) => {
  console.log(`📡 SOCKET: New listener active [${socket.id}]`);
});

server.listen(PORT, () => {
  console.log(`
  ===========================================
  🚀 ADAK ENTERPRISE AI COMPLIANCE SYSTEM
  ===========================================
  📡 Status: ACTIVE
  🌐 Port:   ${PORT}
  📁 Path:   ${__dirname}
  💎 DB:     Connected
  ===========================================
  `);
});
