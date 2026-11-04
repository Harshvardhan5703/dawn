(function () {
  'use strict';

  if (window.BuzzkoWishlistAuth) return;

  var PENDING_KEY = 'buzzko:wishlist:pending-auth:v1';
  
  var currentIntent = null;    
  var pendingPayload = null;   

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
    if (document.documentElement.dataset.buzzkoCustomerSignedIn === 'true') return true;
    if (/(^|;\s*)logged_in_customer_id=/.test(document.cookie)) {
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

    if (!alreadySaved && window.BuzzkoWishlist.toggle) {
      window.BuzzkoWishlist.toggle(payload);
    }
    
    if (window.BuzzkoWishlist.refresh) window.BuzzkoWishlist.refresh();

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
    var intent = currentIntent;
    currentIntent = null; 

    window.setTimeout(function () {
      fetch('/account.json', {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
      })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (customer) {
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
        .catch(function () {});
    }, 500);
  }

  /* ---------- entry points ---------- */
  function openOtpModal() {
    var trigger = document.querySelector('.header__icon--account, shopify-account, [data-otp-login]');
    if (trigger) { trigger.click(); return true; }
    return false;
  }

  function handleWishlistClick(button, payload) {
    if (isCustomerSignedIn()) return false; // Handled instantly by buzzko-wishlist.js
    
    if (!payload || !payload.productId || !payload.handle) return true;

    // Show a subtle loading state on the heart
    if (button) {
      button.style.opacity = '0.5';
      button.style.pointerEvents = 'none';
    }

    // MOBILE OTP FIX: Verify with Shopify directly before opening the modal
    fetch('/account.json', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (customer) {
        if (button) {
          button.style.opacity = '';
          button.style.pointerEvents = '';
        }

        if (customer && customer.id) {
          // They ARE logged in (OTP didn't reload the page)
          markSignedIn();
          applyPendingWishlist(payload);
        } else {
          // They are genuinely signed out
          currentIntent = 'product';
          pendingPayload = payload;
          savePending(payload);
          window.__buzzkoAuthIntent = 'product';

          if (!openOtpModal()) {
            currentIntent = null; window.__buzzkoAuthIntent = null; clearPending();
            // Fallback: toggle locally if no OTP modal exists
            if (window.BuzzkoWishlist && window.BuzzkoWishlist.toggle) {
              var nowAdded = window.BuzzkoWishlist.toggle(payload);
              if (button) {
                button.classList.toggle('is-active', nowAdded);
                button.setAttribute('aria-pressed', nowAdded ? 'true' : 'false');
              }
            }
          }
        }
      })
      .catch(function () {
        if (button) {
          button.style.opacity = '';
          button.style.pointerEvents = '';
        }
        openOtpModal();
      });

    return true; // Stop propagation, we handled it asynchronously
  }

  function handleHeaderWishlistClick(event) {
    if (isCustomerSignedIn()) return;
    event.preventDefault();
    
    var link = event.target.closest('[data-buzzko-wishlist-link]');

    fetch('/account.json', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (customer) {
        if (customer && customer.id) {
          markSignedIn();
          if (link && link.href) window.location.href = link.href;
        } else {
          currentIntent = 'view';
          window.__buzzkoAuthIntent = 'view';
          if (!openOtpModal()) {
            currentIntent = null; window.__buzzkoAuthIntent = null;
            window.location.assign('/account/login?return_url=' + encodeURIComponent(window.location.pathname));
          }
        }
      })
      .catch(function() {
        window.location.assign('/account/login?return_url=' + encodeURIComponent(window.location.pathname));
      });
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

    window.addEventListener('focus', function() {
      if (currentIntent || getPending()) checkAuthentication();
    });

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