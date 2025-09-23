const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");

require("./utils/db.js");
const authRoutes = require("./src/routes/auth.routes.js");
const eventRoutes = require("./src/routes/event.routes.js");
const routes = require("./src/routes");

dotenv.config();
const app = express();

app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/", (req, res) =>
  res.json({ ok: true, name: "firebase-phone-auth-express-template" })
);

app.use("/", routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
