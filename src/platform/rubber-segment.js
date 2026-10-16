// Rubber Segment Micro-Interaction Engine
// Inspired by React Bits by David Haz (https://reactbits.dev/micro/rubber-segment)
// Provides elastic stretching, squash-on-arrival, and pointer drag physics for segmented controls and tab navigation.

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const DILATE = 180; // ms
const HANDOFF = 140; // ms
const SQUASH = 3; // px
const RUBBER = 0.55;

export function createRubberSegment(trackEl, options = {}) {
  if (!trackEl || trackEl._rubberSegment) return trackEl?._rubberSegment;

  const config = {
    activeClass: options.activeClass || 'active',
    itemSelector: options.itemSelector || 'button, a, [role="tab"]',
    stretch: options.stretch ?? 100,
    squash: options.squash ?? SQUASH,
    speed: options.speed ?? 1,
    draggable: options.draggable ?? true,
    onChange: options.onChange || null,
    inset: options.inset ?? 3,
    radius: options.radius ?? 10,
    equalSlots: options.equalSlots ?? false,
    ...options
  };

  trackEl.classList.add('rubber-segment-track');
  if (config.equalSlots) trackEl.dataset.equal = '';

  // Create thumb overlay
  let thumbEl = trackEl.querySelector('.rubber-segment__thumb');
  if (!thumbEl) {
    thumbEl = document.createElement('div');
    thumbEl.className = 'rubber-segment__thumb';
    thumbEl.setAttribute('aria-hidden', 'true');
    trackEl.appendChild(thumbEl);
  }

  let items = Array.from(trackEl.querySelectorAll(config.itemSelector)).filter(el => el !== thumbEl && !el.classList.contains('rubber-segment__copy'));
  let slots = [];
  let currentIndex = -1;
  let edgeL = 0;
  let edgeR = 0;
  let innerW = 0;
  let drag = null;
  let handoffTimer = null;
  let relaxTimer = null;

  // Build the copy layer inside the thumb for perfect text color inversion
  function syncCopyLayer() {
    thumbEl.innerHTML = '';
    items.forEach(it => {
      const copy = document.createElement('span');
      copy.className = 'rubber-segment__item-copy';
      copy.innerHTML = it.innerHTML;
      thumbEl.appendChild(copy);
    });
  }

  function measure() {
    items = Array.from(trackEl.querySelectorAll(config.itemSelector)).filter(el => el !== thumbEl && !el.classList.contains('rubber-segment__copy'));
    if (!items.length) return;

    const trackRect = trackEl.getBoundingClientRect();
    innerW = Math.max(0, trackRect.width - config.inset * 2);

    slots = items.map(el => {
      const r = el.getBoundingClientRect();
      return {
        l: Math.round(r.left - trackRect.left - config.inset),
        r: Math.round(r.right - trackRect.left - config.inset),
        el
      };
    });

    const activeIdx = items.findIndex(el => el.classList.contains(config.activeClass) || el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-checked') === 'true');
    const targetIdx = activeIdx >= 0 ? activeIdx : 0;
    jumpTo(targetIdx);
  }

  function renderThumb() {
    const thumbRadius = Math.max(0, config.radius - config.inset);
    const rightInset = Math.max(0, innerW - edgeR);
    const leftInset = Math.max(0, edgeL);
    thumbEl.style.clipPath = `inset(0 ${rightInset}px 0 ${leftInset}px round ${thumbRadius}px)`;
  }

  function jumpTo(index) {
    const s = slots[index];
    if (!s) return;
    clearTimeout(handoffTimer);
    clearTimeout(relaxTimer);
    currentIndex = index;
    edgeL = s.l;
    edgeR = s.r;
    thumbEl.style.transition = 'none';
    renderThumb();
    updateAria(index);
  }

  function updateAria(index) {
    items.forEach((it, i) => {
      if (i === index) {
        it.classList.add(config.activeClass);
        if (it.getAttribute('role') === 'tab') it.setAttribute('aria-selected', 'true');
        if (it.getAttribute('role') === 'radio') it.setAttribute('aria-checked', 'true');
      } else {
        it.classList.remove(config.activeClass);
        if (it.getAttribute('role') === 'tab') it.setAttribute('aria-selected', 'false');
        if (it.getAttribute('role') === 'radio') it.setAttribute('aria-checked', 'false');
      }
    });
  }

  function travel(fromIndex, toIndex) {
    const a = slots[fromIndex];
    const b = slots[toIndex];
    if (!a || !b) return;

    clearTimeout(handoffTimer);
    clearTimeout(relaxTimer);
    currentIndex = toIndex;
    updateAria(toIndex);

    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      jumpTo(toIndex);
      return;
    }

    const dir = Math.sign(b.l - a.l) || 1;
    const u = config.stretch / 100;
    const duration = DILATE / config.speed;

    // Step 1: Stretch leading edge towards target while trailing edge lags
    thumbEl.style.transition = `clip-path ${duration}ms ${EASE_OUT}`;
    if (dir > 0) {
      edgeR = b.r;
      edgeL = a.l + (b.l - a.l) * (1 - u * 0.7);
    } else {
      edgeL = b.l;
      edgeR = a.r - (a.r - b.r) * (1 - u * 0.7);
    }
    renderThumb();

    // Step 2: Squash slightly past target slot with spring bounce
    handoffTimer = setTimeout(() => {
      const squashDuration = 180 / config.speed;
      thumbEl.style.transition = `clip-path ${squashDuration}ms ${EASE_OUT}`;
      if (config.squash > 0) {
        edgeL = b.l + (dir > 0 ? config.squash : -config.squash);
        edgeR = b.r + (dir > 0 ? config.squash : -config.squash);
        renderThumb();

        relaxTimer = setTimeout(() => {
          thumbEl.style.transition = `clip-path 140ms ease-out`;
          edgeL = b.l;
          edgeR = b.r;
          renderThumb();
        }, squashDuration);
      } else {
        edgeL = b.l;
        edgeR = b.r;
        renderThumb();
      }
    }, (HANDOFF / config.speed));
  }

  // Pointer interactions
  function localX(e) {
    const rect = trackEl.getBoundingClientRect();
    return e.clientX - rect.left - config.inset;
  }

  trackEl.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const x = localX(e);
    const clickedItemIndex = items.findIndex(it => it.contains(e.target));
    if (clickedItemIndex >= 0 && clickedItemIndex !== currentIndex) {
      const from = currentIndex >= 0 ? currentIndex : 0;
      travel(from, clickedItemIndex);
      config.onChange?.(items[clickedItemIndex], clickedItemIndex);
    }
  });

  // Track resize observer
  const ro = new ResizeObserver(() => {
    measure();
  });
  ro.observe(trackEl);

  syncCopyLayer();
  setTimeout(measure, 30);
  if (document.fonts?.ready) document.fonts.ready.then(measure);

  const api = {
    measure,
    jumpTo,
    travel,
    destroy() {
      ro.disconnect();
      thumbEl.remove();
      delete trackEl._rubberSegment;
    }
  };

  trackEl._rubberSegment = api;
  return api;
}

export function attachRubberSegments(container = document) {
  const tracks = container.querySelectorAll('[data-rubber-segment], .topbar-nav-pills, .mobile-bottom-nav');
  tracks.forEach(track => {
    if (!track._rubberSegment) {
      createRubberSegment(track, {
        equalSlots: track.classList.contains('mobile-bottom-nav') || track.hasAttribute('data-equal'),
        activeClass: 'active',
        itemSelector: track.classList.contains('mobile-bottom-nav') ? '.mobile-bottom-btn' : '.topbar-sector-link, a, button'
      });
    }
  });
}
