# Use a stable Python base
FROM python:3.12-slim

# Install system dependencies for Pillow and data processing
RUN apt-get update && apt-get install -y \
    build-essential \
    libjpeg-dev \
    zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install requirements
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

RUN chmod +x docker-entrypoint.sh

# Default port for the app
EXPOSE 8080
ENV NFC_PORT=8080
ENV PRODUCTION=1
ENV DISABLE_MDNS=1

CMD ["./docker-entrypoint.sh"]
