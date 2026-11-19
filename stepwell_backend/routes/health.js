const express = require("express");
const router = express.Router();
const db = require("../db");

router.get("/snapshot/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [rows] = await db.query(
      `SELECT 
         hm.systolic_bp, 
         hm.diastolic_bp, 
         hm.heart_rate, 
         hm.blood_glucose, 
         hm.spo2,
         hm.steps,     
         hm.streak,    
         hm.created_at,
         u.weight,
         u.height
       FROM health_metrics hm
       JOIN users u ON hm.user_id = u.id
       WHERE hm.user_id = ?
       ORDER BY hm.created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.json({});
    }

    res.json(rows[0]);

  } catch (err) {
    console.error("Health snapshot error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.put("/snapshot/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { systolic_bp, diastolic_bp, heart_rate, blood_glucose, spo2, weight, steps, streak } = req.body;

    if (weight !== undefined) {
      await db.query(`UPDATE users SET weight = ? WHERE id = ?`, [weight, userId]);
    }

    const [existing] = await db.query(
      `SELECT id FROM health_metrics WHERE user_id = ? AND DATE(created_at) = CURDATE() LIMIT 1`,
      [userId]
    );

    if (existing.length > 0) {
      await db.query(
        `UPDATE health_metrics
         SET systolic_bp = COALESCE(?, systolic_bp),
             diastolic_bp = COALESCE(?, diastolic_bp),
             heart_rate = COALESCE(?, heart_rate),
             blood_glucose = COALESCE(?, blood_glucose),
             spo2 = COALESCE(?, spo2),
             steps = COALESCE(?, steps),
             streak = COALESCE(?, streak)
         WHERE id = ?`,
        [systolic_bp, diastolic_bp, heart_rate, blood_glucose, spo2, steps, streak, existing[0].id]
      );
    } else {
      await db.query(
        `INSERT INTO health_metrics (user_id, systolic_bp, diastolic_bp, heart_rate, blood_glucose, spo2, steps, streak)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, systolic_bp || 120, diastolic_bp || 80, heart_rate || 70, blood_glucose || 5.0, spo2 || 98, steps || 8000, streak || 1]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.get("/statistics/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const [rows] = await db.query(
      `SELECT 
         DATE_FORMAT(created_at, '%a') as day_name, 
         steps 
       FROM health_metrics 
       WHERE user_id = ?
       ORDER BY created_at ASC
       LIMIT 7`,
      [userId]
    );
    
    if (rows.length === 0) {
      return res.json([]);
    }

    res.json(rows);

  } catch (err) {
    console.error("Statistics error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;