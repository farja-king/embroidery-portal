// Cloudinary config — replace UPLOAD_PRESET once created in the Cloudinary console
// (Settings > Upload > Upload presets > Add upload preset > Signing Mode: Unsigned)
const CLOUDINARY_CLOUD_NAME = "dzifncuur";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";

function initUploadWidget(buttonId, statusId, folder, onSuccess) {
  const button = document.getElementById(buttonId);
  const status = document.getElementById(statusId);
  if (!button || typeof cloudinary === "undefined") return;

  const widget = cloudinary.createUploadWidget(
    {
      cloudName: CLOUDINARY_CLOUD_NAME,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
      folder: folder,
      multiple: false,
      sources: ["local", "camera"],
      maxFileSize: 15000000,
      clientAllowedFormats: ["png", "jpg", "jpeg", "pdf"],
    },
    (error, result) => {
      if (!error && result && result.event === "success") {
        status.classList.remove("upload-status--error");
        status.classList.add("upload-status--success");
        status.textContent = "Uploaded — thanks! We've added a link to it in your WhatsApp message below.";
        button.textContent = "Upload another image";
        if (onSuccess) onSuccess(result.info.secure_url);
        return;
      }

      if (!error && result && result.event === "queues-end") {
        const failed = (result.info && result.info.files || []).find(f => f.status === "error" || f.uploadInfo === undefined && f.status !== "success");
        if (failed) {
          status.classList.remove("upload-status--success");
          status.classList.add("upload-status--error");
          status.textContent = "That file couldn't be uploaded — please use a JPG, PNG or PDF under 15MB, then click Upload your design to try again.";
          widget.close();
        }
        return;
      }

      if (error) {
        status.classList.remove("upload-status--success");
        status.classList.add("upload-status--error");
        status.textContent = "That file couldn't be uploaded — please use a JPG, PNG or PDF under 15MB, then click Upload your design to try again.";
        widget.close();
      }
    }
  );

  button.addEventListener("click", () => widget.open());
}

// Variant of initUploadWidget for non-image "supporting docs" (PDF, CSV,
// Excel, Word) — needs resourceType "raw" since Cloudinary treats anything
// that isn't an image/video as a raw file.
function initDocsUploadWidget(buttonId, statusId, folder, onSuccess) {
  const button = document.getElementById(buttonId);
  const status = document.getElementById(statusId);
  if (!button || typeof cloudinary === "undefined") return;

  const widget = cloudinary.createUploadWidget(
    {
      cloudName: CLOUDINARY_CLOUD_NAME,
      uploadPreset: CLOUDINARY_UPLOAD_PRESET,
      folder: folder,
      multiple: false,
      resourceType: "raw",
      sources: ["local"],
      maxFileSize: 15000000,
      clientAllowedFormats: ["pdf", "csv", "xls", "xlsx", "doc", "docx"],
    },
    (error, result) => {
      if (!error && result && result.event === "success") {
        status.classList.remove("upload-status--error");
        status.classList.add("upload-status--success");
        status.textContent = "Uploaded — thanks! We've added a link to it in your WhatsApp message below.";
        button.textContent = "Upload another document";
        if (onSuccess) onSuccess(result.info.secure_url);
        return;
      }

      if (!error && result && result.event === "queues-end") {
        const failed = (result.info && result.info.files || []).find(f => f.status === "error" || f.uploadInfo === undefined && f.status !== "success");
        if (failed) {
          status.classList.remove("upload-status--success");
          status.classList.add("upload-status--error");
          status.textContent = "That file couldn't be uploaded — please use a PDF, CSV, Excel or Word file under 15MB, then try again.";
          widget.close();
        }
        return;
      }

      if (error) {
        status.classList.remove("upload-status--success");
        status.classList.add("upload-status--error");
        status.textContent = "That file couldn't be uploaded — please use a PDF, CSV, Excel or Word file under 15MB, then try again.";
        widget.close();
      }
    }
  );

  button.addEventListener("click", () => widget.open());
}

function whatsappLink(message) {
  const base = "https://wa.me/447530576197";
  const text = message || "Hi, I would like to enquire about custom garments.";
  return `${base}?text=${encodeURIComponent(text)}`;
}

