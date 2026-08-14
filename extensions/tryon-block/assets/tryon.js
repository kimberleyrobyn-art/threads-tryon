(function () {
  var MAX_FILE_BYTES = 8 * 1024 * 1024; // 8MB
  var POLL_INTERVAL_MS = 3000;
  var POLL_TIMEOUT_MS = 90000;
  var SEARCH_DEBOUNCE_MS = 300;
  var STOREFRONT_API_VERSION = '2025-10';

  function storefrontUrl() {
    return window.location.origin + '/api/' + STOREFRONT_API_VERSION + '/graphql.json';
  }

  function storefrontFetch(token, query, variables) {
    return fetch(storefrontUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': token,
      },
      body: JSON.stringify({ query: query, variables: variables }),
    }).then(function (res) {
      return res.json();
    });
  }

  // Titles in this catalog tend to be long, similar-looking marketing
  // copy ("X - Sustainable Fashion from Recycled Plastic Bottles"). The
  // part before " - " is what actually distinguishes one product from
  // another, so use just that for display; keep the full title for
  // alt text / accessibility.
  function shortTitle(title) {
    var short = title.split(' - ')[0].trim();
    if (short.length > 46) short = short.slice(0, 43).trim() + '…';
    return short;
  }

  function mapProductEdges(edges) {
    return edges
      .map(function (edge) {
        return {
          id: edge.node.id,
          title: edge.node.title,
          shortTitle: shortTitle(edge.node.title),
          imageUrl: edge.node.featuredImage ? edge.node.featuredImage.url : null,
        };
      })
      .filter(function (item) {
        return !!item.imageUrl;
      });
  }

  // Scope search to the title field with wildcards instead of Shopify's
  // default free-text search, which matches description/tags too broadly
  // (e.g. searching "top" was surfacing a poncho).
  function buildTitleQuery(text) {
    var sanitized = text.replace(/[":*]/g, '').trim();
    return 'title:*' + sanitized + '*';
  }

  function initBlock(block) {
    var mode = block.getAttribute('data-tryon-mode') === 'wardrobe-page' ? 'wardrobe-page' : 'product';

    var trigger = block.querySelector('[data-tryon-trigger]');
    var panel = block.querySelector('[data-tryon-panel]');
    var closeBtn = block.querySelector('[data-tryon-close]');
    var choiceSingleBtn = block.querySelector('[data-tryon-choice-single]');
    var choiceOutfitBtn = block.querySelector('[data-tryon-choice-outfit]');
    var fileInput = block.querySelector('[data-tryon-file-input]');
    var uploadBtn = block.querySelector('[data-tryon-upload-btn]');
    var backToOutfitBtn = block.querySelector('[data-tryon-back-to-outfit]');
    var continueBtn = block.querySelector('[data-tryon-continue-btn]');
    var retryBtn = block.querySelector('[data-tryon-retry]');
    var errorEl = block.querySelector('[data-tryon-error]');
    var outfitErrorEl = block.querySelector('[data-tryon-error-outfit]');
    var resultImage = block.querySelector('[data-tryon-result-image]');
    var downloadLink = block.querySelector('[data-tryon-download]');
    var loadingText = block.querySelector('[data-tryon-loading-text]');
    var outfitListEl = block.querySelector('[data-tryon-outfit-list]');
    var searchInput = block.querySelector('[data-tryon-search-input]');
    var searchResultsEl = block.querySelector('[data-tryon-search-results]');
    var seasonTabsEl = block.querySelector('[data-tryon-season-tabs]');
    var browseGridEl = block.querySelector('[data-tryon-browse-grid]');
    var loadMoreBtn = block.querySelector('[data-tryon-load-more]');

    var steps = {};
    block.querySelectorAll('[data-tryon-step]').forEach(function (el) {
      steps[el.getAttribute('data-tryon-step')] = el;
    });

    var storefrontToken = block.getAttribute('data-storefront-token');
    var maxItems = parseInt(block.getAttribute('data-max-items'), 10) || 3;

    var currentProductId = block.getAttribute('data-product-id');
    var currentProductImage = block.getAttribute('data-product-image');
    var currentProductTitle = block.getAttribute('data-product-title');
    var currentProductItem =
      mode === 'product' && currentProductImage
        ? {
            id: currentProductId,
            title: currentProductTitle,
            shortTitle: shortTitle(currentProductTitle),
            imageUrl: currentProductImage,
          }
        : null;

    var outfitItems = [];
    var searchDebounceTimer = null;

    function showStep(name) {
      Object.keys(steps).forEach(function (key) {
        steps[key].hidden = key !== name;
      });
    }

    function showError(el, message) {
      if (!el) return;
      el.textContent = message;
      el.hidden = false;
    }

    function clearError(el) {
      if (!el) return;
      el.hidden = true;
      el.textContent = '';
    }

    function openPanel() {
      if (!panel) return;
      panel.hidden = false;
      document.body.style.overflow = 'hidden';
    }

    function closePanel() {
      if (!panel) return;
      panel.hidden = true;
      document.body.style.overflow = '';
    }

    function resetToStart() {
      clearError(errorEl);
      clearError(outfitErrorEl);
      if (fileInput) fileInput.value = '';
      showStep(mode === 'product' ? 'choice' : 'outfit');
    }

    // --- Outfit list rendering (shared) ---

    function isInOutfit(id) {
      return outfitItems.some(function (existing) {
        return existing.id === id;
      });
    }

    function addOutfitItem(item) {
      if (isInOutfit(item.id)) return;
      if (outfitItems.length >= maxItems) {
        showError(outfitErrorEl, 'You can try on up to ' + maxItems + ' items at once.');
        return;
      }
      clearError(outfitErrorEl);
      outfitItems.push(item);
      renderOutfitList();
    }

    function renderOutfitList() {
      outfitListEl.innerHTML = '';
      outfitItems.forEach(function (item, index) {
        var row = document.createElement('div');
        row.className = 'tryon-outfit-item';

        if (item.imageUrl) {
          var img = document.createElement('img');
          img.src = item.imageUrl;
          img.alt = item.title;
          row.appendChild(img);
        }

        var title = document.createElement('span');
        title.className = 'tryon-outfit-item-title';
        title.textContent = item.shortTitle || item.title;
        row.appendChild(title);

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'tryon-outfit-item-remove';
        removeBtn.setAttribute('aria-label', 'Remove ' + item.title);
        removeBtn.textContent = '×';
        removeBtn.addEventListener('click', function () {
          outfitItems.splice(index, 1);
          renderOutfitList();
        });
        row.appendChild(removeBtn);

        outfitListEl.appendChild(row);
      });
    }

    // --- Storefront API search (shared) ---

    function searchProducts(queryText) {
      var query =
        'query($q: String!) { products(first: 20, query: $q) { edges { node { id title featuredImage { url } } } } }';
      return storefrontFetch(storefrontToken, query, { q: buildTitleQuery(queryText) }).then(function (data) {
        var edges = (data.data && data.data.products && data.data.products.edges) || [];
        return mapProductEdges(edges).filter(function (item) {
          return !isInOutfit(item.id);
        });
      });
    }

    function renderSearchResults(results) {
      searchResultsEl.innerHTML = '';
      if (!results.length) {
        searchResultsEl.hidden = true;
        return;
      }
      results.forEach(function (item) {
        var row = document.createElement('button');
        row.type = 'button';
        row.className = 'tryon-search-result';

        var img = document.createElement('img');
        img.src = item.imageUrl;
        img.alt = item.title;
        row.appendChild(img);

        var title = document.createElement('span');
        title.textContent = item.shortTitle || item.title;
        row.appendChild(title);

        row.addEventListener('click', function () {
          addOutfitItem(item);
          searchInput.value = '';
          searchResultsEl.hidden = true;
          searchResultsEl.innerHTML = '';
        });

        searchResultsEl.appendChild(row);
      });
      searchResultsEl.hidden = false;
    }

    if (searchInput) {
      searchInput.addEventListener('input', function () {
        var value = searchInput.value.trim();
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);

        if (!value) {
          searchResultsEl.hidden = true;
          searchResultsEl.innerHTML = '';
          return;
        }
        if (!storefrontToken) {
          showError(outfitErrorEl, 'Search is not configured for this store yet.');
          return;
        }

        searchDebounceTimer = setTimeout(function () {
          searchProducts(value)
            .then(renderSearchResults)
            .catch(function () {
              showError(outfitErrorEl, 'Search failed. Please try again.');
            });
        }, SEARCH_DEBOUNCE_MS);
      });
    }

    // --- Browse grid (wardrobe-page mode only) ---

    var browseCursor = null;
    var browseActiveSeason = null;

    function appendBrowseTiles(items) {
      if (!browseGridEl) return;
      items.forEach(function (item) {
        var tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tryon-browse-tile';
        if (isInOutfit(item.id)) tile.classList.add('is-added');

        var img = document.createElement('img');
        img.src = item.imageUrl;
        img.alt = item.title;
        tile.appendChild(img);

        var title = document.createElement('span');
        title.textContent = item.shortTitle || item.title;
        tile.appendChild(title);

        tile.addEventListener('click', function () {
          addOutfitItem(item);
          tile.classList.add('is-added');
        });

        browseGridEl.appendChild(tile);
      });
    }

    function loadSeasonCollection(handle, append) {
      if (!browseGridEl || !handle) return;

      if (!append) {
        browseGridEl.innerHTML = '<p class="tryon-browse-loading">Loading&hellip;</p>';
        browseCursor = null;
        browseActiveSeason = handle;
      }

      var query =
        'query($handle: String!, $after: String) { collectionByHandle(handle: $handle) { products(first: 24, after: $after) { edges { cursor node { id title featuredImage { url } } } pageInfo { hasNextPage } } } }';

      storefrontFetch(storefrontToken, query, { handle: handle, after: browseCursor })
        .then(function (data) {
          var connection = data.data && data.data.collectionByHandle && data.data.collectionByHandle.products;
          var edges = (connection && connection.edges) || [];

          if (!append) browseGridEl.innerHTML = '';
          appendBrowseTiles(mapProductEdges(edges));

          if (edges.length) browseCursor = edges[edges.length - 1].cursor;
          var hasNext = !!(connection && connection.pageInfo && connection.pageInfo.hasNextPage);
          if (loadMoreBtn) loadMoreBtn.hidden = !hasNext;
        })
        .catch(function () {
          if (!append) {
            browseGridEl.innerHTML = '<p class="tryon-browse-loading">Could not load items. Please try again.</p>';
          }
        });
    }

    if (loadMoreBtn) {
      loadMoreBtn.addEventListener('click', function () {
        if (browseActiveSeason) loadSeasonCollection(browseActiveSeason, true);
      });
    }

    if (seasonTabsEl) {
      var tabButtons = Array.prototype.slice.call(seasonTabsEl.querySelectorAll('[data-tryon-season-tab]'));

      function activateSeason(season) {
        tabButtons.forEach(function (btn) {
          btn.classList.toggle('is-active', btn.getAttribute('data-tryon-season-tab') === season);
        });
        loadSeasonCollection(season, false);
      }

      tabButtons.forEach(function (btn) {
        btn.addEventListener('click', function () {
          activateSeason(btn.getAttribute('data-tryon-season-tab'));
        });
      });

      if (tabButtons.length) {
        activateSeason(tabButtons[0].getAttribute('data-tryon-season-tab'));
      }
    }

    // --- Choice step (product mode only) ---

    if (choiceSingleBtn) {
      choiceSingleBtn.addEventListener('click', function () {
        outfitItems = currentProductItem ? [currentProductItem] : [];
        renderOutfitList();
        showStep('upload');
      });
    }
    if (choiceOutfitBtn) {
      choiceOutfitBtn.addEventListener('click', function () {
        showStep('outfit');
      });
    }

    if (continueBtn) {
      continueBtn.addEventListener('click', function () {
        if (!outfitItems.length) {
          showError(outfitErrorEl, 'Add at least one item to try on.');
          return;
        }
        clearError(outfitErrorEl);
        showStep('upload');
      });
    }

    if (backToOutfitBtn) {
      backToOutfitBtn.addEventListener('click', function () {
        clearError(errorEl);
        showStep('outfit');
      });
    }

    // --- Panel open/close (product mode only) ---

    if (trigger) {
      trigger.addEventListener('click', function () {
        outfitItems = currentProductItem ? [currentProductItem] : [];
        renderOutfitList();
        showStep('choice');
        openPanel();
      });
    }

    if (closeBtn) closeBtn.addEventListener('click', closePanel);
    if (panel) {
      panel.addEventListener('click', function (event) {
        if (event.target === panel) closePanel();
      });
    }

    if (uploadBtn) {
      uploadBtn.addEventListener('click', function () {
        fileInput.click();
      });
    }

    if (retryBtn) retryBtn.addEventListener('click', resetToStart);

    // --- Upload handling (shared) ---

    if (fileInput) {
      fileInput.addEventListener('change', function () {
        clearError(errorEl);
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          showError(errorEl, 'Please choose an image file.');
          return;
        }
        if (file.size > MAX_FILE_BYTES) {
          showError(errorEl, 'That photo is too large. Please choose one under 8MB.');
          return;
        }

        var reader = new FileReader();
        reader.onload = function () {
          generateOutfit(reader.result);
        };
        reader.onerror = function () {
          showError(errorEl, 'Could not read that photo. Please try another.');
        };
        reader.readAsDataURL(file);
      });
    }

    // --- Generation (sequential across outfit items) ---

    function startTryOnStep(modelImage, productImage) {
      return fetch('/apps/tryon/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_image: modelImage, product_image: productImage }),
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Failed to start try-on.');
          return data.id;
        });
      });
    }

    function pollUntilComplete(id, startedAt) {
      startedAt = startedAt || Date.now();
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        return Promise.reject(new Error('This is taking longer than expected. Please try again.'));
      }

      return fetch('/apps/tryon/status/' + encodeURIComponent(id))
        .then(function (res) {
          return res.json().then(function (data) {
            if (!res.ok) throw new Error(data.error || 'Failed to check status.');
            return data;
          });
        })
        .then(function (data) {
          if (data.status === 'completed') {
            var output = Array.isArray(data.output) ? data.output[0] : data.output;
            if (!output) throw new Error('No result was returned. Please try again.');
            return output;
          }
          if (data.status === 'failed') {
            throw new Error(data.error || 'Try-on generation failed. Please try a different photo.');
          }
          return new Promise(function (resolve) {
            setTimeout(resolve, POLL_INTERVAL_MS);
          }).then(function () {
            return pollUntilComplete(id, startedAt);
          });
        });
    }

    function generateOutfit(initialModelImage) {
      showStep('loading');

      var modelImage = initialModelImage;
      var index = 0;

      function next() {
        if (index >= outfitItems.length) {
          showResult(modelImage);
          return;
        }
        var item = outfitItems[index];
        if (loadingText) {
          loadingText.textContent =
            outfitItems.length > 1
              ? 'Applying item ' + (index + 1) + ' of ' + outfitItems.length + '…'
              : 'Generating your try-on… this can take up to a minute.';
        }

        startTryOnStep(modelImage, item.imageUrl)
          .then(function (id) {
            return pollUntilComplete(id);
          })
          .then(function (resultUrl) {
            modelImage = resultUrl;
            index += 1;
            next();
          })
          .catch(function (err) {
            resetToStart();
            showStep('upload');
            showError(errorEl, err.message || 'Something went wrong. Please try again.');
          });
      }

      next();
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
