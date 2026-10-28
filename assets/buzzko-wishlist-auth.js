(function () {
  'use strict';

  if (window.BuzzkoWishlistAuth) return;

  var PENDING_KEY = 'buzzko:wishlist:pending-auth:v1';
  
  // State
  var currentIntent = null;    // 'product' | 'view' | null
  var pendingPayload = null;   // product intent (heart click)
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
    // Fallback: The count badge only renders in Liquid inside {% if customer %}
    return !!document.querySelector('.buzzko-header-wishlist [data-buzzko-wishlist-count]');
  }

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

  /* ---------- pending actions ---------- */

  function applyPendingWishlist(payload) {
    if (!payload || !payload.productId || !window.BuzzkoWishlist) return;

    // Variant-aware check so adding a new variant of an already-saved product works
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

  function checkAuthentication() {
    if (checkingAuthentication) return;
    checkingAuthentication = true;

    var intent = currentIntent;
    resetOtpModalText(); // Revert OTP+ modal text back to default

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
            // Closed without signing in
            currentIntent = null;
            return;
          }

          markSignedIn();

          if (intent === 'product') {
            var payload = pendingPayload || getPending();
            clearPending();
            if (payload) applyPendingWishlist(payload);
          } else {
            // View intent: discard any stale product payloads
            clearPending();
          }
          currentIntent = null;
        })
        .catch(function (error) {
          checkingAuthentication = false;
          currentIntent = null;
          console.warn('[BuzzKo Wishlist] Could not verify customer session.', error);
        });
    }, 500);
  }

  /* =========================================================
     ACTIVE: OTP+ ACCOUNT MODAL INTEGRATION
     ========================================================= */

  function openOtpModal() {
    // OTP+ hooks into the native header account icon to open the modal
    var trigger = document.querySelector('.header__icon--account, shopify-account, [data-otp-login]');
    if (trigger) {
      trigger.click();
      return true;
    }
    console.warn('[BuzzKo Wishlist] Could not find the OTP+ trigger element.');
    return false;
  }

  function injectOtpModalText() {
    // Poll for OTP+ modal injection
    var attempts = 0;
    var interval = setInterval(function () {
      var subtitle = document.querySelector('#otp-nca-account-modal .otp-card__subtitle');
      
      if (subtitle) {
        clearInterval(interval);
        
        // Save default OTP+ text
        if (!subtitle.dataset.originalText) {
          subtitle.dataset.originalText = subtitle.textContent;
        }
        
        if (currentIntent === 'view') {
          subtitle.textContent = 'Sign in to see your wishlist ❤️';
        } else if (currentIntent === 'product') {
          subtitle.textContent = 'Sign in to add this product to your favourites ❤️';
        }
      }
      
      if (++attempts > 40) clearInterval(interval); // Stop after 2 seconds
    }, 50);
  }

  function resetOtpModalText() {
    var subtitle = document.querySelector('#otp-nca-account-modal .otp-card__subtitle');
    if (subtitle && subtitle.dataset.originalText) {
      subtitle.textContent = subtitle.dataset.originalText;
    }
  }

  /* ---------- entry points ---------- */

  function handleWishlistClick(button, payload) {
    if (isCustomerSignedIn()) return false;
    if (!payload || !payload.productId || !payload.handle) return true;

    currentIntent = 'product';
    pendingPayload = payload;
    savePending(payload);

    if (!openOtpModal()) { // Swap this with openHeaderAccount() to revert
      currentIntent = null;
      clearPending();
      return false;
    }
    
    injectOtpModalText();
    return true;
  }

  function handleHeaderWishlistClick(event) {
    if (isCustomerSignedIn()) return;

    event.preventDefault();

    currentIntent = 'view';
    
    if (!openOtpModal()) { // Swap this with openHeaderAccount() to revert
      currentIntent = null;
      window.location.assign('/account/login?return_url=' + encodeURIComponent(window.location.pathname));
      return;
    }
    
    injectOtpModalText();
  }


  /* =========================================================
     DORMANT: NATIVE SHOPIFY ACCOUNT MODAL INTEGRATION
     (Uncomment this block and update the two openOtpModal() calls 
     above if you ever pivot back from OTP+)
     ========================================================= */
  /*
  var account = null;
  var authWasOpened = false;

  function findHeaderAccount() {
    return document.querySelector('.section-header shopify-account.header__icon--account')
        || document.querySelector('shopify-account.header__icon--account')
        || document.querySelector('.header__icons shopify-account');
  }

  function getAccountTrigger() {
    if (!account || !account.shadowRoot) return null;
    return account.shadowRoot.querySelector('[part="signed-out-avatar"]')
        || account.shadowRoot.querySelector('button');
  }

  function openHeaderAccount() {
    account = findHeaderAccount();
    var trigger = getAccountTrigger();
    if (!account || !trigger) return false;

    var header = document.querySelector('.section-header .header');
    if (header) {
      account.style.setProperty('--account-dialog-top', Math.round(header.getBoundingClientRect().bottom) + 'px');
    }
    authWasOpened = false;
    trigger.click();
    return true;
  }

  function showWishlistSignInNotice() {
    if (!account || !account.shadowRoot) return;
    var shadow = account.shadowRoot;
    var existing = shadow.querySelector('#buzzko-wishlist-signin-notice');

    if (!currentIntent) {
      if (existing) existing.remove();
      return;
    }

    var title = currentIntent === 'view' ? 'Sign in to see your wishlist ❤️' : 'Save your favourites ❤️';
    var body = currentIntent === 'view' ? 'Your saved favourites are waiting. Sign in to view them.' : 'Sign in below to add this product to your wishlist.';

    if (!shadow.querySelector('#buzzko-wishlist-signin-notice-style')) {
      var style = document.createElement('style');
      style.id = 'buzzko-wishlist-signin-notice-style';
      style.textContent = `
        #buzzko-wishlist-signin-notice { margin: 12px 16px 16px; padding: 12px 14px; border-radius: 12px; background: #FFF0F7; color: #1A1A1A; font-family: var(--shopify-account-font-body); font-size: 13px; line-height: 1.45; }
        #buzzko-wishlist-signin-notice strong { display: block; margin-bottom: 3px; font-size: 14px; font-weight: 700; }
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
    notice.innerHTML = '<strong>' + title + '</strong><span>' + body + '</span>';
    header.insertAdjacentElement('afterend', notice);
  }

  function initNativeAccount() {
    account = findHeaderAccount();
    if (account) {
      account.addEventListener('open', function () {
        authWasOpened = true;
        window.requestAnimationFrame(showWishlistSignInNotice);
      });
      account.addEventListener('close', function () {
        if (!authWasOpened) return;
        authWasOpened = false;
        checkAuthentication();
      });
    }
  }
  */

  /* ---------- init ---------- */

  function init() {
    recoverAfterRedirect();

    // 1. Listen for Header Wishlist Icon Clicks
    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('[data-buzzko-wishlist-link]');
      if (!link) return;
      handleHeaderWishlistClick(event);
    });

    // 2. Listen for OTP+ Modal Close to check auth & reset text
    document.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('.otp-account-modal__close, .otp-account-modal-backdrop')) {
        if (currentIntent) {
          checkAuthentication();
        }
      }
    });

    // 3. Init Native Account (If uncommented above, uncomment this too)
    // initNativeAccount();
  }

  window.BuzzkoWishlistAuth = {
    handleWishlistClick: handleWishlistClick,
    handleHeaderWishlistClick: handleHeaderWishlistClick,
    openAccountMenu: openOtpModal, // Swap to openHeaderAccount if reverting
    isCustomerSignedIn: isCustomerSignedIn
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();