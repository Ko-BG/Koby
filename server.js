const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const PORT = process.env.PORT || 10000;

// In-memory storage for demo purposes
let merchants = [];
let transactions = [];

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Merchant onboarding
app.post('/api/signup', (req, res) => {
  const { name, wallet, email, pin } = req.body;
  if (!name || !wallet || !email || !pin) return res.status(400).json({ error: "All fields required" });
  const merchant = { id: merchants.length+1, name, wallet, email, pin };
  merchants.push(merchant);
  return res.json({ success: true, merchant });
});

// Merchant login
app.post('/api/login', (req, res) => {
  const { email, pin } = req.body;
  const merchant = merchants.find(m => m.email === email && m.pin === pin);
  if (!merchant) return res.status(401).json({ error: "Invalid credentials" });
  return res.json({ success: true, merchant });
});

// Generate Daraja OAuth token
async function getDarajaToken() {
  const url = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  try {
    const res = await axios.get(url, { headers: { Authorization: `Basic ${auth}` } });
    return res.data.access_token;
  } catch (err) {
    console.error(err.response?.data || err.message);
    return null;
  }
}

// STK Push
app.post('/api/stkpush', async (req, res) => {
  const { phone, amount, accountRef } = req.body;
  if (!phone || !amount || !accountRef) return res.status(400).json({ error: "Missing fields" });

  const token = await getDarajaToken();
  if (!token) return res.status(500).json({ error: "Cannot get Daraja token" });

  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0,14);
  const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASS}${timestamp}`).toString('base64');

  const payload = {
    BusinessShortCode: process.env.MPESA_SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: amount,
    PartyA: phone,
    PartyB: process.env.MPESA_SHORTCODE,
    PhoneNumber: phone,
    CallBackURL: process.env.MPESA_CALLBACK_URL,
    AccountReference: accountRef,
    TransactionDesc: "Payment to merchant"
  };

  try {
    const stkRes = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', payload, {
      headers: { Authorization: `Bearer ${token}` }
    });
    transactions.push({ phone, amount, accountRef, status: 'PENDING', timestamp: new Date() });
    return res.json(stkRes.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: "STK Push failed" });
  }
});

// Daraja callback
app.post('/mpesa/callback', (req, res) => {
  const data = req.body;
  console.log("Daraja Callback:", JSON.stringify(data, null, 2));
  
  // Update transaction status
  const trx = transactions.find(t => t.accountRef === data.Body.stkCallback?.Body?.AccountReference);
  if(trx) trx.status = data.Body.stkCallback.ResultCode === 0 ? 'SUCCESS' : 'FAILED';

  res.json({ ResultCode: 0, ResultDesc: "Received" });
});

app.listen(PORT, () => console.log(`🚀 LIPA SME running on port ${PORT}`));