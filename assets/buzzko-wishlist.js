(function () {
  'use strict';

  if (window.BuzzkoWishlist) return;

  var STORAGE_KEY = 'buzzko:wishlist:v1';
  var PAGE_SELECTOR = '[data-buzzko-wishlist-page]';
  var moneyFormat = (window.Shopify && window.Shopify.money_format) || '{{amount}}';

  function readItems() {
    try {
      var value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch (error) {
      return [];
    }
  }

  function writeItems(items) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      console.warn('[BuzzKo Wishlist] Could not save wishlist in this browser.', error);
    }
    refresh();
    window.dispatchEvent(new CustomEvent('buzzko:wishlist:change', { detail: { items: items } }));
  }

  function normaliseId(value) {
    return String(value == null ? '' : value);
  }

  function hasProduct(productId) {
    var id = normaliseId(productId);
    return readItems().some(function (item) { return normaliseId(item.productId) === id; });
  }

  function toggle(payload) {
    if (!payload || !payload.productId || !payload.handle) return;
    var items = readItems();
    var id = normaliseId(payload.productId);
    var index = items.findIndex(function (item) { return normaliseId(item.productId) === id; });

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
    var item = items.find(function (entry) { return normaliseId(entry.productId) === id; });
    if (!item) return;
    item.variantId = normaliseId(variantId);
    if (price != null && price !== '') item.price = Number(price);
    writeItems(items);
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function formatMoney(cents) {
    var amount = (Number(cents || 0) / 100).toFixed(2);
    var formatted = moneyFormat
      .replace('{{amount}}', amount)
      .replace('{{ amount }}', amount)
      .replace('{{amount_no_decimals}}', String(Math.round(Number(cents || 0) / 100)))
      .replace('{{ amount_no_decimals }}', String(Math.round(Number(cents || 0) / 100)));
    return formatted;
  }

  function refresh() {
    var items = readItems();
    var count = items.length;

    document.querySelectorAll('[data-buzzko-wishlist-count]').forEach(function (badge) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.dataset.count = String(count);
      badge.setAttribute('aria-label', count + (count === 1 ? ' item in wishlist' : ' items in wishlist'));
    });

    document.querySelectorAll('[data-buzzko-wishlist-toggle]').forEach(function (button) {
      var active = hasProduct(button.dataset.productId);
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

  function bindEvents() {
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-buzzko-wishlist-toggle]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      var payload = payloadFromButton(button);
      var nowAdded = toggle(payload);
      button.classList.toggle('is-active', nowAdded);
      button.setAttribute('aria-pressed', nowAdded ? 'true' : 'false');
    });

    window.addEventListener('storage', function (event) {
      if (event.key === STORAGE_KEY) refresh();
    });

    window.addEventListener('buzzko:wishlist:change', refresh);
  }

  function getVariant(product, savedVariantId) {
    var variants = Array.isArray(product.variants) ? product.variants : [];
    var saved = variants.find(function (variant) { return normaliseId(variant.id) === normaliseId(savedVariantId); });
    if (saved) return saved;
    return variants.find(function (variant) { return variant.available; }) || variants[0] || null;
  }

  function renderPage(page, items) {
    var grid = page.querySelector('[data-buzzko-wishlist-grid]');
    var empty = page.querySelector('[data-buzzko-wishlist-empty]');
    var loading = page.querySelector('[data-buzzko-wishlist-loading]');
    if (!grid) return;

    if (!items.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      if (loading) loading.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (loading) loading.hidden = false;

    var renderToken = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    page.dataset.renderToken = renderToken;

    Promise.all(items.map(function (item) {
      return fetch((window.Shopify && window.Shopify.routes && window.Shopify.routes.root || '/') + 'products/' + encodeURIComponent(item.handle) + '.js')
        .then(function (response) {
          if (!response.ok) throw new Error('Product unavailable');
          return response.json();
        })
        .then(function (product) {
          var variant = getVariant(product, item.variantId);
          return { saved: item, product: product, variant: variant };
        })
        .catch(function () { return null; });
    })).then(function (products) {
      if (page.dataset.renderToken !== renderToken) return;
      var valid = products.filter(Boolean);
      grid.innerHTML = valid.map(function (entry) {
        var item = entry.saved;
        var product = entry.product;
        var variant = entry.variant;
        var image = (variant && variant.featured_image && variant.featured_image.src) ||
          product.featured_image || item.image || '';
        var price = variant ? variant.price : product.price;
        var unavailable = !variant || !variant.available;
        var variantLabel = variant && variant.title && variant.title !== 'Default Title'
          ? '<p class="buzzko-wishlist-card__variant">' + escapeHtml(variant.title) + '</p>'
          : '';
        return '<article class="buzzko-wishlist-card" data-product-id="' + escapeHtml(item.productId) + '">' +
          '<a class="buzzko-wishlist-card__image" href="' + escapeHtml(product.url || item.url) + '">' +
            (image ? '<img src="' + escapeHtml(image) + '" alt="' + escapeHtml(product.title) + '" loading="lazy">' : '') +
          '</a>' +
          '<div class="buzzko-wishlist-card__body">' +
            '<a class="buzzko-wishlist-card__title" href="' + escapeHtml(product.url || item.url) + '">' + escapeHtml(product.title || item.title) + '</a>' +
            variantLabel +
            '<p class="buzzko-wishlist-card__price">' + formatMoney(price) + '</p>' +
            '<div class="buzzko-wishlist-card__actions">' +
              '<button type="button" class="buzzko-wishlist-card__atc" data-wishlist-add-to-cart="' + escapeHtml(item.productId) + '"' +
                ' data-variant-id="' + escapeHtml(variant ? variant.id : '') + '"' + (unavailable ? ' disabled' : '') + '>' +
                (unavailable ? 'Sold Out' : 'Add to Cart') +
              '</button>' +
              '<button type="button" class="buzzko-wishlist-card__remove" data-wishlist-remove="' + escapeHtml(item.productId) + '">Remove</button>' +
            '</div>' +
          '</div>' +
        '</article>';
      }).join('');

      if (loading) loading.hidden = true;
      if (!valid.length) {
        if (empty) empty.hidden = false;
        grid.innerHTML = '';
      }
    });
  }

  function removeById(productId) {
    var id = normaliseId(productId);
    writeItems(readItems().filter(function (item) { return normaliseId(item.productId) !== id; }));
  }

  function bindPageActions() {
    document.addEventListener('click', function (event) {
      var removeButton = event.target.closest('[data-wishlist-remove]');
      if (removeButton) {
        event.preventDefault();
        removeById(removeButton.dataset.wishlistRemove);
        return;
      }

      var addButton = event.target.closest('[data-wishlist-add-to-cart]');
      if (!addButton) return;
      event.preventDefault();
      if (addButton.disabled) return;

      var productId = addButton.dataset.wishlistAddToCart;
      var variantId = addButton.dataset.variantId;
      if (!variantId) return;

      addButton.disabled = true;
      var oldText = addButton.textContent;
      addButton.textContent = 'Adding…';

      fetch((window.Shopify && window.Shopify.routes && window.Shopify.routes.root || '/') + 'cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1 }] })
      }).then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (error) {
            throw new Error(error.description || 'Could not add this item to the cart.');
          });
        }
        return response.json();
      }).then(function () {
        removeById(productId);
      }).catch(function (error) {
        console.error('[BuzzKo Wishlist] Add to cart failed:', error);
        addButton.disabled = false;
        addButton.textContent = oldText === 'Add to Cart' ? 'Try Again' : oldText;
        window.alert(error.message || 'Could not add this item to the cart. Please try again.');
      });
    });
  }

  window.BuzzkoWishlist = {
    key: STORAGE_KEY,
    getItems: readItems,
    hasProduct: hasProduct,
    toggle: toggle,
    updateVariant: updateVariant,
    refresh: refresh,
    remove: removeById
  };

  function init() {
    bindEvents();
    bindPageActions();
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();