// Product tiles: show a random colourway on load (never just black), then
// cycle through the rest on hover.
function initProductCardCarousels() {
  document.querySelectorAll(".product-card[data-images]").forEach(card => {
    const images = JSON.parse(card.dataset.images);
    const base = card.dataset.base || "";
    const img = card.querySelector("img");
    if (!img || !images.length) return;

    let index = Math.floor(Math.random() * images.length);
    img.src = base + images[index];
    const restingSrc = img.src;
    let timer = null;

    card.addEventListener("mouseenter", () => {
      timer = setInterval(() => {
        index = (index + 1) % images.length;
        img.src = base + images[index];
      }, 800);
    });

    card.addEventListener("mouseleave", () => {
      clearInterval(timer);
      img.src = restingSrc;
    });
  });
}

// ---- Cart ----
const CART_KEY = "embroideryClickCart";

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

function updateCartBadge() {
  const badge = document.getElementById("cart-count");
  if (!badge) return;
  const count = getCart().reduce((sum, item) => sum + (item.qty || 1), 0);
  badge.textContent = count;
  badge.style.display = count > 0 ? "inline-flex" : "none";
}

// Reads the current selection straight off a product page's DOM
// (title, style code, colour, size, quantity, price, photo) and adds it
// to the cart — merging into an existing line if the same product/colour/size
// combination is already there, rather than creating a duplicate line.
function addCurrentSelectionToCart(statusElId) {
  const h1 = document.querySelector(".product-details h1");
  const codeEl = document.querySelector(".product-details .code");
  const photo = document.getElementById("product-photo");
  const priceEl = document.querySelector(".product-details .price");
  const sizeSelect = document.getElementById("size-select");
  const colourNameEl = document.getElementById("colour-name");
  const qtyInput = document.getElementById("qty-input");

  const title = h1 ? h1.textContent.trim() : "Item";
  const styleCode = codeEl ? codeEl.textContent.split("—")[0].trim() : "";
  const colourName = colourNameEl ? colourNameEl.textContent.trim() : "";
  const size = sizeSelect ? sizeSelect.value : "One Size";
  const priceText = priceEl ? priceEl.textContent.trim() : "£0.00";
  const price = parseFloat(priceText.replace(/[^0-9.]/g, "")) || 0;
  const image = photo ? photo.src : "";
  const qty = qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1;

  const cart = getCart();
  const existing = cart.find(item =>
    item.styleCode === styleCode && item.colourName === colourName && item.size === size
  );
  if (existing) {
    existing.qty = (existing.qty || 1) + qty;
  } else {
    cart.push({ title, styleCode, colourName, size, price, image, qty });
  }
  saveCart(cart);

  if (statusElId) {
    const el = document.getElementById(statusElId);
    if (el) {
      el.classList.remove("upload-status--error");
      el.classList.add("upload-status--success");
      el.textContent = "Added to your cart!";
      setTimeout(() => {
        el.textContent = "";
        el.classList.remove("upload-status--success");
      }, 2500);
    }
  }
}

function removeFromCart(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
  renderCartUI();
}

function clearCart() {
  if (getCart().length === 0) return;
  if (!confirm("Remove all items from your cart?")) return;
  saveCart([]);
  renderCartUI();
}

function updateCartItemQty(index, delta) {
  const cart = getCart();
  if (!cart[index]) return;
  cart[index].qty = Math.max(1, (cart[index].qty || 1) + delta);
  saveCart(cart);
  renderCartUI();
}

function cartTotal(cart) {
  return cart.reduce((sum, item) => sum + item.price * (item.qty || 1), 0);
}

