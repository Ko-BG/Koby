const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// ----- MIDDLEWARE -----
app.use(cors());
app.use(bodyParser.json());

// Tell Express to serve files (like index.html) directly from the root directory
app.use(express.static(__dirname));

// ----- 1. MONGODB CONNECTION -----
const MONGO_URI = "mongodb+srv://gilliannyangaga95_db_user:JDCeycVpqJwZ0m2d@cluster0.cd62bpl.mongodb.net/lipa_sme?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB connected to: lipa_sme"))
.catch(err => console.log("❌ MongoDB connection error:", err));

// ----- 2. SCHEMAS -----
const merchantSchema = new mongoose.Schema({
    name: { type: String, required: true },
    wallet: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    pin: { type: String, required: true }
}, { timestamps: true });

const transactionSchema = new mongoose.Schema({
    merchantEmail: { type: String, required: true },
    type: String,
    inputAmt: Number,
    localAmt: Number,
    cur: String,
    flow: String,
    createdAt: { type: Date, default: Date.now }
});

const Merchant = mongoose.model('Merchant', merchantSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

// ----- 3. FRONTEND ROUTE -----

// This serves your index.html when you visit the main URL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'), (err) => {
        if (err) {
            console.error("File Error:", err);
            res.status(500).send("<h1>Server is Live</h1><p>Error: index.html not found in root directory.</p>");
        }
    });
});

// ----- 4. API ROUTES -----

// Signup
app.post('/api/signup', async (req, res) => {
    const { name, wallet, email, pin } = req.body;
    if(!name || !wallet || !email || !pin) return res.json({ success: false, error: "All fields required" });

    try {
        const exists = await Merchant.findOne({ email });
        if(exists) return res.json({ success: false, error: "Email already registered" });

        const merchant = new Merchant({ name, wallet, email, pin });
        await merchant.save();
        res.json({ success: true });
    } catch(err) {
        console.error(err);
        res.json({ success: false, error: "Server error during signup" });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, pin } = req.body;
    try {
        const merchant = await Merchant.findOne({ email, pin });
        if(!merchant) return res.json({ success: false, error: "Invalid credentials" });
        res.json({ success: true, merchant });
    } catch(err) {
        res.json({ success: false, error: "Login failed" });
    }
});

// Payment
app.post('/api/payment', async (req, res) => {
    const { email, wallet, amount, method } = req.body;
    try {
        const tx = new Transaction({
            merchantEmail: email,
            type: method,
            inputAmt: amount,
            localAmt: amount, 
            cur: 'KES',
            flow: 'IN'
        });
        await tx.save();
        res.json({ success: true, transaction: tx });
    } catch(err) {
        res.json({ success: false, error: "Payment failed" });
    }
});

// ----- 5. START SERVER -----
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 LIPA SME running on port ${PORT}`);
});
