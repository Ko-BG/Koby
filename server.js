const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 1. DATABASE CONNECTION 
// IMPORTANT: Replace the string below with your actual MongoDB URI
const mongoURI = 'mongodb+srv://gilliannyangaga95_db_user:<pgcgXSNfeflpvoKk>@cluster0.6vqjwsd.mongodb.net/?appName=Cluster0';

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.log('Mongo Error:', err));

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
        res.status(400).json({ success: false, error: "Email exists" });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, pin } = req.body;
        const merchant = await Merchant.findOne({ email, pin });
        if (merchant) res.json({ success: true, merchant });
        else res.status(401).json({ success: false, error: "Wrong credentials" });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/stkpush', (req, res) => {
    // Simulated push using native logic
    res.json({ success: true, message: "Push sent" });
});

// 4. START SERVER
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Server active on port ' + PORT));