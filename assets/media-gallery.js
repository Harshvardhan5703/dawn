if (!customElements.get('media-gallery')) {
  customElements.define(
    'media-gallery',
    class MediaGallery extends HTMLElement {
      constructor() {
        super();
        this.elements = {
          liveRegion: this.querySelector('[id^="GalleryStatus"]'),
          viewer: this.querySelector('[id^="GalleryViewer"]'),
          thumbnails: this.querySelector('[id^="GalleryThumbnails"]'),
        };
        this.mql = window.matchMedia('(min-width: 750px)');
        if (!this.elements.thumbnails) return;

        this.elements.viewer.addEventListener('slideChanged', debounce(this.onSlideChanged.bind(this), 500));
        this.elements.thumbnails.querySelectorAll('[data-target]').forEach((mediaToSwitch) => {
          mediaToSwitch
            .querySelector('button')
            .addEventListener('click', this.setActiveMedia.bind(this, mediaToSwitch.dataset.target, false));
        });
        if (this.dataset.desktopLayout.includes('thumbnail') && this.mql.matches) this.removeListSemantic();
      }

      onSlideChanged(event) {
        const thumbnail = this.elements.thumbnails.querySelector(
          `[data-target="${event.detail.currentElement.dataset.mediaId}"]`
        );
        this.setActiveThumbnail(thumbnail);
      }

      setActiveMedia(mediaId, prepend) {
        const activeMedia =
          this.elements.viewer.querySelector(`[data-media-id="${mediaId}"]`) ||
          this.elements.viewer.querySelector('[data-media-id]');
        if (!activeMedia) {
          return;
        }
        this.elements.viewer.querySelectorAll('[data-media-id]').forEach((element) => {
          element.classList.remove('is-active');
        });
        activeMedia?.classList?.add('is-active');

        if (prepend) {
          activeMedia.parentElement.firstChild !== activeMedia && activeMedia.parentElement.prepend(activeMedia);

          if (this.elements.thumbnails) {
            const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
            activeThumbnail.parentElement.firstChild !== activeThumbnail && activeThumbnail.parentElement.prepend(activeThumbnail);
          }

          if (this.elements.viewer.slider) this.elements.viewer.resetPages();
        }

        this.preventStickyHeader();
        window.setTimeout(() => {
          if (!this.mql.matches || this.elements.thumbnails) {
            activeMedia.parentElement.scrollTo({ left: activeMedia.offsetLeft });
          }
          const activeMediaRect = activeMedia.getBoundingClientRect();
          // Don't scroll if the image is already in view
          if (activeMediaRect.top > -0.5) return;
          const top = activeMediaRect.top + window.scrollY;
          window.scrollTo({ top: top, behavior: 'smooth' });
        });
        this.playActiveMedia(activeMedia);

        if (!this.elements.thumbnails) return;
        const activeThumbnail = this.elements.thumbnails.querySelector(`[data-target="${mediaId}"]`);
        this.setActiveThumbnail(activeThumbnail);
        this.announceLiveRegion(activeMedia, activeThumbnail.dataset.mediaPosition);
      }

      setActiveThumbnail(thumbnail) {
        if (!this.elements.thumbnails || !thumbnail) return;

        this.elements.thumbnails
          .querySelectorAll('button')
          .forEach((element) => element.removeAttribute('aria-current'));
        thumbnail.querySelector('button').setAttribute('aria-current', true);
        if (this.elements.thumbnails.isSlideVisible(thumbnail, 10)) return;

        this.elements.thumbnails.slider.scrollTo({ left: thumbnail.offsetLeft });
      }

      announceLiveRegion(activeItem, position) {
        const image = activeItem.querySelector('.product__modal-opener--image img');
        if (!image) return;
        image.onload = () => {
          this.elements.liveRegion.setAttribute('aria-hidden', false);
          this.elements.liveRegion.innerHTML = window.accessibilityStrings.imageAvailable.replace('[index]', position);
          setTimeout(() => {
            this.elements.liveRegion.setAttribute('aria-hidden', true);
          }, 2000);
        };
        image.src = image.src;
      }

      playActiveMedia(activeItem) {
        window.pauseAllMedia();
        const deferredMedia = activeItem.querySelector('.deferred-media');
        if (deferredMedia) deferredMedia.loadContent(false);
      }

      preventStickyHeader() {
        this.stickyHeader = this.stickyHeader || document.querySelector('sticky-header');
        if (!this.stickyHeader) return;
        this.stickyHeader.dispatchEvent(new Event('preventHeaderReveal'));
      }

      removeListSemantic() {
        if (!this.elements.viewer.slider) return;
        this.elements.viewer.slider.setAttribute('role', 'presentation');
        this.elements.viewer.sliderItems.forEach((slide) => slide.setAttribute('role', 'presentation'));
      }
    }
  );
}




