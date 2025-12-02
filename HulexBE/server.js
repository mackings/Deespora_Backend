const express = require("express")
const app = express();
const dotenv =require("dotenv").config();
const Rateroutes = require("./src/routes/ratesRoutes");
const PORT = process.env.PORT


app.use("/",Rateroutes);
app.listen(PORT,()=>{
    console.log(`Server live locally  on ${PORT}`);
})
