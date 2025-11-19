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
  verifyEmailOtp,
  getAllUsers,
  getUser
} = require("../controllers/auth.js");
const { getRestaurants, searchRestaurants } = require("../controllers/restaurants.js");
const { getRealEstateCompanies } = require("../controllers/realestate.js");
const { getCateringCompanies } = require("../controllers/catering.js");
const { createCategory, getCategories, getCategoryById, updateCategory, deleteCategory, createListing, promoteListing,getListings,getListingById ,updateListing,deleteListing} = require("../controllers/Listings.js");



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

//RealEstate
router.get("/realestate", getRealEstateCompanies);


//Catering
router.get("/catering", getCateringCompanies);


//Users

router.get("/all-users", getAllUsers);
router.get("/get-user", getUser);



router.post("/categories", createCategory);
router.get("/categories", getCategories);
router.get("/categories/:categoryId", getCategoryById);
router.put("/categories/:categoryId", updateCategory);
router.delete("/categories/:categoryId", deleteCategory);

// ===============================
// LISTING ROUTES
// ===============================
router.post("/listings", createListing);
router.get("/listings", getListings);
router.get("/listings/:listingId", getListingById);
router.put("/listings/:listingId",  updateListing);
router.delete("/listings/:listingId",  deleteListing);
router.post("/listings/:listingId/promote", promoteListing);



module.exports = router;

/////


