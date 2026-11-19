# First Flush — Happy Valley, Darjeeling (1854)

> *Two leaves and a bud on the steep northern slopes of Darjeeling.*  
> *Pinch the tender spring flush at dawn beneath the golden snows of Mount Kanchenjunga.*

A cinematic 3D indie tea-plucking simulation and atmospheric Himalayan journey set in Happy Valley Tea Estate (Est. 1854) at 2,100 metres elevation.

---

## Features

- **Procedural Himalayan Terrain & Foliage**: Terraced tea slopes, ancient Chinese-variety *Camellia sinensis* bushes with organic noise variations, feathery Albizia shade trees, and mountain prayer flags.
- **Tactile Plucking Mechanics**: Center-reticle pinch-and-snap node timing for *"Do Patti, Ek Kali"* (Two leaves and a bud), with fresh leaf collection and doko basket management.
- **Atmospheric Time-of-Day Lighting**: Dynamic time moods shifting between *Kanchenjunga Alpenglow (05:40 AM)*, *Golden First Flush (07:35 AM)*, *Silver Rangeet Mist (11:15 AM)*, and *Amber Sunset (05:05 PM)*.
- **Volumetric Mountain Fog & Visuals**: Soft valley mist ribbons, layered ground haze, and bloom post-processing.
- **AI Tea Master Appraisal (Gemini 4 Neon)**: Real-time historical ledger evaluation powered by Google Gemini at the Tola Ghar brass weighing scale, analyzing harvest purity, rhythm, weight, and aroma.
- **Soundscape**: Dynamic mountain winds, Himalayan songbirds, gentle stream murmurs, and brass scale bells.

---

## Controls

| Key | Action |
|---|---|
| <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> | Walk along terraces and stone paths |
| <kbd>Hold & Release Left Click</kbd> | Pinch and snap tender tea shoots inside the golden node ring |
| <kbd>F</kbd> | Toss gathered handful into bamboo Doko |
| <kbd>V</kbd> | Toggle 1st Person / 3rd Person camera |
| <kbd>R</kbd> | Rest & Gaze Mode (GPS Himalayan Peak Callouts) |
| <kbd>T</kbd> | Shift Atmospheric Sunlight & Time Moods |
| <kbd>E</kbd> | Weigh harvest at Tola Ghar Brass Balance |
| <kbd>Esc</kbd> / <kbd>P</kbd> | Settings & Controls Menu |

---

## Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/phinix99/happy-valley-darjeeling.git
   cd happy-valley-darjeeling
   ```

2. **Configure environment:**
   Copy `.env.example` to `.env` and insert your Gemini API key:
   ```bash
   cp .env.example .env
   ```

3. **Start the local server:**
   ```bash
   python server.py 8000
   ```

4. **Play:**
   Open [http://localhost:8000](http://localhost:8000) in your web browser.

---

## Tech Stack

- **Three.js** (WebGL 3D Rendering, Instanced Meshes, Custom Shaders, Bloom Post-Processing)
- **Vanilla Modern JS & CSS** (Editorial Himalayan Typography: Playfair Display & Crimson Pro)
- **Python Backend** (`server.py` integrating the Google Gemini API)
