# SPEC — best-flight-game-20261126-0057: "Ridgeline: Merapi Ridge Run"

- Kompetisi: best-flight-game-20261126-0057, $500, 50 paid places (#1 $100 … #50 $3)
- Deadline entry: 28 Nov 2026 00:57 UTC (07:57 WIB). Blind round 1 cutoff: 26 Nov 12:57 UTC (19:57 WIB).
- Judge: pairwise AI atas contact sheet screenshot + outline source. Kriteria (urut penting):
  1. Game flight lengkap TERLIHAT di screenshot: chase/cockpit view, terrain recognisable, aircraft in frame, instrumen menyala, runway/ring di depan, HUD ALT/SPD/HDG.
  2. Fun/depth: throttle + turn discipline, misi dengan goal beda, fuel/damage bikin keputusan.
  3. Feel/polish: kontrol responsif, kamera tidak melawan pilot, landing/crash kebaca.
  4. Look/originality: terrain + langit satu gaya, pesawat kelihatan dibangun, instrumen kelihatan diterbangkan. Original, bukan kopi game komersial.
  5. Struktur: source terpisah per file dengan satu job jelas, nama file/fungsi deskriptif.
- Pelajaran leaderboard yang dipakai: densitas > kerapian; tiap klaim dibuktikan 2x; judul/metode spesifik; konsistensi sesi (interval judge lebar = ada sesi rusak).

## Game

Setting original: lembah Merapi (Indonesia) — kerucut vulkan, sawah terasering, sungai, kota kecil, bandara "Adi Ridge Airfield", garis pantai di kejauhan. Pesawat: "Kestrel K-9" bush plane / jet latih fiktif. Semua art digambar kode (vector canvas), semua suara synth WebAudio, tanpa aset eksternal, tanpa network.

### Mode / misi (goal beda-beda, kriteria 2)
1. **Ring Run** — terbang lewat 8 ring berurutan di atas lembah; tiap ring +100, bonus waktu; ring berikutnya ditunjuk panah + beacon.
2. **Ridge Rescue** — 6 gate rendah di celah lembah; bonus +50 kalau lewat di bawah 300 ft AGL.
3. **Runway Landing** — turunkan gear, landing di runway 09 dalam touchdown zone, kecepatan < 120 kt, vertical speed < 500 fpm; skor dari presisi (jarak dari centerline + touchdown point).
- Fuel: terbakar per throttle; throttle penuh + manuver keras = boros. Fuel habis = engine mati, glide darurat.
- Damage: sentuh terrain = crash; hard landing (VS tinggi / gear up) = damage + skor potong; 3x damage = sortie berakhir.
- Skor tampil live di HUD; debrief screen rangkum misi + skor + fuel tersisa + waktu.

### Kontrol
- Keyboard: ↑/↓ pitch, ←/→ roll (bank-to-turn), Shift throttle up, Ctrl throttle down, G gear, B airbrake, P pause, R restart, M mute.
- Mouse: gerakkan mouse = stick (pitch/roll halus); klik = boost sesaat? — tidak, klik = toggle chase/cockpit cam. Scroll = zoom kamera.
- Gamepad tidak didukung (tidak ada di sandbox judge).

### Renderer (Canvas 2D, no library)
- Voxel-style terrain raycast per kolom dari kamera chase (di belakang + di atas pesawat): heightmap 256x256 seeded (mulberry32 + value noise), warna per ketinggian (sawah hijau, hutan, batuan, salju di puncak vulkan), sungai biru, jalan, kota (kotak-kotak), runway (strip abu-abu + marking) digambar sebagai bagian terrain.
- Langit: gradient + matahari + awan billboard + kabut jarak (fog).
- Pesawat: sprite vector digambar di tengah-bawah layar, banking sesuai roll, afterburner glow saat throttle tinggi; bayangan di terrain.
- Ring: torus billboard (elips + tiang) dengan glow; ring aktif berwarna emas, berikutnya abu-abu.
- HUD: strip atas (ALT ft, SPD kt, HDG kompas), artificial horizon, throttle bar, fuel gauge, skor, ring counter, pesan misi, peringatan (STALL / PULL UP / LOW FUEL / GEAR).
- Cockpit frame: tepi bawah kanopi + panel instrumen menyala (glow hijau/amber) — menutupi kriteria "instruments lit" + "cockpit or chase view" sekaligus.

### File (satu job per file — kriteria 5, nama muncul di outline judge)
- `game/index.html` — page + canvas + loading semua src (classic scripts, no network).
- `game/src/config.js` — `GAME_CONFIG`: dunia, performa pesawat, misi, warna, tuning.
- `game/src/random.js` — `mulberry32`, `makeValueNoise`, `seededWorld`.
- `game/src/world.js` — `buildHeightmap`, `heightAt`, `placeRunway`, `placeRings`, `placeTown`, `terrainColor`.
- `game/src/flight.js` — `FlightModel`: `updateFlightModel(state, input, dt)` — throttle, pitch/roll/yaw, lift/stall, fuel, damage, landing check.
- `game/src/missions.js` — `MISSION_DEFS`, `updateMission`, `missionScore`, `nextRingBeacon`.
- `game/src/audio.js` — `AudioEngine`: engine hum, wind, `playRingChime`, `playLandingThud`, `playWarning`.
- `game/src/input.js` — `InputState`: keyboard + mouse, `readControls`.
- `game/src/render.js` — `renderFrame`: sky, `renderTerrain`, `renderRunway`, `renderRings`, `renderAircraft`, `renderCockpit`, `renderHUD`.
- `game/src/shots.js` — `SHOT_POSES`: pose deterministik per `?shot=` untuk screenshot.
- `game/src/main.js` — `GameState`, loop, state machine (title/briefing/flying/paused/landed/crashed/debrief), `bootGame`.
- `main.ts` — Node 22 stdlib only: copy game/ + screenshots/ ke /output, `buildDossier` dari vendor/makefun-game.ts (caps: text 163840, screenshots max 4 / 262144, game_max_files 993, game_max_bytes 50331648, game_path_max_bytes 1000). Deterministik (dua run byte-identik).
- `vendor/makefun-game.ts` — copy kit ini, unchanged.
- `serve.ts` — static server lokal (playtest + screenshot).
- `shots.json` — daftar 4 shot.
- `LICENSE` — MIT (dari kit starter). `README.md` — badge template.

### Screenshot (4, 1280x720 JPEG q~0.82, masing-masing ≤256 KiB, long side ≤1280, short ≥480)
1. `1-cover.jpg` (`?shot=cover`): chase view, Kestrel di frame, ring emas di depan, vulkan + sawah + pantai, HUD lengkap menyala.
2. `2-rings.jpg` (`?shot=rings`): tengah Ring Run, 3 ring terlihat, terasering di bawah, skor naik.
3. `3-runway.jpg` (`?shot=runway`): final approach, runway 09 di depan, gear down, lampu runway menyala.
4. `4-debrief.jpg` (`?shot=debrief`): layar debrief (misi selesai, skor, fuel, waktu) di atas vista senja.

### Verifikasi (sebelum lapor ready-to-submit)
- `node main.ts` 2x dengan MAKEFUN_OUTPUT_DIR berbeda → dossier.json byte-identik.
- Game jalan di headless Chrome (/opt/meta-chromium/chrome + puppeteer-core): 0 console error, 0 network request, tiap `?shot=` render < 2 dtk.
- Screenshot dibaca visual: pesawat + terrain + runway/ring + HUD semua kebaca di ukuran contact-sheet (cover 768x480, lainnya kecil).
- Gate check lokal: file count/size, nama file screenshot, ukuran tiap jpg ≤256 KiB.
- TIDAK submit di sesi ini. Sisa untuk parent/top-level: buat repo GitHub publik (dibuat setelah 26 Nov 00:57Z) + push, bundle transcripts (top-level agent, --muse-usage), submit via kit CLI, pantau blind round 1 (cutoff 19:57 WIB).
