// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// ----- MIDDLEWARE -----
app.use(cors()); // Allows your frontend to connect
app.use(bodyParser.json());

// ----- 1. MONGODB CONNECTION -----
// Note: I cleaned the connection string slightly to ensure the DB name "lipa_sme" is parsed correctly
const MONGO_URI = "mongodb+srv://gilliannyangaga95_db_user:JDCeycVpqJwZ0m2d@cluster0.cd62bpl.mongodb.net/lipa_sme?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
.then(() => console.log("✅ MongoDB connected to database: lipa_sme"))
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

// ----- 3. ROUTES -----

/**
 * ROOT ROUTE - THIS FIXES "CANNOT GET /"
 * When you visit the live URL in a browser, this will now show.
 */
app.get('/', (req, res) => {
    res.status(200).send("🚀 LIPA SME API is live and connected to MongoDB Atlas.");
});

// Sign-up new merchant
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
        console.error("Signup Error:", err);
        res.json({ success: false, error: "Server error during registration" });
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
        console.error("Login Error:", err);
        res.json({ success: false, error: "Authentication failed" });
    }
});

// Payment
app.post('/api/payment', async (req, res) => {
    const { email, wallet, amount, method } = req.body;
    try {
        const merchant = await Merchant.findOne({ email });
        if(!merchant) return res.json({ success: false, error: "Merchant not found" });

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
        console.error("Payment Error:", err);
        res.json({ success: false, error: "Transaction failed to save" });
    }
});

// Get last 10 transactions
app.get('/api/transactions/:email', async (req, res) => {
    try {
        const txs = await Transaction.find({ merchantEmail: req.params.email }).sort({ createdAt: -1 }).limit(10);
        res.json({ success: true, txs });
    } catch(err) {
        res.json({ success: false, error: "Failed to fetch ledger" });
    }
});

// ----- 4. START SERVER -----
// Using process.env.PORT for live hosting services like Render or Heroku
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 Local check: http://localhost:${PORT}`);
});
