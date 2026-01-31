const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 1. DATABASE CONNECTION 
// FIX: Removed the < > brackets from your password
const mongoURI = 'mongodb+srv://gilliannyangaga95_db_user:pgcgXSNfeflpvoKk@cluster0.6vqjwsd.mongodb.net/LipaSME?retryWrites=true&w=majority&appName=Cluster0';

mongoose.connect(mongoURI)
  .then(() => console.log('✅ MongoDB Connected Successfully'))
  .catch(err => console.log('❌ Mongo Connection Error:', err));

// 2. DATA MODEL
const merchantSchema = new mongoose.Schema({
    name: String,
    wallet: String,
    email: { type: String, unique: true },
    pin: String,
    fiatBalance: { type: Number, default: 25000 },
    vaultBalance: { type: Number, default: 80000 },
    cryptoBalance: { type: Number, default: 50 }
});
const Merchant = mongoose.model('Merchant', merchantSchema);

// 3. ROUTES
app.post('/api/signup', async (req, res) => {
    try {
        const merchant = new Merchant(req.body);
        await merchant.save();
        res.json({ success: true });
    } catch (err) {
        console.error("Signup Error:", err);
        res.status(400).json({ success: false, error: "Registration failed. Email might exist." });
    }
});

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
        res.status(500).json({ success: false, error: "Server Error" });
    }
});

// Added a sync route for payments
app.post('/api/payment', async (req, res) => {
    try {
        const { email, amount } = req.body;
        const merchant = await Merchant.findOneAndUpdate(
            { email },
            { $inc: { fiatBalance: Number(amount) } },
            { new: true }
        );
        res.json({ success: true, newBalance: merchant.fiatBalance });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/stkpush', (req, res) => {
    // Simulated push using native logic (No Axios)
    res.json({ success: true, message: "Push initiated" });
});

// 4. START SERVER
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('🚀 Lipa SME Server active on port ' + PORT));
