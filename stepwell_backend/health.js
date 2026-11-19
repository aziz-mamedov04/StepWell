const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/snapshot/:userId", async (req, res) => {
  const { userId } = req.params;

  const [rows] = await db.query(
    "SELECT * FROM health_data WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
    [userId]
  );

  if (rows.length === 0) {
    return res.json(null);
  }

  res.json(rows[0]);
});

module.exports = router;