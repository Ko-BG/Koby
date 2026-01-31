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
  .then(() => console.log("Connected to MongoDB Hub"))
  .catch(err => console.error("Connection Error:", err));

// Merchant Schema
const merchantSchema = new mongoose.Schema({
    name: String,
    wallet: String,
    email: { type: String, unique: true },
    pin: String,
    fiat: { type: Number, default: 25000 },
    vault: { type: Number, default: 80000 },
    crypto: { type: Number, default: 50 }
});

const Merchant = mongoose.model('Merchant', merchantSchema);

// API Endpoints
app.post('/api/signup', async (req, res) => {
    try {
        const merchant = new Merchant(req.body);
        await merchant.save();
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ success: false, error: "Email already registered" });
    }
});

app.post('/api/login', async (req, res) => {
    const { email, pin } = req.body;
    const merchant = await Merchant.findOne({ email, pin });
    if (merchant) {
        res.json({ success: true, merchant });
    } else {
        res.status(401).json({ success: false, error: "Invalid Credentials" });
    }
});

app.post('/api/payment', async (req, res) => {
    // This acknowledges the payment on the server side
    // In a production app, you'd update balances in the DB here
    res.json({ success: true });
});

// Serve the HTML file
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
