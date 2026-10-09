
(function () {
  'use strict';

  if (window.BuzzkoWishlistAuth) return;

  var PENDING_KEY = 'buzzko:wishlist:pending-auth:v1';
  var account = null;
  var pendingPayload = null;
  var authWasOpened = false;
  var checkingAuthentication = false;

  function savePending(payload) {
    try {
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('[BuzzKo Wishlist] Could not save pending action.', error);
    }
  }

  function getPending() {
    try {
      var value = sessionStorage.getItem(PENDING_KEY);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      return null;
    }
  }

  function clearPending() {
    pendingPayload = null;
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch (error) {}
  }

  function isCustomerSignedIn() {
    return document.documentElement.dataset.buzzkoCustomerSignedIn === 'true';
  }

  function findHeaderAccount() {
    return document.querySelector(
      '.section-header shopify-account.header__icon--account'
    ) || document.querySelector(
      'shopify-account.header__icon--account'
    ) || document.querySelector(
      '.header__icons shopify-account'
    );
  }

  function getAccountTrigger() {
    if (!account || !account.shadowRoot) return null;

    return account.shadowRoot.querySelector('[part="signed-out-avatar]') ||
      account.shadowRoot.querySelector('button');
  }

  function openHeaderAccount() {
    account = findHeaderAccount();

    var trigger = getAccountTrigger();

    if (!account || !trigger) {
      console.warn(
        '[BuzzKo Wishlist] Could not find the Shopify header account trigger.'
      );
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

  function applyPendingWishlist(payload) {
    if (
      !payload ||
      !payload.productId ||
      !window.BuzzkoWishlist
    ) return;

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
        .then(function (response) {
          return response.ok ? response.json() : null;
        })
        .then(function (customer) {
          checkingAuthentication = false;

          // Keep the pending action if authentication hasn't completed yet.
          if (!customer || !customer.id) return;

          var payload = pendingPayload || getPending();

          clearPending();
          applyPendingWishlist(payload);
        })
        .catch(function (error) {
          checkingAuthentication = false;

          console.warn(
            '[BuzzKo Wishlist] Could not verify customer session.',
            error
          );
        });
    }, 500);
  }

  function handleWishlistClick(button, payload) {
    if (isCustomerSignedIn()) return false;

    if (!payload || !payload.productId || !payload.handle) {
      console.warn(
        '[BuzzKo Wishlist] Wishlist button is missing product data.'
      );
      return true;
    }

    pendingPayload = payload;
    savePending(payload);

    // Open the same Shopify account menu used by the header.
    // Do not open the separate BuzzKo prompt.
    if (!openHeaderAccount()) {
      clearPending();
      return false;
    }

    return true;
  }


  
function showWishlistSignInNotice() {
  if (!account || !account.shadowRoot) return;

  var shadow = account.shadowRoot;
  var existing = shadow.querySelector('#buzzko-wishlist-signin-notice');

  // Only show this message when the account menu was opened
  // because someone tried to use the wishlist.
  var pending = pendingPayload || safeGetPending();

  if (!pending) {
    if (existing) existing.remove();
    return;
  }

  var header = shadow.querySelector('.account__header');

  if (!header) return;

  if (!shadow.querySelector('#buzzko-wishlist-signin-notice-style')) {
    var style = document.createElement('style');
    style.id = 'buzzko-wishlist-signin-notice-style';

    style.textContent = `
      #buzzko-wishlist-signin-notice {
        margin: 12px 16px 16px;
        padding: 12px 14px;
        border-radius: 12px;
        background: #FFF0F7;
        color: #1A1A1A;
        font-family: var(--shopify-account-font-body);
        font-size: 13px;
        line-height: 1.45;
      }

      #buzzko-wishlist-signin-notice strong {
        display: block;
        margin-bottom: 3px;
        font-size: 14px;
        font-weight: 700;
      }

      #buzzko-wishlist-signin-notice span {
        display: block;
        opacity: 0.8;
      }
    `;

    shadow.appendChild(style);
  }

  if (existing) return;

  var notice = document.createElement('div');
  notice.id = 'buzzko-wishlist-signin-notice';
  notice.setAttribute('role', 'status');
  notice.innerHTML =
    '<strong>Save your favourites ❤️</strong>' +
    '<span>Sign in below to add this product to your wishlist.</span>';

  header.insertAdjacentElement('afterend', notice);
}


  function init() {
    account = findHeaderAccount();

    if (account) {
      account.addEventListener('open', function () {
  authWasOpened = true;

  // Wait until Shopify has rendered its account menu.
  window.requestAnimationFrame(function () {
    showWishlistSignInNotice();
  });
});

      account.addEventListener('close', function () {
        if (!authWasOpened) return;

        authWasOpened = false;
        checkAuthenticationAfterSheetCloses();
      });
    }

    recoverAfterRedirect();
  }

  window.BuzzkoWishlistAuth = {
    handleWishlistClick: handleWishlistClick
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