// Renders a cart item list + running total into a given set of element
// ids. Used for both the full cart page and the slide-out cart drawer,
// which show the same data in two different containers. Only does
// anything if the list container is present.
function renderCartInto(ids) {
  const list = document.getElementById(ids.list);
  if (!list) return;

  const cart = getCart();
  const emptyMsg = document.getElementById(ids.empty);
  const summary = document.getElementById(ids.summary);
  const leaversBox = document.getElementById(ids.leaversBox);
  const leaversContent = document.getElementById(ids.leaversContent);
  const leaversLines = getLeaversDetailsLines();

  if (leaversBox && leaversContent) {
    const leaversQty = cart
      .filter(item => item.title && item.title.startsWith("Leavers"))
      .reduce((sum, item) => sum + (item.qty || 1), 0);

    if (leaversQty > 0 && cart.length) {
      const qtyLine = leaversQty >= 10
        ? `<strong style="color: var(--whatsapp-dark);">Total Leavers units: ${leaversQty} — 10-unit minimum met</strong>`
        : `<strong style="color: var(--danger);">Total Leavers units: ${leaversQty} — add ${10 - leaversQty} more to reach the 10-unit minimum</strong>`;
      leaversContent.innerHTML = [qtyLine].concat(leaversLines.map(l => l.replace(/</g, "&lt;"))).join("<br>");
      leaversBox.style.display = "block";
    } else {
      leaversBox.style.display = "none";
    }
  }

  if (cart.length === 0) {
    list.innerHTML = "";
    if (emptyMsg) emptyMsg.style.display = "block";
    if (summary) summary.style.display = "none";
    return;
  }

  if (emptyMsg) emptyMsg.style.display = "none";
  if (summary) summary.style.display = "block";

  list.innerHTML = cart.map((item, i) => {
    const qty = item.qty || 1;
    return `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.title}">
      <div class="cart-item-details">
        <div class="cart-item-title">${item.title} (${item.styleCode})</div>
        <div class="cart-item-meta">Colour: ${item.colourName} &middot; Size: ${item.size}</div>
        <div class="cart-item-qty">
          <button type="button" onclick="updateCartItemQty(${i}, -1)" aria-label="Decrease quantity">&minus;</button>
          <span>${qty}</span>
          <button type="button" onclick="updateCartItemQty(${i}, 1)" aria-label="Increase quantity">+</button>
        </div>
      </div>
      <div class="cart-item-price">£${(item.price * qty).toFixed(2)}</div>
      <button class="cart-item-remove" type="button" onclick="removeFromCart(${i})" aria-label="Remove item">&times;</button>
    </div>
  `;
  }).join("");

  const totalEl = document.getElementById(ids.total);
  if (totalEl) totalEl.textContent = `£${cartTotal(cart).toFixed(2)}`;

  const sendBtn = document.getElementById(ids.whatsappBtn);
  if (sendBtn) sendBtn.href = whatsappLink(buildCartMessage(cart));
}

function renderCartPage() {
  renderCartInto({
    list: "cart-list", empty: "cart-empty", summary: "cart-summary",
    total: "cart-total", whatsappBtn: "cart-whatsapp-btn",
    leaversBox: "leavers-details-box", leaversContent: "leavers-details-content"
  });
}

function renderCartDrawer() {
  renderCartInto({
    list: "drawer-cart-list", empty: "drawer-cart-empty", summary: "drawer-cart-summary",
    total: "drawer-cart-total", whatsappBtn: "drawer-cart-whatsapp-btn",
    leaversBox: "drawer-leavers-details-box", leaversContent: "drawer-leavers-details-content"
  });
}

// Keeps the full cart page and the slide-out drawer in sync — whichever
// of the two is actually present on the current page re-renders, the
// other call is just a no-op.
function renderCartUI() {
  renderCartPage();
  renderCartDrawer();
}

// Collections pages live one folder down (/collections/...), everything
// else is at the site root — this resolves a root-relative path from
// either location.
function rootPath(path) {
  return window.location.pathname.includes("/collections/") ? `../${path}` : path;
}

// Called when the customer clicks "Send My Cart on WhatsApp". The link's
// own href/target still open WhatsApp in a new tab as normal; this just
// clears the cart and takes the current tab to a thank-you page afterwards.
function handleSendCart() {
  setTimeout(() => {
    saveCart([]);
    window.location.href = rootPath("thank-you.html");
  }, 400);
}

function buildCartMessage(cart) {
  const lines = cart.map((item, i) => {
    const qty = item.qty || 1;
    return `${i + 1}. ${item.title} (${item.styleCode}) — Colour: ${item.colourName}, Size: ${item.size}, Qty: ${qty} — £${(item.price * qty).toFixed(2)}`;
  });
  const total = cartTotal(cart).toFixed(2);
  let msg = `Hi, I'd like to enquire about the following items:\n\n${lines.join("\n")}`;

  const leaversLines = getLeaversDetailsLines();
  if (leaversLines.length) {
    msg += `\n\nLeavers Order Details (applies to every Leavers item above):\n${leaversLines.join("\n")}`;
  }

  msg += `\n\nTotal: £${total}`;
  return msg;
}

// ---- Leavers order details ----
// A small set of custom fields (year, names, print colour, school crest,
// school/group, notes, uploaded files) that only need filling in once for
// the whole order, rather than once per size/colour added to the cart.
const LEAVERS_KEY = "embroideryClickLeaversDetails";

const LEAVERS_FIELD_LABELS = {
  "leavers-year": "Leavers Year",
  "names-in-year": "Names inside year",
  "print-colour": "Print colour",
  "school-crest": "School crest to left chest",
  "school-group": "School/Group",
  "order-notes": "Notes",
  "logoUrl": "Logo",
  "docsUrl": "Supporting doc"
};

