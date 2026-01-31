// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ----- 1. MONGODB CONNECTION -----
const MONGO_URI = "mongodb+srv://gilliannyangaga95_db_user:JDCeycVpqJwZ0m2d@cluster0.cd62bpl.mongodb.net/?appName=Cluster0.xlsldfh.mongodb.net/lipa_sme?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
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
        console.log(err);
        res.json({ success: false, error: "Server error" });
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
        console.log(err);
        res.json({ success: false, error: "Server error" });
    }
});

// Payment
app.post('/api/payment', async (req, res) => {
    const { email, wallet, amount, method } = req.body;
    try {
        const merchant = await Merchant.findOne({ email });
        if(!merchant) return res.json({ success: false, error: "Merchant not found" });

        // For demo, store transaction
        const tx = new Transaction({
            merchantEmail: email,
            type: method,
            inputAmt: amount,
            localAmt: amount, // You can convert using FX later
            cur: 'KES',
            flow: 'IN'
        });
        await tx.save();

        res.json({ success: true, transaction: tx });
    } catch(err) {
        console.log(err);
        res.json({ success: false, error: "Payment failed" });
    }
});

// Get last 10 transactions for merchant (optional)
app.get('/api/transactions/:email', async (req, res) => {
    try {
        const txs = await Transaction.find({ merchantEmail: req.params.email }).sort({ createdAt: -1 }).limit(10);
        res.json({ success: true, txs });
    } catch(err) {
        console.log(err);
        res.json({ success: false, error: "Failed to fetch transactions" });
    }
});

// ----- 4. START SERVER -----
const PORT = 5000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));