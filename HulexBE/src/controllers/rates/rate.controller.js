const axios = require("axios");
const https = require("https");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
require('dotenv').config();
const {getRevolutRates } = require("../Utils/revolut")
const {getWiseRates} = require("../Utils/wise");




exports.GetWiseRates = async (req, res) => {
  try {
    const { from = "CAD", to = "NGN", amount = 1 } = req.query;

    const rates = await getWiseRates(from, to, amount);

    res.json({ success: true, rates });
  } catch (err) {
    console.error(err);
    res.status(400).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
};



exports.GetRevolutRates = async (req, res) => {
  try {
    const { from = "USD", to = "NGN", amount = 1 } = req.query;

    const rates = await getRevolutRates(from, to, amount);

    res.json({ success: true, rates });
  } catch (err) {
    console.error(err);
    res.status(400).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
};

//Break


exports.Getrates = async (req, res) => {
    try {
        const response = await axios.get(
            "https://app.sendwave.com/v2/pricing-public",
            {
                params: {
                    amountType: "SEND",
                    amount: 100,
                    sendCurrency: "USD",
                    sendCountryIso2: "US",
                    receiveCurrency: "NGN",
                    receiveCountryIso2: "NG"
                },
                headers: {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    "Accept": "application/json",
                    "Accept-Language": "en-US,en;q=0.9"
                }
            }
        );
        
        res.json(response.data);
    } catch (error) {
        console.log("Status:", error.response?.status);
        console.log("Error data:", error.response?.data);
        res.status(500).json({ 
            error: "Failed to fetch rates",
            message: error.message,
            details: error.response?.data
        });
    }
};



exports.GetPaysendRates = async (req, res) => {
    try {
        const data = JSON.stringify({
            header: {
                request: {
                    id: `req_${Date.now()}`,
                    date: new Date().toISOString()
                },
                service: {
                    sync: true,
                    waitTime: "WaitFor2000"
                }
            },
            payload: {
                partner: {
                    identifier: "your_partner_identifier",
                    parameters: {}
                },
                tasks: [
                    {
                        type: "fx.rateGet.p2a",
                        payload: {
                            payinCurrency: "USD",
                            payoutCurrency: "NGN",
                            payoutAmount: "100",
                            payoutCountry: "NG"
                        }
                    }
                ]
            }
        });

        const config = {
            method: 'post',
            maxBodyLength: Infinity,
            url: 'http://enterprise.sandbox.paysend.com/processing',
            headers: { 
                'Content-Type': 'application/json', 
                'Accept': 'application/json',
                'X-OPP-Signature': 'your_signature_key_here'
            },
            data: data
        };

        const response = await axios.request(config);
        
        res.json(response.data);
    } catch (error) {
        console.log("Full error:", error.response?.data);
        res.status(500).json({
            error: "Failed to fetch Paysend P2A rates",
            message: error.response?.data || error.message
        });
    }
};


