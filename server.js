const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// ----- MIDDLEWARE -----
app.use(cors());
app.use(bodyParser.json());

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

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

const Merchant = mongoose.model('Merchant', merchantSchema);

// ----- 3. ROUTES -----

// ROOT ROUTE: Serves your actual Frontend (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Signup
app.post('/api/signup', async (req, res) => {
    const { name, wallet, email, pin } = req.body;
    try {
        const exists = await Merchant.findOne({ email });
        if(exists) return res.json({ success: false, error: "Email exists" });
        const merchant = new Merchant({ name, wallet, email, pin });
        await merchant.save();
        res.json({ success: true });
    } catch(err) {
        res.json({ success: false, error: "Server error" });
    }
});

// API: Login
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

// ----- 4. START SERVER -----
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 App live at http://localhost:${PORT}`));
