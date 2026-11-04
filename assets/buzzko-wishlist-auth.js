(function () {
  'use strict';

  if (window.BuzzkoWishlistAuth) return;

  var PENDING_KEY = 'buzzko:wishlist:pending-auth:v1';
  
  var currentIntent = null;    
  var pendingPayload = null;   
  var checkingAuthentication = false;

  /* ---------- storage ---------- */
  function savePending(payload) {
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload)); } catch (e) {}
  }
  function getPending() {
    try { var v = sessionStorage.getItem(PENDING_KEY); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function clearPending() {
    pendingPayload = null;
    try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {}
  }

  /* ---------- auth state ---------- */
  function isCustomerSignedIn() {
    // 1. Check the server-set data attribute first
    if (document.documentElement.dataset.buzzkoCustomerSignedIn === 'true') {
      return true;
    }

    // 2. MOBILE FALLBACK: Check the actual Shopify login cookie
    // OTP on mobile sets the cookie but doesn't reload the page, so the dataset stays false.
    if (/(^|;\s*)logged_in_customer_id=/.test(document.cookie)) {
      // Self-heal the state so the rest of the page knows they are logged in
      document.documentElement.dataset.buzzkoCustomerSignedIn = 'true';
      return true;
    }

    return false;
  }

  function ensureHeaderBadge() {
    var link = document.querySelector('.buzzko-header-wishlist');
    if (!link || link.querySelector('[data-buzzko-wishlist-count]')) return;
    var badge = document.createElement('span');
    badge.className = 'buzzko-wishlist-count';
    badge.setAttribute('data-buzzko-wishlist-count', '');
    badge.setAttribute('data-count', '0');
    badge.setAttribute('aria-live', 'polite');
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
    
    var alreadySaved = (payload.variantId && window.BuzzkoWishlist.hasVariant) 
      ? window.BuzzkoWishlist.hasVariant(payload.variantId) 
      : window.BuzzkoWishlist.hasProduct(payload.productId);

    if (!alreadySaved) {
      window.BuzzkoWishlist.toggle(payload);
    }
    
    window.BuzzkoWishlist.refresh();

    // Force the specific heart to fill visually
    var heartBtns = document.querySelectorAll('[data-buzzko-wishlist-toggle]');
    heartBtns.forEach(function(btn) {
      if (btn.dataset.productId === String(payload.productId) || btn.dataset.variantId === String(payload.variantId)) {
        btn.classList.add('is-active');
        btn.setAttribute('aria-pressed', 'true');
      }
    });
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
    currentIntent = null; 

    window.setTimeout(function () {
      fetch('/account.json', {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
      })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (customer) {
          checkingAuthentication = false;
          if (!customer || !customer.id) return; 

          markSignedIn();

          if (intent === 'product') {
            var payload = pendingPayload || getPending();
            clearPending();
            if (payload) applyPendingWishlist(payload);
          } else {
            clearPending(); 
          }
        })
        .catch(function () { checkingAuthentication = false; });
    }, 500);
  }

  /* ---------- entry points ---------- */
  function openOtpModal() {
    var trigger = document.querySelector('.header__icon--account, shopify-account, [data-otp-login]');
    if (trigger) { trigger.click(); return true; }
    return false;
  }

  function handleWishlistClick(button, payload) {
    // isCustomerSignedIn now checks the cookie directly, fixing the mobile issue!
    if (isCustomerSignedIn()) return false;
    
    if (!payload || !payload.productId || !payload.handle) return true;

    currentIntent = 'product';
    pendingPayload = payload;
    savePending(payload);

    window.__buzzkoAuthIntent = 'product';

    if (!openOtpModal()) {
      currentIntent = null; window.__buzzkoAuthIntent = null; clearPending();
      return false;
    }
    return true;
  }

  function handleHeaderWishlistClick(event) {
    if (isCustomerSignedIn()) return;
    event.preventDefault();
    currentIntent = 'view';
    
    window.__buzzkoAuthIntent = 'view';

    if (!openOtpModal()) {
      currentIntent = null; window.__buzzkoAuthIntent = null;
      window.location.assign('/account/login?return_url=' + encodeURIComponent(window.location.pathname));
      return;
    }
  }

  /* ---------- init ---------- */
  function init() {
    recoverAfterRedirect();

    document.addEventListener('click', function (event) {
      var link = event.target.closest && event.target.closest('[data-buzzko-wishlist-link]');
      if (!link) return;
      handleHeaderWishlistClick(event);
    });

    document.addEventListener('click', function (event) {
      if (event.target.closest && event.target.closest('.otp-account-modal__close, .otp-account-modal-backdrop')) {
        if (document.getElementById('otp-nca-account-modal')) checkAuthentication();
      }
    });

    // MOBILE FIX: Check auth when the user switches back to the tab (e.g., from email/SMS app)
    window.addEventListener('focus', function() {
      if (currentIntent || getPending()) checkAuthentication();
    });

    // MOBILE FIX: Check auth when page is restored from cache
    window.addEventListener('pageshow', function(event) {
      if (event.persisted && (currentIntent || getPending())) checkAuthentication();
    });
  }

  window.BuzzkoWishlistAuth = {
    handleWishlistClick: handleWishlistClick,
    handleHeaderWishlistClick: handleHeaderWishlistClick,
    isCustomerSignedIn: isCustomerSignedIn
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();