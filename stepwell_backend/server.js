require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

const {
  PORT = 3000,
  DB_HOST,
  DB_PORT = 3306,
  DB_USER,
  DB_PASSWORD,
  DB_NAME,
  JWT_SECRET,
} = process.env;

if (!JWT_SECRET) {
  console.error("JWT_SECRET is missing in .env");
  process.exit(1);
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ message: "Missing or invalid Authorization header" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.auth = payload;
    next();
  } catch (e) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max, decimals = 1) {
  const num = Math.random() * (max - min) + min;
  return Number(num.toFixed(decimals));
}

function generateHealthMetrics() {
  return {
    systolic_bp: randomInt(105, 130),
    diastolic_bp: randomInt(65, 85),
    blood_glucose: randomFloat(4.2, 6.8, 1),
    spo2: randomInt(95, 100),
    heart_rate: randomInt(60, 95),
  };
}

app.get("/", (req, res) => {
  res.json({ ok: true, name: "HealthComp API" });
});

app.post("/auth/register", async (req, res) => {
  console.log("REGISTER BODY:", req.body);
  try {
    const {
      firstName,
      lastName,
      email,
      dateOfBirth,
      role,
      height,
      weight,
      password,
    } = req.body;

    if (
      !firstName ||
      !lastName ||
      !email ||
      !dateOfBirth ||
      !role ||
      !height ||
      !weight ||
      !password
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      });
    }

    const safeRole = role === "doctor" ? "doctor" : "patient";
    const normalizedEmail = String(email).trim().toLowerCase();

    const [existing] = await pool.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users
      (first_name, last_name, email, date_of_birth, role, height, weight, password_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        firstName.trim(),
        lastName.trim(),
        normalizedEmail,
        dateOfBirth,
        safeRole,
        Number(height),
        Number(weight),
        password_hash,
      ]
    );

    const userId = result.insertId;

    if (safeRole === "patient") {
      const metrics = generateHealthMetrics();

      await pool.query(
        `INSERT INTO health_metrics
        (user_id, systolic_bp, diastolic_bp, blood_glucose, spo2, heart_rate)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          userId,
          metrics.systolic_bp,
          metrics.diastolic_bp,
          metrics.blood_glucose,
          metrics.spo2,
          metrics.heart_rate,
        ]
      );
    }

    const user = {
      id: userId,
      firstName,
      lastName,
      email: normalizedEmail,
      role: safeRole,
    };

    const token = signToken(user);

    res.status(201).json({ token, user });
  } catch (e) {
    console.error("REGISTER ERROR:", e);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }

    const [rows] = await pool.query(
      `SELECT id, first_name, last_name, email, password_hash, role
       FROM users
       WHERE email = ? LIMIT 1`,
      [String(email).trim().toLowerCase()]
    );

    if (rows.length === 0) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const userRow = rows[0];
    const ok = await bcrypt.compare(password, userRow.password_hash);

    if (!ok) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const user = {
      id: userRow.id,
      firstName: userRow.first_name,
      lastName: userRow.last_name,
      email: userRow.email,
      role: userRow.role,
    };

    const token = signToken(user);

    res.json({ token, user });
  } catch (e) {
    console.error("LOGIN ERROR:", e);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = req.auth.sub;

    const [rows] = await pool.query(
      `SELECT
        id,
        first_name,
        last_name,
        email,
        date_of_birth,
        role,
        height,
        weight,
        created_at
      FROM users
      WHERE id = ? LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ user: rows[0] });
  } catch (e) {
    console.error("ME ERROR:", e);
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/metrics/latest", authMiddleware, async (req, res) => {
  try {
    const userId = req.auth.sub;

    const [rows] = await pool.query(
      `SELECT
        id,
        systolic_bp,
        diastolic_bp,
        blood_glucose,
        spo2,
        heart_rate,
        created_at
      FROM health_metrics
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "No metrics found" });
    }

    res.json({ metrics: rows[0] });
  } catch (e) {
    console.error("METRICS ERROR:", e);
    res.status(500).json({ message: "Server error" });
  }
});

app.get('/users', async (req, res) => {
  try {
    const role = req.query.role;
    let query = 'SELECT id, first_name, last_name, email, role FROM users';
    let params = [];

    if (role) {
      query += ' WHERE role = ?';
      params.push(role);
    }

    const [users] = await pool.query(query, params);

    for (let i = 0; i < users.length; i++) {
      const [metricsRows] = await pool.query(
        `SELECT systolic_bp, diastolic_bp, blood_glucose, spo2, heart_rate
         FROM health_metrics
         WHERE user_id = ?
         ORDER BY created_at DESC LIMIT 1`,
        [users[i].id]
      );
      
      if (metricsRows.length > 0) {
        users[i].metrics = {
          systolic_bp: metricsRows[0].systolic_bp,
          diastolic_bp: metricsRows[0].diastolic_bp,
          blood_glucose: metricsRows[0].blood_glucose,
          spo2: metricsRows[0].spo2,
          heart_rate: metricsRows[0].heart_rate
        };
      } else {
        users[i].metrics = null;
      }
    }

    res.json(users);
  } catch (error) {
    console.error("Ошибка при получении пользователей:", error);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

app.get('/weather', async (req, res) => {
  try {
    const response = await fetch('https://api.open-meteo.com/v1/forecast?latitude=50.28&longitude=57.17&current_weather=true');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Weather API error:", error);
    res.status(500).json({ error: "Failed to fetch weather" });
  }
});

app.use("/health", require("./routes/health"));
app.use("/ai", require("./routes/ai")); 

app.listen(PORT, "0.0.0.0", () => {
  console.log(`StepWell API running on http://0.0.0.0:${PORT}`);
});