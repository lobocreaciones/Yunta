/**
 * Timeline Component
 * Copyright © RoarTheme
 */
class TimelineComponent extends HTMLElement {
  // ---------- Lifecycle ----------
  constructor() {
    super();

    // Config (data-* with sensible defaults)
    const ds = this.dataset;
    this.animationSpeed = parseInt(ds.animationSpeed || "", 10) || 800;
    this.sectionHeight  = parseInt(ds.height || "", 10) || 500;
    this.showDots       = ds.showDots === "true";
    this.timelineBg     = ds.timelineBg || "#1a1a1a";
    this.contentBg      = ds.contentBg || "#ffffff";
    this.accentColor    = ds.accentColor || "#ff6b35";
    this.dateColor      = ds.dateColor || "#cccccc";
    this.textColor      = ds.textColor || "#ffffff";

    // State
    this.slides = [];
    this.timelineItems = [];
    this.timelineDot = null;
    this.currentSlideIndex = -1;
    this.totalSlides = 0;
    this.windowHeight = 0;
    this.isInViewport = false;

    // Misc
    this._raf = null;           // scroll rAF lock
    this._abort = new AbortController(); // for listeners/observers
    this._resizeObserver = null;
    this._io = null;            // single IntersectionObserver
  }

  connectedCallback() {
    this._init();
  }

  disconnectedCallback() {
    this._cleanup();
  }

  // ---------- Init / Cleanup ----------
  _init() {
    this._setupElements();
    this._applyCustomStyles();
    this._setupObservers();
    this._setupEventListeners();

    this._updateDimensions();
    this._render();
  }

  _cleanup() {
    // Abort all DOM listeners bound with this._abort.signal
    this._abort.abort();

    // Disconnect observers
    this._resizeObserver?.disconnect();
    this._io?.disconnect();

    // Cancel any scheduled frame
    if (this._raf) cancelAnimationFrame(this._raf);
  }

  // ---------- Setup ----------
  _setupElements() {
    this.timelineSection = this.closest(".timeline-section") || this;

    this.slides = Array.from(this.querySelectorAll(".slide"));
    this.timelineItems = Array.from(this.querySelectorAll(".timeline-item"));
    this.timelineDot = this.querySelector(".timeline-dot");
    this.totalSlides = this.slides.length;

    if (this.timelineSection) {
      this.timelineSection.style.height = `${this.sectionHeight}vh`;
    }
  }

  _applyCustomStyles() {
    const timelinePanel = this.querySelector(".timeline-panel");
    const contentPanel  = this.querySelector(".content-panel");

    if (timelinePanel) timelinePanel.style.backgroundColor = this.timelineBg;
    if (contentPanel)  contentPanel.style.backgroundColor = this.contentBg;

    this.querySelectorAll(".source-link").forEach(a => (a.style.color = this.accentColor));

    // CSS custom props
    this.style.setProperty("--timeline-accent-color", this.accentColor);
    this.style.setProperty("--timeline-animation-speed", `${this.animationSpeed}ms`);
    this.style.setProperty("--timeline-date-color", this.dateColor);
    this.style.setProperty("--timeline-text-color", this.textColor);
  }

