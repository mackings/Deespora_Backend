const express = require("express");
const { requireAuth } = require("../middleware/auth.js");
const { getEvents, searchEvent } = require("../controllers/event.js");
const router = express.Router();


const {
  register,
  login,
  me,
  requestPasswordReset,
  resetPassword,
  sendEmailOtp,
  verifyEmailOtp
} = require("../controllers/auth.js");
const { getRestaurants, searchRestaurants } = require("../controllers/restaurants.js");



// Email/password
router.post("/register", register);
router.post("/login", login);
//router.get("/me", requireAuth, me);

// Password reset
router.post("/request-password-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);

// Firebase Phone
router.post("/send-otp", sendEmailOtp);
router.post("/verify-otp", verifyEmailOtp);


//Events
router.get("/all-events", getEvents);
router.post("/search-events", searchEvent);


//Restaurants

router.get("/restaurants", getRestaurants);
router.get("/search-restaurants", searchRestaurants);



module.exports = router;

/////


