# Pars-Python Docker

Build and run the DNS parser inside a container (includes Chromium + undetected-chromedriver).

Build and run with docker-compose from project root:

```bash
docker-compose up --build
```

By default the service listens on port `8000` and pool size is set to `3`.
To override pool size:

```bash
CHROME_POOL_SIZE=5 docker-compose up --build
```

Endpoint:
- POST http://localhost:8000/parse  body: { "urls": ["https://...characteristics/"] }

Notes:
- Running multiple Chrome instances requires memory — consider increasing container memory or using a small pool.
- If container cannot start Chromium, check installed package names for your distro and adjust Dockerfile.
