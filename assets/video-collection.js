/*
  Shoppable video cards.

  The markup ships a poster image only; the <video> lives in a <template> and is
  instantiated the first time the card scrolls into view. Nothing downloads for
  cards the visitor never reaches.
*/
class ShoppableVideo extends HTMLElement {
  connectedCallback() {
    if (this.observer) return;

    this.template = this.querySelector('template');
    if (!this.template) return;

    this.card = this.closest('.video-collection__card');
    this.autoplay = this.dataset.autoplay === 'true' && !ShoppableVideo.prefersReducedMotion();

    // Wired once here, not in load() — the button must respond on the first click
    // whether or not the clip has been instantiated yet.
    this.toggle = this.card && this.card.querySelector('.video-collection__sound');
    if (this.toggle) this.toggle.addEventListener('click', this.onToggleSound.bind(this));

    if (this.autoplay) {
      this.observer = new IntersectionObserver(this.onIntersect.bind(this), { threshold: 0.5 });
      this.observer.observe(this);
    } else {
      // Click-to-play runs off its own button, never off the card, so that a click
      // on the card means one thing only.
      this.playButton = this.card && this.card.querySelector('.video-collection__play');
      if (this.playButton) this.playButton.addEventListener('click', this.onPlayClick.bind(this));
    }
  }

  disconnectedCallback() {
    if (this.observer) this.observer.disconnect();
    this.observer = null;
  }

  static prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Audio is a single channel: several clips playing at once would just talk over
  // each other, so anything already audible is silenced first.
  static muteAll(except) {
    document.querySelectorAll('shoppable-video').forEach((clip) => {
      if (clip !== except && typeof clip.mute === 'function') clip.mute();
    });
  }

  onIntersect(entries) {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        this.load();
        this.play();
      } else {
        this.pause();
      }
    });
  }

  onPlayClick(event) {
    // The button sits inside the card's link — never navigate from it.
    event.preventDefault();
    event.stopPropagation();
    if (this.video && !this.video.paused) {
      this.pause();
      return;
    }
    this.load();
    this.play();
  }

  load() {
    if (this.video) return;

    this.appendChild(this.template.content.firstElementChild.cloneNode(true));
    this.video = this.querySelector('video');
    if (!this.video) return;

    this.video.playsInline = true;
    // Autoplaying clips stay silent and looping; a clip the visitor opened
    // deliberately gets sound. Native controls stay off in both modes — the
    // card's own play/pause and sound buttons are the only controls.
    this.video.muted = this.autoplay;
    this.video.loop = this.autoplay;
    this.video.controls = false;
    // The card class follows real playback: the end of a non-looping clip
    // pauses the video without going through pause().
    this.video.addEventListener('play', () => this.syncPlayingState(true));
    this.video.addEventListener('pause', () => this.syncPlayingState(false));
    this.syncSoundState();
  }

  onToggleSound(event) {
    // The card is a link — never navigate when the visitor only wants sound.
    event.preventDefault();
    event.stopPropagation();
    if (!this.video) return;
    if (this.video.muted) ShoppableVideo.muteAll(this);
    this.video.muted = !this.video.muted;
    this.syncSoundState();
  }

  syncSoundState() {
    if (!this.toggle || !this.video) return;
    this.toggle.setAttribute('aria-pressed', String(!this.video.muted));
  }

  syncPlayingState(playing) {
    if (this.card) this.card.classList.toggle('is-playing', playing);
    if (this.playButton) this.playButton.setAttribute('aria-pressed', String(playing));
  }

  /*
    Used when the quick view takes over the screen. Silencing rather than pausing
    is deliberate: the observer only reacts to intersection *changes*, and the card
    never leaves the viewport while the modal is open, so a paused clip would have
    nothing to restart it once the modal closes.
  */
  mute() {
    if (!this.video || this.video.muted) return;
    this.video.muted = true;
    this.syncSoundState();
  }

  play() {
    if (!this.video) return;
    const played = this.video.play();
    if (played && typeof played.catch === 'function') {
      // Autoplay can still be refused (Low Power Mode); the poster just stays put.
      played.catch(() => this.card && this.card.classList.remove('is-playing'));
    }
    if (this.card) this.card.classList.add('is-playing');
  }

  pause() {
    if (!this.video) return;
    this.video.pause();
    if (this.card) this.card.classList.remove('is-playing');
  }
}

if (!customElements.get('shoppable-video')) {
  customElements.define('shoppable-video', ShoppableVideo);
}

/*
  Cards stay real links so that crawlers, middle-click and "open in new tab" all
  keep working; a plain left click is upgraded to the theme's quick view, which
  keeps the visitor inside the row instead of sending them to the product page.
*/
function onShoppableCardClick(event) {
  const card = event.currentTarget;

  // Anything the browser would treat as "open elsewhere" is left alone.
  if (event.defaultPrevented || event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const wrapper = card.closest('.card-wrapper');
  const drawer = wrapper && wrapper.querySelector('quick-view-drawer');
  const summary = drawer && drawer.querySelector('summary');
  // No drawer means quick view never rendered — fall through to navigation.
  if (!summary) return;

  event.preventDefault();

  // Every clip, not just this card's — the audible one may be a different card.
  ShoppableVideo.muteAll();

  summary.click();
  document.dispatchEvent(
    new CustomEvent('quickview:open', { detail: { productUrl: card.getAttribute('href') } })
  );
}

function initShoppableCards(root) {
  (root || document).querySelectorAll('.video-collection__card[data-quick-view="true"]').forEach((card) => {
    if (card.dataset.quickViewBound) return;
    card.dataset.quickViewBound = 'true';
    card.addEventListener('click', onShoppableCardClick);
  });
}

initShoppableCards();
document.addEventListener('shopify:section:load', (event) => initShoppableCards(event.target));
