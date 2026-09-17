"""
FastAPI ML inference service.

Replaces the old Flask app.py AND the old frontend/server/predict.py
subprocess hack. This is the ONE place the model is loaded and the ONE
place predictions happen — the Node server calls this over HTTP, it never
shells out to Python or loads the model itself again.
"""
import io
import logging
from pathlib import Path

import cv2
import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image
from tensorflow.keras.layers import Dense
from tensorflow.keras.models import load_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ml-service")

IMG_SIZE = (224, 224)
CLASS_NAMES = ["Glioma", "Meningioma", "No Tumor", "Pituitary"]


def preprocess_image(pil_image) -> np.ndarray:
    """Convert an uploaded MRI image into the model's expected tensor."""
    image = pil_image.convert("RGB").resize(IMG_SIZE)
    array = np.array(image, dtype="float32")
    array = cv2.GaussianBlur(array, (3, 3), 0)
    return np.expand_dims(array / 255.0, axis=0)

app = FastAPI(title="Brain Tumor Detection - ML Service")


class PatchedDense(Dense):
    """Defensive shim: keras files saved by a newer/older Keras sometimes
    serialize a 'quantization_config' kwarg this Keras version doesn't
    accept. Strip it rather than fail to load. If you retrain the model with
    the pinned TF version in this repo (see requirements.txt), this patch
    becomes unnecessary but is harmless to leave in."""

    def __init__(self, **kwargs):
        kwargs.pop("quantization_config", None)
        super().__init__(**kwargs)


# This is the project's deployed CNN. It is loaded once at service startup.
MODEL_PATH = Path(__file__).resolve().with_name("trained_model.h5")
model = None


@app.on_event("startup")
def load_ml_model():
    global model
    try:
        model = load_model(
            MODEL_PATH, custom_objects={"Dense": PatchedDense}, compile=False
        )
        logger.info("Model loaded from %s", MODEL_PATH)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Failed to load model")
        raise RuntimeError(f"Failed to load {MODEL_PATH}") from exc


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None}


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    try:
        raw = await file.read()
        if not raw:
            raise ValueError("The uploaded image is empty")
        pil_image = Image.open(io.BytesIO(raw))
        pil_image.verify()
        pil_image = Image.open(io.BytesIO(raw))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail="Could not read image") from exc

    processed = preprocess_image(pil_image)
    prediction = model.predict(processed, verbose=0)[0]
    class_index = int(np.argmax(prediction))

    probabilities = {
        class_name: float(probability)
        for class_name, probability in zip(CLASS_NAMES, prediction)
    }
    return {
        "prediction": CLASS_NAMES[class_index],
        "confidence": float(prediction[class_index]),
        "probabilities": probabilities,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000)
