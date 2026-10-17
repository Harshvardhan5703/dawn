(function () {
  'use strict';

  if (window.BuzzkoWishlist) return;

  var STORAGE_KEY = 'buzzko:wishlist:v1';
  var PAGE_SELECTOR = '[data-buzzko-wishlist-page]';
  var moneyFormat =
    (window.Shopify && window.Shopify.money_format) || '₹{{amount}}';

  var CARD_BORDERS = [
    '#F7CFCF',
    '#B9E404',
    '#9DDCF7',
    '#FFD96A',
    '#CDB8F5',
    '#FF9FC8'
  ];

  /* =========================================================
     STORAGE
  ========================================================= */

  function readItems() {
    try {
      var value = JSON.parse(
        window.localStorage.getItem(STORAGE_KEY) || '[]'
      );

      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.warn('[BuzzKo Wishlist] Could not read wishlist.', error);
      return [];
    }
  }

  function normaliseId(value) {
    return String(value == null ? '' : value);
  }

  function writeItems(items) {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(items)
      );
    } catch (error) {
      console.warn('[BuzzKo Wishlist] Could not save wishlist.', error);
    }

    refresh();

    window.dispatchEvent(
      new CustomEvent('buzzko:wishlist:change', {
        detail: { items: items }
      })
    );
  }

  function hasProduct(productId) {
    var id = normaliseId(productId);

    return readItems().some(function (item) {
      return normaliseId(item.productId) === id;
    });
  }

  function toggle(payload) {
    if (!payload || !payload.productId || !payload.handle) {
      return false;
    }

    var items = readItems();
    var id = normaliseId(payload.productId);

    var index = items.findIndex(function (item) {
      return normaliseId(item.productId) === id;
    });

    if (index >= 0) {
      items.splice(index, 1);
      writeItems(items);
      return false;
    }

    items.unshift({
      productId: id,
      handle: String(payload.handle),
      variantId: normaliseId(payload.variantId),
      title: String(payload.title || ''),
      url: String(payload.url || ('/products/' + payload.handle)),
      image: String(payload.image || ''),
      price: Number(payload.price || 0),
      addedAt: Date.now()
    });

    writeItems(items);
    return true;
  }

  function updateVariant(productId, variantId, price) {
    var items = readItems();
    var id = normaliseId(productId);

    var item = items.find(function (entry) {
      return normaliseId(entry.productId) === id;
    });

    if (!item) return;

    item.variantId = normaliseId(variantId);

    if (price != null && price !== '') {
      item.price = Number(price);
    }

    writeItems(items);
  }

  function removeById(productId) {
    var id = normaliseId(productId);

    writeItems(
      readItems().filter(function (item) {
        return normaliseId(item.productId) !== id;
      })
    );
  }

  /* =========================================================
     HELPERS
  ========================================================= */

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(
      /[&<>"']/g,
      function (char) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[char];
      }
    );
  }

  function formatMoney(cents) {
    cents = Number(cents || 0);

    if (window.Shopify && typeof window.Shopify.formatMoney === 'function') {
      try {
        return window.Shopify.formatMoney(cents, moneyFormat);
      } catch (error) {
        // Continue to the fallback formatter.
      }
    }

    var amount = (cents / 100).toFixed(2);
    var noDecimals = String(Math.round(cents / 100));

    return moneyFormat
      .replace(/\{\{\s*amount\s*\}\}/g, amount)
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, noDecimals)
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g,
        amount.replace('.', ','))
      .replace(/\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/g,
        noDecimals);
  }

  function getRootUrl() {
    return (
      window.Shopify &&
      window.Shopify.routes &&
      window.Shopify.routes.root
    ) || '/';
  }

  function getVariant(product, savedVariantId) {
    var variants = Array.isArray(product.variants)
      ? product.variants
      : [];

    var savedVariant = variants.find(function (variant) {
      return normaliseId(variant.id) === normaliseId(savedVariantId);
    });

    if (savedVariant) return savedVariant;

    return variants.find(function (variant) {
      return variant.available;
    }) || variants[0] || null;
  }

  function getVariantLabel(variant) {
    if (
      !variant ||
      !variant.title ||
      variant.title === 'Default Title'
    ) {
      return '';
    }

    return variant.title;
  }

  function getProductImage(product, variant, savedItem) {
    var variantImage =
      variant &&
      variant.featured_image &&
      variant.featured_image.src;

    return (
      variantImage ||
      product.featured_image ||
      (product.images && product.images[0]) ||
      savedItem.image ||
      ''
    );
  }

  function getCompareAtPrice(product, variant, price) {
    var variantCompare = Number(
      variant && variant.compare_at_price
        ? variant.compare_at_price
        : 0
    );

    var productCompare = Number(product.compare_at_price || 0);

    if (variantCompare > price) return variantCompare;
    if (productCompare > price) return productCompare;

    return 0;
  }

  /* =========================================================
     CARD STYLES (Updated to match the new 1:1 design)
  ========================================================= */

  function injectCardStyles() {
    if (document.getElementById('buzzko-wishlist-grid-card-styles')) {
      return;
    }

    var style = document.createElement('style');
    style.id = 'buzzko-wishlist-grid-card-styles';

    style.textContent = `
      .buzzko-wishlist .buzzko-wishlist__grid {
        display: grid !important;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        column-gap: 20px;
        row-gap: 20px;
        align-items: stretch;
      }

      .buzzko-wishlist .buzzko-product-card {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-width: 0;
        overflow: visible;
        box-sizing: border-box;
        background: #faf8f6;
        border: 3px solid var(--card-border, #F7CFCF);
        border-radius: 18px;
        padding: 8px;
        color: #111;
        transition: transform .2s ease, box-shadow .2s ease;
      }

      .buzzko-wishlist .buzzko-product-card:hover {
        transform: translateY(-4px);
        box-shadow: 0 10px 25px rgba(0, 0, 0, .06);
      }

      .buzzko-wishlist .buzzko-product-card__image-wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 1 / 1;
        flex-shrink: 0;
        border-radius: 11px;
        background: #eee;
      }

      .buzzko-wishlist .buzzko-product-card__image-link {
        position: absolute;
        inset: 0;
        display: block;
        width: 100%;
        height: 100%;
        overflow: hidden;
        border-radius: 11px;
      }

      .buzzko-wishlist .buzzko-product-card__image {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform .3s ease;
      }

      .buzzko-wishlist .buzzko-product-card:hover
      .buzzko-product-card__image {
        transform: scale(1.025);
      }

      .buzzko-wishlist .buzzko-product-card__placeholder {
        display: block;
        width: 100%;
        height: 100%;
      }

      .buzzko-wishlist .buzzko-product-card__remove {
        position: absolute;
        top: 8px;
        right: 8px;
        z-index: 2;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        padding: 0;
        border: 1px solid rgba(26, 26, 26, .16);
        border-radius: 50%;
        background: #fff;
        color: #1A1A1A;
        font-size: 21px;
        line-height: 1;
        cursor: pointer;
        transition: background .15s ease, transform .15s ease;
      }

      .buzzko-wishlist .buzzko-product-card__remove:hover {
        background: #F8B5D1;
        transform: scale(1.05);
      }

      .buzzko-wishlist .buzzko-product-card__content {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        padding: 8px 4px 2px;
      }

      .buzzko-wishlist .buzzko-product-card__title {
        margin: 0;
        color: #111;
        font-size: 14px;
        line-height: 1.2;
        font-weight: 800;
        letter-spacing: -.2px;
        overflow-wrap: anywhere;
      }

      .buzzko-wishlist .buzzko-product-card__title-link {
        color: inherit;
        text-decoration: none;
      }

      .buzzko-wishlist .buzzko-product-card__title-link:hover {
        text-decoration: underline;
        text-underline-offset: 3px;
      }

      .buzzko-wishlist .buzzko-product-card__subtitle {
        margin: 3px 0 0;
        color: #777;
        font-size: 11px;
        line-height: 1.35;
      }

      .buzzko-wishlist .buzzko-product-card__footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: auto;
        padding-top: 10px;
      }

      .buzzko-wishlist .buzzko-product-card__price {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        min-width: 0;
      }

      .buzzko-wishlist .buzzko-product-card__price-current {
        color: #111;
        font-size: 14px;
        line-height: 1;
        font-weight: 800;
      }

      .buzzko-wishlist .buzzko-product-card__price-compare {
        color: #999;
        font-size: 11px;
        text-decoration: line-through;
      }

      /* Forms visibility */
      .buzzko-wishlist .buzzko-product-card__form--mobile { display: none !important; }
      .buzzko-wishlist .buzzko-product-card__form--desktop { margin: 0; flex-shrink: 0; position: relative; }

      /* Desktop Base Button */
      .buzzko-wishlist .buzzko-product-card__atc {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 6px 12px;
        background: #FF60B9;
        color: #201e1e;
        border: 0;
        border-radius: 999px;
        font: inherit;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: .3px;
        line-height: 1;
        white-space: nowrap;
        cursor: pointer;
        transition: background .15s ease, opacity .15s ease;
      }

      .buzzko-wishlist .buzzko-product-card__atc:hover:not(:disabled) {
        background: #e469af;
      }

      .buzzko-wishlist .buzzko-product-card__atc:disabled {
        background: #ccc;
        cursor: not-allowed;
        color: #666;
      }

      .buzzko-wishlist .buzzko-product-card__atc[data-state="loading"] {
        opacity: .7;
        cursor: wait;
      }

      .buzzko-wishlist .buzzko-product-card__atc[data-state="success"] {
        background: #B9E404;
      }

      /* Hide mobile icons on desktop */
      .buzzko-wishlist .buzzko-product-card__atc svg {
        display: none;
      }

      /* Mobile Overrides */
      @media screen and (max-width: 989px) {
        .buzzko-wishlist .buzzko-wishlist__grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
        }
      }

      @media screen and (max-width: 749px) {
        .buzzko-wishlist .buzzko-wishlist__grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          column-gap: 10px;
          row-gap: 12px;
        }

        .buzzko-wishlist .buzzko-product-card {
          padding: 6px;
          border-width: 2px;
          border-radius: 13px;
        }

        .buzzko-wishlist .buzzko-product-card__image-wrapper {
          border-radius: 8px;
        }

        .buzzko-wishlist .buzzko-product-card__content {
          padding: 6px 2px 2px;
        }

        .buzzko-wishlist .buzzko-product-card__title {
          font-size: 13px;
          line-height: 1.2;
        }

        .buzzko-wishlist .buzzko-product-card__subtitle {
          font-size: 10px;
          margin-top: 2px;
        }

        .buzzko-wishlist .buzzko-product-card__footer {
          padding-top: 6px;
        }

        .buzzko-wishlist .buzzko-product-card__price-current {
          font-size: 13px;
        }

        .buzzko-wishlist .buzzko-product-card__price-compare {
          font-size: 10px;
        }

        /* Show Mobile Form, Hide Desktop Form */
        .buzzko-wishlist .buzzko-product-card__form--desktop { display: none !important; }
        .buzzko-wishlist .buzzko-product-card__form--mobile {
          display: block !important;
          position: absolute;
          bottom: 8px;
          right: 8px;
          z-index: 10;
        }

        .buzzko-wishlist .buzzko-product-card__atc {
          width: 36px;
          height: 36px;
          padding: 0;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.35);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          color: #FF60B9;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          border: 1px solid rgba(255, 255, 255, 0.6);
        }

        .buzzko-wishlist .buzzko-product-card__atc:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.65);
        }

        .buzzko-wishlist .buzzko-product-card__atc:disabled {
          background: rgba(200, 200, 200, 0.6);
          color: #fff;
        }

        .buzzko-wishlist .buzzko-product-card__atc svg {
          display: block;
          width: 16px;
          height: 16px;
        }

        .buzzko-wishlist .buzzko-product-card__atc .btn-text {
          display: none;
        }

        .buzzko-wishlist .buzzko-product-card__remove {
          top: 5px;
          right: 5px;
          width: 26px;
          height: 26px;
          font-size: 19px;
        }
      }

      /* Icon States */
      .buzzko-wishlist .buzzko-product-card__atc .icon-check,
      .buzzko-wishlist .buzzko-product-card__atc .icon-spinner {
        display: none;
      }

      .buzzko-wishlist .buzzko-product-card__atc[data-state="loading"] .icon-cart { display: none; }
      .buzzko-wishlist .buzzko-product-card__atc[data-state="loading"] .icon-spinner { display: block; animation: buzzko-spin 1s linear infinite; }
      .buzzko-wishlist .buzzko-product-card__atc[data-state="loading"] .btn-text::before { content: "Adding..."; }
      .buzzko-wishlist .buzzko-product-card__atc[data-state="loading"] .btn-text { font-size: 0; }
      .buzzko-wishlist .buzzko-product-card__atc[data-state="loading"] .btn-text::before { font-size: 11px; }

      .buzzko-wishlist .buzzko-product-card__atc[data-state="success"] { background: #B9E404; color: #111; }
      .buzzko-wishlist .buzzko-product-card__atc[data-state="success"] .icon-cart { display: none; }
      .buzzko-wishlist .buzzko-product-card__atc[data-state="success"] .icon-check { display: block; }
      .buzzko-wishlist .buzzko-product-card__atc[data-state="success"] .btn-text { font-size: 0; }
      .buzzko-wishlist .buzzko-product-card__atc[data-state="success"] .btn-text::before { content: "Added ✓"; font-size: 11px; }
      @keyframes buzzko-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    `;

    document.head.appendChild(style);
  }

  /* =========================================================
     RENDER WISHLIST CARDS (Updated with double form structure)
  ========================================================= */

  function renderCard(entry, index) {
    var item = entry.saved;
    var product = entry.product;
    var variant = entry.variant;

    var title = product.title || item.title || '';
    var url = product.url || item.url || ('/products/' + item.handle);
    var image = getProductImage(product, variant, item);
    var price = variant ? Number(variant.price || 0) : Number(product.price || 0);
    var compareAt = getCompareAtPrice(product, variant, price);
    var unavailable = !variant || !variant.available;
    var variantLabel = getVariantLabel(variant);
    var border = CARD_BORDERS[index % CARD_BORDERS.length];
    var variantId = variant ? variant.id : '';

    var imageMarkup = image
      ? '<img class="buzzko-product-card__image" src="' +
          escapeHtml(image) +
          '" alt="' + escapeHtml(title) +
          '" loading="lazy">'
      : '<div class="buzzko-product-card__image buzzko-product-card__placeholder" aria-hidden="true"></div>';

    var priceMarkup =
      '<span class="buzzko-product-card__price-current">' +
        escapeHtml(formatMoney(price)) +
      '</span>';

    if (compareAt > price) {
      priceMarkup +=
        '<span class="buzzko-product-card__price-compare">' +
          escapeHtml(formatMoney(compareAt)) +
        '</span>';
    }

    var subtitleMarkup = variantLabel
      ? '<p class="buzzko-product-card__subtitle">' +
          escapeHtml(variantLabel) +
        '</p>'
      : '';

    var buttonHtml = 
      '<button type="submit" ' +
        'class="buzzko-product-card__atc" ' +
        'data-wishlist-add-to-cart="' + escapeHtml(item.productId) + '" ' +
        'data-variant-id="' + escapeHtml(variantId) + '" ' +
        'data-label-default="' + (unavailable ? 'Sold Out' : 'Add to Cart') + '" ' +
        'data-label-loading="Adding…" ' +
        'data-label-success="Added ✓" ' +
        (unavailable ? 'disabled ' : '') +
      '>' +
        '<span class="btn-text">' + (unavailable ? 'Sold Out' : 'Add to Cart') + '</span>' +
        (unavailable ? 
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>' :
          '<svg class="icon-cart" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>' +
          '<svg class="icon-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
          '<svg class="icon-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>'
        ) +
      '</button>';

    var formContent = 
      '<input type="hidden" name="id" value="' + escapeHtml(variantId) + '">' +
      buttonHtml;

    return (
      '<article class="buzzko-product-card" ' +
        'data-product-id="' + escapeHtml(item.productId) + '" ' +
        'style="--card-border:' + border + ';">' +

        '<div class="buzzko-product-card__image-wrapper">' +
          '<a href="' + escapeHtml(url) + '" ' +
             'class="buzzko-product-card__image-link" ' +
             'aria-label="' + escapeHtml(title) + '">' +
            imageMarkup +
          '</a>' +

          '<button type="button" ' +
            'class="buzzko-product-card__remove" ' +
            'data-wishlist-remove="' + escapeHtml(item.productId) + '" ' +
            'aria-label="Remove ' + escapeHtml(title) + ' from wishlist" ' +
            'title="Remove from wishlist">' +
            '&times;' +
          '</button>' +
          
          '<form class="buzzko-product-card__form buzzko-product-card__form--mobile" data-wishlist-cart-form data-product-id="' + escapeHtml(item.productId) + '">' +
            formContent +
          '</form>' +
        '</div>' +

        '<div class="buzzko-product-card__content">' +
          '<h3 class="buzzko-product-card__title">' +
            '<a href="' + escapeHtml(url) + '" ' +
               'class="buzzko-product-card__title-link">' +
              escapeHtml(title) +
            '</a>' +
          '</h3>' +

          subtitleMarkup +

          '<div class="buzzko-product-card__footer">' +
            '<div class="buzzko-product-card__price">' +
              priceMarkup +
            '</div>' +
            '<form class="buzzko-product-card__form buzzko-product-card__form--desktop" data-wishlist-cart-form data-product-id="' + escapeHtml(item.productId) + '">' +
              formContent +
            '</form>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }


  function renderPage(page, items) {
    var grid = page.querySelector('[data-buzzko-wishlist-grid]');
    var empty = page.querySelector('[data-buzzko-wishlist-empty]');
    var loading = page.querySelector('[data-buzzko-wishlist-loading]');
    var countLabel = page.querySelector('[data-buzzko-wishlist-page-count]');

    if (!grid) return;

    if (countLabel) {
      countLabel.textContent =
        items.length + (items.length === 1
          ? ' saved favourite'
          : ' saved favourites');
    }

    if (!items.length) {
      page.dataset.renderToken = '';
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      if (loading) loading.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (loading) loading.hidden = false;

    var skeleton = '';
    for (var i = 0; i < 4; i++) {
      var skeletonBorder = CARD_BORDERS[i % CARD_BORDERS.length];
      skeleton +=
        '<article class="buzzko-product-card buzzko-wishlist__skeleton" ' +
          'style="--card-border:' + skeletonBorder + ';" aria-hidden="true">' +
          '<div class="buzzko-product-card__image-wrapper">' +
            '<div class="buzzko-wishlist__skeleton-image"></div>' +
          '</div>' +
          '<div class="buzzko-product-card__content">' +
            '<div class="buzzko-wishlist__skeleton-line buzzko-wishlist__skeleton-line--title"></div>' +
            '<div class="buzzko-wishlist__skeleton-line buzzko-wishlist__skeleton-line--subtitle"></div>' +
            '<div class="buzzko-wishlist__skeleton-footer">' +
              '<div class="buzzko-wishlist__skeleton-line buzzko-wishlist__skeleton-line--price"></div>' +
              '<div class="buzzko-wishlist__skeleton-button"></div>' +
            '</div>' +
          '</div>' +
        '</article>';
    }

    grid.innerHTML = skeleton;

    var renderToken = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    page.dataset.renderToken = renderToken;

    Promise.all(
      items.map(function (item) {
        return fetch(getRootUrl() + 'products/' + encodeURIComponent(item.handle) + '.js')
          .then(function (response) {
            if (!response.ok) throw new Error('Product unavailable');
            return response.json();
          })
          .then(function (product) {
            return {
              saved: item,
              product: product,
              variant: getVariant(product, item.variantId)
            };
          })
          .catch(function (error) {
            console.warn('[BuzzKo Wishlist] Could not load product:', item.handle, error);
            return null;
          });
      })
    ).then(function (results) {
      if (page.dataset.renderToken !== renderToken) return;

      var valid = results.filter(Boolean);
      grid.innerHTML = valid.map(renderCard).join('');

      if (loading) loading.hidden = true;
      if (!valid.length) {
        if (empty) empty.hidden = false;
        grid.innerHTML = '';
      } else if (empty) {
        empty.hidden = true;
      }
    });
  }


  /* =========================================================
     REFRESH COUNTS AND HEART STATES
  ========================================================= */

  function refresh() {
    var items = readItems();
    var count = items.length;

    document.querySelectorAll('[data-buzzko-wishlist-count]').forEach(function (badge) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.dataset.count = String(count);
      badge.setAttribute('aria-label', count + (count === 1 ? ' item in wishlist' : ' items in wishlist'));
    });

    document.querySelectorAll('[data-buzzko-wishlist-toggle]').forEach(function (button) {
      var customerSignedIn = document.documentElement.dataset.buzzkoCustomerSignedIn === 'true';
      var active = customerSignedIn && hasProduct(button.dataset.productId);

      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.setAttribute('aria-label', active ? 'Remove from wishlist' : 'Add to wishlist');
    });

    var page = document.querySelector(PAGE_SELECTOR);
    if (page) renderPage(page, items);
  }

  function currentVariant(button) {
    var root = button.closest('product-info') || document.querySelector('product-info');
    var input = root && root.querySelector('form[action*="/cart/add"] input[name="id"]');
    return input && input.value ? input.value : (button.dataset.variantId || '');
  }

  function payloadFromButton(button) {
    return {
      productId: button.dataset.productId,
      handle: button.dataset.productHandle,
      variantId: currentVariant(button),
      title: button.dataset.productTitle,
      url: button.dataset.productUrl,
      image: button.dataset.productImage,
      price: button.dataset.productPrice
    };
  }

  /* =========================================================
     EVENTS
  ========================================================= */

  function bindWishlistToggle() {
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-buzzko-wishlist-toggle]');
      if (!button) return;

      event.preventDefault();
      event.stopPropagation();

      var payload = payloadFromButton(button);

      if (window.BuzzkoWishlistAuth && window.BuzzkoWishlistAuth.handleWishlistClick(button, payload)) {
        return;
      }

      var nowAdded = toggle(payload);
      button.classList.toggle('is-active', nowAdded);
      button.setAttribute('aria-pressed', nowAdded ? 'true' : 'false');
    });
  }


  function updateCartHeader() {
    var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
    return fetch(root + 'cart.js', { headers: { Accept: 'application/json' } })
      .then(function (response) {
        if (!response.ok) throw new Error('Could not refresh the cart count.');
        return response.json();
      })
      .then(function (cart) {
        var cartLink = document.querySelector('#cart-icon-bubble');
        if (!cartLink) return;

        var count = Number(cart.item_count || 0);
        var bubble = cartLink.querySelector('.cart-count-bubble');

        if (count === 0) {
          if (bubble) bubble.remove();
          return;
        }

        if (!bubble) {
          bubble = document.createElement('div');
          bubble.className = 'cart-count-bubble';
          cartLink.appendChild(bubble);
        }

        bubble.innerHTML =
          '<span aria-hidden="true">' + (count > 99 ? '99+' : count) + '</span>' +
          '<span class="visually-hidden">' + count + (count === 1 ? ' item' : ' items') + ' in cart</span>';
      });
  }
    
  function bindWishlistPageActions() {
    document.addEventListener('click', function (event) {
      var removeButton = event.target.closest('[data-wishlist-remove]');
      if (removeButton) {
        event.preventDefault();
        removeById(removeButton.dataset.wishlistRemove);
        return;
      }
    });

    document.addEventListener('submit', function (event) {
      var form = event.target.closest('[data-wishlist-cart-form]');
      if (!form) return;

      event.preventDefault();

      var button = form.querySelector('[data-wishlist-add-to-cart]');
      if (!button || button.disabled) return;

      var productId = button.dataset.wishlistAddToCart;
      var variantId = button.dataset.variantId;
      if (!variantId) return;

      var originalLabel = button.dataset.labelDefault || 'Add to Cart';

      button.disabled = true;
      button.dataset.state = 'loading';
      
      // Update text for desktop
      var textSpan = button.querySelector('.btn-text');
      if(textSpan) textSpan.textContent = button.dataset.labelLoading || 'Adding…';
      else button.textContent = button.dataset.labelLoading || 'Adding…';

      fetch(getRootUrl() + 'cart/add.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          items: [{ id: Number(variantId), quantity: 1 }]
        })
      })
      .then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (error) {
            throw new Error(error.description || 'Could not add this item to the cart.');
          });
        }
        return response.json();
      })
      .then(function () {
        button.dataset.state = 'success';
        var textSpan = button.querySelector('.btn-text');
        if(textSpan) textSpan.textContent = button.dataset.labelSuccess || 'Added ✓';
        else button.textContent = button.dataset.labelSuccess || 'Added ✓';

        return updateCartHeader().catch(function (error) {
          console.warn('[BuzzKo Wishlist] Could not refresh cart count:', error);
        });
      })
      .then(function () {
        removeById(productId);
        window.location.assign(getRootUrl() + 'cart');
      })
      .catch(function (error) {
        console.error('[BuzzKo Wishlist] Add to cart failed:', error);
        button.disabled = false;
        button.removeAttribute('data-state');
        var textSpan = button.querySelector('.btn-text');
        if(textSpan) textSpan.textContent = 'Try Again';
        else button.textContent = 'Try Again';

        window.setTimeout(function () {
          if (!document.body.contains(button)) return;
          if(textSpan) textSpan.textContent = originalLabel;
          else button.textContent = originalLabel;
        }, 1600);
      });
    });
  }


  /* =========================================================
     PUBLIC API
  ========================================================= */

  window.BuzzkoWishlist = {
    key: STORAGE_KEY,
    getItems: readItems,
    hasProduct: hasProduct,
    toggle: toggle,
    updateVariant: updateVariant,
    refresh: refresh,
    remove: removeById
  };

  /* =========================================================
     INIT
  ========================================================= */

  function init() {
    injectCardStyles();
    bindWishlistToggle();
    bindWishlistPageActions();
    window.addEventListener('storage', function (event) { if (event.key === STORAGE_KEY) refresh(); });
    window.addEventListener('buzzko:wishlist:change', refresh);
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();