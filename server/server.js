require('dotenv').config()

const express = require('express')
const mongoose = require('mongoose')
const multer = require('multer')
const cors = require('cors')
const Prediction = require('./models/Prediction')

const app = express()
const PORT = process.env.PORT || 5000
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000'
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/neuroscan'

app.use(cors({ origin: process.env.CORS_ORIGIN || true }))
app.use(express.json())

// Keep uploads in memory — we only need bytes long enough to forward them
// to the ML service, nothing is written to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
})

mongoose
  .connect(MONGO_URI, { serverSelectionTimeoutMS: 5000 })
  .then(() => console.log('Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err.message))

app.get('/api/health', async (req, res) => {
  const mongoConnected = mongoose.connection.readyState === 1
  let mlServiceConnected = false
  try {
    const mlHealth = await fetch(`${ML_SERVICE_URL}/health`, { signal: AbortSignal.timeout(3000) })
    mlServiceConnected = mlHealth.ok
  } catch {
    // A health response is still useful when a dependency is temporarily down.
  }
  res.status(mlServiceConnected ? 200 : 503).json({
    status: mlServiceConnected ? 'ok' : 'degraded',
    mongoConnected,
    mlServiceConnected,
  })
})

app.post('/api/predict', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' })
  }
  if (!req.file.mimetype?.startsWith('image/')) {
    return res.status(400).json({ error: 'Only image uploads are supported' })
  }

  try {
    // Use Node's built-in web FormData with its built-in fetch. The `form-data`
    // npm package generates a stream that native fetch does not serialize as a
    // multipart request, causing FastAPI to reject the request body.
    const formData = new FormData()
    const image = new Blob([req.file.buffer], { type: req.file.mimetype })
    formData.append('file', image, req.file.originalname)

    const mlResponse = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      body: formData,
    })

    if (!mlResponse.ok) {
      const detail = await mlResponse.text()
      throw new Error(`ML service error (${mlResponse.status}): ${detail}`)
    }

    const result = await mlResponse.json()

    // Don't let a Mongo hiccup break the prediction response — log and move on.
    try {
      await Prediction.create({
        imageName: req.file.originalname,
        prediction: result.prediction,
        confidence: result.confidence,
        probabilities: result.probabilities,
      })
    } catch (dbErr) {
      console.error('Failed to save prediction history:', dbErr.message)
    }

    res.json(result)
  } catch (err) {
    console.error('Prediction failed:', err.message)
    res.status(502).json({ error: 'Prediction failed: ' + err.message })
  }
})

app.get('/api/history', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Prediction history is temporarily unavailable' })
  }
  try {
    const history = await Prediction.find().sort({ date: -1 }).limit(10)
    res.json(history)
  } catch (err) {
    res.status(500).json({ error: 'Could not fetch history: ' + err.message })
  }
})

app.listen(PORT, () => console.log(`Server running on port ${PORT}, forwarding to ML service at ${ML_SERVICE_URL}`))
