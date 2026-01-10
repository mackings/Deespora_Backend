require("dotenv").config();
const express = require("express");
const compression = require("compression");
const morgan = require("morgan");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const dotenv = require("dotenv");
const connectDB = require("./Deespora/src/utils/db.js");
const { preloadCaches } = require("./Deespora/src/utils/RestCache.js");

//require("./src/utils/db.js");
const routes = require("./Deespora/src/routes/routes.js");

//dotenv.config();
const app = express();
connectDB();
preloadCaches();

app.use(cors({ origin: process.env.CLIENT_URL || "*", credentials: true }));
app.use(compression());
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/", (req, res) =>
  res.json({ ok: true, name: "firebase-phone-auth-express-template" })
);

app.use("/", routes);
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
