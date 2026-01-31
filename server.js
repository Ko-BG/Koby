const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// 1. MONGODB CONNECTION
// Replace the string below with your Atlas URI
const mongoURI =  "mongodb+srv://gilliannyangaga95_db_user:pgcgXSNfeflpvoKk@cluster0.mongodb.net/lipa_sme?retryWrites=true&w=majority"
.6vqjwsd.mongodb.net/?appName=Cluster0;

mongoose.connect(mongoURI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.log('❌ MongoDB Connection Error:', err));

// 2. MERCHANT DATA MODEL
const merchantSchema = new mongoose.Schema({
    name: { type: String, required: true },
    wallet: { type: String, required: true },
    email: { type: String, unique: true, required: true },
    pin: { type: String, required: true },
    fiatBalance: { type: Number, default: 25000 },
    vaultBalance: { type: Number, default: 80000 },
    cryptoBalance: { type: Number, default: 50 }
});

const Merchant = mongoose.model('Merchant', merchantSchema);

// 3. AUTHENTICATION ROUTES

// Signup Route
app.post('/api/signup', async (req, res) => {
    try {
        const { name, wallet, email, pin } = req.body;
        const newMerchant = new Merchant({ name, wallet, email, pin });
        await newMerchant.save();
        res.status(201).json({ success: true, message: "Merchant created" });
    } catch (err) {
        console.error("Signup Error:", err);
        res.status(400).json({ success: false, error: "Email already registered or invalid data" });
    }
});

// Login Route
app.post('/api/login', async (req, res) => {
    try {
        const { email, pin } = req.body;
        const merchant = await Merchant.findOne({ email, pin });
        if (merchant) {
            res.json({ success: true, merchant });
        } else {
            res.status(401).json({ success: false, error: "Invalid email or PIN" });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: "Server error during login" });
    }
});

// 4. M-PESA / PAYMENT SYNC ROUTE
// This uses native fetch (No Axios needed)
app.post('/api/payment', async (req, res) => {
    try {
        const { email, amount, method } = req.body;
        const merchant = await Merchant.findOne({ email });
        
        if (!merchant) return res.status(404).json({ success: false, error: "Merchant not found" });

        // Update local balance
        merchant.fiatBalance += Number(amount);
        await merchant.save();

        res.json({ success: true, newBalance: merchant.fiatBalance });
    } catch (err) {
        res.status(500).json({ success: false, error: "Payment sync failed" });
    }
});

// 5. STK PUSH (SIMULATED FOR DARAJA)
app.post('/api/stkpush', async (req, res) => {
    const { phone, amount } = req.body;
    console.log(`Initiating STK Push to ${phone} for KES ${amount}`);
    
    // In a live environment, you would use fetch() here to call Safaricom
    // Since we removed Axios, fetch() is the standard way to handle this.
    res.json({ success: true, message: "STK Push Sent" });
});

// Start Server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`🚀 Lipa SME Server running on port ${PORT}`);
});
