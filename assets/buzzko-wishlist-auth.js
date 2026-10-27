(function () {
  'use strict';

  if (window.BuzzkoWishlistAuth) return;

  var PENDING_KEY = 'buzzko:wishlist:pending-auth:v1';
  var account = null;
  var pendingPayload = null;   // product intent (heart click)
  var pendingView = false;     // view intent (header click)
  var currentIntent = null;    // 'product' | 'view' | null — what opened THIS sheet
  var authWasOpened = false;
  var checkingAuthentication = false;

  /* ---------- storage ---------- */

  function savePending(payload) {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload)); }
    catch (e) { console.warn('[BuzzKo Wishlist] Could not save pending action.', e); }
  }

  function getPending() {
    try { var v = sessionStorage.getItem(PENDING_KEY); return v ? JSON.parse(v) : null; }
    catch (e) { return null; }
  }

  function clearPending() {
    pendingPayload = null;
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {}
  }

  /* ---------- auth state ---------- */

  function isCustomerSignedIn() {
    if (document.documentElement.dataset.buzzkoCustomerSignedIn === 'true') return true;
    // Liquid fallback: the count badge is only rendered inside {% if customer %}.
    return !!document.querySelector('.buzzko-header-wishlist [data-buzzko-wishlist-count]');
  }

  // Injects the header badge for signed-out visitors who just signed in
  // without a page reload (so refresh() has an element to update).
  // Idempotent — no-op if the badge already exists.
  function ensureHeaderBadge() {
    var link = document.querySelector('.buzzko-header-wishlist');
    if (!link || link.querySelector('[data-buzzko-wishlist-count]')) return;

    var badge = document.createElement('span');
    badge.className = 'buzzko-wishlist-count';
    badge.setAttribute('data-buzzko-wishlist-count', '');
    badge.setAttribute('data-count', '0');
    badge.setAttribute('aria-live', 'polite');
    badge.setAttribute('aria-label', '0 items in wishlist');
    badge.textContent = '0';
    link.appendChild(badge);
  }

  function markSignedIn() {
    document.documentElement.dataset.buzzkoCustomerSignedIn = 'true';
    ensureHeaderBadge();
    if (window.BuzzkoWishlist && typeof window.BuzzkoWishlist.refresh === 'function') {
      window.BuzzkoWishlist.refresh();
    }
  }

  /* ---------- Shopify header account component ---------- */

  function findHeaderAccount() {
    return document.querySelector('.section-header shopify-account.header__icon--account')
        || document.querySelector('shopify-account.header__icon--account')
        || document.querySelector('.header__icons shopify-account');
  }

  function getAccountTrigger() {
    if (!account || !account.shadowRoot) return null;
    // Fixed: was missing the closing " in [part="signed-out-avatar]
    return account.shadowRoot.querySelector('[part="signed-out-avatar"]')
        || account.shadowRoot.querySelector('button');
  }

  function openHeaderAccount() {
    account = findHeaderAccount();
    var trigger = getAccountTrigger();
    if (!account || !trigger) {
      console.warn('[BuzzKo Wishlist] Could not find the Shopify header account trigger.');
      return false;
    }
    var header = document.querySelector('.section-header .header');
    if (header) {
      account.style.setProperty(
        '--account-dialog-top',
        Math.round(header.getBoundingClientRect().bottom) + 'px'
      );
    }
    authWasOpened = false;
    trigger.click();
    return true;
  }

  /* ---------- pending intents ---------- */

  function applyPendingWishlist(payload) {
    if (!payload || !payload.productId || !window.BuzzkoWishlist) return;

    // FIXED: variant-aware check so multi-variant products work correctly.
    // Previously used hasProduct() which returns true for ANY variant,
    // so adding variant B while variant A was saved silently did nothing.
    var alreadySaved;
    if (payload.variantId && typeof window.BuzzkoWishlist.hasVariant === 'function') {
      alreadySaved = window.BuzzkoWishlist.hasVariant(payload.variantId);
    } else {
      alreadySaved = window.BuzzkoWishlist.hasProduct(payload.productId);
    }

    if (!alreadySaved) {
      window.BuzzkoWishlist.toggle(payload);
    }
    window.BuzzkoWishlist.refresh();
  }

  function recoverAfterRedirect() {
    var payload = getPending();
    if (!payload || !isCustomerSignedIn()) return;
    clearPending();
    applyPendingWishlist(payload);
  }

  function checkAuthenticationAfterSheetCloses() {
    if (checkingAuthentication) return;
    checkingAuthentication = true;

    // Capture intent NOW — the sheet's auth flow may take a moment.
    var intent = currentIntent;
    currentIntent = null;

    window.setTimeout(function () {
      fetch('/account.json', {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' }
      })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (customer) {
          checkingAuthentication = false;

          if (!customer || !customer.id) {
            // Sheet closed without sign-in. Keep pendingPayload in memory +
            // sessionStorage so the next heart click re-prompts; view intent
            // is transient so drop it.
            pendingView = false;
            return;
          }

          markSignedIn();

          if (intent === 'product') {
            var payload = pendingPayload || getPending();
            clearPending();
            if (payload) applyPendingWishlist(payload);
          } else {
            // View intent (or unknown) — never apply a stale product payload.
            clearPending();
          }

          pendingView = false;
        })
        .catch(function (error) {
          checkingAuthentication = false;
          console.warn('[BuzzKo Wishlist] Could not verify customer session.', error);
        });
    }, 500);
  }

  /* ---------- ENTRY POINT 1: product heart click ---------- */

  function handleWishlistClick(button, payload) {
    if (isCustomerSignedIn()) return false;

    if (!payload || !payload.productId || !payload.handle) {
      console.warn('[BuzzKo Wishlist] Wishlist button is missing product data.');
      return true;
    }

    pendingView = false;
    pendingPayload = payload;
    currentIntent = 'product';
    savePending(payload);

    if (!openHeaderAccount()) {
      currentIntent = null;
      clearPending();
      return false;
    }
    return true;
  }

  /* ---------- ENTRY POINT 2: header wishlist icon click ---------- */

  function handleHeaderWishlistClick(event) {
    if (isCustomerSignedIn()) return;   // allow normal navigation

    event.preventDefault();

    pendingView = true;
    currentIntent = 'view';

    if (!openHeaderAccount()) {
      // Last-resort fallback if the account web component is missing.
      pendingView = false;
      currentIntent = null;
      var returnUrl = encodeURIComponent(window.location.pathname);
      window.location.assign('/account/login?return_url=' + returnUrl);
    }
  }

  /* ---------- in-sheet notice (copy driven by currentIntent) ---------- */

  function showWishlistSignInNotice() {
    if (!account || !account.shadowRoot) return;

    var shadow = account.shadowRoot;
    var existing = shadow.querySelector('#buzzko-wishlist-signin-notice');

    // Copy reflects the action that opened THIS sheet, not accumulated state.
    if (!currentIntent) {
      if (existing) existing.remove();
      return;
    }

    var title, body;
    if (currentIntent === 'view') {
      title = 'Sign in to see your wishlist ❤️';
      body  = 'Your saved favourites are waiting. Sign in to view them.';
    } else {
      title = 'Save your favourites ❤️';
      body  = 'Sign in below to add this product to your wishlist.';
    }

    if (!shadow.querySelector('#buzzko-wishlist-signin-notice-style')) {
      var style = document.createElement('style');
      style.id = 'buzzko-wishlist-signin-notice-style';
      style.textContent = `
        #buzzko-wishlist-signin-notice {
          margin: 12px 16px 16px; padding: 12px 14px;
          border-radius: 12px; background: #FFF0F7; color: #1A1A1A;
          font-family: var(--shopify-account-font-body);
          font-size: 13px; line-height: 1.45;
        }
        #buzzko-wishlist-signin-notice strong {
          display: block; margin-bottom: 3px; font-size: 14px; font-weight: 700;
        }
        #buzzko-wishlist-signin-notice span { display: block; opacity: 0.8; }
      `;
      shadow.appendChild(style);
    }

    if (existing) {
      existing.querySelector('strong').textContent = title;
      existing.querySelector('span').textContent = body;
      return;
    }

    var header = shadow.querySelector('.account__header');
    if (!header) return;

    var notice = document.createElement('div');
    notice.id = 'buzzko-wishlist-signin-notice';
    notice.setAttribute('role', 'status');

    var strong = document.createElement('strong');
    strong.textContent = title;
    var span = document.createElement('span');
    span.textContent = body;

    notice.appendChild(strong);
    notice.appendChild(span);
    header.insertAdjacentElement('afterend', notice);
  }

  /* ---------- init ---------- */

  function init() {
    account = findHeaderAccount();

    if (account) {
      account.addEventListener('open', function () {
        authWasOpened = true;
        window.requestAnimationFrame(showWishlistSignInNotice);
      });
      account.addEventListener('close', function () {
        if (!authWasOpened) return;
        authWasOpened = false;
        checkAuthenticationAfterSheetCloses();
      });
    }

    recoverAfterRedirect();

    // Delegated handler covers the header icon and any future
    // [data-buzzko-wishlist-link] (e.g. a mobile drawer version).
    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('[data-buzzko-wishlist-link]');
      if (!link) return;
      handleHeaderWishlistClick(event);
    });
  }

  window.BuzzkoWishlistAuth = {
    handleWishlistClick: handleWishlistClick,
    handleHeaderWishlistClick: handleHeaderWishlistClick,
    openAccountMenu: openHeaderAccount,
    isCustomerSignedIn: isCustomerSignedIn
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();