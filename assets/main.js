// Cloudinary config — replace UPLOAD_PRESET once created in the Cloudinary console
// (Settings > Upload > Upload presets > Add upload preset > Signing Mode: Unsigned)
const CLOUDINARY_CLOUD_NAME = "dzifncuur";
const CLOUDINARY_UPLOAD_PRESET = "ml_default";

// ---- Deferred uploads ----
// Files the customer picks are kept locally (IndexedDB, so they survive
// navigating between pages while shopping) and only actually uploaded to
// Cloudinary once they confirm sending a quote — either "Add to Cart" +
// "Send My Cart on WhatsApp", or the single-item "Find Out More on
// WhatsApp" button. That way an abandoned upload never reaches Cloudinary
// at all, and nothing leaves the browser until the customer has committed.
const PENDING_DB_NAME = "embroideryClickPendingFiles";

function openPendingDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PENDING_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function savePendingFile(id, file) {
  return openPendingDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").put(file, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  }));
}

function getPendingFile(id) {
  return openPendingDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const req = tx.objectStore("files").get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function deletePendingFile(id) {
  return openPendingDB().then(db => new Promise((resolve) => {
    const tx = db.transaction("files", "readwrite");
    tx.objectStore("files").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  }));
}

function genPendingId() {
  return `p${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
}

// Direct unsigned upload to Cloudinary's REST API. Used only at send-time
// (see handleSendCart / initWhatsappCta) — deliberately not the Cloudinary
// widget, since the widget uploads the moment a file is picked and we need
// that to happen later, under our own control.
function uploadFileToCloudinary(file, folder, resourceType) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder", folder);
  const type = resourceType || "image";
  return fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${type}/upload`, {
    method: "POST",
    body: formData
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) throw new Error(data.error.message || "Upload failed");
      return data.secure_url;
    });
}

const IMAGE_TYPES = ["image/png", "image/jpeg", "application/pdf"];
const DOC_TYPES = [
  "application/pdf", "text/csv", "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
];

// Wires a visible button to a hidden native file input. Picking a file
// just stores it locally (savePendingFile) and hands the caller back a
// { id, name, folder, resourceType } reference — nothing is uploaded yet.
function initDeferredUpload(buttonId, statusId, folder, onSelect, docs) {
  const button = document.getElementById(buttonId);
  const status = document.getElementById(statusId);
  if (!button) return;

  const input = document.createElement("input");
  input.type = "file";
  input.hidden = true;
  input.accept = docs ? ".pdf,.csv,.xls,.xlsx,.doc,.docx" : ".jpg,.jpeg,.png,.pdf";
  button.insertAdjacentElement("afterend", input);
  button.addEventListener("click", () => input.click());

  input.addEventListener("change", () => {
    const file = input.files[0];
    if (!file) return;

    const allowed = docs ? DOC_TYPES : IMAGE_TYPES;
    const extOk = docs && /\.(csv|xlsx?|docx?)$/i.test(file.name);
    if ((!allowed.includes(file.type) && !extOk) || file.size > 15000000) {
      status.classList.remove("upload-status--success");
      status.classList.add("upload-status--error");
      status.textContent = docs
        ? "That file couldn't be used — please use a PDF, CSV, Excel or Word file under 15MB."
        : "That file couldn't be used — please use a JPG, PNG or PDF under 15MB.";
      input.value = "";
      return;
    }

    const id = genPendingId();
    savePendingFile(id, file).then(() => {
      status.classList.remove("upload-status--error");
      status.classList.add("upload-status--success");
      status.textContent = `"${file.name}" ready — it'll be sent to us once you confirm your quote.`;
      button.textContent = docs ? "Choose a different document" : "Choose a different image";
      if (onSelect) onSelect({ id, name: file.name, folder, resourceType: docs ? "raw" : "image" });
    });
  });
}

