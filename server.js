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

// Fix for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// =========================
// CONFIG
// =========================
// Use process.env for Render deployment security
const JWT_SECRET = process.env.JWT_SECRET || "adak_secret_key";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/adak";
const PORT = process.env.PORT || 3000;

// =========================
// MIDDLEWARE
// =========================
app.use(cors());
app.use(express.json());

// 1. Serve static files from the root directory so it finds index.html
app.use(express.static(__dirname)); 
// 2. Explicitly serve the uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Ensure uploads directory exists on start
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

// =========================
// DB
// =========================
mongoose.connect(MONGO_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("Could not connect to MongoDB:", err));

// =========================
// SOCKET.IO GLOBAL
// =========================
const emitAudit = (data) => {
  io.emit("auditUpdate", data);
};

// =========================
// SCHEMAS
// =========================
const User = mongoose.model("User", new mongoose.Schema({
  email: String,
  password: String,
  role: String
}));

const Document = mongoose.model("Document", new mongoose.Schema({
  name: String,
  department: String,
  fileUrl: String,
  text: String,
  score: Number,
  riskLevel: String,
  signature: String,
  uploadedBy: String
}));

const Audit = mongoose.model("Audit", new mongoose.Schema({
  action: String,
  user: String,
  department: String,
  riskScore: Number,
  riskLevel: String,
  timestamp: { type: Date, default: Date.now }
}));

// =========================
// AUTH MIDDLEWARE
// =========================
const auth = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

// =========================
// UPLOAD
// =========================
const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  }
});
const upload = multer({ storage });

// =========================
// FRONTEND ROUTE
// =========================
// Explicitly serve index.html when hitting the base URL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// =========================
// AUTH
// =========================
app.post("/signup", async (req, res) => {
  const hash = await bcrypt.hash(req.body.password, 10);
  await User.create({ email: req.body.email, password: hash, role: "viewer" });
  res.json({ message: "User created" });
});

app.post("/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user) return res.status(400).json({ message: "Not found" });

  const ok = await bcrypt.compare(req.body.password, user.password);
  if (!ok) return res.status(400).json({ message: "Wrong password" });

  const token = jwt.sign(
    { email: user.email, role: user.role },
    JWT_SECRET
  );

  res.json({ token, email: user.email });
});

// =========================
// 📤 UPLOAD + AI PDF
// =========================
app.post("/upload", auth, upload.single("document"), async (req, res) => {
  let text = "";

  if (req.file.mimetype === "application/pdf") {
    const data = fs.readFileSync(req.file.path);
    const pdfData = await pdf(data);
    text = pdfData.text;
  }

  const score = Math.min(100, text.length / 25);
  const riskLevel = score > 70 ? "HIGH" : score > 40 ? "MEDIUM" : "LOW";

  const doc = await Document.create({
    name: req.file.originalname,
    department: req.body.department,
    fileUrl: req.file.path,
    text,
    score,
    riskLevel,
    uploadedBy: req.body.user
  });

  const audit = await Audit.create({
    action: "UPLOAD",
    user: req.body.user,
    department: req.body.department,
    riskScore: score,
    riskLevel
  });

  emitAudit(audit);

  res.json(doc);
});

// =========================
// 🔎 SEARCH
// =========================
app.get("/search", auth, async (req, res) => {
  const docs = await Document.find({
    department: req.query.dept,
    name: { $regex: req.query.q || "", $options: "i" }
  });

  res.json(docs);
});

// =========================
// 🤖 RISK
// =========================
app.get("/risk/:dept", auth, async (req, res) => {
  const docs = await Document.find({ department: req.params.dept });

  const avg = docs.length > 0 
    ? docs.reduce((a, b) => a + (b.score || 0), 0) / docs.length 
    : 0;

  res.json({
    score: avg.toFixed(2),
    level: avg > 70 ? "HIGH" : avg > 40 ? "MEDIUM" : "LOW"
  });
});

// =========================
// 🤖 ANALYZE
// =========================
app.post("/analyze/:id", auth, async (req, res) => {
  const doc = await Document.findById(req.params.id);

  const score = Math.floor(Math.random() * 100);
  doc.score = score;
  doc.riskLevel = score > 70 ? "HIGH" : score > 40 ? "MEDIUM" : "LOW";

  await doc.save();

  res.json(doc);
});

// =========================
// ✍️ SIGN
// =========================
app.post("/sign", auth, async (req, res) => {
  // Logic updated to find the most recent document for the user if ID isn't provided
  const query = req.body.documentId 
    ? { _id: req.body.documentId } 
    : { uploadedBy: req.user.email, department: req.body.department };

  const doc = await Document.findOne(query).sort({ _id: -1 });

  if (!doc) return res.status(404).json({ message: "Document not found" });

  doc.signature = req.body.hash; 
  await doc.save();

  res.json({ message: "Signed", hash: req.body.hash });
});

// =========================
// 📜 LEDGER
// =========================
app.get("/ledger", auth, async (req, res) => {
  const logs = await Audit.find().sort({ timestamp: -1 }).limit(50);
  res.json(logs);
});

// =========================
// SOCKET CONNECT
// =========================
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);
});

// =========================
// START
// =========================
server.listen(PORT, () => {
  console.log(`ADAK server running on port ${PORT}`);
});
