const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- MongoDB Setup ---
const mongoUri = process.env.MONGO_URI; // Set in Render environment
mongoose.connect(mongoUri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// --- Schemas ---
const accessLogSchema = new mongoose.Schema({
  email: String,
  wallet: String,
  ip: String,
  action: String, // signup/login/payment
  timestamp: { type: Date, default: Date.now }
});

const AccessLog = mongoose.model('AccessLog', accessLogSchema);

const merchantSchema = new mongoose.Schema({
  name: String,
  wallet: String,
  email: String,
  pin: String,
  createdAt: { type: Date, default: Date.now }
});

const Merchant = mongoose.model('Merchant', merchantSchema);

// --- Routes ---
// Serve HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Merchant Sign-Up
app.post('/api/signup', async (req, res) => {
  try {
    const { name, wallet, email, pin } = req.body;
    if (!name || !wallet || !email || !pin) return res.status(400).json({ error: "All fields required" });

    const existing = await Merchant.findOne({ email });
    if (existing) return res.status(400).json({ error: "Email already registered" });

    const merchant = new Merchant({ name, wallet, email, pin });
    await merchant.save();

    const log = new AccessLog({ email, wallet, ip: req.ip, action: 'signup' });
    await log.save();

    res.json({ success: true, merchant });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Merchant Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, pin } = req.body;
    if (!email || !pin) return res.status(400).json({ error: "Email and PIN required" });

    const merchant = await Merchant.findOne({ email });
    if (!merchant || merchant.pin !== pin) return res.status(401).json({ error: "Invalid credentials" });

    const log = new AccessLog({ email, wallet: merchant.wallet, ip: req.ip, action: 'login' });
    await log.save();

    res.json({ success: true, merchant });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Payment Logging (placeholder for Daraja)
app.post('/api/payment', async (req, res) => {
  try {
    const { email, wallet, amount, method } = req.body;
    if (!email || !wallet || !amount || !method) return res.status(400).json({ error: "Missing payment data" });

    const log = new AccessLog({ email, wallet, ip: req.ip, action: `payment-${method}` });
    await log.save();

    res.json({ success: true, message: `Payment logged for ${email}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Start Server ---
app.listen(PORT, () => console.log(`🚀 LIPA SME Server running on port ${PORT}`));