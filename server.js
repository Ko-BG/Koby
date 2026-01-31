const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// ----- DARAJA CONFIG (Sandbox Credentials) -----
const LIPA_SHORTCODE = "174379"; 
const LIPA_PASSKEY = "bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"; 
const CONSUMER_KEY = "YOUR_KEY_HERE";
const CONSUMER_SECRET = "YOUR_SECRET_HERE";

// ----- MONGODB -----
const MONGO_URI = "mongodb+srv://gilliannyangaga95_db_user:JDCeycVpqJwZ0m2d@cluster0.cd62bpl.mongodb.net/lipa_sme?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI).then(() => console.log("✅ MongoDB Live"));

// ----- TRANSACTION SCHEMA (Expanded for M-Pesa) -----
const transactionSchema = new mongoose.Schema({
    merchantEmail: String,
    checkoutRequestID: String, // From Safaricom
    receiptNumber: String,     // M-Pesa Receipt (e.g., QAB123...)
    amount: Number,
    phone: String,
    status: { type: String, default: 'Pending' }, // Pending, Completed, Failed
    createdAt: { type: Date, default: Date.now }
});
const Transaction = mongoose.model('Transaction', transactionSchema);

// ----- 1. DARAJA TOKEN HELPER -----
const getDarajaToken = async () => {
    const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
    const response = await axios.get("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
        headers: { Authorization: `Basic ${auth}` }
    });
    return response.data.access_token;
};

// ----- 2. INITIATE STK PUSH -----
app.post('/api/stkpush', async (req, res) => {
    const { phone, amount, email } = req.body;
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(LIPA_SHORTCODE + LIPA_PASSKEY + timestamp).toString('base64');

    try {
        const token = await getDarajaToken();
        const response = await axios.post("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
            "BusinessShortCode": LIPA_SHORTCODE,
            "Password": password,
            "Timestamp": timestamp,
            "TransactionType": "CustomerPayBillOnline",
            "Amount": amount,
            "PartyA": phone,
            "PartyB": LIPA_SHORTCODE,
            "PhoneNumber": phone,
            "CallBackURL": "https://your-render-app-url.onrender.com/api/callback", 
            "AccountReference": "LIPA_SME",
            "TransactionDesc": "Merchant Payment"
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });

        // Save initial transaction as Pending
        const newTx = new Transaction({
            merchantEmail: email,
            checkoutRequestID: response.data.CheckoutRequestID,
            amount: amount,
            phone: phone
        });
        await newTx.save();

        res.json({ success: true, CheckoutRequestID: response.data.CheckoutRequestID });
    } catch (err) {
        console.error(err);
        res.json({ success: false, error: "STK Push Request Failed" });
    }
});

// ----- 3. DARAJA CALLBACK URL -----
// Safaricom calls this once the user enters their PIN
app.post('/api/callback', async (req, res) => {
    const callbackData = req.body.Body.stkCallback;
    console.log("Safaricom Callback Received:", JSON.stringify(callbackData));

    const checkoutRequestID = callbackData.CheckoutRequestID;
    const resultCode = callbackData.ResultCode;

    if (resultCode === 0) {
        // Success! Get the Receipt Number from Item list
        const meta = callbackData.CallbackMetadata.Item;
        const receipt = meta.find(item => item.Name === 'MpesaReceiptNumber').Value;

        // Update Database to Completed
        await Transaction.findOneAndUpdate(
            { checkoutRequestID: checkoutRequestID },
            { status: 'Completed', receiptNumber: receipt }
        );
        console.log(`✅ Payment ${receipt} confirmed.`);
    } else {
        // User cancelled or failed
        await Transaction.findOneAndUpdate(
            { checkoutRequestID: checkoutRequestID },
            { status: 'Failed' }
        );
        console.log(`❌ Payment ${checkoutRequestID} failed.`);
    }

    res.json({ ResultCode: 0, ResultDesc: "Success" }); // Acknowledge Safaricom
});

// Root
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 API on port ${PORT}`));
