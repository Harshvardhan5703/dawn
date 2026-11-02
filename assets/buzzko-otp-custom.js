(function () {
  'use strict';

  window.__buzzkoAuthIntent = null;
  var sawLoginScreen = false; 

  function customizeOtpModal() {
    var modal = document.getElementById('otp-nca-account-modal');
    if (!modal || modal.style.display === 'none') return;

    // 1. Detect if the Login Screen is currently showing
    if (modal.querySelector('.otp-card') || modal.querySelector('.otp-login-modal-body')) {
      sawLoginScreen = true;
    }

    // 2. The moment the Dashboard appears after a successful login, kill the modal and reload.
    var dashboard = modal.querySelector('.otp-account-dashboard');
    if (sawLoginScreen && dashboard) {
      modal.style.display = 'none'; // Hide instantly
      
      // Trigger a page reload so Shopify updates the header and applies pending wishlist items
      if (!window.__buzzkoIsReloading) {
        window.__buzzkoIsReloading = true;
        
        // 100ms delay lets OTP+ finish writing its session cookies before we reload
        setTimeout(function() {
          window.location.reload();
        }, 100);
      }
      return; 
    }

    var subtitle = modal.querySelector('.otp-card__subtitle');
    var helper = modal.querySelector('.otp-helper');

    // 3. Handle Subtitle Text
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

    // 4. Handle Terms & Conditions Link
    if (helper && !helper.dataset.hasTerms) {
      if (helper.innerHTML.includes('Charges may apply')) {
        var linkHtml = '<a href="javascript:void(0)" class="buzzko-terms-link" style="color: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: pointer;">Terms & conditions</a>';
        helper.innerHTML = helper.innerHTML.replace('Charges may apply', linkHtml);
        helper.dataset.hasTerms = 'true';
        
        var termsLink = helper.querySelector('.buzzko-terms-link');
        if (termsLink) {
          termsLink.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            openTermsModal();
          });
        }
      }
    }
  }

  function openTermsModal() {
    var modal = document.getElementById('buzzko-terms-modal');
    
    if (!modal) {
      var modalHtml = `
        <div id="buzzko-terms-modal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(26,26,26,0.6); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 2147483647; display: flex; align-items: center; justify-content: center; opacity: 1; visibility: visible;">
          <div class="buzzko-terms-content" style="background: #FFFAF5; width: 100%; max-width: 650px; max-height: 85vh; border-radius: 20px; border: 2px solid #FFDCEF; box-shadow: 0 24px 60px rgba(26,26,26,0.2); position: relative; display: flex; flex-direction: column; margin: 20px;">
            <button type="button" class="buzzko-terms-close" aria-label="Close" style="position: absolute; top: 16px; right: 16px; width: 32px; height: 32px; border-radius: 50%; background: #FFFFFF; border: 1px solid rgba(26,26,26,0.14); font-size: 20px; line-height: 1; color: #1A1A1A; cursor: pointer; z-index: 10; display: grid; place-items: center;">&times;</button>
            <div class="buzzko-terms-body" style="padding: 32px; overflow-y: auto; font-family: var(--bk-body); color: #1A1A1A; font-size: 14px; line-height: 1.6;">
              <div class="buzzko-terms-loader" style="text-align: center; color: #6B6663; padding: 40px 0; font-weight: 600;">Loading policy...</div>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', modalHtml);
      modal = document.getElementById('buzzko-terms-modal');

      fetch('/policies/terms-of-service')
        .then(function(res) { return res.text(); })
        .then(function(html) {
          var parser = new DOMParser();
          var doc = parser.parseFromString(html, 'text/html');
          var policyContent = doc.querySelector('.shopify-policy__body') 
                           || doc.querySelector('.rte') 
                           || doc.querySelector('main') 
                           || doc.body;

          var modalBody = modal.querySelector('.buzzko-terms-body');
          if (modalBody) modalBody.innerHTML = policyContent.innerHTML;
        })
        .catch(function() {
          var modalBody = modal.querySelector('.buzzko-terms-body');
          if (modalBody) modalBody.innerHTML = '<p>Could not load terms. Please check back later.</p>';
        });
    } else {
      modal.style.display = 'flex';
      modal.style.opacity = '1';
      modal.style.visibility = 'visible';
    }
  }

  // Handle closing the terms modal
  document.addEventListener('click', function(event) {
    var modal = document.getElementById('buzzko-terms-modal');
    if (!modal) return;

    if (event.target === modal || (event.target.closest && event.target.closest('.buzzko-terms-close'))) {
      modal.style.opacity = '0';
      modal.style.visibility = 'hidden';
      setTimeout(function() {
        if (modal.style.opacity === '0') modal.style.display = 'none';
      }, 200);
    }
  }, true);

  // Optimized Observer Logic
  var observer = new MutationObserver(function (mutations) {
    var isOtpMutation = mutations.some(function(m) {
      return (m.target && m.target.id === 'otp-nca-account-modal') || 
             (m.target.closest && m.target.closest('#otp-nca-account-modal'));
    });

    if (isOtpMutation) {
      customizeOtpModal();
    }
  });

  document.addEventListener('DOMContentLoaded', function() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });

  document.addEventListener('click', function(event) {
    if (event.target.closest && event.target.closest('.otp-account-modal__close, .otp-account-modal-backdrop')) {
      window.__buzzkoAuthIntent = null;
      sawLoginScreen = false; 
    }
  });
})();