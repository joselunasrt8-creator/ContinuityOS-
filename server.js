const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.VALIDATOR_TOKEN || "dev-token";

function canonicalJson(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return JSON.stringify(v);
  }
  return '{' + Object.keys(v).sort().map(k =>
    JSON.stringify(k) + ':' + canonicalJson(v[k])
  ).join(',') + '}';
}

function normalizeAeoForSigning(aeo) {
  const clone = JSON.parse(JSON.stringify(aeo));

  if (!clone.validation) {
    clone.validation = {};
  }

  // CRITICAL: signature must be blank during validation hashing
  clone.validation.signature = "";

  return clone;
}

app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

app.post('/validate', (req, res) => {
  const auth = req.headers.authorization || "";

  if (auth !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ status: "NULL", reason: "Invalid token" });
  }

  const { decision_id, signature, aeo } = req.body;

  if (!decision_id) {
    return res.json({ status: "NULL", reason: "Missing decision_id" });
  }

  if (!aeo) {
    return res.json({ status: "NULL", reason: "Missing AEO" });
  }

  // Required AEO structure checks
  if (!aeo.intent) {
    return res.json({ status: "NULL", reason: "Missing aeo field: intent" });
  }

  if (!aeo.scope) {
    return res.json({ status: "NULL", reason: "Missing aeo field: scope" });
  }

  if (!aeo.validation) {
    return res.json({ status: "NULL", reason: "Missing aeo field: validation" });
  }

  if (!aeo.target) {
    return res.json({ status: "NULL", reason: "Missing aeo field: target" });
  }

  if (!aeo.finality) {
    return res.json({ status: "NULL", reason: "Missing aeo field: finality" });
  }

  if (!aeo.expires_at) {
    return res.json({ status: "NULL", reason: "Missing aeo field: expires_at" });
  }

  // Normalize before hashing (this fixes your bug)
  const normalizedAeo = normalizeAeoForSigning(aeo);

  const computed = crypto
    .createHash('sha256')
    .update(decision_id + canonicalJson(normalizedAeo))
    .digest('hex');

  if (signature !== computed) {
    return res.json({
      status: "NULL",
      reason: "Invalid signature"
    });
  }

  return res.json({ status: "VALID" });
});

app.listen(PORT, () => {
  console.log(`Validator running on port ${PORT}`);
});