FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /app/bin/parser ./parser/cmd

FROM python:3.11-slim

# Install system deps for Playwright/Chromium on Debian 12 Bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libcups2t64 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxrandr2 \
    libgbm1 libasound2t64 libpangocairo-1.0-0 libgtk-3-0t64 \
    ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/bin/parser ./parser
COPY parser/browser.py ./browser.py
COPY parser/pitergsm.py ./pitergsm.py

RUN pip install --no-cache-dir requests playwright && \
    playwright install chromium --with-deps

CMD ["./parser"]
