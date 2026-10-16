FROM node:22-slim AS frontend
WORKDIR /web
COPY package*.json ./
RUN npm ci
COPY index.html systems.html vite.config.* ./
COPY public public
COPY src src
RUN npm run build
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend backend
COPY --from=frontend /web/dist dist
COPY --from=frontend /web/public public
ENV KIDS_DATA_DIR=/data
RUN mkdir /data && useradd --system --uid 10001 kids && chown kids /data
USER kids
EXPOSE 8770
CMD ["python","-m","backend.cloud_entrypoint"]
