const mongoose = require("mongoose");
//const dotenv = require("dotenv");

//dotenv.config();

const uri = process.env.MONGO_URI;
// if (!uri) {
//   console.error("Missing MONGO_URI in .env");
//   process.exit(1);
// }

// mongoose.set("strictQuery", true);

// mongoose.connect(uri)
//   .then(() => console.log("✅ MongoDB connected"))
//   .catch((err) => {
//     console.error("❌ MongoDB connection error:", err.message);
//     process.exit(1);
//   });



  const connectDB = async ()=>{
    try {
          await mongoose.connect(uri);
    console.log("DBconnected Successsfully");

    } catch (error) {
      console.log("Error connecting to DB", error.message);
    }
  }

  module.exports = connectDB;