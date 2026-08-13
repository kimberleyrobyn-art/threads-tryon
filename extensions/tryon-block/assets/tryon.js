(function () {
  var MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
  var POLL_INTERVAL_MS = 3000;
  var POLL_TIMEOUT_MS = 90000;

  function initBlock(block) {
    var trigger = block.querySelector('[data-tryon-trigger]');
    var panel = block.querySelector('[data-tryon-panel]');
    var closeBtn = block.querySelector('[data-tryon-close]');
    var fileInput = block.querySelector('[data-tryon-file-input]');
    var uploadBtn = block.querySelector('[data-tryon-upload-btn]');
    var retryBtn = block.querySelector('[data-tryon-retry]');
    var errorEl = block.querySelector('[data-tryon-error]');
    var resultImage = block.querySelector('[data-tryon-result-image]');
    var downloadLink = block.querySelector('[data-tryon-download]');

    var steps = {
      upload: block.querySelector('[data-tryon-step="upload"]'),
      loading: block.querySelector('[data-tryon-step="loading"]'),
      result: block.querySelector('[data-tryon-step="result"]'),
    };

    var productImage = block.getAttribute('data-product-image');

    function showStep(name) {
      Object.keys(steps).forEach(function (key) {
        steps[key].hidden = key !== name;
      });
    }

    function showError(message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
    }

    function clearError() {
      errorEl.hidden = true;
      errorEl.textContent = '';
    }

    function openPanel() {
      panel.hidden = false;
      document.body.style.overflow = 'hidden';
    }

    function closePanel() {
      panel.hidden = true;
      document.body.style.overflow = '';
    }

    function resetToUpload() {
      clearError();
      fileInput.value = '';
      showStep('upload');
    }

    trigger.addEventListener('click', function () {
      if (!productImage) {
        showError('This product has no image to try on yet.');
      }
      openPanel();
    });

    closeBtn.addEventListener('click', closePanel);
    panel.addEventListener('click', function (event) {
      if (event.target === panel) closePanel();
    });

    uploadBtn.addEventListener('click', function () {
      fileInput.click();
    });

    retryBtn.addEventListener('click', resetToUpload);

    fileInput.addEventListener('change', function () {
      clearError();
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        showError('Please choose an image file.');
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        showError('That photo is too large. Please choose one under 8MB.');
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        startTryOn(reader.result);
      };
      reader.onerror = function () {
        showError('Could not read that photo. Please try another.');
      };
      reader.readAsDataURL(file);
    });

    function startTryOn(modelImageDataUri) {
      showStep('loading');

      var payload = {
        model_image: modelImageDataUri,
        product_image: productImage,
      };

      fetch('/apps/tryon/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || 'Failed to start try-on.');
            return data;
          });
        })
        .then(function (data) {
          pollStatus(data.id, Date.now());
        })
        .catch(function (err) {
          resetToUpload();
          showError(err.message || 'Something went wrong. Please try again.');
        });
    }

    function pollStatus(id, startedAt) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        resetToUpload();
        showError('This is taking longer than expected. Please try again.');
        return;
      }

      fetch('/apps/tryon/status/' + encodeURIComponent(id))
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || 'Failed to check status.');
            return data;
          });
        })
        .then(function (data) {
          if (data.status === 'completed') {
            var output = Array.isArray(data.output) ? data.output[0] : data.output;
            if (!output) {
              resetToUpload();
              showError('No result was returned. Please try again.');
              return;
            }
            showResult(output);
          } else if (data.status === 'failed') {
            resetToUpload();
            showError(data.error || 'Try-on generation failed. Please try a different photo.');
          } else {
            setTimeout(function () {
              pollStatus(id, startedAt);
            }, POLL_INTERVAL_MS);
          }
        })
        .catch(function (err) {
          resetToUpload();
          showError(err.message || 'Something went wrong while checking your try-on.');
        });
    }

    function showResult(imageUrl) {
      resultImage.src = imageUrl;
      downloadLink.href = imageUrl;

      // The download attribute is ignored for cross-origin links in most
      // browsers, so best-effort upgrade it to a blob URL when possible.
      fetch(imageUrl)
        .then(function (res) {
          return res.blob();
        })
        .then(function (blob) {
          downloadLink.href = URL.createObjectURL(blob);
        })
        .catch(function () {
          // Fall back to the plain image URL (opens in a new tab instead
          // of forcing a download) if the fetch is blocked by CORS.
        });

      showStep('result');
    }
  }

  function init() {
    var blocks = document.querySelectorAll('[data-tryon-block]');
    blocks.forEach(initBlock);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