  _setupObservers() {
    // ResizeObserver to keep windowHeight in sync
    this._resizeObserver = new ResizeObserver(() => this._handleResize());
    this._resizeObserver.observe(document.documentElement);

    // Single IntersectionObserver for:
    // 1) section visibility (activates rendering)
    // 2) lazy image preloading (inside this component)
    this._io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const target = entry.target;

        // Section visibility
        if (target === this.timelineSection) {
          this.isInViewport = entry.isIntersecting;
          if (this.isInViewport) {
            this._render();
          }
          continue;
        }

        // Image preloading
        if (entry.isIntersecting && target.tagName === "IMG") {
          const img = target;
          const src = img.dataset.src;
          if (src) {
            img.src = src;
            img.removeAttribute("data-src");
            img.decoding = "async";
            img.loading = "eager";
          }
          this._io.unobserve(img);
        }
      }
    }, { root: null, rootMargin: "50px", threshold: 0.1 });

    // Observe section
    this._io.observe(this.timelineSection);

    // Observe lazy images within this component
    this.querySelectorAll('img[loading="lazy"]').forEach(img => this._io.observe(img));
  }

  _setupEventListeners() {
    const { signal } = this._abort;

    // Native scrolling is the only driver — wheel, trackpad, touch and
    // programmatic scrolls all land here, and the frame renders from wherever
    // the page actually is. Nothing intercepts the gesture.
    window.addEventListener("scroll", () => this._handleScroll(), { passive: true, signal });
    window.addEventListener("resize", () => this._handleResize(), { passive: true, signal });

    document.addEventListener("keydown", (e) => this._handleKeydown(e), { signal });
  }

  // ---------- Measurements ----------
  _updateDimensions() {
    this.windowHeight = window.innerHeight || document.documentElement.clientHeight;
  }

  // ---------- Rendering ----------
  // Every position is a pure function of scroll progress, written each frame:
  // the section's travel maps onto the gaps between slides, and within a gap
  // the outgoing and incoming pair sit at the exact fraction the scroll is at.
  // Nothing here has a duration — reversing the scroll reverses the motion,
  // stopping mid-gesture freezes it mid-flight, and the pace is the reader's.
  _render() {
    if (!this.totalSlides) return;

    const rect = this.timelineSection.getBoundingClientRect();
    const span = Math.max(1, rect.height - this.windowHeight);
    const progress = this._clamp(-rect.top / span, 0, 1);

    if (this.totalSlides === 1) {
      this._place(this.slides[0], 0, 1);
      this._place(this.timelineItems[0], -50, 1);
      this._setDiscrete(0);
      return;
    }

    const t = progress * (this.totalSlides - 1);
    const i = Math.min(this.totalSlides - 2, Math.floor(t));
    const frac = t - i;

    this.slides.forEach((slide, j) => {
      if (j === i) {
        // Outgoing: drifts up a tenth of its height and fades as the gap runs
        this._place(slide, -10 * frac, 1 - frac);
      } else if (j === i + 1) {
        // Incoming: rises from the bottom edge to rest
        this._place(slide, 100 * (1 - frac), frac);
      } else {
        this._place(slide, j < i ? -10 : 100, 0);
      }
    });

    this.timelineItems.forEach((item, j) => {
      if (j === i) {
        // The centred date leaves downward, mirroring the bar's direction
        this._place(item, -50 + 150 * frac, 1 - frac);
      } else if (j === i + 1) {
        this._place(item, -100 + 50 * frac, frac);
      } else {
        this._place(item, j < i ? 100 : -100, 0);
      }
    });

    this._setDiscrete(Math.round(t));
  }

  _place(el, yPercent, opacity) {
    if (!el) return;
    el.style.transform = `translateY(${yPercent}%)`;
    el.style.opacity = String(opacity);
  }

  // The classes stay discrete on purpose: they carry pointer-events and the
  // dot's accent — state, not motion. The dot keeps its timed transition,
  // which is what the animation speed setting governs.
  _setDiscrete(slideIndex) {
    if (slideIndex === this.currentSlideIndex) return;

    this.currentSlideIndex = slideIndex;

    this.slides.forEach((el, j) => el.classList.toggle("active", j === slideIndex));
    this.timelineItems.forEach((el, j) => el.classList.toggle("active", j === slideIndex));
    this.timelineDot?.classList.add("active");

    // Notify listeners
    this.dispatchEvent(new CustomEvent("slidechange", {
      detail: { slideIndex, totalSlides: this.totalSlides },
      bubbles: true
    }));
  }

  // ---------- Handlers ----------
  _handleScroll() {
    if (!this.isInViewport) return;
    if (this._raf) return; // throttle via rAF

    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._render();
    });
  }

  _handleResize() {
    this._updateDimensions();
    this._render();
  }

  _handleKeydown(e) {
    if (!this.isInViewport) return;

    const idx = this.currentSlideIndex;
    switch (e.key) {
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        if (idx > 0) this.scrollToSlide(idx - 1);
        break;
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        if (idx < this.totalSlides - 1) this.scrollToSlide(idx + 1);
        break;
      case " ":
      case "Spacebar":
        e.preventDefault();
        this.scrollToSlide((idx + 1) % this.totalSlides);
        break;
      default:
        break;
    }
  }

  // ---------- Scrolling ----------
  // Moves the page, not the slides: the scrub renders every intermediate frame
  // of the smooth scroll on its own, so this needs no guard against itself.
  scrollToSlide(slideIndex, behavior = "smooth") {
    if (!this.timelineSection || this.totalSlides <= 1) return;

    const rect = this.timelineSection.getBoundingClientRect();
    const sectionTopAbs = window.scrollY + rect.top; // absolute top
    const span = Math.max(1, rect.height - this.windowHeight);

    const ratio = slideIndex / (this.totalSlides - 1);
    window.scrollTo({ top: sectionTopAbs + span * ratio, behavior });
  }

  // ---------- Public API ----------
  goToSlide(i)      { if (i >= 0 && i < this.totalSlides) this.scrollToSlide(i); }

  // Theme Editor entry point: land on the block's scroll position outright,
  // and the next rendered frame shows that slide settled.
  goToSlideImmediate(i) {
    if (i >= 0 && i < this.totalSlides) {
      this.scrollToSlide(i, "instant");
      this._render();
    }
  }

  nextSlide()       { this.goToSlide(Math.min(this.currentSlideIndex + 1, this.totalSlides - 1)); }
  previousSlide()   { this.goToSlide(Math.max(this.currentSlideIndex - 1, 0)); }
  getCurrentSlide() { return this.currentSlideIndex; }
  getTotalSlides()  { return this.totalSlides; }

  // ---------- Utils ----------
  _clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
}

// Define once
if (!customElements.get("timeline-component")) {
  customElements.define("timeline-component", TimelineComponent);
}
