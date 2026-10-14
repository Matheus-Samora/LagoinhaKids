FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY dist dist
ENV KIDS_DATA_DIR=/data
RUN mkdir /data && useradd --system --uid 10001 kids && chown kids /data
USER kids
EXPOSE 8770
CMD ["python","-m","uvicorn","backend.app:app","--host","0.0.0.0","--port","8770"]
