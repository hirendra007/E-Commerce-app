const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const crypto = require("crypto");
const nodeMailer = require("nodemailer");

const app = express();
const port = 8000;
const cors = require("cors");
app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json);
const jwt = require("jsonwebtoken");
mongoose.connect("mongodb+srv://hirendrabalaji3:xGdPV8UxBIvEFbWQ@cluster0.6lkrz.mongodb.net/ecommerce_app", {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("connected to database");
}
).catch((err) => {
    console.log(err);
}
);
app.listen(port, () => {
    console.log("server is running on port", port);
}
)


