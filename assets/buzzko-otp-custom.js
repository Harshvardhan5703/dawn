(function () {
  'use strict';

  window.__buzzkoAuthIntent = null;
  var sawLoginScreen = false; 

  function customizeOtpModal() {
    var modal = document.getElementById('otp-nca-account-modal');
    if (!modal) return;

    if (modal.querySelector('.otp-card') || modal.querySelector('.otp-login-modal-body')) {
      sawLoginScreen = true;
    }

    var dashboard = modal.querySelector('.otp-account-dashboard');
    if (sawLoginScreen && dashboard && modal.style.display !== 'none') {
      modal.style.display = 'none';
      return; 
    }

    var subtitle = modal.querySelector('.otp-card__subtitle');
    var helper = modal.querySelector('.otp-helper');

    // 1. Handle Subtitle Text
    if (subtitle) {
      var currentText = subtitle.textContent.trim();
      var newText = null;

      if (window.__buzzkoAuthIntent === 'view') {
        newText = 'Sign in to see your wishlist ❤️';
      } else if (window.__buzzkoAuthIntent === 'product') {
        newText = 'Sign in to add this product to your favourites ❤️';
      } else {
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
      if (helper.innerHTML.includes('Charges may apply')) {
        // Removed target="_blank", added class for our JS to intercept
        var linkHtml = '<a href="#" class="buzzko-terms-link" style="color: inherit; text-decoration: underline; text-underline-offset: 2px;">Terms & conditions</a>';
        helper.innerHTML = helper.innerHTML.replace('Charges may apply', linkHtml);
        helper.dataset.hasTerms = 'true';
      }
    }
  }

  // 3. The Terms Modal Logic
  function openTermsModal(event) {
    event.preventDefault(); // Stop the page from jumping to the top
    
    // Create the modal if it doesn't exist yet
    if (!document.getElementById('buzzko-terms-modal')) {
      var modalHtml = `
        <div id="buzzko-terms-modal" class="buzzko-terms-backdrop">
          <div class="buzzko-terms-content">
            <button type="button" class="buzzko-terms-close" aria-label="Close">&times;</button>
            <div class="buzzko-terms-body">
              <div class="buzzko-terms-loader">Loading policy...</div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);

      // Fetch the Shopify policy page content
      fetch('/policies/terms-of-service')
        .then(function(res) { return res.text(); })
        .then(function(html) {
          // Parse the HTML to extract just the policy text
          var parser = new DOMParser();
          var doc = parser.parseFromString(html, 'text/html');
          
          // Try to find the main policy body, fallback to main tag or body
          var policyContent = doc.querySelector('.shopify-policy__body') 
                           || doc.querySelector('.rte') 
                           || doc.querySelector('main') 
                           || doc.body;

          var modalBody = document.querySelector('#buzzko-terms-modal .buzzko-terms-body');
          if (modalBody) {
            modalBody.innerHTML = policyContent.innerHTML;
          }
        })
        .catch(function() {
          var modalBody = document.querySelector('#buzzko-terms-modal .buzzko-terms-body');
          if (modalBody) modalBody.innerHTML = '<p>Could not load terms. Please check back later.</p>';
        });
    }

    // Show the modal
    document.getElementById('buzzko-terms-modal').classList.add('is-active');
  }

  // Listen for clicks on the terms link
  document.addEventListener('click', function(event) {
    if (event.target.closest && event.target.closest('.buzzko-terms-link')) {
      openTermsModal(event);
    }
  });

  // Handle closing the terms modal
  document.addEventListener('click', function(event) {
    var modal = document.getElementById('buzzko-terms-modal');
    if (!modal) return;

    // If clicking the dark backdrop or the X button
    if (event.target === modal || event.target.closest('.buzzko-terms-close')) {
      modal.classList.remove('is-active');
    }
  });

  // The rest of the observer logic
  var observer = new MutationObserver(function () {
    var modal = document.getElementById('otp-nca-account-modal');
    if (modal && (modal.offsetWidth > 0 || modal.offsetHeight > 0)) {
      customizeOtpModal();
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    observer.observe(document.body, { childList: true, subtree: true });
  });

  document.addEventListener('click', function(event) {
    if (event.target.closest && event.target.closest('.otp-account-modal__close, .otp-account-modal-backdrop')) {
      window.__buzzkoAuthIntent = null;
      sawLoginScreen = false; 
    }
  });
})();