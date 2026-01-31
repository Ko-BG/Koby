require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// In-memory merchant store (replace with DB in production)
const merchants = {};
const transactions = {};

// Serve frontend HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------------------------
// MERCHANT WALLET LINK
// ---------------------------
app.post('/api/merchant/link', (req, res) => {
    const { businessName, mpesaNumber, type } = req.body;
    if(!businessName || !mpesaNumber) return res.json({ success: false, error: "Business name and wallet required" });

    const merchantId = "M-" + Math.random().toString(36).substr(2, 6).toUpperCase();
    merchants[merchantId] = { businessName, mpesaNumber, type, balance: 0 };
    return res.json({ success: true, merchantId });
});

// ---------------------------
// INITIATE PAYMENT (STK PUSH)
// ---------------------------
app.post('/api/pay', async (req, res) => {
    const { merchantId, amount, phone } = req.body;
    if(!merchants[merchantId]) return res.json({ success: false, error: "Merchant not found" });
    if(!amount || !phone) return res.json({ success: false, error: "Amount & phone required" });

    try {
        // Step 1: Get OAuth Token from Safaricom Daraja
        const tokenRes = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
            auth: {
                username: process.env.MPESA_CONSUMER_KEY,
                password: process.env.MPESA_CONSUMER_SECRET
            }
        });
        const token = tokenRes.data.access_token;

        // Step 2: Construct STK Push
        const stkPush = {
            BusinessShortCode: process.env.MPESA_SHORTCODE,
            Password: process.env.MPESA_PASS,
            Timestamp: new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14),
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phone,
            PartyB: merchants[merchantId].mpesaNumber,
            PhoneNumber: phone,
            CallBackURL: process.env.MPESA_CALLBACK_URL,
            AccountReference: merchants[merchantId].businessName,
            TransactionDesc: `Payment to ${merchants[merchantId].businessName}`
        };

        // Step 3: Send STK Push
        const stkRes = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', stkPush, {
            headers: { Authorization: `Bearer ${token}` }
        });

        // Store temporary transaction
        transactions[stkRes.data.CheckoutRequestID] = { merchantId, amount, phone, status: "PENDING" };

        return res.json({ success: true, checkoutRequestId: stkRes.data.CheckoutRequestID });

    } catch(err) {
        console.error(err.response?.data || err.message);
        return res.json({ success: false, error: "Failed to initiate STK Push" });
    }
});

// ---------------------------
// MPESA CALLBACK
// ---------------------------
app.post('/mpesa/callback', (req, res) => {
    const data = req.body;

    // Parse CheckoutRequestID
    const checkoutId = data.Body?.stkCallback?.CheckoutRequestID;
    const resultCode = data.Body?.stkCallback?.ResultCode;

    if(checkoutId && transactions[checkoutId]) {
        const tx = transactions[checkoutId];
        if(resultCode === 0) { // SUCCESS
            merchants[tx.merchantId].balance += tx.amount;
            tx.status = "SUCCESS";
            console.log(`Payment received for ${tx.merchantId}: ${tx.amount} KES`);
        } else {
            tx.status = "FAILED";
            console.log(`Payment failed for ${tx.merchantId}`);
        }
    }

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// ---------------------------
// GET MERCHANT INFO
// ---------------------------
app.get('/api/merchant/:id', (req,res) => {
    const merchant = merchants[req.params.id];
    if(!merchant) return res.json({ success:false, error:"Merchant not found" });
    res.json({ success:true, merchant });
});

// ---------------------------
// START SERVER
// ---------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));