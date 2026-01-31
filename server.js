require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// --- APP SETUP ---
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // if you host your HTML here

const PORT = process.env.PORT || 5000;

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- SCHEMAS ---
const merchantSchema = new mongoose.Schema({
    name: { type: String, required: true },
    wallet: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    pin: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const Merchant = mongoose.model('Merchant', merchantSchema);

// --- ROUTES ---
// Health check
app.get('/', (req, res) => res.send("LIPA SME Hub API Running"));

// Signup
app.post('/api/signup', async (req, res) => {
    const { name, wallet, email, pin } = req.body;
    if (!name || !wallet || !email || !pin) return res.json({ success: false, error: "All fields required" });

    try {
        const exists = await Merchant.findOne({ email });
        if (exists) return res.json({ success: false, error: "Email already registered" });

        const merchant = new Merchant({ name, wallet, email, pin });
        await merchant.save();
        res.json({ success: true, merchant });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Signup failed" });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, pin } = req.body;
    if (!email || !pin) return res.json({ success: false, error: "All fields required" });

    try {
        const merchant = await Merchant.findOne({ email, pin });
        if (!merchant) return res.json({ success: false, error: "Invalid credentials" });

        res.json({ success: true, merchant });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Login failed" });
    }
});

// Payment simulation (update balances on server)
app.post('/api/payment', async (req, res) => {
    const { email, wallet, amount, method } = req.body;
    if (!email || !amount || !wallet) return res.json({ success: false, error: "Missing payment data" });

    try {
        // For demo, we just approve the payment
        // Here you can integrate actual mobile money or crypto APIs
        return res.json({ success: true, msg: "Payment processed" });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "Payment failed" });
    }
});

// --- START SERVER ---
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));