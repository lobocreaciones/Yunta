/*
  Skin quiz.

  Opens on an intro panel and only reveals the questions once the visitor opts in.
  Every question and outcome is already in the DOM; this toggles which panel shows
  and tallies votes. Nothing is fetched until a routine is added, and the result
  appears before any email is asked for.
*/
class SkinQuiz extends HTMLElement {
  connectedCallback() {
    this.steps = Array.from(this.querySelectorAll('[data-quiz-step]'));
    this.panels = Array.from(this.querySelectorAll('[data-quiz-result-panel]'));
    if (!this.steps.length || !this.panels.length) return;

    this.intro = this.querySelector('[data-quiz-intro]');
    this.stage = this.querySelector('[data-quiz-stage]');
    this.progress = this.querySelector('[data-quiz-progress]');
    this.progressLabel = this.querySelector('[data-quiz-progress-label]');
    this.segments = Array.from(this.querySelectorAll('[data-quiz-segment]'));
    this.progressTemplate = this.dataset.progressTemplate || '';
    this.miniCart = document.querySelector('mini-cart');

    this.answers = [];
    this.index = 0;

    this.addEventListener('click', this.onClick.bind(this));
  }

  static reducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  onClick(event) {
    const hit = (selector) => {
      const el = event.target.closest(selector);
      return el && this.contains(el) ? el : null;
    };

    if (hit('[data-quiz-start]')) return this.beginQuiz();
    if (hit('[data-quiz-restart]')) return this.beginQuiz();
    if (hit('[data-quiz-back]')) return this.goBack();

    const option = hit('[data-quiz-option]');
    if (option) return this.answer(option);

    const add = hit('[data-quiz-add]');
    if (add) return this.addRoutine(add);
  }

  /*
    Height is pinned before the swap and released after it, so a short question
    giving way to a tall result eases open instead of snapping the page down.
  */
  transition(mutate) {
    if (SkinQuiz.reducedMotion() || !this.stage) {
      mutate();
      return;
    }

    const stage = this.stage;
    const from = stage.getBoundingClientRect().height;

    mutate();

    /*
      The target is measured the same way as `from`, on the element in the state
      it will actually be released into — no is-measuring class, height auto.
      scrollHeight is no substitute: it rounds to an integer where
      getBoundingClientRect does not, and under overflow:hidden the stage is a
      block formatting context that stops child margins collapsing out — either
      leaves the pinned height a few pixels off the natural one, which shows as
      a jump the moment it is released.
    */
    stage.style.height = 'auto';
    const to = stage.getBoundingClientRect().height;

    if (Math.abs(to - from) < 1) {
      // Same height either way; animating it only risks a flicker.
      stage.style.height = '';
      return;
    }

    stage.classList.add('is-measuring');
    stage.style.height = `${from}px`;
    // Commit the start value, or the browser coalesces both writes and no
    // transition runs at all.
    void stage.getBoundingClientRect();

    requestAnimationFrame(() => {
      stage.style.height = `${to}px`;
    });

    this.releaseHeight(stage);
  }

  // Released when the height transition finishes — a fixed timeout can fire
  // while the easing is still running.
  releaseHeight(stage) {
    if (this.onHeightEnd) stage.removeEventListener('transitionend', this.onHeightEnd);
    clearTimeout(this.releaseTimer);

    this.onHeightEnd = (event) => {
      if (event.target !== stage || event.propertyName !== 'height') return;
      stage.style.height = '';
      stage.classList.remove('is-measuring');
      stage.removeEventListener('transitionend', this.onHeightEnd);
      this.onHeightEnd = null;
      clearTimeout(this.releaseTimer);
    };
    stage.addEventListener('transitionend', this.onHeightEnd);

    // Safety net: transitionend never fires if the transition is interrupted or
    // the tab is backgrounded mid-flight.
    this.releaseTimer = setTimeout(() => {
      if (this.onHeightEnd) this.onHeightEnd({ target: stage, propertyName: 'height' });
    }, 900);
  }

  // Only the visible panel carries is-active, which is what drives the stagger.
  show(panel) {
    const all = [this.intro, ...this.steps, ...this.panels].filter(Boolean);
    all.forEach((el) => {
      el.hidden = el !== panel;
      el.classList.toggle('is-active', el === panel);
    });
  }

