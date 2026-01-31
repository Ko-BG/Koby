const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Connection
const MONGO_URI = "mongodb+srv://gilliannyangaga95_db_user:iG73g3IoSQlYtMCJ@cluster0.6vqjwsd.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
    .then(() => console.log("LIPA SME: Connected to MongoDB"))
    .catch(err => console.error("MongoDB Connection Error:", err));

// Database Schema
const merchantSchema = new mongoose.Schema({
    name: String,
    wallet: String,
    email: { type: String, unique: true },
    pin: String
});
const Merchant = mongoose.model('Merchant', merchantSchema);

// Auth APIs
app.post('/api/signup', async (req, res) => {
    try {
        const merchant = new Merchant(req.body);
        await merchant.save();
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ success: false, error: "Email already exists" });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, pin } = req.body;
    try {
        const merchant = await Merchant.findOne({ email, pin });
        if (merchant) res.json({ success: true, merchant });
        else res.status(401).json({ success: false, error: "Invalid credentials" });
    } catch (err) {
        res.status(500).json({ success: false, error: "Server error" });
    }
});

app.post('/api/payment', (req, res) => res.json({ success: true }));

// Serve HTML from ROOT
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hub running on port ${PORT}`));
