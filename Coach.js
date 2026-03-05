const mongoose = require("mongoose");

const coachSchema = new mongoose.Schema({
  name: String,
  sport: String,
  schedule: String,
  experience: Number,
  contact: String
});

module.exports = mongoose.model("Coach", coachSchema);