  focusPanel(panel, selector) {
    const target = panel && panel.querySelector(selector);
    if (!target) return;
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  beginQuiz() {
    this.answers = [];
    this.index = 0;
    if (this.progress) this.progress.hidden = false;
    this.transition(() => this.showStep());
  }

  answer(option) {
    // Stored per step so Back can undo one vote without replaying the quiz.
    this.answers[this.index] = parseInt(option.dataset.quizResult, 10) || 1;
    this.index += 1;
    this.transition(() => (this.index >= this.steps.length ? this.showResult() : this.showStep()));
  }

  goBack() {
    if (this.index === 0) return;
    this.index -= 1;
    this.answers.length = this.index;
    this.transition(() => this.showStep());
  }

  showStep() {
    const current = this.steps[this.index];
    this.show(current);

    const back = current && current.querySelector('[data-quiz-back]');
    if (back) back.hidden = this.index === 0;

    this.focusPanel(current, '.skin-quiz__question');
    this.updateProgress(this.index + 1, this.steps.length);
  }

  showResult() {
    const winner = this.resolveWinner();
    const panel = this.panels.find((p) => parseInt(p.dataset.quizResultPanel, 10) === winner);
    this.show(panel);
    this.focusPanel(panel, '.skin-quiz__result-heading');
    this.updateProgress(this.steps.length, this.steps.length);
  }

  /*
    Highest vote count wins. Ties fall to the lowest-numbered outcome so the same
    answers always produce the same routine — a random or last-wins tiebreak would
    make the quiz feel broken when a visitor retakes it.
  */
  resolveWinner() {
    const tally = new Map();
    this.answers.forEach((result) => tally.set(result, (tally.get(result) || 0) + 1));

    const available = this.panels.map((p) => parseInt(p.dataset.quizResultPanel, 10));
    let winner = available[0];
    let best = -1;

    available.forEach((candidate) => {
      const score = tally.get(candidate) || 0;
      if (score > best) {
        best = score;
        winner = candidate;
      }
    });

    return winner;
  }

  updateProgress(current, total) {
    // Segments fill up to and including the current step, so the visitor always
    // sees how many questions remain rather than an unmarked percentage.
    this.segments.forEach((segment, i) => {
      segment.classList.toggle('is-filled', i < current);
    });
    if (this.progressLabel && this.progressTemplate) {
      this.progressLabel.textContent = this.progressTemplate
        .replace('[current]', current)
        .replace('[total]', total);
    }
  }

  addRoutine(button) {
    const ids = (button.dataset.variantIds || '').split(',').filter(Boolean);
    if (!ids.length) return;

    const items = { items: ids.map((id) => ({ id: id, quantity: 1 })) };
    const errorTarget = button.closest('[data-quiz-result-panel]').querySelector('[data-quiz-error]');
    this.setError(errorTarget, false);

    // Same two paths BundleProducts uses: a real form post when the drawer is off
    // or we are already on the cart page, otherwise the AJAX cart.
    if (document.body.classList.contains('template-cart') || !theme.shopSettings.cartDrawer) {
      Shopify.postLink2(theme.routes.cart_add_url, { parameters: { ...items } });
      return;
    }

    button.setAttribute('disabled', true);
    button.classList.add('loading');

    const sections = this.miniCart ? this.miniCart.getSectionsToRender().map((section) => section.id) : [];
    const body = JSON.stringify({
      ...items,
      sections: sections,
      sections_url: window.location.pathname
    });

    fetch(`${theme.routes.cart_add_url}`, { ...fetchConfig('javascript'), body })
      .then((response) => response.json())
      .then((response) => {
        if (response.status) {
          this.setError(errorTarget, response.description);
          return;
        }

        this.miniCart && this.miniCart.renderContents(response);
        document.dispatchEvent(new CustomEvent('ajaxProduct:added', { detail: { product: response } }));
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        button.classList.remove('loading');
        button.removeAttribute('disabled');
      });
  }

  setError(target, message) {
    if (!target) {
      if (message) alert(message);
      return;
    }
    target.textContent = message || '';
    target.hidden = !message;
  }
}

if (!customElements.get('skin-quiz')) {
  customElements.define('skin-quiz', SkinQuiz);
}
