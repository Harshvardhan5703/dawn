(function () {
  'use strict';

  // Global flag for the Wishlist script to communicate with this UI script
  window.__buzzkoAuthIntent = null;

  function customizeOtpModal() {
    var modal = document.getElementById('otp-nca-account-modal');
    if (!modal) return;

    var subtitle = modal.querySelector('.otp-card__subtitle');
    var helper = modal.querySelector('.otp-helper');

    // 1. Handle Subtitle Text
    if (subtitle) {
      if (window.__buzzkoAuthIntent === 'view') {
        subtitle.textContent = 'Sign in to see your wishlist ❤️';
      } else if (window.__buzzkoAuthIntent === 'product') {
        subtitle.textContent = 'Sign in to add this product to your favourites ❤️';
      } else {
        subtitle.textContent = 'Welcome! Choose your sign in option';
      }
    }

    // 2. Handle Terms & Conditions Link
    if (helper && !helper.dataset.hasTerms) {
      helper.innerHTML = '<a href="/policies/terms-of-service" target="_blank" style="color: inherit; text-decoration: underline; text-underline-offset: 3px; font-weight: 700;">Terms & conditions</a>';
      helper.dataset.hasTerms = 'true';
    }
  }

  // Watch for the modal popping up in the DOM
  var observer = new MutationObserver(function (mutations) {
    var modal = document.getElementById('otp-nca-account-modal');
    // If modal exists and is visible on screen
    if (modal && (modal.offsetWidth > 0 || modal.offsetHeight > 0)) {
      customizeOtpModal();
    }
  });

  // Start watching the page
  document.addEventListener('DOMContentLoaded', function() {
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // Clear the intent flag when the modal is closed so the next time they 
  // open it normally, it resets to "Welcome!"
  document.addEventListener('click', function(event) {
    if (event.target.closest && event.target.closest('.otp-account-modal__close, .otp-account-modal-backdrop')) {
      window.__buzzkoAuthIntent = null;
    }
  });
})();