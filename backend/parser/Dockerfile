FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /app/bin/parser ./parser/cmd

FROM python:3.11-slim

WORKDIR /app
COPY --from=builder /app/bin/parser ./parser
COPY parser/browser.py .

RUN pip install --no-cache-dir requests playwright \
    && playwright install --with-deps chromium

CMD ["./parser"]