function getLeaversDetails() {
  try {
    return JSON.parse(localStorage.getItem(LEAVERS_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveLeaversDetails(partial) {
  const current = getLeaversDetails();
  localStorage.setItem(LEAVERS_KEY, JSON.stringify(Object.assign({}, current, partial)));
  renderCartUI();
}

function clearLeaversDetails() {
  localStorage.removeItem(LEAVERS_KEY);
  renderCartUI();
}

function getLeaversDetailsLines() {
  const details = getLeaversDetails();
  return Object.keys(LEAVERS_FIELD_LABELS)
    .filter(key => details[key])
    .map(key => `${LEAVERS_FIELD_LABELS[key]}: ${details[key]}`);
}

// Captures the shared "fill in once" fields straight from a Leavers page's
// DOM (whichever of them are present — the mug page has no size/colour,
// for instance) and saves them alongside whatever's already stored.
function captureLeaversFieldsFromPage() {
  const details = {};
  ["leavers-year", "names-in-year", "print-colour", "school-crest", "school-group", "order-notes"].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value.trim()) details[id] = el.value.trim();
  });
  return details;
}

// Wraps addCurrentSelectionToCart for Leavers pages: saves the shared
// order-level fields, then adds this specific colour/size/qty as its own
// itemized cart line.
function addLeaversItemToCart(statusElId) {
  saveLeaversDetails(captureLeaversFieldsFromPage());
  addCurrentSelectionToCart(statusElId);
}

// Top-of-page rotating announcement bar (mirrors the old Shopify site's banner)
function initAnnouncementBar() {
  const el = document.getElementById("announcement-bar");
  if (!el) return;
  const messages = [
    "Embroidery, printing & digitising — made in Raunds, Northamptonshire",
    "Rated 5.0 on Google · Every order proofed before production",
    "All work carried out in-store by our resident expert"
  ];
  let i = 0;
  setInterval(() => {
    el.style.opacity = "0";
    setTimeout(() => {
      i = (i + 1) % messages.length;
      el.textContent = messages[i];
      el.style.opacity = "1";
    }, 400);
  }, 5000);
}

// ---- "Back to last product" (cart page convenience) ----
const LAST_PRODUCT_KEY = "embroideryClickLastProduct";

// Called on every page load. If this page looks like a product page,
// remember it so the cart page can offer a way back to it.
function trackLastProductPage() {
  if (document.querySelector(".product-details")) {
    localStorage.setItem(LAST_PRODUCT_KEY, window.location.href);
  }
}

function initContinueShoppingLink() {
  const link = document.getElementById("continue-shopping-link");
  if (!link) return;
  const last = localStorage.getItem(LAST_PRODUCT_KEY);
  if (last) {
    link.href = last;
    link.textContent = "← Back to Shopping";
  }
}

// ---- Slide-out cart drawer ----
// Builds a right-hand slide-out mini cart (same data as the full cart
// page, rendered via renderCartDrawer) and wires the header's cart icon
// to open it instead of navigating straight to cart.html. The drawer
// itself has a "View Full Cart Page" link for anyone who wants the full
// page instead.
function openCartDrawer() {
  document.getElementById("cart-drawer").classList.add("open");
  document.getElementById("cart-drawer-overlay").classList.add("open");
  document.body.classList.add("cart-drawer-locked");
}

function closeCartDrawer() {
  document.getElementById("cart-drawer").classList.remove("open");
  document.getElementById("cart-drawer-overlay").classList.remove("open");
  document.body.classList.remove("cart-drawer-locked");
}

function initCartDrawer() {
  const cartIcon = document.querySelector(".cart-icon");
  if (!cartIcon || document.getElementById("cart-drawer")) return;

  const overlay = document.createElement("div");
  overlay.className = "cart-drawer-overlay";
  overlay.id = "cart-drawer-overlay";

  const drawer = document.createElement("aside");
  drawer.className = "cart-drawer";
  drawer.id = "cart-drawer";
  drawer.innerHTML = `
    <div class="cart-drawer-header">
      <h3>Your Cart</h3>
      <button type="button" class="cart-drawer-close" id="cart-drawer-close" aria-label="Close cart">&times;</button>
    </div>
    <div class="cart-drawer-body">
      <div id="drawer-cart-empty" class="cart-empty" style="display:none;">
        Your cart is empty. Browse the range and click <strong>Add to Cart</strong> on anything you like.
      </div>
      <div id="drawer-cart-list"></div>
      <div id="drawer-leavers-details-box" class="min-order-note" style="display:none;">
        <strong>Leavers Order Details</strong> (applies to every Leavers item above)
        <div id="drawer-leavers-details-content" style="font-weight:400; margin-top:0.5rem;"></div>
        <button type="button" class="clear-cart-btn" onclick="clearLeaversDetails()">Clear these details</button>
      </div>
      <div id="drawer-cart-summary" class="cart-summary" style="display:none;">
        <div class="cart-summary-row">
          <span>Total</span>
          <span id="drawer-cart-total">£0.00</span>
        </div>
        <a id="drawer-cart-whatsapp-btn" class="whatsapp-btn whatsapp-btn--large" href="#" target="_blank" rel="noopener" onclick="handleSendCart()" style="width:100%; justify-content:center;">Send My Cart on WhatsApp</a>
        <button class="clear-cart-btn" type="button" onclick="clearCart()">Empty Cart</button>
      </div>
    </div>
    <div class="cart-drawer-footer">
      <a class="add-to-cart-btn" id="view-cart-page-link" href="${rootPath("cart.html")}" style="width:100%; justify-content:center;">View Full Cart Page</a>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  cartIcon.addEventListener("click", (e) => {
    e.preventDefault();
    renderCartDrawer();
    openCartDrawer();
  });

  document.getElementById("cart-drawer-close").addEventListener("click", closeCartDrawer);
  overlay.addEventListener("click", closeCartDrawer);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCartDrawer();
  });
}

// ---- Category carousel ----
// Drives the "our work on this garment" carousel at the top of each
// collection page. Autoplays, but stops for good the moment the customer
// takes control (click, key, swipe) so it never fights them.
function initCategoryCarousel(root) {
  const carousel = root || document.querySelector("[data-carousel]");
  if (!carousel) return;

  const slides = Array.from(carousel.querySelectorAll(".carousel-slide"));
  if (slides.length < 2) return;

  const dotsWrap = carousel.querySelector(".carousel-dots");
  const prevBtn = carousel.querySelector(".carousel-btn--prev");
  const nextBtn = carousel.querySelector(".carousel-btn--next");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let timer = null;
  let stopped = false;

  const dots = slides.map((_, i) => {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "carousel-dot" + (i === 0 ? " is-active" : "");
    dot.setAttribute("aria-label", `Show image ${i + 1} of ${slides.length}`);
    dot.addEventListener("click", () => { stop(); go(i); });
    if (dotsWrap) dotsWrap.appendChild(dot);
    return dot;
  });

  function go(next) {
    index = (next + slides.length) % slides.length;
    slides.forEach((s, i) => {
      const active = i === index;
      s.classList.toggle("is-active", active);
      s.setAttribute("aria-hidden", active ? "false" : "true");
    });
    dots.forEach((d, i) => d.classList.toggle("is-active", i === index));
  }

  function start() {
    if (reduced || stopped || timer) return;
    timer = setInterval(() => go(index + 1), 5000);
  }

  function stop() {
    stopped = true;
    clearInterval(timer);
    timer = null;
  }

  if (prevBtn) prevBtn.addEventListener("click", () => { stop(); go(index - 1); });
  if (nextBtn) nextBtn.addEventListener("click", () => { stop(); go(index + 1); });

  carousel.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") { stop(); go(index - 1); }
    if (e.key === "ArrowRight") { stop(); go(index + 1); }
  });

  // Pause while the pointer is over it, resume on the way out — but only
  // if the customer hasn't already taken manual control.
  carousel.addEventListener("mouseenter", () => { clearInterval(timer); timer = null; });
  carousel.addEventListener("mouseleave", start);

  let touchX = null;
  carousel.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  carousel.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 45) { stop(); go(index + (dx < 0 ? 1 : -1)); }
    touchX = null;
  }, { passive: true });

  go(0);
  start();
}

// ---- Scroll reveal ----
// Fades sections in as they enter the viewport. Anything already on screen
// at load shows immediately, so the first paint is never blank.
function initScrollReveal() {
  const targets = document.querySelectorAll(".reveal");
  if (!targets.length) return;

  if (!("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    targets.forEach(el => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });

  targets.forEach(el => observer.observe(el));
}

// Adds a shadow under the sticky header once the page has scrolled.
function initStickyHeader() {
  const header = document.querySelector(".site-header");
  if (!header) return;
  const onScroll = () => header.classList.toggle("is-stuck", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

updateCartBadge();
initAnnouncementBar();
trackLastProductPage();
initCartDrawer();
renderCartUI();
initCategoryCarousel();
initScrollReveal();
initStickyHeader();
