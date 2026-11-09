import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend files from the sibling frontend directory
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendPath = path.resolve(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

// Proxy endpoint: fetch live rates from Frankfurter and forward to client
app.get("/api/convert", async (req, res) => {
  const { from, to, amount } = req.query;

  if (!from || !to || !amount || isNaN(Number(amount))) {
    return res.status(400).json({ error: "Missing or invalid parameters: from, to, amount" });
  }

  const numericAmount = Number(amount);

  try {
    const upstream = await fetch(
      `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    );

    if (!upstream.ok) {
      return res.status(502).json({ error: "Failed to fetch exchange rates from upstream provider" });
    }

    const data = await upstream.json();
    const rate = data.rates[to];

    if (rate === undefined) {
      return res.status(400).json({ error: `Unsupported currency: ${to}` });
    }

    const converted = numericAmount * rate;

    return res.json({
      from,
      to,
      amount: numericAmount,
      rate,
      converted: Number(converted.toFixed(6)),
      date: data.date,
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error during conversion" });
  }
});

app.listen(PORT, () => {
  console.log(`Currency converter backend running on http://localhost:${PORT}`);
});