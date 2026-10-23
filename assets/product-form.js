/* =====================================================
   BuzzKo: Stop the "(n in cart)" flash
===================================================== */
customElements.whenDefined('product-info').then(() => {
  const ProductInfoClass = customElements.get('product-info');
  if (ProductInfoClass && !ProductInfoClass.__buzzkoPatched) {
    ProductInfoClass.__buzzkoPatched = true;
    const origUpdate = ProductInfoClass.prototype.updateQuantityRules;
    
    ProductInfoClass.prototype.updateQuantityRules = function(cartData) {
      try {
        if (!this.currentVariant) return origUpdate.call(this, cartData);
        const item = (cartData.items || []).find(i => i.id == this.currentVariant.id);
        const serverQty = item ? item.quantity : 0;
        const qtyInput = this.querySelector('.quantity__input');
        if (qtyInput) {
          const localQty = parseInt(qtyInput.getAttribute('data-cart-quantity'), 10);
          if (serverQty === localQty) return;
        }
      } catch(e) {}
      origUpdate.call(this, cartData);
    };
  }
});


if (!customElements.get('product-form')) {
  let requestSequence = 0; // Global counter to prevent timeout race conditions

  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      readBubbleCount() {
        const link = document.getElementById('cart-icon-bubble');
        if (!link) return null;
        const bubble = link.querySelector('.cart-count-bubble');
        if (!bubble) return 0;
        const shown = bubble.querySelector('[aria-hidden="true"]');
        const n = shown ? parseInt(shown.textContent, 10) : NaN;
        return isNaN(n) ? null : n;
      }

      updateBubble(count) {
        const link = document.getElementById('cart-icon-bubble');
        if (!link) return;
        let bubble = link.querySelector('.cart-count-bubble');
        if (count === 0) {
          if (bubble) bubble.remove();
          return;
        }
        if (!bubble) {
          bubble = document.createElement('div');
          bubble.className = 'cart-count-bubble';
          link.appendChild(bubble);
        }
        bubble.innerHTML = '<span aria-hidden="true">' + count + '</span><span class="visually-hidden">' + count + (count === 1 ? ' item' : ' items') + ' in cart</span>';
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('data-buzzko-loading') === 'true') return;

        this.handleErrorMessage();

        // --- BuzzKo: TRUE Optimistic UI Start ---
        const mySeq = ++requestSequence; // Tag this request with a sequence number
        const formData = new FormData(this.form);
        const quantity = parseInt(formData.get('quantity')) || 1;
        const submittedVariantId = formData.get('id');
        const beforeCount = this.readBubbleCount();
        const bumped = beforeCount !== null;

        if (bumped) this.updateBubble(beforeCount + quantity);

        this.submitButton.setAttribute('data-buzzko-loading', 'true');
        this.submitButton.classList.remove('loading'); // Kill Dawn's spinner class
        const dawnSpinner = this.querySelector('.loading__spinner');
        if (dawnSpinner) dawnSpinner.classList.add('hidden');

        this.submitButtonText.textContent = 'Added ✓';
        
        this.submitButton.style.setProperty('transition', 'none', 'important');
        this.submitButton.style.setProperty('background-color', '#B9E404', 'important');
        this.submitButton.style.setProperty('border-color', '#B9E404', 'important');
        this.submitButton.style.setProperty('color', '#111', 'important');
        this.submitButton.style.setProperty('opacity', '1', 'important');
        this.submitButton.style.setProperty('pointer-events', 'none', 'important');
        this.submitButtonText.style.setProperty('color', '#111', 'important');

        const container = this.closest('product-info') || document;
        const qtyInput = container.querySelector('.quantity__input');
        const rulesCart = container.querySelector('.quantity__rules-cart');

        let currentCartQty = 0;
        let targetSpan = null;
        let observer = null;
        let spinner = null;

        if (qtyInput) {
          currentCartQty = parseInt(qtyInput.getAttribute('data-cart-quantity'), 10) || 0;
        }
        const newQty = currentCartQty + quantity;

        if (rulesCart) {
          rulesCart.classList.remove('hidden');
          spinner = rulesCart.querySelector('.loading__spinner');
          if (spinner) spinner.classList.add('hidden');
          targetSpan = rulesCart.querySelector('span:last-child');
          if (targetSpan) {
            targetSpan.innerHTML = targetSpan.innerHTML.replace(/\d+/, newQty);
          }

          observer = new MutationObserver(() => {
            if (rulesCart.classList.contains('hidden')) rulesCart.classList.remove('hidden');
            if (spinner && !spinner.classList.contains('hidden')) spinner.classList.add('hidden');
            if (targetSpan && !targetSpan.innerHTML.includes(String(newQty))) {
              targetSpan.innerHTML = targetSpan.innerHTML.replace(/\d+/, newQty);
            }
          });
          observer.observe(rulesCart, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class']
          });

          setTimeout(() => { if (observer) observer.disconnect(); }, 3000);
        }
        if (qtyInput) qtyInput.setAttribute('data-cart-quantity', newQty);
        // --- BuzzKo: TRUE Optimistic UI End ---

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        formData.append('sections', 'cart-icon-bubble');
        formData.append('sections_url', window.location.pathname);
        config.body = formData;

        const variantId = submittedVariantId;
        const linesUpdateDeferred = this.createCartLinesUpdateEvent(variantId, quantity);

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            if (response.status) {
              this.error = true;
              // Rollback
              if (bumped) this.updateBubble(beforeCount);
              if (rulesCart) {
                if (currentCartQty === 0) rulesCart.classList.add('hidden');
                if (targetSpan && currentCartQty > 0) {
                  targetSpan.innerHTML = targetSpan.innerHTML.replace(/\d+/, currentCartQty);
                }
              }
              if (qtyInput) qtyInput.setAttribute('data-cart-quantity', currentCartQty);

              this.submitButtonText.textContent = 'Try again';
              this.submitButton.style.setProperty('background-color', '#C24545', 'important');
              this.submitButton.style.setProperty('border-color', '#C24545', 'important');
              this.submitButton.style.setProperty('color', '#fff', 'important');
              this.submitButtonText.style.setProperty('color', '#fff', 'important');

              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: variantId,
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);
              this.dispatchCartErrorEvent(response.description || response.message, 'INVALID');
              linesUpdateDeferred?.reject(new Error(response.description || response.message));

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButtonText.classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              return;
            } else if (!this.cart) {
              this.resolveCartLinesUpdate(linesUpdateDeferred);
              window.location = window.routes.cart_url;
              return;
            }

            this.error = false;
            this.resolveCartLinesUpdate(linesUpdateDeferred);

            const startMarker = CartPerformance.createStartingMarker('add:wait-for-subscribers');
            if (!this.error)
              publish(PUB_SUB_EVENTS.cartUpdate, {
                source: 'product-form',
                productVariantId: variantId,
                cartData: response,
              }).then(() => {
                CartPerformance.measureFromMarker('add:wait-for-subscribers', startMarker);
              });
          })
          .catch((e) => {
            this.error = true;
            // Rollback
            if (bumped) this.updateBubble(beforeCount);
            if (rulesCart) {
              if (currentCartQty === 0) rulesCart.classList.add('hidden');
              if (targetSpan && currentCartQty > 0) {
                targetSpan.innerHTML = targetSpan.innerHTML.replace(/\d+/, currentCartQty);
              }
            }
            if (qtyInput) qtyInput.setAttribute('data-cart-quantity', currentCartQty);

            this.submitButtonText.textContent = 'Try again';
            this.submitButton.style.setProperty('background-color', '#C24545', 'important');
            this.submitButton.style.setProperty('border-color', '#C24545', 'important');
            this.submitButton.style.setProperty('color', '#fff', 'important');
            this.submitButtonText.style.setProperty('color', '#fff', 'important');

            console.error(e);
            this.dispatchCartErrorEvent(e.message || 'Network error', 'SERVICE_UNAVAILABLE');
            linesUpdateDeferred?.reject(e);
          })
          .finally(() => {
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            
            // 1. Instantly unlock the button
            this.submitButton.removeAttribute('data-buzzko-loading');
            this.submitButton.style.removeProperty('pointer-events');
            const spinnerToHide = this.querySelector('.loading__spinner');
            if (spinnerToHide) spinnerToHide.classList.add('hidden');

            // 2. Delay the reset so the user sees "Added ✓" or "Try again"
            setTimeout(() => {
              // If a newer request has started since this one, ignore this reset!
              if (mySeq !== requestSequence) return;

              // Check if the variant was changed
              const currentVariantInput = this.form.querySelector('[name=id]');
              if (currentVariantInput && currentVariantInput.value !== submittedVariantId) {
                 // Just clean up styles, let Dawn handle the text
                 this.submitButton.style.removeProperty('transition');
                 this.submitButton.style.removeProperty('background-color');
                 this.submitButton.style.removeProperty('border-color');
                 this.submitButton.style.removeProperty('color');
                 this.submitButton.style.removeProperty('opacity');
                 this.submitButtonText.style.removeProperty('color');
                 return;
              }

              // Reset everything
              this.submitButton.style.removeProperty('transition');
              this.submitButton.style.removeProperty('background-color');
              this.submitButton.style.removeProperty('border-color');
              this.submitButton.style.removeProperty('color');
              this.submitButton.style.removeProperty('opacity');
              this.submitButtonText.style.removeProperty('color');
              this.submitButtonText.classList.remove('hidden');
              this.submitButtonText.textContent = window.variantStrings.addToCart;
            }, this.error ? 2000 : 700);

            CartPerformance.measureFromEvent("add:user-action", evt);
          });
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;
        this.errorMessageWrapper = this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');
        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);
        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      toggleSubmitButton(disable = true, text) {
        if (disable) {
          this.submitButton.setAttribute('disabled', 'disabled');
          if (text) this.submitButtonText.textContent = text;
        } else {
          this.submitButton.removeAttribute('disabled');
          this.submitButtonText.textContent = window.variantStrings.addToCart;
        }
      }

      createCartLinesUpdateEvent(variantId, quantity) {
        const { CartLinesUpdateEvent } = window.StandardEvents || {};
        if (!CartLinesUpdateEvent) return null;
        const deferred = CartLinesUpdateEvent.createPromise();
        this.dispatchEvent(
          new CartLinesUpdateEvent({
            action: 'add',
            context: 'product',
            lines: [{ merchandiseId: variantId, quantity }],
            promise: deferred.promise,
          })
        );
        return deferred;
      }

      resolveCartLinesUpdate(deferred) {
        if (!deferred) return;
        const { CartLinesUpdateEvent } = window.StandardEvents || {};
        if (!CartLinesUpdateEvent) return;
        const pendingCartDataPromise = typeof CartItems !== 'undefined'
          ? CartItems.fetchCartData()
          : fetch(`${routes.cart_url}.json`).then((response) => response.json());
        pendingCartDataPromise
          .then((cart) => {
            if (!cart?.currency) return deferred.reject(new Error('Missing currency in cart response'));
            deferred.resolve({ cart: CartLinesUpdateEvent.createCartFromAjaxResponse(cart) });
          })
          .catch((e) => deferred.reject(e));
      }

      dispatchCartErrorEvent(message, code) {
        const { CartErrorEvent } = window.StandardEvents || {};
        if (!CartErrorEvent) return;
        this.dispatchEvent(new CartErrorEvent({ error: message, code }));
      }

      get variantIdInput() {
        return this.form.querySelector('[name=id]');
      }
    }
  );
}