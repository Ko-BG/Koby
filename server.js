require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// ------------------- MONGODB CONNECTION -------------------
const uri = process.env.MONGO_URI;

if (!uri) {
  console.error("❌ MONGO_URI not found! Set it in .env or Render Environment Variables.");
  process.exit(1);
}

mongoose.connect(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Connection Error:", err));

// ------------------- MERCHANT MODEL -------------------
const merchantSchema = new mongoose.Schema({
  name: { type: String, required: true },
  wallet: { type: String },
  email: { type: String, required: true, unique: true },
  pin: { type: String, required: true },
  fiat: { type: Number, default: 0 },
  cryptoUSDT: { type: Number, default: 0 },
  vault: { type: Number, default: 0 },
  tx: { type: Array, default: [] }
});

const Merchant = mongoose.model('Merchant', merchantSchema);

// ------------------- API ROUTES -------------------

// Signup
app.post('/api/signup', async (req, res) => {
  const { name, wallet, email, pin } = req.body;
  if (!name || !email || !pin) return res.json({ success: false, error: 'All fields required' });

  try {
    let merchant = await Merchant.findOne({ email });
    if (merchant) return res.json({ success: false, error: 'Email already registered' });

    merchant = new Merchant({ name, wallet, email, pin, fiat: 25000, cryptoUSDT: 50, vault: 80000, tx: [] });
    await merchant.save();

    res.json({ success: true });
  } catch(err) {
    console.error(err);
    res.json({ success: false, error: 'Server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, pin } = req.body;
  if (!email || !pin) return res.json({ success: false, error: 'Email and PIN required' });

  try {
    const merchant = await Merchant.findOne({ email, pin });
    if (!merchant) return res.json({ success: false, error: 'Invalid credentials' });
    res.json({ success: true, merchant });
  } catch(err) {
    console.error(err);
    res.json({ success: false, error: 'Server error' });
  }
});

// Payment simulation
app.post('/api/payment', async (req, res) => {
  const { email, wallet, amount, method } = req.body;
  if (!email || !amount || !method) return res.json({ success: false, error: 'Invalid data' });

  try {
    const merchant = await Merchant.findOne({ email });
    if (!merchant) return res.json({ success: false, error: 'Merchant not found' });

    // Simulate cash inflow
    merchant.fiat += amount;
    merchant.tx.unshift({ type: method, time: new Date().toLocaleTimeString(), localAmt: amount, flow: 'IN' });
    await merchant.save();

    res.json({ success: true });
  } catch(err) {
    console.error(err);
    res.json({ success: false, error: 'Transaction failed' });
  }
});

// Serve front-end
app.get('*', (req,res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ------------------- SERVER -------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));