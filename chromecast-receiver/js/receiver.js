// Firup Cast receiver (Cast Application Framework v3). The phone app (android/…/cast/CastController.kt) loads a
// stream with customData {title, subtitle, poster, startTime}; this page plays it and shows the Firup look around it.
(function () {
  'use strict';

  const context = cast.framework.CastReceiverContext.getInstance();
  const player = context.getPlayerManager();
  const events = cast.framework.events.EventType;

  const $ = (id) => document.getElementById(id);
  const screens = { idle: $('idle'), loading: $('loading'), paused: $('paused'), failed: $('failed') };

  // What the sender said about the current stream.
  let details = { title: '', subtitle: '', poster: '' };

  function show(name) {
    for (const key of Object.keys(screens)) screens[key].hidden = key !== name;
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
    const data = request.media.customData || {};
    const start = Number(data.startTime);
    if (request.currentTime == null && Number.isFinite(start) && start > 0) request.currentTime = start;
    show('loading');
    return request;
  });

  player.addEventListener(events.PLAYER_LOAD_COMPLETE, () => show('none'));
  player.addEventListener(events.PLAYING, () => show('none'));
  player.addEventListener(events.PAUSE, () => {
    // Paused for real, not the pause that comes just before a seek or the end.
    if (player.getPlayerState() === cast.framework.messages.PlayerState.PAUSED) show('paused');
  });
  player.addEventListener(events.BUFFERING, (event) => show(event.isBuffering ? 'loading' : 'none'));
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
