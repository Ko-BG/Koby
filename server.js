// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

// --- CONFIG ---
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/lipa_sme";

// --- MIDDLEWARE ---
app.use(cors());
app.use(bodyParser.json());

// --- MONGODB CONNECTION ---
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// --- SCHEMAS ---
const merchantSchema = new mongoose.Schema({
    name: String,
    wallet: String,
    email: { type: String, unique: true },
    pin: String,
    fiat: { type: Number, default: 0 },
    cryptoUSDT: { type: Number, default: 0 },
    vault: { type: Number, default: 0 },
    tx: { type: Array, default: [] }
}, { timestamps: true });

const Merchant = mongoose.model('Merchant', merchantSchema);

// --- ROUTES ---

// Signup
app.post('/api/signup', async (req, res) => {
    try {
        const { name, wallet, email, pin } = req.body;
        if(!name || !email || !pin) return res.json({ success: false, error: 'All fields required' });

        const exists = await Merchant.findOne({ email });
        if(exists) return res.json({ success: false, error: 'Email already registered' });

        const merchant = await Merchant.create({ name, wallet, email, pin });
        return res.json({ success: true, merchant });
    } catch(err) {
        console.error(err);
        return res.json({ success: false, error: 'Server error' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { email, pin } = req.body;
        const merchant = await Merchant.findOne({ email, pin });
        if(!merchant) return res.json({ success: false, error: 'Invalid credentials' });
        return res.json({ success: true, merchant });
    } catch(err) {
        console.error(err);
        return res.json({ success: false, error: 'Server error' });
    }
});

// Payment
app.post('/api/payment', async (req, res) => {
    try {
        const { email, wallet, amount, method } = req.body;
        const merchant = await Merchant.findOne({ email });
        if(!merchant) return res.json({ success: false, error: 'Merchant not found' });

        // For simplicity, assume amount is KES. You can add FX logic
        merchant.fiat += amount;
        merchant.tx.unshift({ type: method, time: new Date().toLocaleTimeString(), localAmt: amount, flow: 'IN' });
        await merchant.save();

        return res.json({ success: true });
    } catch(err) {
        console.error(err);
        return res.json({ success: false, error: 'Payment failed' });
    }
});

// Swap FX (KES <-> USDT)
app.post('/api/swap', async (req, res) => {
    try {
        const { email, direction, amount } = req.body;
        const FX = 132.5; // KES per USDT
        const merchant = await Merchant.findOne({ email });
        if(!merchant) return res.json({ success: false, error: 'Merchant not found' });

        if(direction === 'K2C') {
            if(merchant.fiat < amount) return res.json({ success:false, error:'Low KES balance' });
            merchant.fiat -= amount;
            merchant.cryptoUSDT += amount / FX;
        } else {
            if(merchant.cryptoUSDT < amount) return res.json({ success:false, error:'Low USDT balance' });
            merchant.cryptoUSDT -= amount;
            merchant.fiat += amount * FX;
        }
        merchant.tx.unshift({ type: 'FX Swap', time: new Date().toLocaleTimeString(), localAmt: amount, flow: 'OUT' });
        await merchant.save();

        return res.json({ success: true });
    } catch(err) {
        console.error(err);
        return res.json({ success:false, error:'Swap failed' });
    }
});

// Withdrawal
app.post('/api/withdraw', async (req, res) => {
    try {
        const { email, pin, amount } = req.body;
        const merchant = await Merchant.findOne({ email });
        if(!merchant) return res.json({ success:false, error:'Merchant not found' });
        if(pin !== merchant.pin) return res.json({ success:false, error:'Wrong PIN' });
        if(amount > merchant.fiat) return res.json({ success:false, error:'Insufficient funds' });

        merchant.fiat -= amount;
        merchant.tx.unshift({ type:'Withdraw', time: new Date().toLocaleTimeString(), localAmt: amount, flow:'OUT' });
        await merchant.save();
        return res.json({ success:true });
    } catch(err) {
        console.error(err);
        return res.json({ success:false, error:'Withdrawal failed' });
    }
});

// Vault unlock
app.post('/api/vault', async (req, res) => {
    try {
        const { email, pin, amount } = req.body;
        const merchant = await Merchant.findOne({ email });
        if(!merchant) return res.json({ success:false, error:'Merchant not found' });
        if(pin !== merchant.pin) return res.json({ success:false, error:'Wrong PIN' });
        if(amount > merchant.vault) return res.json({ success:false, error:'Insufficient vault balance' });

        merchant.vault -= amount;
        merchant.fiat += amount;
        merchant.tx.unshift({ type:'Vault Release', time: new Date().toLocaleTimeString(), localAmt: amount, flow:'IN' });
        await merchant.save();
        return res.json({ success:true });
    } catch(err) {
        console.error(err);
        return res.json({ success:false, error:'Vault unlock failed' });
    }
});

// --- START SERVER ---
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));