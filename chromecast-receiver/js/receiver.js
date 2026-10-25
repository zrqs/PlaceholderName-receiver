// Firup Cast receiver (Cast Application Framework v3). The phone app (android/…/cast/CastController.kt) loads a
// stream with customData {title, subtitle, poster, startTime}; this page plays it and shows the Firup look around it.
(function () {
  'use strict';

  const context = cast.framework.CastReceiverContext.getInstance();
  const player = context.getPlayerManager();
  const events = cast.framework.events.EventType;

  const $ = (id) => document.getElementById(id);
  const video = $('player');
  const screens = { idle: $('idle'), loading: $('loading'), paused: $('paused'), failed: $('failed') };

  const ui = {
    kicker: $('hud-kicker'),
    iconPause: $('icon-pause'),
    iconPlay: $('icon-play'),
    fill: $('progress-fill'),
    buffered: $('progress-buffered'),
    current: $('time-current'),
    total: $('time-total'),
  };

  // Bind directly to our <video> element so CAF never creates its default UI.
  player.setMediaElement(video);

  // What the sender said about the current stream.
  let details = { title: '', subtitle: '', poster: '' };
  let activeScreen = 'idle';
  let seekHudTimer = null;

  function clearSeekTimer() {
    if (seekHudTimer) {
      clearTimeout(seekHudTimer);
      seekHudTimer = null;
    }
  }

  function show(name) {
    clearSeekTimer();
    activeScreen = name;
    for (const key of Object.keys(screens)) screens[key].hidden = key !== name;
  }

  function setHudMode(isPaused) {
    ui.kicker.textContent = isPaused ? 'Paused' : 'Playing';
    ui.iconPause.hidden = !isPaused;
    ui.iconPlay.hidden = isPaused;
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
  }

  function updateProgress() {
    const cur = Number(player.getCurrentTimeSec()) || video.currentTime || 0;
    const dur = Number(player.getDurationSec()) || video.duration || 0;

    if (dur > 0 && Number.isFinite(dur)) {
      const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
      ui.fill.style.width = `${pct}%`;

      if (video.buffered && video.buffered.length > 0) {
        const bufEnd = video.buffered.end(video.buffered.length - 1);
        const bufPct = Math.min(100, Math.max(0, (bufEnd / dur) * 100));
        ui.buffered.style.width = `${bufPct}%`;
      } else {
        ui.buffered.style.width = '0%';
      }

      const rem = Math.max(0, dur - cur);
      ui.current.textContent = formatTime(cur);
      ui.total.textContent = `-${formatTime(rem)}  ·  ${formatTime(dur)}`;
    } else {
      ui.fill.style.width = '0%';
      ui.buffered.style.width = '0%';
      ui.current.textContent = formatTime(cur);
      ui.total.textContent = 'LIVE';
    }
  }

  function fill(section) {
    section.querySelector('.title').textContent = details.title;
    const sub = section.querySelector('.subtitle');
    sub.textContent = details.subtitle;
    sub.hidden = !details.subtitle;
    const poster = section.querySelector('.poster');
    if (details.poster) poster.src = details.poster; else poster.removeAttribute('src');
  }

  function remember(media) {
    const data = (media && media.customData) || {};
    const meta = (media && media.metadata) || {};
    const image = meta.images && meta.images[0] && meta.images[0].url;
    details = {
      title: data.title || meta.title || '',
      subtitle: data.subtitle || meta.subtitle || '',
      poster: data.poster || image || '',
    };
    fill(screens.loading);
    fill(screens.paused);
  }

  // A new load: remember the titles, show the loading stage, and start where the sender says.
  player.setMessageInterceptor(cast.framework.messages.MessageType.LOAD, (request) => {
    if (!request || !request.media) return request;
    remember(request.media);

    // Sync metadata back to the request so sender notifications stay populated.
    const meta = request.media.metadata || new cast.framework.messages.GenericMediaMetadata();
    meta.title = details.title;
    meta.subtitle = details.subtitle;
    if (details.poster) {
      meta.images = [new cast.framework.messages.Image(details.poster)];
    }
    request.media.metadata = meta;

    const data = request.media.customData || {};
    const start = Number(data.startTime);
    if (request.currentTime == null && Number.isFinite(start) && start > 0) request.currentTime = start;

    ui.fill.style.width = '0%';
    ui.buffered.style.width = '0%';
    show('loading');
    return request;
  });

  player.addEventListener(events.PLAYER_LOAD_COMPLETE, () => {
    updateProgress();
  });

  player.addEventListener(events.PLAYING, () => {
    setHudMode(false);
    updateProgress();
    show('none');
  });

  player.addEventListener(events.PAUSE, () => {
    // Ignore pause events that fire when a stream reaches the end.
    if (video.ended) return;
    setHudMode(true);
    updateProgress();
    show('paused');
  });

  player.addEventListener(events.BUFFERING, (event) => {
    if (event.isBuffering) {
      show('loading');
    } else if (video.paused) {
      setHudMode(true);
      updateProgress();
      show('paused');
    } else {
      show('none');
    }
  });

  // Show the control panel briefly when the user scrubs from their phone while playing.
  player.addEventListener(events.SEEKING, () => {
    updateProgress();
    if (activeScreen !== 'loading') {
      setHudMode(video.paused);
      show('paused');
      if (!video.paused) {
        seekHudTimer = setTimeout(() => {
          if (!video.paused && activeScreen === 'paused') show('none');
        }, 3000);
      }
    }
  });

  player.addEventListener(events.TIME_UPDATE, () => {
    if (activeScreen === 'paused') updateProgress();
  });

  player.addEventListener(events.MEDIA_FINISHED, () => show('idle'));
  player.addEventListener(events.ERROR, () => show('failed'));
  player.addEventListener(events.REQUEST_STOP, () => show('idle'));

  // The last phone left: nothing to play for.
  context.addEventListener(cast.framework.system.EventType.SENDER_DISCONNECTED, () => {
    if (context.getSenders().length === 0) context.stop();
  });

  const options = new cast.framework.CastReceiverOptions();
  // Idle for ten minutes on the logo, and the TV may go back to its home screen.
  options.maxInactivity = 600;
  options.disableIdleTimeout = false;
  options.supportedCommands = cast.framework.messages.Command.ALL_BASIC_MEDIA;

  show('idle');
  context.start(options);
})();
