import assert from 'node:assert/strict'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost'
const API_URL = process.env.API_URL || 'http://localhost:5000'
const ML_URL = process.env.ML_URL || 'http://localhost:8000'
const PROXY_API_URL = process.env.PROXY_API_URL || `${FRONTEND_URL}/api`
const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNsaGhgYGBgYgADABIqAYQKPxU1AAAAAElFTkSuQmCC',
  'base64',
)

async function waitFor(url, expectedStatus = 200) {
  let lastError
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.status === expectedStatus) return response
      lastError = new Error(`${url} returned ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
  throw lastError
}

const frontend = await waitFor(FRONTEND_URL)
assert.match(await frontend.text(), /NeuroScan/)
const proxyHealth = await waitFor(`${PROXY_API_URL}/health`)
assert.equal((await proxyHealth.json()).mlServiceConnected, true)
const mlHealth = await waitFor(`${ML_URL}/health`)
assert.equal((await mlHealth.json()).model_loaded, true)
const apiHealth = await waitFor(`${API_URL}/api/health`)
const health = await apiHealth.json()
assert.equal(health.mlServiceConnected, true)
assert.equal(health.mongoConnected, true)

const formData = new FormData()
formData.append('image', new Blob([SAMPLE_PNG], { type: 'image/png' }), 'smoke-test.png')
const predictionResponse = await fetch(`${API_URL}/api/predict`, { method: 'POST', body: formData })
assert.equal(predictionResponse.status, 200)
const prediction = await predictionResponse.json()
assert.equal(typeof prediction.prediction, 'string')
assert.equal(typeof prediction.confidence, 'number')
assert.equal(typeof prediction.probabilities, 'object')
assert.ok(Math.abs(Object.values(prediction.probabilities).reduce((sum, value) => sum + value, 0) - 1) < 0.01)

const invalidData = new FormData()
invalidData.append('image', new Blob(['not an image'], { type: 'text/plain' }), 'invalid.txt')
const invalidResponse = await fetch(`${API_URL}/api/predict`, { method: 'POST', body: invalidData })
assert.equal(invalidResponse.status, 400)

let history = []
for (let attempt = 1; attempt <= 10; attempt += 1) {
  const historyResponse = await fetch(`${API_URL}/api/history`)
  assert.equal(historyResponse.status, 200)
  history = await historyResponse.json()
  if (history.some((entry) => entry.imageName === 'smoke-test.png')) break
  await new Promise((resolve) => setTimeout(resolve, 1000))
}
assert.ok(history.some((entry) => entry.imageName === 'smoke-test.png'))
console.log('E2E checks passed: frontend, ML health, API health, prediction, validation, and MongoDB history.')
