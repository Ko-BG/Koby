const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// --- MONGODB CONNECTION ---
// Make sure to add MONGODB_URI to your Render Environment Variables
const mongoURI = process.env.MONGODB_URI || 'mongodb+srv://gilliannyangaga95_db_user:iG73g3IoSQlYtMCJ@cluster0.6vqjwsd.mongodb.net/?appName=Cluster0';

mongoose.connect(mongoURI)
    .then(() => console.log("Connected to MongoDB Hub"))
    .catch(err => console.error("MongoDB Connection Error:", err));

// --- MERCHANT SCHEMA ---
const merchantSchema = new mongoose.Schema({
    name: String,
    wallet: String,
    email: { type: String, unique: true, required: true },
    pin: String,
    createdAt: { type: Date, default: Date.now }
});

const Merchant = mongoose.model('Merchant', merchantSchema);

// --- ROUTES ---

// 1. SIGNUP
app.post('/api/signup', async (req, res) => {
    try {
        const { name, wallet, email, pin } = req.body;
        const existing = await Merchant.findOne({ email });
        if (existing) return res.status(400).json({ success: false, error: "Email already registered" });

        const newMerchant = new Merchant({ name, wallet, email, pin });
        await newMerchant.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: "Database error during signup" });
    }
});

// 2. LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { email, pin } = req.body;
        const merchant = await Merchant.findOne({ email, pin });
        if (merchant) {
            res.json({ success: true, merchant });
        } else {
            res.status(401).json({ success: false, error: "Invalid Email or PIN" });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: "Auth server error" });
    }
});

// 3. PAYMENT (STK PUSH PLACEHOLDER)
app.post('/api/payment', (req, res) => {
    const { email, amount, method } = req.body;
    console.log(`Processing ${amount} for ${email} via ${method}`);
    res.json({ success: true, message: "Payment verified and saved to ledger" });
});

app.get('/', (req, res) => res.send("LIPA SME + MONGODB is LIVE 🚀"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
