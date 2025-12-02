const express = require("express");
const { Getrates, GetPaysendRates, GetRevolutRates, GetWiseRates } = require("../controllers/rates/rate.controller");

const router = express.Router();


router.get("/rates/sendwave",Getrates);
router.get("/rates/wise", GetWiseRates);

router.get("/rates/paysend", GetPaysendRates);
router.get("/rates/revolut", GetRevolutRates);






module.exports = router;