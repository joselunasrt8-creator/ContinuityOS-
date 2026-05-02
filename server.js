const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.all('*', (_req, res) => {
  res.status(410).json({
    status: "FAILED",
    error: "legacy_server_disabled",
    message: "Legacy direct validator server is disabled. Use governed runtime flow only."
  });
});

app.listen(PORT, () => {
  console.log(`Legacy server disabled on port ${PORT}`);
});
