require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://gilliannyangaga95_db_user:iG73g3IoSQlYtMCJ@cluster0.6vqjwsd.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).then(() => console.log("LIPA SME: Connected to MongoDB"));

// Refactored Schema: Added balances and transaction history
const merchantSchema = new mongoose.Schema({
    name: String,
    wallet: String, // Stored as 07... but formatted for M-Pesa
    email: { type: String, unique: true },
    pin: String,
    fiat: { type: Number, default: 0 },
    vault: { type: Number, default: 0 },
    cryptoUSDT: { type: Number, default: 0 },
    history: [{ type: String, amount: Number, flow: String, date: { type: Date, default: Date.now } }]
});
const Merchant = mongoose.model('Merchant', merchantSchema);

// --- DARAJA AUTH MIDDLEWARE ---
const getDarajaToken = async (req, res, next) => {
    const secret = process.env.DARAJA_CONSUMER_SECRET;
    const key = process.env.DARAJA_CONSUMER_KEY;
    const auth = Buffer.from(`${key}:${secret}`).toString('base64');
    try {
        const { data } = await axios.get("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
            headers: { Authorization: `Basic ${auth}` }
        });
        req.daraja_token = data.access_token;
        next();
    } catch (err) { res.status(401).json({ error: "Daraja Auth Failed" }); }
};

// --- API: INITIATE STK PUSH (Send money to app) ---
app.post('/api/stkpush', getDarajaToken, async (req, res) => {
    const { email, amount } = req.body;
    const merchant = await Merchant.findOne({ email });
    if (!merchant) return res.status(404).json({ error: "Merchant not found" });

    const phone = merchant.wallet.startsWith('0') ? '254' + merchant.wallet.slice(1) : merchant.wallet;
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    const password = Buffer.from(process.env.DARAJA_SHORTCODE + process.env.DARAJA_PASSKEY + timestamp).toString('base64');

    try {
        const response = await axios.post("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
            BusinessShortCode: process.env.DARAJA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phone,
            PartyB: process.env.DARAJA_SHORTCODE,
            PhoneNumber: phone,
            CallBackURL: `${process.env.RENDER_URL}/api/callback`,
            AccountReference: "LIPA_SME_HUB",
            TransactionDesc: "Wallet Deposit"
        }, { headers: { Authorization: `Bearer ${req.daraja_token}` } });

        res.json({ success: true, message: "PIN prompt sent to phone" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- API: CALLBACK (Where Safaricom sends payment results) ---
app.post('/api/callback', async (req, res) => {
    const callbackData = req.body.Body.stkCallback;
    if (callbackData.ResultCode === 0) {
        const amount = callbackData.CallbackMetadata.Item.find(i => i.Name === "Amount").Value;
        const phone = callbackData.CallbackMetadata.Item.find(i => i.Name === "PhoneNumber").Value.toString();
        const formattedPhone = '0' + phone.slice(3); // Convert 2547... back to 07...

        await Merchant.findOneAndUpdate(
            { wallet: formattedPhone },
            { 
                $inc: { fiat: amount }, 
                $push: { history: { type: "M-Pesa Deposit", amount, flow: "IN" } } 
            }
        );
    }
    res.json("OK");
});

// --- API: GET BALANCE (For frontend to stay synced) ---
app.get('/api/balance/:email', async (req, res) => {
    const merchant = await Merchant.findOne({ email: req.params.email });
    res.json({ fiat: merchant.fiat, vault: merchant.vault, cryptoUSDT: merchant.cryptoUSDT, history: merchant.history });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
