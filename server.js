// server.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // Your HTML/JS in /public

// PostgreSQL Pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize DB tables
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS merchants (
      id SERIAL PRIMARY KEY,
      name TEXT,
      wallet TEXT,
      email TEXT UNIQUE,
      pin TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      merchant_email TEXT,
      action TEXT,
      timestamp TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      merchant_email TEXT,
      phone TEXT,
      amount NUMERIC,
      account_ref TEXT,
      status TEXT,
      timestamp TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log('✅ Database Initialized');
}

initDB();

// ---------------- MERCHANT ENDPOINTS ----------------

// Signup
app.post('/api/signup', async (req, res) => {
  const { name, wallet, email, pin } = req.body;
  if (!name || !wallet || !email || !pin) return res.status(400).json({ error: "All fields required" });
  
  try {
    const result = await pool.query(
      `INSERT INTO merchants (name, wallet, email, pin) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, wallet, email, pin]
    );
    await pool.query(`INSERT INTO logs (merchant_email, action) VALUES ($1,'signup')`, [email]);
    res.json({ success: true, merchant: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { email, pin } = req.body;
  try {
    const result = await pool.query(`SELECT * FROM merchants WHERE email=$1 AND pin=$2`, [email, pin]);
    const merchant = result.rows[0];
    if (!merchant) return res.status(401).json({ error: "Invalid credentials" });
    await pool.query(`INSERT INTO logs (merchant_email, action) VALUES ($1,'login')`, [email]);
    res.json({ success: true, merchant });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// ---------------- PAYMENT ENDPOINT ----------------

// Daraja STK Push
app.post('/api/stkpush', async (req, res) => {
  const { phone, amount, accountRef, email } = req.body;
  if (!phone || !amount || !accountRef || !email) return res.status(400).json({ error: "Missing fields" });

  try {
    // Log attempt
    await pool.query(`INSERT INTO logs (merchant_email, action) VALUES ($1,'stkpush_attempt')`, [email]);

    // Get Daraja token
    const tokenResponse = await axios.get(`https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials`, {
      auth: { username: process.env.DARAJA_CONSUMER_KEY, password: process.env.DARAJA_CONSUMER_SECRET }
    });

    const token = tokenResponse.data.access_token;

    const timestamp = new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14);
    const password = Buffer.from(`${process.env.BUSINESS_SHORTCODE}${process.env.PASSKEY}${timestamp}`).toString('base64');

    // STK Push request
    const stkPayload = {
      BusinessShortCode: process.env.BUSINESS_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: process.env.BUSINESS_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: `${process.env.HOST_URL}/api/callback`,
      AccountReference: accountRef,
      TransactionDesc: `Payment to ${email}`
    };

    const stkResponse = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', stkPayload, {
      headers: { Authorization: `Bearer ${token}` }
    });

    await pool.query(
      `INSERT INTO transactions (merchant_email, phone, amount, account_ref, status) VALUES ($1,$2,$3,$4,$5)`,
      [email, phone, amount, accountRef, 'PENDING']
    );

    res.json({ success: true, data: stkResponse.data });
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).json({ error: "STK Push failed" });
  }
});

// Daraja Callback
app.post('/api/callback', async (req, res) => {
  try {
    const body = req.body;
    const checkoutId = body.Body.stkCallback.CheckoutRequestID;
    const resultCode = body.Body.stkCallback.ResultCode;

    let status = resultCode === 0 ? 'SUCCESS' : 'FAILED';

    await pool.query(
      `UPDATE transactions SET status=$1 WHERE account_ref=$2`,
      [status, checkoutId]
    );

    // Log callback
    await pool.query(`INSERT INTO logs (merchant_email, action) VALUES ($1,$2)`, [body.merchant_email || 'unknown', `stkpush_${status}`]);

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

// ---------------- SERVE FRONTEND ----------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---------------- START SERVER ----------------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));