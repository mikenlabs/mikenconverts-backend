import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  credentials: false,
  maxAge: 86400,
};

app.use(cors(corsOptions));
app.options("/api/convert", cors(corsOptions));

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendPath = path.resolve(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

const UPSTREAM = "https://open.er-api.com/v6/latest";

async function fetchRate(from, to) {
  const url = `${UPSTREAM}/${encodeURIComponent(from)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.rates?.[to] ?? null;
}

app.get("/api/convert", async (req, res) => {
  const { from, to, amount } = req.query;

  if (!from || !to || !amount || isNaN(Number(amount))) {
    return res.status(400).json({ error: "Missing or invalid parameters: from, to, amount" });
  }

  const numericAmount = Number(amount);

  try {
    const rate = await fetchRate(from, to);

    if (rate === null) {
      return res.status(400).json({ error: `Unsupported currency pair: ${from} → ${to}` });
    }

    const converted = numericAmount * rate;

    return res.json({
      from,
      to,
      amount: numericAmount,
      rate,
      converted: Number(converted.toFixed(6)),
      date: new Date().toISOString().split("T")[0],
    });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error during conversion" });
  }
});

app.get("/api/currencies", async (req, res) => {
  try {
    const resUpstream = await fetch(`${UPSTREAM}/USD`);
    if (!resUpstream.ok) return res.status(502).json({ error: "Failed to fetch currencies" });
    const data = await resUpstream.json();
    return res.json(data.rates || {});
  } catch {
    return res.status(500).json({ error: "Failed to fetch currencies" });
  }
});

app.listen(PORT, () => {
  console.log(`Currency converter backend running on http://localhost:${PORT}`);
  if (allowedOrigins.length) {
    console.log(`CORS enabled for: ${allowedOrigins.join(", ")}`);
  } else {
    console.log("CORS: no ALLOWED_ORIGINS set, allowing all origins (development)");
  }
});