const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files (your HTML)
app.use(express.static(__dirname));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "LIPA Upay running 🚀" });
});

// Fallback: always return index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`✅ LIPA running on port ${PORT}`);
});