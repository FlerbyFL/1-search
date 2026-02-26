from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List
from fastapi.middleware.cors import CORSMiddleware
import DNS_parser as dns
import undetected_chromedriver as uc
import queue
import threading
import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.chrome.options import Options as ChromeOptions
from webdriver_manager.chrome import ChromeDriverManager
import subprocess
from playwright.sync_api import sync_playwright


class UrlsModel(BaseModel):
    urls: List[str]


class ChromePool:
    def __init__(self, size: int = 2, options: dict = None):
        self.size = max(1, size)
        self._queue = queue.Queue(maxsize=self.size)
        self._drivers = []
        self._lock = threading.Lock()

    def start(self):
        # Initialize chrome instances with container-friendly flags
        chrome_bin = os.environ.get("CHROME_BIN", "/usr/bin/chromium")
        # ensure a chromedriver matching a local or downloaded chromium is available
        try:
            driver_path = ChromeDriverManager().install()
            print(f"webdriver-manager installed chromedriver: {driver_path}")
        except Exception as e:
            driver_path = '/usr/bin/chromedriver'
            print(f"webdriver-manager failed, falling back to {driver_path}: {e}")
        # debug versions if available
        try:
            ver = subprocess.check_output([chrome_bin, "--version"]).decode().strip()
            print(f"Chrome binary: {ver}")
        except Exception:
            pass
        try:
            ver2 = subprocess.check_output([driver_path, "--version"]).decode().strip()
            print(f"Chromedriver: {ver2}")
        except Exception:
            pass
        for i in range(self.size):
            try:
                opts = uc.ChromeOptions()
                opts.add_argument("--headless=new")
                opts.add_argument("--no-sandbox")
                opts.add_argument("--disable-dev-shm-usage")
                opts.add_argument("--disable-gpu")
                opts.add_argument("--disable-extensions")
                opts.add_argument(f"--user-data-dir=/tmp/udc_profile_{i}")
                try:
                    drv = uc.Chrome(options=opts, browser_executable_path=chrome_bin)
                except Exception:
                    # fallback to selenium-backed driver if uc fails to start
                    try:
                        chrome_opts = ChromeOptions()
                        chrome_opts.binary_location = chrome_bin
                        chrome_opts.add_argument("--headless=new")
                        chrome_opts.add_argument("--no-sandbox")
                        chrome_opts.add_argument("--disable-dev-shm-usage")
                        chrome_opts.add_argument("--disable-gpu")
                        chrome_opts.add_argument(f"--user-data-dir=/tmp/udc_profile_{i}")
                        service = ChromeService(driver_path)
                        drv = webdriver.Chrome(service=service, options=chrome_opts)
                    except Exception as e2:
                        raise e2

                # small warm-up pause
                time.sleep(0.5)
                self._drivers.append(drv)
                self._queue.put(drv)
            except Exception as e:
                print(f"Failed to start Chrome driver #{i}: {e}")

    def get(self, timeout: int = 30):
        try:
            return self._queue.get(timeout=timeout)
        except queue.Empty:
            return None

    def put(self, drv):
        try:
            self._queue.put_nowait(drv)
        except queue.Full:
            try:
                drv.quit()
            except Exception:
                pass

    def shutdown(self):
        with self._lock:
            while not self._queue.empty():
                try:
                    d = self._queue.get_nowait()
                    d.quit()
                except Exception:
                    pass
            for d in self._drivers:
                try:
                    d.quit()
                except Exception:
                    pass


app = FastAPI(title="DNS Parser API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Global pool instance (initialized at startup)
POOL: ChromePool = None


@app.on_event("startup")
def startup_event():
    global POOL
    pool_size = int(os.environ.get("CHROME_POOL_SIZE", "2"))
    POOL = ChromePool(size=pool_size)
    print(f"Starting Chrome pool with size={pool_size}")
    POOL.start()


@app.on_event("shutdown")
def shutdown_event():
    global POOL
    if POOL:
        print("Shutting down Chrome pool")
        POOL.shutdown()


@app.post("/parse")
def parse_urls(payload: UrlsModel):
    global POOL
    if POOL is None:
        raise HTTPException(status_code=503, detail="Chrome pool not initialized")

    driver = POOL.get(timeout=20)
    if driver is None:
        # Fallback: use Playwright to fetch pages and parse HTML directly
        try:
            results = []
            with sync_playwright() as p:
                browser = p.chromium.launch(headless=True)
                page = browser.new_page()
                for url in payload.urls:
                    try:
                        page.goto(url, timeout=60000)
                        html = page.content()
                        parsed = dns.parse_characteristics_html(html, url)
                        results.append(parsed)
                    except Exception as e:
                        results.append({"url": url, "error": str(e)})
                browser.close()
            return {"count": len(results), "results": results, "source": "playwright"}
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"No available Chrome drivers and Playwright failed: {e}")

    results = []
    try:
        for url in payload.urls:
            try:
                parsed = dns.parse_characteristics_page(driver, url)
                results.append(parsed)
            except Exception as e:
                results.append({"url": url, "error": str(e)})
    finally:
        # Return driver to pool
        POOL.put(driver)

    return {"count": len(results), "results": results}


@app.get("/health")
def health():
    global POOL
    ok = POOL is not None and POOL._queue is not None
    return {"status": "ok" if ok else "starting", "pool_size": POOL.size if POOL else 0}
