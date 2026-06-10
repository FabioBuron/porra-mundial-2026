// =============================================================================
// La Porra del Mundial — Music Player & World Cup Ambient
// =============================================================================
// Encapsulates all background music playback, states, and the welcome overlay.
// Uses local static M4A files for high performance and ad-free playback.
// =============================================================================

const PorraMusic = (() => {
  "use strict";

  const PLAYLIST_TRACKS = [
    { id: "waka_waka_es", title: "Shakira - Waka Waka (Español)" },
    { id: "gol", title: "Cali y El Dandee - Gol" },
    { id: "wavin_flag_es", title: "K'NAAN ft. Bisbal - Wavin' Flag" },
    { id: "waka_waka_en", title: "Shakira - Waka Waka (English)" },
    { id: "wavin_flag_en", title: "K'NAAN - Wavin' Flag (English)" },
    { id: "la_copa_de_la_vida", title: "Ricky Martin - La Copa de la Vida" },
    { id: "we_are_one", title: "Pitbull ft. J.Lo - We Are One" },
    { id: "la_la_la", title: "Shakira - La La La (Brazil 2014)" },
    { id: "colors", title: "Jason Derulo - Colors" },
    { id: "curacao", title: "¿Dónde está Curazao? (Línea de Cal)" },
    { id: "magalenha", title: "Sergio Mendes - Magalenha (Brasil)" }
  ];

  let _audio = null;
  let _isMuted = false;
  let _saveInterval = null;
  let _consecutiveErrors = 0;
  let _shuffledPlaylist = [];
  let _currentTrackIndex = 0;
  let _lastSavedSecond = -1;

  function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // CSS injection to keep style.css clean and this module self-contained
  function injectStyles() {
    const css = `
      /* --- Music Player Container --- */
      .porra-music-container {
        position: fixed;
        bottom: 24px;
        left: 24px;
        z-index: 9999;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        background: rgba(18, 25, 41, 0.85);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid var(--color-border, #1e2a3a);
        border-radius: 9999px;
        box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.35));
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        font-family: var(--font-family, sans-serif);
      }

      .porra-music-container:hover {
        border-color: var(--color-green, #22c55e);
        box-shadow: var(--shadow-glow-green, 0 0 20px rgba(34, 197, 94, 0.35));
      }

      /* Indicator/Resume notification bubble */
      .porra-music-bubble {
        position: absolute;
        bottom: 50px;
        left: 0;
        background: var(--color-gold, #f59e0b);
        color: #000;
        font-size: 11px;
        font-weight: bold;
        padding: 4px 8px;
        border-radius: 4px;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transform: translateY(5px);
        transition: all 0.3s ease;
        box-shadow: var(--shadow-sm);
      }

      .porra-music-bubble--visible {
        opacity: 1;
        transform: translateY(0);
      }

      /* --- Equalizer Visualizer --- */
      .music-equalizer {
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 16px;
        width: 14px;
        margin-left: 2px;
      }

      .eq-bar {
        width: 2px;
        height: 3px;
        background-color: var(--color-green, #22c55e);
        border-radius: 1px;
        transition: height 0.15s ease;
      }

      .porra-music-container--playing .eq-bar:nth-child(1) { animation: eqAnimation 0.8s ease-in-out infinite alternate; }
      .porra-music-container--playing .eq-bar:nth-child(2) { animation: eqAnimation 1.2s ease-in-out infinite alternate 0.25s; }
      .porra-music-container--playing .eq-bar:nth-child(3) { animation: eqAnimation 1.0s ease-in-out infinite alternate 0.4s; }
      .porra-music-container--playing .eq-bar:nth-child(4) { animation: eqAnimation 0.7s ease-in-out infinite alternate 0.1s; }

      @keyframes eqAnimation {
        0% { height: 3px; }
        100% { height: 16px; }
      }

      /* --- Spinning Soccer Ball --- */
      .music-disc-wrapper {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        background: var(--color-surface-alt, #1a2332);
        font-size: 18px;
        box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.3));
        cursor: pointer;
        user-select: none;
        transition: transform 0.2s ease;
      }

      .music-disc-wrapper:hover {
        transform: scale(1.08);
      }

      .music-disc {
        display: inline-block;
      }

      .porra-music-container--playing .music-disc {
        animation: spin 5s linear infinite;
      }

      @keyframes spin {
        100% { transform: rotate(360deg); }
      }

      /* --- Controls Pill --- */
      .music-controls {
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 0;
        overflow: hidden;
        opacity: 0;
        transition: max-width 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease;
      }

      .porra-music-container:hover .music-controls,
      .porra-music-container--expanded .music-controls {
        max-width: 280px;
        opacity: 1;
      }

      .music-track-info {
        display: flex;
        flex-direction: column;
        white-space: nowrap;
        max-width: 120px;
        overflow: hidden;
      }

      .music-track-label {
        font-size: 9px;
        font-weight: 700;
        color: var(--color-green, #22c55e);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 1px;
      }

      .music-track-title {
        font-size: 11px;
        font-weight: 600;
        color: var(--color-text, #e2e8f0);
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
      }

      .music-btn-group {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .music-btn {
        background: none;
        border: none;
        font-size: 12px;
        color: var(--color-text-secondary, #94a3b8);
        padding: 4px 6px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
      }

      .music-btn:hover {
        color: var(--color-text, #e2e8f0);
        background-color: rgba(255, 255, 255, 0.08);
        transform: scale(1.15);
      }

      .music-btn:active {
        transform: scale(0.95);
      }

      /* --- Welcome/Ambient Intro Overlay --- */
      .music-welcome-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: 10000;
        background: radial-gradient(circle at center, rgba(10, 14, 23, 0.98) 0%, rgba(5, 8, 14, 0.99) 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 1;
        transition: opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1);
      }

      .music-welcome-content {
        max-width: 460px;
        width: 90%;
        padding: 40px var(--space-6, 24px);
        background: rgba(18, 25, 41, 0.65);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid var(--color-border, #1e2a3a);
        border-radius: var(--radius-xl, 16px);
        box-shadow: 0 12px 32px rgba(0,0,0,0.6);
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        animation: welcomeScaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes welcomeScaleIn {
        0% { transform: scale(0.85); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
      }

      .music-welcome-emoji {
        font-size: 4.5rem;
        margin-bottom: 12px;
        animation: footballBounce 2.5s infinite ease-in-out;
        display: inline-block;
        filter: drop-shadow(0 0 15px rgba(255,255,255,0.1));
      }

      @keyframes footballBounce {
        0%, 100% { transform: translateY(0) rotate(0deg); }
        50% { transform: translateY(-16px) rotate(180deg); }
      }

      .music-welcome-title {
        font-size: 20px;
        font-weight: 800;
        color: var(--color-gold, #f59e0b);
        margin-bottom: 8px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        text-shadow: 0 0 12px rgba(245, 158, 11, 0.25);
      }

      .music-welcome-subtitle {
        font-size: var(--font-base, 15px);
        color: var(--color-text, #e2e8f0);
        font-weight: 500;
        margin-bottom: 12px;
      }

      .music-welcome-desc {
        font-size: 13px;
        color: var(--color-text-secondary, #94a3b8);
        line-height: 1.6;
        margin-bottom: 30px;
      }

      .music-welcome-buttons {
        display: flex;
        flex-direction: column;
        gap: 12px;
        width: 100%;
      }

      .music-welcome-btn-play {
        background: var(--color-green, #22c55e);
        color: #05080e;
        font-size: 14px;
        font-weight: 750;
        border: none;
        padding: 14px 28px;
        border-radius: 9999px;
        cursor: pointer;
        box-shadow: var(--shadow-glow-green, 0 0 20px rgba(34, 197, 94, 0.35));
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
      }

      .music-welcome-btn-play:hover {
        background: #4ade80;
        transform: translateY(-2px);
        box-shadow: 0 0 28px rgba(34, 197, 94, 0.55);
      }

      .music-welcome-btn-play:active {
        transform: translateY(0);
      }

      .music-welcome-btn-silent {
        background: transparent;
        color: var(--color-text-secondary, #94a3b8);
        font-size: 13px;
        font-weight: 600;
        border: 1px solid var(--color-border, #1e2a3a);
        padding: 12px 28px;
        border-radius: 9999px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .music-welcome-btn-silent:hover {
        color: var(--color-text, #e2e8f0);
        border-color: var(--color-text-secondary, #94a3b8);
        background-color: rgba(255, 255, 255, 0.05);
      }

      /* Mobile responsiveness */
      @media (max-width: 768px) {
        .porra-music-container {
          bottom: 16px;
          left: 16px;
          padding: 6px 10px;
        }
        .music-disc-wrapper {
          width: 28px;
          height: 28px;
          font-size: 15px;
        }
        .music-controls {
          gap: 8px;
        }
        .music-track-info {
          max-width: 90px;
        }
        .music-btn {
          font-size: 11px;
          padding: 4px;
        }
        .music-welcome-content {
          padding: 30px var(--space-4, 16px);
        }
        .music-welcome-emoji {
          font-size: 3.5rem;
        }
      }
    `;

    const styleEl = document.createElement("style");
    styleEl.innerHTML = css;
    document.head.appendChild(styleEl);
  }

  // Create Player elements
  function createPlayerUI() {
    // Floating Controller Widget
    if (!document.getElementById("porra-music-container")) {
      const container = document.createElement("div");
      container.id = "porra-music-container";
      container.className = "porra-music-container";
      container.innerHTML = `
        <div class="porra-music-bubble" id="porra-music-bubble">🎵 Haz clic para activar música</div>
        <div class="music-equalizer">
          <div class="eq-bar"></div>
          <div class="eq-bar"></div>
          <div class="eq-bar"></div>
          <div class="eq-bar"></div>
        </div>
        <div class="music-disc-wrapper" id="music-btn-disc">
          <span class="music-disc">⚽</span>
        </div>
        <div class="music-controls" id="music-controls">
          <div class="music-track-info">
            <span class="music-track-label">Ambientación</span>
            <span class="music-track-title" id="music-track-title">Cargando himnos...</span>
          </div>
          <div class="music-btn-group">
            <button id="music-btn-prev" class="music-btn" title="Anterior">⏮️</button>
            <button id="music-btn-play" class="music-btn" title="Reproducir">▶️</button>
            <button id="music-btn-next" class="music-btn" title="Siguiente">⏭️</button>
            <button id="music-btn-mute" class="music-btn" title="Silenciar">🔊</button>
          </div>
        </div>
      `;
      document.body.appendChild(container);
      
      // Setup listeners for controller
      document.getElementById("music-btn-disc").addEventListener("click", () => {
        container.classList.toggle("porra-music-container--expanded");
      });

      document.getElementById("music-btn-play").addEventListener("click", togglePlay);
      document.getElementById("music-btn-next").addEventListener("click", playNext);
      document.getElementById("music-btn-prev").addEventListener("click", playPrev);
      document.getElementById("music-btn-mute").addEventListener("click", toggleMute);
    }

    // Welcome Screen Overlay
    const introSeen = sessionStorage.getItem("porra_intro_seen");
    if (!introSeen) {
      const overlay = document.createElement("div");
      overlay.id = "music-welcome-overlay";
      overlay.className = "music-welcome-overlay";
      overlay.innerHTML = `
        <div class="music-welcome-content">
          <span class="music-welcome-emoji">⚽</span>
          <h1 class="music-welcome-title">🏆 La Porra del Mundial 2026</h1>
          <h2 class="music-welcome-subtitle">¡Bienvenido al juego de los 8 amigos!</h2>
          <p class="music-welcome-desc">
            Siente el ambiente del torneo con la playlist de himnos históricos del mundial (Waka Waka, Wavin' Flag, La Copa de la Vida y más).
          </p>
          <div class="music-welcome-buttons" style="display:flex; gap:16px; justify-content:center; flex-wrap:wrap;">
            <button id="music-welcome-play" class="music-welcome-btn-play">
              ⚽ ENTRAR A LA PORRA
            </button>
            <button id="music-welcome-silent" class="music-welcome-btn-silent">
              🔇 ENTRAR SIN MÚSICA
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const playBtn = document.getElementById("music-welcome-play");
      const silentBtn = document.getElementById("music-welcome-silent");

      playBtn.addEventListener("click", () => {
        playBtn.style.pointerEvents = "none";
        if (silentBtn) silentBtn.style.pointerEvents = "none";
        closeWelcomeOverlay(true);
      });

      silentBtn.addEventListener("click", () => {
        playBtn.style.pointerEvents = "none";
        if (silentBtn) silentBtn.style.pointerEvents = "none";
        closeWelcomeOverlay(false);
      });
    }
  }

  // Closes welcome screen and starts player if requested
  function closeWelcomeOverlay(startMusic) {
    const overlay = document.getElementById("music-welcome-overlay");
    if (overlay) {
      overlay.style.opacity = "0";
      setTimeout(() => {
        overlay.remove();
      }, 600);
    }
    sessionStorage.setItem("porra_intro_seen", "true");

    // Lanzar fuegos artificiales al entrar por primera vez
    launchFireworks();

    if (startMusic) {
      localStorage.setItem("porra_music_playing", "true");
      if (_audio) {
        _audio.play().catch(e => {
          console.error("Error starting music playback:", e);
        });
      }
    } else {
      localStorage.setItem("porra_music_playing", "false");
    }
  }

  let _fireworksRetryCount = 0;
  function launchFireworks() {
    if (typeof window.confetti === "undefined") {
      if (_fireworksRetryCount < 25) { // Max 5 seconds
        _fireworksRetryCount++;
        setTimeout(launchFireworks, 200);
      }
      return;
    }
    _fireworksRetryCount = 0;
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10001 };

    function randomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      window.confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
      window.confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);
  }

  // Initialize native HTML5 Audio player
  function initAudioPlayer() {
    const wasPlaying = localStorage.getItem("porra_music_playing") === "true";
    const savedTrackId = localStorage.getItem("porra_music_track_id");
    const savedTime = localStorage.getItem("porra_music_time");
    const savedMute = localStorage.getItem("porra_music_muted") === "true";

    _isMuted = savedMute;

    if (savedTrackId) {
      const idx = _shuffledPlaylist.findIndex(t => t.id === savedTrackId);
      if (idx !== -1) {
        _currentTrackIndex = idx;
      }
    }

    _audio = new Audio();
    window._audio = _audio;
    _audio.volume = 0.5;

    if (_isMuted) {
      _audio.muted = true;
      updateMuteUI(true);
    }

    // Audio events
    _audio.addEventListener("play", () => {
      const container = document.getElementById("porra-music-container");
      const playBtn = document.getElementById("music-btn-play");
      if (container) container.classList.add("porra-music-container--playing");
      if (playBtn) {
        playBtn.textContent = "⏸️";
        playBtn.title = "Pausar";
      }
      localStorage.setItem("porra_music_playing", "true");
      showResumeBubble(false);
      updateTrackInfo();
      _consecutiveErrors = 0;
    });

    _audio.addEventListener("pause", () => {
      const container = document.getElementById("porra-music-container");
      const playBtn = document.getElementById("music-btn-play");
      if (container) container.classList.remove("porra-music-container--playing");
      if (playBtn) {
        playBtn.textContent = "▶️";
        playBtn.title = "Reproducir";
      }
      localStorage.setItem("porra_music_playing", "false");
    });

    _audio.addEventListener("ended", () => {
      playNext();
    });

    _audio.addEventListener("error", (e) => {
      console.error("Audio playback error on track: " + _shuffledPlaylist[_currentTrackIndex].id, e);
      _consecutiveErrors++;
      if (_consecutiveErrors < _shuffledPlaylist.length) {
        playNext();
      } else {
        const trackTitle = document.getElementById("music-track-title");
        if (trackTitle) {
          trackTitle.textContent = "Error de reproducción";
        }
      }
    });

    // Load initial track
    loadTrack(_shuffledPlaylist[_currentTrackIndex], parseFloat(savedTime) || 0, wasPlaying);

    startStateSaving();
  }

  function loadTrack(track, startTime = 0, autoPlay = false) {
    if (!_audio) return;
    
    // Resolve relative path for GitHub Pages or local development
    const pathPrefix = window.location.pathname.includes("porra-mundial-2026") ? "/porra-mundial-2026/" : "/";
    _audio.src = pathPrefix + "music/" + track.id + ".m4a";
    _audio.load();

    // Si es la canción de Curazao y se inicia desde el principio, saltar los primeros 20 segundos
    let actualStartTime = startTime;
    if (track.id === "curacao" && startTime === 0) {
      actualStartTime = 20;
    }

    if (actualStartTime > 0) {
      _audio.currentTime = actualStartTime;
    }

    updateTrackInfo();

    const hasIntroSeen = sessionStorage.getItem("porra_intro_seen") === "true";
    if (autoPlay && hasIntroSeen) {
      _audio.play().catch(() => {
        showResumeBubble(true);
      });
    }
  }

  function updateTrackInfo() {
    const trackTitle = document.getElementById("music-track-title");
    if (trackTitle) {
      const track = _shuffledPlaylist[_currentTrackIndex];
      trackTitle.textContent = track ? track.title : "Cargando...";
    }
  }

  function showResumeBubble(show) {
    const bubble = document.getElementById("porra-music-bubble");
    if (!bubble) return;
    if (show) {
      bubble.classList.add("porra-music-bubble--visible");
      const resumeHandler = (e) => {
        if (e && e.target.closest("#porra-music-container")) return;
        if (_audio && _audio.paused) {
          _audio.play().catch(() => {});
        }
        bubble.classList.remove("porra-music-bubble--visible");
        window.removeEventListener("click", resumeHandler);
      };
      window.addEventListener("click", resumeHandler);
    } else {
      bubble.classList.remove("porra-music-bubble--visible");
    }
  }

  function togglePlay() {
    if (!_audio) return;
    if (_audio.paused) {
      _audio.play().catch(() => {});
    } else {
      _audio.pause();
    }
  }

  function playNext() {
    if (!_audio) return;
    _currentTrackIndex = (_currentTrackIndex + 1) % _shuffledPlaylist.length;
    loadTrack(_shuffledPlaylist[_currentTrackIndex], 0, true);
  }

  function playPrev() {
    if (!_audio) return;
    _currentTrackIndex = (_currentTrackIndex - 1 + _shuffledPlaylist.length) % _shuffledPlaylist.length;
    loadTrack(_shuffledPlaylist[_currentTrackIndex], 0, true);
  }

  function toggleMute() {
    if (!_audio) return;
    if (_isMuted) {
      _audio.muted = false;
      _isMuted = false;
      localStorage.setItem("porra_music_muted", "false");
      updateMuteUI(false);
    } else {
      _audio.muted = true;
      _isMuted = true;
      localStorage.setItem("porra_music_muted", "true");
      updateMuteUI(true);
    }
  }

  function updateMuteUI(muted) {
    const muteBtn = document.getElementById("music-btn-mute");
    if (muteBtn) {
      muteBtn.textContent = muted ? "🔇" : "🔊";
      muteBtn.title = muted ? "Activar sonido" : "Silenciar";
    }
  }

  // Persistence saving loop
  function startStateSaving() {
    if (_saveInterval) clearInterval(_saveInterval);
    _saveInterval = setInterval(() => {
      if (_audio && !_audio.paused) {
        const time = _audio.currentTime;
        const currentSecond = Math.floor(time);

        if (currentSecond !== _lastSavedSecond) {
          _lastSavedSecond = currentSecond;
          const track = _shuffledPlaylist[_currentTrackIndex];
          if (track) {
            localStorage.setItem("porra_music_track_id", track.id);
          }
          localStorage.setItem("porra_music_time", time.toString());
        }
      }
    }, 500);
  }

  // Initialize
  function init() {
    _shuffledPlaylist = shuffleArray(PLAYLIST_TRACKS);
    injectStyles();
    createPlayerUI();
    initAudioPlayer();

    const startAudioOnInteraction = (e) => {
      if (e && e.target.closest("#porra-music-container")) return;
      const wasPlaying = localStorage.getItem("porra_music_playing") === "true";
      if (wasPlaying && _audio && _audio.paused) {
        _audio.play().catch(() => {});
      }
      window.removeEventListener("click", startAudioOnInteraction);
      window.removeEventListener("touchstart", startAudioOnInteraction);
    };
    window.addEventListener("click", startAudioOnInteraction);
    window.addEventListener("touchstart", startAudioOnInteraction);
  }

  return { init };
})();
