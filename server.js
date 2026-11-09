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
app.options("/api/*", cors(corsOptions));

import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendPath = path.resolve(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

const UPSTREAM_FX = "https://open.er-api.com/v6/latest";
const UPSTREAM_CRYPTO = "https://api.coingecko.com/api/v3";

async function fetchFxRate(from, to) {
  const url = `${UPSTREAM_FX}/${encodeURIComponent(from)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.rates?.[to] ?? null;
}

async function fetchCryptoRate(from, to) {
  const url = `${UPSTREAM_CRYPTO}/simple/price?ids=${encodeURIComponent(from)}&vs_currencies=${encodeURIComponent(to)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data[from]?.[to] ?? null;
}

const ENERGY_UNITS = {
  J: 1,
  kJ: 1000,
  MJ: 1_000_000,
  GJ: 1_000_000_000,
  cal: 4.184,
  kcal: 4184,
  Wh: 3600,
  kWh: 3_600_000,
  MWh: 3_600_000_000,
  BTU: 1055.06,
  therm: 105_506_000,
  eV: 1.602176634e-19,
  erg: 1e-7,
  ft_lbf: 1.355817948,
};

const RATE_UNITS = {
  per_second: 1,
  per_minute: 60,
  per_hour: 3600,
  per_day: 86400,
  per_week: 604800,
  per_month: 2_629_746,
  per_year: 31_556_952,
};

function convertEnergy(value, from, to) {
  const fromFactor = ENERGY_UNITS[from];
  const toFactor = ENERGY_UNITS[to];
  if (!fromFactor || !toFactor) return null;
  return (value * fromFactor) / toFactor;
}

function convertRate(value, from, to) {
  const fromFactor = RATE_UNITS[from];
  const toFactor = RATE_UNITS[to];
  if (!fromFactor || !toFactor) return null;
  return (value * toFactor) / fromFactor;
}

app.get("/api/convert/currency", async (req, res) => {
  const { from, to, amount } = req.query;
  if (!from || !to || !amount || isNaN(Number(amount))) {
    return res.status(400).json({ error: "Missing or invalid parameters: from, to, amount" });
  }
  const numericAmount = Number(amount);
  try {
    const rate = await fetchFxRate(from, to);
    if (rate === null) return res.status(400).json({ error: `Unsupported currency pair: ${from} → ${to}` });
    return res.json({ from, to, amount: numericAmount, rate, converted: Number((numericAmount * rate).toFixed(6)), date: new Date().toISOString().split("T")[0], type: "currency" });
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

app.get("/api/convert/crypto", async (req, res) => {
  const { from, to, amount } = req.query;
  if (!from || !to || !amount || isNaN(Number(amount))) {
    return res.status(400).json({ error: "Missing or invalid parameters: from, to, amount" });
  }
  const numericAmount = Number(amount);
  try {
    const rate = await fetchCryptoRate(from, to);
    if (rate === null) return res.status(400).json({ error: `Unsupported crypto pair: ${from} → ${to}` });
    return res.json({ from, to, amount: numericAmount, rate, converted: Number((numericAmount * rate).toFixed(8)), date: new Date().toISOString().split("T")[0], type: "crypto" });
  } catch { return res.status(500).json({ error: "Internal server error" }); }
});

app.get("/api/convert/energy", async (req, res) => {
  const { from, to, amount } = req.query;
  if (!from || !to || !amount || isNaN(Number(amount))) {
    return res.status(400).json({ error: "Missing or invalid parameters: from, to, amount" });
  }
  const numericAmount = Number(amount);
  const converted = convertEnergy(numericAmount, from, to);
  if (converted === null) return res.status(400).json({ error: `Unsupported energy units: ${from} → ${to}` });
  return res.json({ from, to, amount: numericAmount, rate: ENERGY_UNITS[to] / ENERGY_UNITS[from], converted: Number(converted.toFixed(10)), date: new Date().toISOString().split("T")[0], type: "energy" });
});

app.get("/api/convert/rate", async (req, res) => {
  const { from, to, amount } = req.query;
  if (!from || !to || !amount || isNaN(Number(amount))) {
    return res.status(400).json({ error: "Missing or invalid parameters: from, to, amount" });
  }
  const numericAmount = Number(amount);
  const converted = convertRate(numericAmount, from, to);
  if (converted === null) return res.status(400).json({ error: `Unsupported rate units: ${from} → ${to}` });
  return res.json({ from, to, amount: numericAmount, rate: RATE_UNITS[to] / RATE_UNITS[from], converted: Number(converted.toFixed(10)), date: new Date().toISOString().split("T")[0], type: "rate" });
});

app.get("/api/currencies", async (req, res) => {
  try {
    const resUp = await fetch(`${UPSTREAM_FX}/USD`);
    if (!resUp.ok) return res.status(502).json({ error: "Failed to fetch currencies" });
    const data = await resUp.json();
    return res.json(data.rates || {});
  } catch { return res.status(500).json({ error: "Failed to fetch currencies" }); }
});

app.get("/api/cryptos", async (req, res) => {
  try {
    const resUp = await fetch(`${UPSTREAM_CRYPTO}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1`);
    if (!resUp.ok) return res.status(502).json({ error: "Failed to fetch cryptos" });
    const data = await resUp.json();
    const map = {};
    data.forEach(c => { map[c.id] = c.symbol.toUpperCase(); });
    return res.json(map);
  } catch { return res.status(500).json({ error: "Failed to fetch cryptos" }); }
});

app.get("/api/energy-units", (req, res) => res.json(ENERGY_UNITS));
app.get("/api/rate-units", (req, res) => res.json(RATE_UNITS));

app.listen(PORT, () => {
  console.log(`Convertly backend running on http://localhost:${PORT}`);
  if (allowedOrigins.length) console.log(`CORS enabled for: ${allowedOrigins.join(", ")}`);
  else console.log("CORS: no ALLOWED_ORIGINS set, allowing all origins (development)");
});