(function () {
  'use strict';

  if (window.BuzzkoWishlistAuth) return;

  var PENDING_KEY = 'buzzko:wishlist:pending-auth:v1';
  var account = null;
  var pendingPayload = null;   // set by handleWishlistClick (product heart)
  var pendingView = false;     // set by handleHeaderWishlistClick (header icon)
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
    // Liquid fallback: the count badge only renders inside {% if customer %}.
    return !!document.querySelector('.buzzko-header-wishlist [data-buzzko-wishlist-count]');
  }

  function markSignedIn() {
    document.documentElement.dataset.buzzkoCustomerSignedIn = 'true';
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
    if (!window.BuzzkoWishlist.hasProduct(payload.productId)) {
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
            // Sheet closed without completing sign-in — drop the *view* intent
            // so the next unrelated click doesn't show stale copy.
            pendingView = false;
            return;
          }

          // Persist signed-in state for the rest of this page session so
          // the next click (heart or header icon) works without a reload.
          markSignedIn();

          var payload = pendingPayload || getPending();
          pendingView = false;
          clearPending();

          // Only product intent has a post-login action. View intent
          // intentionally does nothing — the user stays on this page and
          // can click the wishlist icon again (now it will navigate).
          if (payload) applyPendingWishlist(payload);
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

    // Product intent wins over any stale view intent.
    pendingView = false;
    pendingPayload = payload;
    savePending(payload);

    if (!openHeaderAccount()) {
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

    if (!openHeaderAccount()) {
      // Last-resort fallback if the account web component is missing.
      pendingView = false;
      var returnUrl = encodeURIComponent(window.location.pathname);
      window.location.assign('/account/login?return_url=' + returnUrl);
    }
  }

  /* ---------- in-sheet notice (shared, copy differs by intent) ---------- */

  function showWishlistSignInNotice() {
    if (!account || !account.shadowRoot) return;

    var shadow = account.shadowRoot;
    var existing = shadow.querySelector('#buzzko-wishlist-signin-notice');

    var hasProduct = !!(pendingPayload || getPending());
    var hasView = pendingView;

    if (!hasProduct && !hasView) {
      if (existing) existing.remove();
      return;
    }

    // Product intent takes priority — it's the more specific, actionable one.
    var title, body;
    if (hasProduct) {
      title = 'Save your favourites ❤️';
      body  = 'Sign in below to add this product to your wishlist.';
    } else {
      title = 'Sign in to see your wishlist ❤️';
      body  = 'Your saved favourites are waiting. Sign in to view them.';
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

    // Delegated handler covers the header icon (and any future
    // [data-buzzko-wishlist-link], e.g. a mobile drawer version).
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