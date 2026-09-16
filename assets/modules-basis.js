class ScrollSnapSlider extends HTMLUListElement {
  constructor() {
    super();
    
    // A section can place its controls outside the slider's own wrapper.
    // data-controls names the container that holds them, so a section carrying
    // several sliders never binds one slider to another's buttons.
    const controls = (this.dataset.controls && document.getElementById(this.dataset.controls)) || this.parentNode;

    this.prevButton = controls.querySelector(".slider-buttons .slider-button--prev");
    this.nextButton = controls.querySelector(".slider-buttons .slider-button--next");
    this.indicators = controls.querySelectorAll(".indicator");
    this.currentIndicator = controls.querySelector(".indicator .current-indicator");
    this.isAutoplay = (this.dataset.autoplay || "false") === 'true';
    this.isLoop = (this.dataset.loop || "false") === 'true';
    this.isDraggable = (this.dataset.draggable || "false") === 'true';
    this.autoplayInterval = this.dataset.autoplayInterval ? this.dataset.autoplayInterval : 3000;

    theme.initWhenVisible({
      element: this,
      callback: this.init.bind(this),
      threshold: 200
    });
  }

  async init() {
    const { ScrollSnapSlider, ScrollSnapDraggable, ScrollSnapAutoplay, ScrollSnapLoop } = await import('mdl-scrollsnap');

    const sliderElement = this;
    const sliderSimple = new ScrollSnapSlider({ element: this });
    const draggablePlugin = new ScrollSnapDraggable(70);
    const autoplayPlugin = new ScrollSnapAutoplay(this.autoplayInterval);
    const loopPlugin = new ScrollSnapLoop();
    
    this.slider = sliderSimple;

    draggablePlugin.slider = sliderSimple;
    autoplayPlugin.slider = sliderSimple;
    loopPlugin.slider = sliderSimple;

    this.prevButton?.addEventListener("click", () => {
      autoplayPlugin.disableTemporarily();
      sliderSimple.slideTo(sliderSimple.slide - 1);
    });
    this.nextButton?.addEventListener("click", () => {
      autoplayPlugin.disableTemporarily();
      sliderSimple.slideTo(sliderSimple.slide + 1);
    });

    for (const indicator of this.indicators) {
      indicator.addEventListener("click", function () {
        autoplayPlugin.disableTemporarily();
        const slideElementIndex = Array.prototype.slice.call(sliderElement.children).findIndex(item => item.dataset.index === indicator.dataset.index);
        sliderSimple.slideTo(slideElementIndex);
      });
    }

    this.slider.addEventListener("slide-stop", (e) => {
      this.updateSlideState(e);
      this.updateIndicator(e);
    });

    const syncButtonState = () => {
      this.prevButton?.removeAttribute('disabled');
      this.nextButton?.removeAttribute('disabled');
      if (sliderSimple.firstItemInView) {
        this.prevButton?.setAttribute('disabled', 'disabled');
      }
      if (sliderSimple.lastItemInView) {
        this.nextButton?.setAttribute('disabled', 'disabled');
      }
    };

    if (!this.isLoop || this.isDraggable) {
      this.slider.addEventListener("slide-stop", syncButtonState);

      // A row short enough to fit never scrolls, so slide-stop never fires and
      // Next keeps the enabled state it was rendered with — it invites a click
      // that can do nothing. Settle the buttons once the first measurement is
      // in; a frame is needed because the slide size is measured in one.
      requestAnimationFrame(() => {
        sliderSimple.update();
        syncButtonState();
      });
    }

    if (this.isAutoplay) {
      this.enablePlugin(autoplayPlugin);
    }

    if (this.isLoop) {
      this.enablePlugin(loopPlugin);
    }

    if (this.isDraggable) {
      this.enablePlugin(draggablePlugin);
      if (this.isLoop) {
        this.disablePlugin(loopPlugin);
      }
      return;
    }
    this.disablePlugin(draggablePlugin);
  }

  slideTo(index) {
    this.slider.slideTo(index);
  }

  enablePlugin(plugin) {
    plugin.enable();
    this.slider.plugins.set(plugin.id, plugin);
  }

  disablePlugin(plugin) {
    plugin.disable();
    this.slider.plugins.delete(plugin.id);
  }

  updateSlideState(event) {
    const children = event.target.children; 
      if (!children || event.detail < 0 || event.detail >= children.length) {
        return; 
      }
      for (let child of children) {
        child.classList.remove('-active');
      }
      children[event.detail].classList.add('-active');
  }

  updateIndicator(event) {
    const slideElementIndex = event.detail;
    const slideElement = event.target.children[slideElementIndex];

    for (const indicator of this.indicators) {
      const isActive = indicator.classList.toggle(
      "-active",
      indicator.dataset.index === slideElement.dataset.index);
  
      if (isActive) {
        indicator.appendChild(this.currentIndicator);
      }
    }
  }
}
customElements.define('scroll-snap-slider', ScrollSnapSlider, { extends: 'ul' });