// Wires the single-item "Find Out More on WhatsApp" button used on
// standalone product pages (not the cart). If a design was picked,
// uploads it to Cloudinary first, then opens WhatsApp with the resolved
// link included; if nothing was picked, the button's already-set href
// just navigates normally. buildMessage(imageUrl) returns the message text.
function initWhatsappCta(linkId, buildMessage, getPendingDesign) {
  const link = document.getElementById(linkId);
  if (!link) return;

  link.addEventListener("click", (e) => {
    const pending = getPendingDesign();
    if (!pending || link.dataset.busy) return;
    e.preventDefault();

    const original = link.textContent;
    link.dataset.busy = "1";
    link.textContent = "Uploading your design…";
    link.style.pointerEvents = "none";

    getPendingFile(pending.id)
      .then(file => {
        if (!file) return null;
        return uploadFileToCloudinary(file, pending.folder, pending.resourceType).then(url => {
          return deletePendingFile(pending.id).then(() => url);
        });
      })
      .then(imageUrl => {
        window.open(whatsappLink(buildMessage(imageUrl)), "_blank", "noopener");
      })
      .catch(err => {
        link.textContent = "Upload failed — tap to try again";
        console.error(err);
      })
      .finally(() => {
        delete link.dataset.busy;
        link.style.pointerEvents = "";
        if (link.textContent === "Uploading your design…") link.textContent = original;
      });
  });
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

// Whatever design was last picked via initDeferredUpload on the current
// product page — attached to the next item added to the cart. Cleared
// per page load (a fresh visit shouldn't carry over a design from
// wherever the customer was before).
let pendingDesignForCart = null;
function setPendingImageForCart(info) { pendingDesignForCart = info; }

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
  const styleCode = codeEl ? codeEl.textContent.split("-")[0].trim() : "";
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
    if (pendingDesignForCart) existing.pendingImage = pendingDesignForCart;
  } else {
    cart.push({ title, styleCode, colourName, size, price, image, qty, pendingImage: pendingDesignForCart || null });
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
    const designNote = item.pendingImage
      ? `<div class="cart-item-meta" style="color:var(--brass-dark);">Design attached: ${item.pendingImage.name}</div>`
      : "";
    return `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.title}">
      <div class="cart-item-details">
        <div class="cart-item-title">${item.title} (${item.styleCode})</div>
        <div class="cart-item-meta">Colour: ${item.colourName} &middot; Size: ${item.size}</div>
        ${designNote}
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

// Collections and products pages live one folder down (/collections/...,
// /products/...), everything else is at the site root — this resolves a
// root-relative path from any of those locations.
function rootPath(path) {
  const isNested = window.location.pathname.includes("/collections/") || window.location.pathname.includes("/products/");
  return isNested ? `../${path}` : path;
}

// Called when the customer clicks "Send My Cart on WhatsApp". Uploads any
// pending design files (per cart item, plus the shared Leavers logo/docs)
// to Cloudinary first — this is the one moment those files actually leave
// the browser — then opens WhatsApp with the resolved links included,
// clears the cart, and moves on to the thank-you page. If an upload fails,
// the cart is left untouched so the customer can try again.
function handleSendCart(e) {
  const link = e.currentTarget;
  if (link.dataset.busy) return;
  e.preventDefault();

  const cart = getCart();
  const leavers = getLeaversDetails();
  const pendingCount = cart.filter(item => item.pendingImage).length +
    (leavers.pendingLogo ? 1 : 0) + (leavers.pendingDocs ? 1 : 0);

  const original = link.textContent;
  if (pendingCount > 0) {
    link.dataset.busy = "1";
    link.textContent = `Uploading your design${pendingCount > 1 ? "s" : ""}…`;
    link.style.pointerEvents = "none";
  }

  Promise.resolve()
    .then(async () => {
      for (const item of cart) {
        if (!item.pendingImage) continue;
        const file = await getPendingFile(item.pendingImage.id);
        if (file) {
          item.imageUrl = await uploadFileToCloudinary(file, item.pendingImage.folder, item.pendingImage.resourceType);
          await deletePendingFile(item.pendingImage.id);
        }
        delete item.pendingImage;
      }
      saveCart(cart);

      if (leavers.pendingLogo) {
        const file = await getPendingFile(leavers.pendingLogo.id);
        if (file) {
          leavers.logoUrl = await uploadFileToCloudinary(file, leavers.pendingLogo.folder, "image");
          await deletePendingFile(leavers.pendingLogo.id);
        }
        delete leavers.pendingLogo;
      }
      if (leavers.pendingDocs) {
        const file = await getPendingFile(leavers.pendingDocs.id);
        if (file) {
          leavers.docsUrl = await uploadFileToCloudinary(file, leavers.pendingDocs.folder, "raw");
          await deletePendingFile(leavers.pendingDocs.id);
        }
        delete leavers.pendingDocs;
      }
      localStorage.setItem(LEAVERS_KEY, JSON.stringify(leavers));

      window.open(whatsappLink(buildCartMessage(cart)), "_blank", "noopener");

      setTimeout(() => {
        saveCart([]);
        window.location.href = rootPath("thank-you.html");
      }, 400);
    })
    .catch(err => {
      link.textContent = "Upload failed — tap to try again";
      console.error(err);
    })
    .finally(() => {
      delete link.dataset.busy;
      link.style.pointerEvents = "";
      if (link.textContent.startsWith("Uploading your design")) link.textContent = original;
    });
}

function buildCartMessage(cart) {
  const lines = cart.map((item, i) => {
    const qty = item.qty || 1;
    let line = `${i + 1}. ${item.title} (${item.styleCode}) — Colour: ${item.colourName}, Size: ${item.size}, Qty: ${qty} — £${(item.price * qty).toFixed(2)}`;
    if (item.imageUrl) {
      line += `\n   Design: ${item.imageUrl}`;
    } else if (item.pendingImage) {
      line += `\n   Design: "${item.pendingImage.name}" (will be sent once you confirm)`;
    }
    return line;
  });
  const total = cartTotal(cart).toFixed(2);
  let msg = `Hi, I'd like to enquire about the following items:\n\n${lines.join("\n\n")}`;

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
        <a id="drawer-cart-whatsapp-btn" class="whatsapp-btn whatsapp-btn--large" href="#" target="_blank" rel="noopener" onclick="handleSendCart(event)" style="width:100%; justify-content:center;">Send My Cart on WhatsApp</a>
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
