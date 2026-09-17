const mongoose = require('mongoose')

const predictionSchema = new mongoose.Schema({
  imageName: { type: String, maxlength: 255 },
  prediction: { type: String, required: true },
  confidence: { type: Number, required: true, min: 0, max: 1 },
  probabilities: { type: Map, of: Number, required: true },
  date: { type: Date, default: Date.now },
})

module.exports = mongoose.model('Prediction', predictionSchema)
