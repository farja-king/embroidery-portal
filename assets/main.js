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
      clientAllowedFormats: ["png", "jpg", "jpeg"],
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
          status.textContent = "That file couldn't be uploaded — please use a JPG or PNG under 15MB, then click Upload your design to try again.";
          widget.close();
        }
        return;
      }

      if (error) {
        status.classList.remove("upload-status--success");
        status.classList.add("upload-status--error");
        status.textContent = "That file couldn't be uploaded — please use a JPG or PNG under 15MB, then click Upload your design to try again.";
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
  renderCartPage();
}

function clearCart() {
  if (getCart().length === 0) return;
  if (!confirm("Remove all items from your cart?")) return;
  saveCart([]);
  renderCartPage();
}

function updateCartItemQty(index, delta) {
  const cart = getCart();
  if (!cart[index]) return;
  cart[index].qty = Math.max(1, (cart[index].qty || 1) + delta);
  saveCart(cart);
  renderCartPage();
}

function cartTotal(cart) {
  return cart.reduce((sum, item) => sum + item.price * (item.qty || 1), 0);
}

// Renders the cart page's item list + running total. Only does anything
// if the expected cart-page elements are present.
function renderCartPage() {
  const list = document.getElementById("cart-list");
  if (!list) return;

  const cart = getCart();
  const emptyMsg = document.getElementById("cart-empty");
  const summary = document.getElementById("cart-summary");

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

  const totalEl = document.getElementById("cart-total");
  if (totalEl) totalEl.textContent = `£${cartTotal(cart).toFixed(2)}`;

  const sendBtn = document.getElementById("cart-whatsapp-btn");
  if (sendBtn) sendBtn.href = whatsappLink(buildCartMessage(cart));
}

function buildCartMessage(cart) {
  const lines = cart.map((item, i) => {
    const qty = item.qty || 1;
    return `${i + 1}. ${item.title} (${item.styleCode}) — Colour: ${item.colourName}, Size: ${item.size}, Qty: ${qty} — £${(item.price * qty).toFixed(2)}`;
  });
  const total = cartTotal(cart).toFixed(2);
  return `Hi, I'd like to enquire about the following items:\n\n${lines.join("\n")}\n\nTotal: £${total}`;
}

updateCartBadge();
