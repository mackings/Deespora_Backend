
require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");

require("./src/utils/db.js");
const routes = require("./src/routes/routes.js");


dotenv.config();
const app = express();

// CORS Configuration
const allowedOrigins = [
  'http://localhost',
  'http://127.0.0.1',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  "https://deespora.netlify.app",
  process.env.CLIENT_URL
].filter(Boolean); // Remove undefined values

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/", (req, res) =>
  res.json({ ok: true, name: "Welcome to the Diaspora" })
);

app.use("/", routes);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});