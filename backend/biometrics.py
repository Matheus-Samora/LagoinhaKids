import io, threading, warnings
from pathlib import Path
import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import HTTPException
BASE = Path(__file__).resolve().parent
MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 12_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS
LOCK = threading.Lock()
DETECTOR = cv2.FaceDetectorYN.create(str(BASE / 'models/face_detection_yunet_2023mar.onnx'), '', (320, 320), 0.9, 0.3, 5000)
RECOGNIZER = cv2.FaceRecognizerSF.create(str(BASE / 'models/face_recognition_sface_2021dec.onnx'), '')
def fail(code, message, status=422):
    raise HTTPException(status, detail={'code': code, 'message': message})

def decode(data: bytes):
    if not data or len(data) > MAX_BYTES:
        fail('too_large' if data else 'invalid_image', 'Image must be nonempty and at most 8 MiB.', 413 if data else 422)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as source:
                if source.format not in ('JPEG', 'PNG', 'WEBP'):
                    fail('unsupported_image', 'Use JPEG, PNG or WebP.')
                if source.width * source.height > MAX_PIXELS:
                    fail('too_many_pixels', 'Maximum 12 megapixels.', 413)
                if min(source.width, source.height) < 32:
                    fail('image_too_small', 'Image dimensions must be at least 32 pixels.')
                rgb = ImageOps.exif_transpose(source).convert('RGB')
                return cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)
    except (Image.DecompressionBombError, Image.DecompressionBombWarning):
        fail('too_many_pixels', 'Maximum 12 megapixels.', 413)
    except (UnidentifiedImageError, OSError, ValueError):
        fail('invalid_image', 'Image could not be decoded.')

def analyze(image, feature=False):
    height, width = image.shape[:2]
    scale = min(1.0, 1280 / max(height, width))
    working = cv2.resize(image, (round(width * scale), round(height * scale))) if scale < 1 else image
    # OpenCV instances mutate input size and inference buffers; serialize access.
    with LOCK:
        DETECTOR.setInputSize((working.shape[1], working.shape[0]))
        _, faces = DETECTOR.detect(working)
        count = 0 if faces is None else len(faces)
        if count != 1:
            fail('no_face' if count == 0 else 'multiple_faces', f'Exactly one face required; detected {count}.')
        face = faces[0]
        x, y, w, h = face[:4]
        crop = working[max(0, int(y)):min(working.shape[0], int(y+h)), max(0, int(x)):min(working.shape[1], int(x+w))]
        if crop.size == 0:
            fail('invalid_face', 'Face crop is empty.')
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        brightness = float(gray.mean())
        sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        face_size = float(min(w, h) / scale)
        cautions = []
        if brightness < 50 or brightness > 205: cautions.append('lighting')
        if sharpness < 60: cautions.append('blur')
        if face_size < 100: cautions.append('small_face')
        result = {'face_count': 1, 'image': {'width': width, 'height': height}, 'box': [round(float(v)/scale, 2) for v in face[:4]], 'landmarks': [[round(float(face[i])/scale, 2), round(float(face[i+1])/scale, 2)] for i in range(4, 14, 2)], 'detection_score': float(face[14]), 'quality': {'brightness': brightness, 'laplacian_variance': sharpness, 'face_min_pixels': face_size, 'warnings': cautions, 'heuristic_only': True}, 'liveness': {'available': False, 'verified': False}, 'processing': 'local_memory_only'}
        embedding = RECOGNIZER.feature(RECOGNIZER.alignCrop(working, face)).copy() if feature else None
    return result, embedding

