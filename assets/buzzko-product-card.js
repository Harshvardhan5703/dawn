(function () {
  if (document.body.dataset.buzzkoAtcInit === 'true') return;
  document.body.dataset.buzzkoAtcInit = 'true';

  var ROOT = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';

  function state(button, value) {
    if (value) button.setAttribute('data-state', value);
    else button.removeAttribute('data-state');
  }

  function updateBubble(cart) {
    if (!cart || typeof cart.item_count !== 'number') return;
    var cartLink = document.getElementById('cart-icon-bubble');
    if (!cartLink) return;

    var bubble = cartLink.querySelector('.cart-count-bubble');

    if (cart.item_count === 0) {
      if (bubble) bubble.remove();
      return;
    }

    if (!bubble) {
      bubble = document.createElement('div');
      bubble.className = 'cart-count-bubble';
      cartLink.appendChild(bubble);
    }

    bubble.innerHTML = '<span aria-hidden="true">' + cart.item_count + '</span><span class="visually-hidden">' + cart.item_count + (cart.item_count === 1 ? ' item' : ' items') + ' in cart</span>';
  }

  function readBubbleCount() {
    var link = document.getElementById('cart-icon-bubble');
    if (!link) return null;
    var bubble = link.querySelector('.cart-count-bubble');
    if (!bubble) return 0;
    var shown = bubble.querySelector('[aria-hidden="true"]');
    var n = shown ? parseInt(shown.textContent, 10) : NaN;
    return isNaN(n) ? null : n;
  }

  function countFromSection(html) {
    if (!html) return null;
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var shown = doc.querySelector('.cart-count-bubble [aria-hidden="true"]');
    var n = shown ? parseInt(shown.textContent, 10) : NaN;
    if (!isNaN(n)) return n;
    var sr = doc.querySelector('.cart-count-bubble .visually-hidden');
    var m = sr && sr.textContent.match(/\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  function addToCart(formData) {
    formData.set('sections', 'cart-icon-bubble');
    formData.set('sections_url', window.location.pathname);

    return fetch(ROOT + 'cart/add.js', {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: formData
    })
    .then(function (res) {
      return res.json().then(function (json) {
        if (!res.ok) throw json;
        return json;
      });
    })
    .then(function (json) {
      var count = countFromSection(json.sections && json.sections['cart-icon-bubble']);
      if (count !== null) return count;
      return fetch(ROOT + 'cart.js', { headers: { 'Accept': 'application/json' } })
        .then(function (res) { return res.json(); })
        .then(function (cart) { return cart.item_count; });
    });
  }

  var requestSeq = 0;
  var appliedSeq = 0;

  function addWithBubble(formData) {
    var before = readBubbleCount();
    var bumped = before !== null;
    if (bumped) updateBubble({ item_count: before + 1 });

    var mySeq = ++requestSeq;

    return addToCart(formData).then(function (count) {
      if (mySeq > appliedSeq) {
        appliedSeq = mySeq;
        updateBubble({ item_count: count });
      }
    }).catch(function (err) {
      if (bumped) {
        var now = readBubbleCount();
        if (now !== null && now > 0) updateBubble({ item_count: now - 1 });
      }
      throw err;
    });
  }

  var selectedVariantId = null;
  var lastOpen = null;
  var closeTimer = null;

  function parts() {
    return {
      modal: document.getElementById('buzzko-variant-modal'),
      img: document.getElementById('buzzko-modal-img'),
      title: document.getElementById('buzzko-modal-title'),
      price: document.getElementById('buzzko-modal-price'),
      variants: document.getElementById('buzzko-modal-variants'),
      add: document.getElementById('buzzko-modal-add')
    };
  }

  function openVariantModal(productTitle, defaultImage, variantsJson) {
    var P = parts();
    if (!P.modal || !P.variants) return;
    lastOpen = { title: productTitle, image: defaultImage, json: variantsJson };

    var variants = JSON.parse(variantsJson);
    P.title.textContent = productTitle;
    P.img.src = defaultImage || '';
    P.variants.innerHTML = '';
    selectedVariantId = null;
    var firstAvailableBtn = null;

    variants.forEach(function (v) {
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'buzzko-modal-variant-btn'; btn.textContent = v.title;
      if (!v.available) btn.disabled = true; else if (!firstAvailableBtn) firstAvailableBtn = btn;
      btn.dataset.variantId = v.id; btn.dataset.image = v.image || defaultImage; btn.dataset.price = v.price;
      btn.setAttribute('aria-pressed', 'false');

      btn.addEventListener('click', function () {
        if (btn.disabled) return;
        P.variants.querySelectorAll('.buzzko-modal-variant-btn').forEach(function (b) { b.classList.remove('is-active'); b.setAttribute('aria-pressed', 'false'); });
        btn.classList.add('is-active'); btn.setAttribute('aria-pressed', 'true');
        if (btn.dataset.image) P.img.src = btn.dataset.image;
        selectedVariantId = btn.dataset.variantId; P.price.textContent = btn.dataset.price;
        P.add.disabled = false; P.add.textContent = 'Add to Cart';
      });
      P.variants.appendChild(btn);
    });

    if (firstAvailableBtn) firstAvailableBtn.click();
    else { P.price.innerHTML = ''; P.add.disabled = true; P.add.textContent = 'Sold Out'; }
    if (typeof P.modal.showModal === 'function') P.modal.showModal(); else P.modal.setAttribute('open', '');
  }

  function resetAddButton() {
    var A = parts().add;
    if (!A) return;
    A.style.background = '';
    A.style.color = '';
    A.textContent = 'Add to Cart';
    A.disabled = false;
  }

  function closeModal() {
    var P = parts();
    if (!P.modal) return;
    if (typeof P.modal.close === 'function') P.modal.close(); else P.modal.removeAttribute('open');
    selectedVariantId = null;
  }

  function onModalAdd() {
    var A = parts().add;
    if (!A || A.disabled || !selectedVariantId) return;
    var id = selectedVariantId;

    clearTimeout(closeTimer);
    A.textContent = 'Added ✓';
    A.style.background = '#B9E404';
    A.style.color = '#111';
    A.disabled = true;
    closeTimer = setTimeout(function () { closeModal(); resetAddButton(); }, 450);

    var data = new FormData();
    data.append('id', id);
    data.append('quantity', 1);

    addWithBubble(data).catch(function (err) {
      console.error(err);
      clearTimeout(closeTimer);
      var P = parts();
      if (!(P.modal && P.modal.open) && lastOpen) {
        openVariantModal(lastOpen.title, lastOpen.image, lastOpen.json);
        var b = parts().variants.querySelector('[data-variant-id="' + id + '"]');
        if (b) b.click();
      }
      var A2 = parts().add;
      if (A2) {
        A2.style.background = '';
        A2.style.color = '';
        A2.textContent = 'Try again';
        A2.disabled = false;
      }
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#buzzko-modal-close')) { closeModal(); return; }
    if (t.id === 'buzzko-variant-modal') { closeModal(); return; }
    if (t.closest('#buzzko-modal-add')) { onModalAdd(); }
  });

  document.body.addEventListener('click', function (event) {
    var button = event.target.closest('.buzzko-product-card__atc');
    if (button && !button.disabled && button.dataset.hasVariants === 'true') {
      event.preventDefault();
      openVariantModal(button.dataset.productTitle, button.dataset.productImage, button.dataset.variants);
    }
  });

  document.body.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form.matches('[data-buzzko-atc]')) return;
    event.preventDefault();

    var button = form.querySelector('.buzzko-product-card__atc');
    if (!button || button.disabled || button.dataset.hasVariants === 'true') return;

    state(button, 'success');
    button.disabled = true;
    setTimeout(function () {
      if (button.getAttribute('data-state') === 'success') {
        state(button, '');
        button.disabled = false;
      }
    }, 700);

    addWithBubble(new FormData(form)).catch(function (error) {
      console.error(error);
      state(button, 'error');
      button.disabled = true;
      setTimeout(function () {
        state(button, '');
        button.disabled = false;
      }, 2000);
    });
  });
})();