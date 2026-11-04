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
    // Rely purely on Liquid's output. If it's false, we'll confirm with Shopify.
    return document.documentElement.dataset.buzzkoCustomerSignedIn === 'true';
  }

  function recoverAfterRedirect() {
    var payload = getPending();
    if (!payload || !isCustomerSignedIn()) return;
    clearPending();
    
    // The page reloaded successfully and the user is signed in. Add the item!
    if (window.BuzzkoWishlist && window.BuzzkoWishlist.toggle) {
       var alreadySaved = (payload.variantId && window.BuzzkoWishlist.hasVariant) 
         ? window.BuzzkoWishlist.hasVariant(payload.variantId) 
         : window.BuzzkoWishlist.hasProduct(payload.productId);
       
       if (!alreadySaved) window.BuzzkoWishlist.toggle(payload);
       if (window.BuzzkoWishlist.refresh) window.BuzzkoWishlist.refresh();
    }
  }

  function checkAuthentication() {
    var intent = currentIntent;
    currentIntent = null; 

    window.setTimeout(function () {
      fetch('/account.json', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (customer) {
          if (!customer || !customer.id) return; 
          // Success! The OTP worked but the page didn't reload. Force it to reload.
          window.location.reload();
        })
        .catch(function () {});
    }, 500);
  }

  function openOtpModal() {
    var trigger = document.querySelector('.header__icon--account, shopify-account, [data-otp-login]');
    if (trigger) { trigger.click(); return true; }
    return false;
  }

  function handleWishlistClick(button, payload) {
    // If the dataset is already true, let the normal wishlist logic handle it.
    if (isCustomerSignedIn()) return false; 
    
    if (!payload || !payload.productId || !payload.handle) return true;

    // Show loading state on the heart
    if (button) {
      button.style.opacity = '0.5';
      button.style.pointerEvents = 'none';
    }

    // Ask Shopify directly if they are actually logged in
    fetch('/account.json', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (res) { 
        if (!res.ok) return null;
        return res.json(); 
      })
      .then(function (customer) {
        if (customer && customer.id) {
          // THEY ARE LOGGED IN (OTP didn't reload). 
          // Save the wishlist item, then force reload so Liquid updates the page!
          savePending(payload);
          window.location.reload();
        } else {
          // They are genuinely signed out. Restore button and open OTP.
          if (button) {
            button.style.opacity = '';
            button.style.pointerEvents = '';
          }

          currentIntent = 'product';
          pendingPayload = payload;
          savePending(payload);
          window.__buzzkoAuthIntent = 'product';

          if (!openOtpModal()) {
            currentIntent = null; window.__buzzkoAuthIntent = null; clearPending();
            // Fallback if OTP modal doesn't exist
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
        // If fetch fails, just open the modal normally
        if (button) {
          button.style.opacity = '';
          button.style.pointerEvents = '';
        }
        openOtpModal();
      });

    return true; // Tell buzzko-wishlist.js we are handling this asynchronously
  }

  function handleHeaderWishlistClick(event) {
    if (isCustomerSignedIn()) return;
    event.preventDefault();
    
    fetch('/account.json', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (customer) {
        if (customer && customer.id) {
          // Logged in via OTP but page didn't reload. Force reload.
          window.location.reload();
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
    // 1. Check if we just reloaded from an OTP login and need to add an item
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