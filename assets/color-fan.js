/*
  Color fan stage.

  One-way latch: once open, the fan stays open — the shades are the section's
  content, not a hover flourish, and the settled fan is the composed state.
  data-fan-trigger picks what opens it on hover-capable pointers: 'view'
  (scroll reveal, hover/focus merely open early) or 'hover' (pointer only).
  Touch screens have no hover, so they always open on view.
*/
if (!customElements.get('color-fan')) {
  customElements.define('color-fan', class ColorFan extends HTMLElement {
    connectedCallback() {
      if (this.bound) return;
      this.bound = true;

      const open = () => {
        this.classList.add('is-open');
        if (this.observer) this.observer.disconnect();
      };

      const hoverCapable = window.matchMedia('(hover: hover)').matches;

      if (hoverCapable) {
        // Hover means the picture itself, not the full-width row around it.
        const hoverTarget = this.querySelector('.color-fan__media') || this;
        hoverTarget.addEventListener('mouseenter', open, { once: true });
        this.addEventListener('focusin', open, { once: true });
        this.setupTooltip();
        if (this.dataset.fanTrigger === 'hover') return;
      }

      this.observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.intersectionRatio >= 0.6) open();
        });
      }, { threshold: 0.6 });
      this.observer.observe(this);
    }

    // One tooltip for the whole fan, following the pointer — a card-anchored
    // tip would rotate with the card it names. Pointer-only by design: the
    // cards are decorative to assistive tech, which gets the shade names as
    // plain text instead.
    setupTooltip() {
      const tip = document.createElement('span');
      tip.className = 'color-fan__tooltip';
      tip.hidden = true;
      this.appendChild(tip);

      this.addEventListener('mouseover', (event) => {
        const card = event.target.closest('.color-fan__card');
        const label = card && card.dataset.fanLabel;
        if (label) tip.textContent = label;
        tip.hidden = !label;
      });

      this.addEventListener('mousemove', (event) => {
        if (tip.hidden) return;
        const bounds = this.getBoundingClientRect();
        tip.style.left = (event.clientX - bounds.left) + 'px';
        tip.style.top = (event.clientY - bounds.top) + 'px';
      });

      this.addEventListener('mouseleave', () => {
        tip.hidden = true;
      });
    }
  });
}