/* BUZZKO: floating product image magnifier */
(() => {
  if (window.buzzkoMagnifierReady) return;
  window.buzzkoMagnifierReady = true;

  const desktop = window.matchMedia(
    '(hover: hover) and (min-width: 750px)'
  );

  const LENS_SIZE = 140;
  const ZOOM = 2.5;
  const CURSOR_GAP = 16;
  let lens = null;

  function removeLens() {
    if (lens) {
      lens.remove();
      lens = null;
    }
  }

  function createLens() {
    if (lens) return lens;

    lens = document.createElement('div');
    lens.setAttribute('aria-hidden', 'true');

    Object.assign(lens.style, {
      position: 'fixed',
      width: `${LENS_SIZE}px`,
      height: `${LENS_SIZE}px`,
      border: '2px solid white',
      borderRadius: '50%',
      boxShadow: '0 4px 18px rgba(0,0,0,.25)',
      backgroundColor: '#fff',
      backgroundRepeat: 'no-repeat',
      pointerEvents: 'none',
      zIndex: '2147483647',
      display: 'none',
      overflow: 'hidden'
    });

    document.body.appendChild(lens);
    return lens;
  }

  function getProductImage(target) {
    const image = target.closest(
      '.product__media-item .product__media img'
    );

    if (!image || !image.complete || !image.naturalWidth) return null;
    return image;
  }

  function updateLens(event, image) {
    const currentLens = createLens();
    const rect = image.getBoundingClientRect();

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    const fit = getComputedStyle(image).objectFit;

    let scaleX = rect.width / naturalWidth;
    let scaleY = rect.height / naturalHeight;

    if (fit === 'contain' || fit === 'cover') {
      const scale = fit === 'cover'
        ? Math.max(scaleX, scaleY)
        : Math.min(scaleX, scaleY);

      scaleX = scale;
      scaleY = scale;
    }

    const renderedWidth = naturalWidth * scaleX;
    const renderedHeight = naturalHeight * scaleY;

    /* Dawn normally centers product images within their media box. */
    const imageLeft = rect.left + (rect.width - renderedWidth) / 2;
    const imageTop = rect.top + (rect.height - renderedHeight) / 2;

    const sourceX = (event.clientX - imageLeft) / scaleX;
    const sourceY = (event.clientY - imageTop) / scaleY;

    /* Ignore empty letterboxed areas around contained images. */
    if (
      sourceX < 0 || sourceX > naturalWidth ||
      sourceY < 0 || sourceY > naturalHeight
    ) {
      currentLens.style.display = 'none';
      return;
    }

    /* Position the lens above-left of the cursor, within the viewport. */
    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - LENS_SIZE - 8,
        event.clientX - LENS_SIZE - CURSOR_GAP
      )
    );

    const top = Math.max(
      8,
      Math.min(
        window.innerHeight - LENS_SIZE - 8,
        event.clientY - LENS_SIZE - CURSOR_GAP
      )
    );

    currentLens.style.left = `${left}px`;
    currentLens.style.top = `${top}px`;

    /* Magnify only the image itself. */
    currentLens.style.backgroundImage =
      `url("${image.currentSrc || image.src}")`;

    currentLens.style.backgroundSize =
      `${renderedWidth * ZOOM}px ${renderedHeight * ZOOM}px`;

    currentLens.style.backgroundPosition =
      `${LENS_SIZE / 2 - sourceX * scaleX * ZOOM}px ` +
      `${LENS_SIZE / 2 - sourceY * scaleY * ZOOM}px`;

    currentLens.style.display = 'block';
  }

  document.addEventListener('pointerover', (event) => {
    if (!desktop.matches || event.pointerType !== 'mouse') return;

    const image = getProductImage(event.target);
    if (!image) return;

    updateLens(event, image);
  });

  document.addEventListener('pointermove', (event) => {
    if (!desktop.matches || event.pointerType !== 'mouse') {
      removeLens();
      return;
    }

    const image = getProductImage(event.target);
    if (!image) {
      removeLens();
      return;
    }

    updateLens(event, image);
  });

  document.addEventListener('pointerout', (event) => {
    const image = event.target.closest(
      '.product__media-item .product__media img'
    );

    if (!image) return;

    if (event.relatedTarget && image.contains(event.relatedTarget)) return;
    removeLens();
  });

  document.addEventListener('click', removeLens);
  window.addEventListener('scroll', removeLens, true);
  window.addEventListener('resize', removeLens);
  document.addEventListener('slideChanged', removeLens);
  desktop.addEventListener('change', removeLens);
})();