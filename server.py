import os
import sys
import json
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path

# Load .env variables
ENV_FILE = Path(__file__).resolve().parent / ".env"
config = {
    "GEMINI_API_KEY": "",
    "GEMINI_MODEL": "gemini-4-neon",
    "PORT": 8000
}

if ENV_FILE.exists():
    with open(ENV_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                config[k.strip()] = v.strip().strip("'\"")

# Fallback: check parent directory if key not set
if not config["GEMINI_API_KEY"]:
    parent_env = Path(__file__).resolve().parent.parent / "GEMINI_API_KEY=your_key_here.env"
    if parent_env.exists():
        with open(parent_env, "r", encoding="utf-8") as f:
            config["GEMINI_API_KEY"] = f.read().strip()

FALLBACK_MODELS = [
    config.get("GEMINI_MODEL", "gemini-4-neon"),
    "gemini-3.5-flash-lite",
    "gemini-3.5-flash",
    "gemini-flash-latest"
]

def query_gemini(prompt: str, system_instruction: str = ""):
    api_key = config.get("GEMINI_API_KEY", "")
    if not api_key:
        return {
            "model": "local-fallback",
            "text": "The brass balance settles as cool mist drifts up from the Little Rangeet gorge. Unbruised tender two-leaves-and-a-bud shoots yield the finest muscatel aroma."
        }

    for model_name in FALLBACK_MODELS:
        clean_model = model_name.replace("models/", "")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{clean_model}:generateContent?key={api_key}"
        
        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "temperature": 0.72,
                "maxOutputTokens": 300
            }
        }
        if system_instruction:
            payload["systemInstruction"] = {
                "parts": [{"text": system_instruction}]
            }

        try:
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=12) as response:
                result = json.loads(response.read().decode("utf-8"))
                candidates = result.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts and "text" in parts[0]:
                        return {
                            "model": clean_model,
                            "text": parts[0]["text"].strip()
                        }
        except urllib.error.HTTPError as e:
            # If 429 quota reached on gemini-4-neon, smoothly try next fallback model
            print(f"[Gemini API] Model {clean_model} returned HTTP {e.code}, checking fallback...", file=sys.stderr)
            continue
        except Exception as e:
            print(f"[Gemini API] Model {clean_model} error: {e}", file=sys.stderr)
            continue

    return {
        "model": "archive-ledger",
        "text": "From 150-year-old heritage China-variety bushes at 2,100 metres, fresh shoots climb uphill to the 1854 withering lofts while mist rises from the Little Rangeet gorge."
    }

class HappyValleyHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent aggressive browser caching of script/css files during indie dev
        if self.path.endswith(('.js', '.css', '.html')):
            self.send_header('Cache-Control', 'no-cache, must-revalidate')
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/status":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            resp = {
                "ok": True,
                "model": config.get("GEMINI_MODEL", "gemini-4-neon"),
                "hasKey": bool(config.get("GEMINI_API_KEY"))
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        super().do_GET()

    def do_POST(self):
        if self.path == "/api/gemini/tea-master":
            content_length = int(self.headers.get("Content-Length", 0))
            raw_body = self.rfile.read(content_length) if content_length > 0 else b"{}"
            try:
                body = raw_body.decode("utf-8")
            except UnicodeDecodeError:
                body = raw_body.decode("latin-1", errors="replace")
            try:
                data = json.loads(body)
            except Exception:
                data = {}

            weight = data.get("weight", "0.00")
            purity = data.get("purity", 100)
            grade = data.get("grade", "FTGFOP1")
            crisp = data.get("crispSnaps", 0)
            shoots = data.get("shoots", 0)
            streak = data.get("streak", 0)
            time_of_day = data.get("timeOfDay", "05:40 AM · Kanchenjunga Alpenglow")
            block = data.get("block", "Happy Valley · North Heritage Block")

            system_prompt = (
                "You are the legendary 1854 Head Tea Master & Inspector at Happy Valley Tea Estate in Darjeeling. "
                "You inspect freshly gathered spring First Flush shoots at the Tola Ghar brass balance. "
                "Your tone is poetic, knowledgeable, sensorial, and historical. "
                "Write in 2 to 3 evocative sentences, focusing on leaf tenderness, two-leaves-and-a-bud snap, "
                "muscatel and floral bouquet, morning mist, and the snows of Kanchenjunga."
            )

            user_prompt = (
                f"A plucker has arrived at the weighing scale with this morning harvest:\n"
                f"- Weight: {weight} kg\n"
                f"- Flush Purity: {purity}% (Grade: {grade})\n"
                f"- Crisp Snaps: {crisp}\n"
                f"- Total Shoots: {shoots}\n"
                f"- Rhythm Streak: {streak}x\n"
                f"- Time & Light: {time_of_day}\n"
                f"- Sector: {block}\n\n"
                f"Write your Master Tea Inspector entry for the brass ledger."
            )

            res = query_gemini(user_prompt, system_prompt)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            output = {
                "ok": True,
                "model": res["model"],
                "appraisal": res["text"],
                "grade": grade,
                "purity": purity
            }
            self.wfile.write(json.dumps(output).encode("utf-8"))
            return

        self.send_error(404, "Endpoint not found")

def run(port=None):
    if port is None:
        port = int(config.get("PORT", 8000))
    server_address = ("", port)
    httpd = HTTPServer(server_address, HappyValleyHandler)
    print(f"Happy Valley Darjeeling Server running on http://localhost:{port} (Gemini Model: {config.get('GEMINI_MODEL')})")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()

if __name__ == "__main__":
    p = int(sys.argv[1]) if len(sys.argv) > 1 else int(config.get("PORT", 8000))
    run(p)
