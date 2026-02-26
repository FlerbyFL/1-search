FROM python:3.10-bullseye

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    curl \
    gnupg2 \
    unzip \
    fonts-liberation \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgdk-pixbuf-xlib-2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxrandr2 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libxrender1 \
    fonts-liberation \
    chromium \
    chromium-driver \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt /app/requirements.txt
# Install Python deps and Playwright browsers
RUN pip install --upgrade pip \
    && pip install --no-cache-dir -r /app/requirements.txt \
    && python -m playwright install --with-deps chromium

# Copy parser sources
COPY . /app

ENV CHROME_BIN=/usr/bin/chromium
ENV CHROME_POOL_SIZE=3

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
