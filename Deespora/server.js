
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
  "http://admin.deespora.com",
  "https://admin.deespora.com",
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parser middleware - ADD THIS
app.use(express.json({ limit: '10mb' })); // For JSON payloads
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // For URL-encoded form data
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/", (req, res) =>
  res.json({ ok: true, name: "Welcome to the Diaspora" })
);
// Add this right before your routes
app.use((req, res, next) => {
  console.log('=== DEBUG ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Body:', req.body);
  console.log('=============');
  next();
});


app.use("/", routes);

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});