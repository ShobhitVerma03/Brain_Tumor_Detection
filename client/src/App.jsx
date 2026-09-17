import { useEffect, useState } from 'react'
import './App.css'

const CLASS_NAMES = ['Glioma', 'Meningioma', 'No Tumor', 'Pituitary']
const CLASS_COLORS = ['#ff6b6b', '#ffa94d', '#51cf66', '#748ffc']

// Talk to the Node server only — never the ML service directly. The server
// is the one place that owns both the model prediction AND the history DB.
const API_URL = import.meta.env.VITE_API_URL || ''

function App() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [history, setHistory] = useState([])

  useEffect(() => {
    fetchHistory()
  }, [])

  async function fetchHistory() {
    try {
      const res = await fetch(`${API_URL}/api/history`)
      if (res.ok) setHistory(await res.json())
    } catch {
      // history is a nice-to-have; don't surface an error for it
    }
  }

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
    setResult(null)
  }

  function handleDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    if (e.type === 'dragleave') setDragActive(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0])
    }
  }

  function handleInputChange(e) {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0])
    }
  }

  async function handleSubmit() {
    if (!file) return
    setLoading(true)
    setResult(null)

    const formData = new FormData()
    formData.append('image', file) // must match multer field name on the server

    try {
      const res = await fetch(`${API_URL}/api/predict`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || 'Server error')
      }

      const data = await res.json()

      setResult({
        className: data.prediction,
        confidence: data.confidence,
        probabilities: data.probabilities,
      })

      fetchHistory()
    } catch (err) {
      setResult({ error: err.message || 'Could not connect to server' })
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setFile(null)
    setPreview(null)
    setResult(null)
  }

  return (
    <div className="container">
      <div className="glow glow-1"></div>
      <div className="glow glow-2"></div>

      <h1 className="title">
        <span className="title-icon">🧠</span> NeuroScan
      </h1>
      <p className="subtitle">AI-Powered Brain Tumor Classification</p>

      <div className="card">
        {!preview ? (
          <div
            className={`dropzone ${dragActive ? 'active' : ''}`}
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => document.getElementById('file-input').click()}
          >
            <input
              id="file-input"
              type="file"
              accept="image/*"
              onChange={handleInputChange}
              hidden
            />
            <div className="dropzone-icon">📁</div>
            <p className="dropzone-text">Drag & drop an MRI scan here</p>
            <p className="dropzone-hint">or click to browse</p>
          </div>
        ) : (
          <div className="preview-section">
            <div className="image-wrapper">
              <img src={preview} alt="MRI Preview" className="preview-image" />
            </div>

            {loading && (
              <div className="loader">
                <div className="spinner"></div>
                <p>Analyzing scan...</p>
              </div>
            )}

            {result && !result.error && (
              <div className="results">
                <h2 className="results-title">Model Prediction</h2>
                <div
                  className="predicted-class"
                  style={{ color: CLASS_COLORS[CLASS_NAMES.indexOf(result.className)] }}
                >
                  {result.className}
                </div>
                <div className="confidence">
                  {(result.confidence * 100).toFixed(1)}% Confidence
                </div>
                <p className="prediction-disclaimer">
                  Educational classification only — not a clinical diagnosis.
                </p>
                <div className="probabilities">
                  {CLASS_NAMES.map((name, i) => (
                    <div key={name} className="prob-row">
                      <span className="prob-label">{name}</span>
                      <div className="prob-bar-bg">
                        <div
                          className="prob-bar-fill"
                          style={{
                            width: `${((result.probabilities[name] || 0) * 100).toFixed(1)}%`,
                            background: CLASS_COLORS[i],
                          }}
                        ></div>
                      </div>
                      <span className="prob-value">
                        {((result.probabilities[name] || 0) * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result && result.error && <div className="error-msg">{result.error}</div>}

            <div className="actions">
              {!loading && !result && (
                <button className="btn btn-primary" onClick={handleSubmit}>
                  Analyze Scan
                </button>
              )}
              <button className="btn btn-secondary" onClick={handleReset}>
                New Scan
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="history">
        <h3 className="history-title">Recent Predictions</h3>
        {history.length === 0 ? (
          <p className="history-empty">No predictions yet.</p>
        ) : (
          <div className="history-list">
            {history.map((h) => (
              <div className="history-row" key={h._id}>
                <span>{h.imageName}</span>
                <span>{h.prediction}</span>
                <span>{(h.confidence * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default App
