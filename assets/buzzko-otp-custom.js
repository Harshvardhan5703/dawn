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
      var currentText = subtitle.textContent.trim();
      var newText = null;

      // If opened via Wishlist, force our text
      if (window.__buzzkoAuthIntent === 'view') {
        newText = 'Sign in to see your wishlist ❤️';
      } else if (window.__buzzkoAuthIntent === 'product') {
        newText = 'Sign in to add this product to your favourites ❤️';
      } else {
        // DEFAULT OPEN: Only replace if we are on the initial screen.
        // If the text has changed to "Enter OTP", we ignore it.
        if (currentText === "Choose how you'd like to continue" || currentText === 'Welcome! Choose your sign in option') {
          newText = 'Welcome! Choose your sign in option';
        }
      }

      if (newText && currentText !== newText) {
        subtitle.textContent = newText;
      }
    }

    // 2. Handle Terms & Conditions Link
    if (helper && !helper.dataset.hasTerms) {
      // ONLY swap the text if we are on the screen that actually says "Charges may apply"
      if (helper.innerHTML.includes('Charges may apply')) {
        var linkHtml = '<a href="/policies/terms-of-service" target="_blank" style="color: inherit; text-decoration: underline; text-underline-offset: 2px;">Terms & conditions</a>';
        helper.innerHTML = helper.innerHTML.replace('Charges may apply', linkHtml);
        helper.dataset.hasTerms = 'true';
      }
    }
  }

  // Watch for the modal popping up in the DOM
  var observer = new MutationObserver(function () {
    var modal = document.getElementById('otp-nca-account-modal');
    if (modal && (modal.offsetWidth > 0 || modal.offsetHeight > 0)) {
      customizeOtpModal();
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    observer.observe(document.body, { childList: true, subtree: true });
  });

  // Clear the intent flag when the modal is closed
  document.addEventListener('click', function(event) {
    if (event.target.closest && event.target.closest('.otp-account-modal__close, .otp-account-modal-backdrop')) {
      window.__buzzkoAuthIntent = null;
    }
  });
})();