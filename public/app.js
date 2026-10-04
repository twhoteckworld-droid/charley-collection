  // ==========================================================
  // SOCIAL MEDIA CONFIGURATION
  // Paste the real URLs between the quotation marks later.
  // Empty links stay hidden automatically.
  // ==========================================================

  const SOCIAL_LINKS = {
  instagram: "https://www.instagram.com/charlie_collection___?stkn=MWI3cno2NG42ZHBtOQ==",
  facebook: "https://www.facebook.com/share/1Bzc5X2nZp/"
};

  var products = [];
  var cart = [];
  let selectedCategory = "All";

  function setupSocialLinks() {
    const instagram = document.getElementById("instagramLink");
    const facebook = document.getElementById("facebookLink");

    if (instagram && SOCIAL_LINKS.instagram.trim()) {
      instagram.href = SOCIAL_LINKS.instagram.trim();
      instagram.style.display = "inline-flex";
    }

    if (facebook && SOCIAL_LINKS.facebook.trim()) {
      facebook.href = SOCIAL_LINKS.facebook.trim();
      facebook.style.display = "inline-flex";
    }
  }

  async function loadProducts() {
    try {
      const response = await fetch("/api/products");

      if (!response.ok) {
        throw new Error("Products API unavailable");
      }

      products = await response.json();
      renderProducts();

    } catch (error) {
      console.error(error);

      document.getElementById("products").innerHTML = `
        <div class="empty">
          Products will be available soon.
        </div>
      `;
    }
  }

  function setCategory(category, button) {
    selectedCategory = category;

    // Clear active on all category buttons
    document
      .querySelectorAll(".category")
      .forEach(el => el.classList.remove("active"));

    // If clicked element is itself a .category button, activate it.
    // If it's a cat-card (not a .category), find the matching toolbar button and activate that.
    var targetBtn = null;
    if (button && button.classList && button.classList.contains("category")) {
      targetBtn = button;
    } else {
      // find by text match in toolbar
      var buttons = document.querySelectorAll(".category");
      for (var i = 0; i < buttons.length; i++) {
        if (buttons[i].textContent.trim().toLowerCase() === String(category).toLowerCase()) {
          targetBtn = buttons[i];
          break;
        }
      }
    }
    if (targetBtn) targetBtn.classList.add("active");

    renderProducts();
  }

  function renderProducts() {
    const container = document.getElementById("products");
    const search = document
      .getElementById("search")
      .value
      .toLowerCase()
      .trim();

    const filtered = products.filter(product => {
      const matchesCategory =
        selectedCategory === "All" ||
        product.category === selectedCategory;

      const matchesSearch =
        !search ||
        String(product.name || "")
          .toLowerCase()
          .includes(search);

      return matchesCategory && matchesSearch;
    });

    if (!filtered.length) {
      container.innerHTML = `
        <div class="empty">
          No products available yet.
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(product => `
      <article class="product">

        <div class="product-img">
          ${
            product.image
              ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}">`
              : `<span>Image coming soon</span>`
          }
        </div>

        <div class="product-info">
          <div class="product-name">
            ${escapeHtml(product.name)}
          </div>

          <div class="product-price">
            ${
              product.price
                ? "₹" + Number(product.price).toLocaleString("en-IN")
                : "Ask for Price"
            }
          </div>

          ${
            Array.isArray(product.sizes) && product.sizes.length
              ? `
                <div class="size-label">Select Size</div>

                <div class="product-sizes" id="sizes-${escapeHtml(product.id)}">

                  ${product.sizes.map(size => `
                    <button
                      type="button"
                      class="product-size-btn"
                      data-product-id="${escapeHtml(product.id)}"
                      data-size="${escapeHtml(size)}"
                      onclick="selectProductSize('${String(product.id).replace(/'/g, "\\'")}', '${String(size).replace(/'/g, "\\'")}')"
                    >
                      ${escapeHtml(size)}
                    </button>
                  `).join("")}

                </div>

                <div
                  class="size-required"
                  id="size-required-${escapeHtml(product.id)}"
                >
                  Please select a size.
                </div>
              `
              : ""
          }

          <button
            class="add-btn"
            onclick="addToCart('${String(product.id).replace(/'/g, "\\'")}')"
          >
            Add to Cart
          </button>
        </div>

      </article>
    `).join("");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  let selectedSizes = {};

  function selectProductSize(id, size) {

    selectedSizes[String(id)] = size;

    document
      .querySelectorAll(
        `.product-size-btn[data-product-id="${CSS.escape(String(id))}"]`
      )
      .forEach(button => {

        button.classList.toggle(
          "selected",
          button.dataset.size === size
        );

      });

    const warning =
      document.getElementById(
        "size-required-" + String(id)
      );

    if (warning) {
      warning.style.display = "none";
    }
  }


  function addToCart(id) {

    const product = products.find(
      item => String(item.id) === String(id)
    );

    if (!product) return;


    const sizes =
      Array.isArray(product.sizes)
        ? product.sizes
        : [];


    let selectedSize = "";


    if (sizes.length) {

      selectedSize =
        selectedSizes[String(id)] || "";


      if (!selectedSize) {

        const warning =
          document.getElementById(
            "size-required-" + String(id)
          );

        if (warning) {
          warning.style.display = "block";
        }

        return;
      }

    }


    const existing = cart.find(
      item =>
        String(item.id) === String(id) &&
        String(item.size || "") ===
          String(selectedSize || "")
    );


    if (existing) {

      existing.quantity++;

    } else {

      cart.push({

        ...product,

        size: selectedSize,

        quantity: 1

      });

    }


    updateCart();
  }


  function changeQuantity(id, size, change) {

    const item = cart.find(
      item =>
        String(item.id) === String(id) &&
        String(item.size || "") ===
          String(size || "")
    );


    if (!item) return;


    item.quantity += change;


    if (item.quantity <= 0) {

      cart = cart.filter(
        item =>
          !(
            String(item.id) === String(id) &&
            String(item.size || "") ===
              String(size || "")
          )
      );

    }


    updateCart();
  }


  function updateCart() {

    const count = cart.reduce(
      (total, item) =>
        total + item.quantity,
      0
    );


    const cartTotal = cart.reduce(
      (total, item) => {

        const price =
          Number(item.price || 0);

        return total +
          (price * item.quantity);

      },
      0
    );


    document.getElementById(
      "cartCount"
    ).textContent = count;


    document.getElementById(
      "cartTotal"
    ).textContent =
      cartTotal > 0
        ? "Total: ₹" +
          cartTotal.toLocaleString("en-IN")
        : "Total: Price to be confirmed";


    const container =
      document.getElementById(
        "cartItems"
      );


    if (!cart.length) {

      container.innerHTML = `
        <div class="empty">
          Your cart is empty.
        </div>
      `;

      return;
    }


    container.innerHTML =
      cart.map(item => `

        <div class="cart-item">

          <div>

            <strong>
              ${escapeHtml(item.name)}
            </strong>

            ${
              item.size
                ? `
                  <div
                    style="
                      font-size:13px;
                      color:#666;
                      margin-top:4px;
                    "
                  >
                    Size: ${escapeHtml(item.size)}
                  </div>
                `
                : ""
            }

            <div class="quantity-control">

              <button
                type="button"
                onclick="changeQuantity(
                  '${String(item.id).replace(/'/g, "\\'")}',
                  '${String(item.size || "").replace(/'/g, "\\'")}',
                  -1
                )"
              >
                −
              </button>

              <span>
                ${item.quantity}
              </span>

              <button
                type="button"
                onclick="changeQuantity(
                  '${String(item.id).replace(/'/g, "\\'")}',
                  '${String(item.size || "").replace(/'/g, "\\'")}',
                  1
                )"
              >
                +
              </button>

            </div>

          </div>


          <strong>

            ${
              item.price
                ? "₹" +
                  (
                    Number(item.price) *
                    item.quantity
                  ).toLocaleString("en-IN")
                : "Ask for Price"
            }

          </strong>

        </div>

      `).join("");
  }


  function openCart() {
    document
      .getElementById("cartPanel")
      .classList.add("open");

    updateCart();
  }

  function closeCart(event) {
    if (
      !event ||
      event.target === document.getElementById("cartPanel")
    ) {
      document
        .getElementById("cartPanel")
        .classList.remove("open");
    }
  }

  function checkout() {
    if (!cart.length) {
      alert("Your cart is empty.");
      return;
    }

    const name =
      document.getElementById("customerName").value.trim();

    const phone =
      document.getElementById("customerPhone").value.trim();

    const address =
      document.getElementById("customerAddress").value.trim();

    if (!name) {
      alert("Please enter your name.");
      document.getElementById("customerName").focus();
      return;
    }

    if (!phone) {
      alert("Please enter your phone number.");
      document.getElementById("customerPhone").focus();
      return;
    }

    if (!/^[0-9]{10}$/.test(phone.replace(/\D/g, ""))) {
      alert("Please enter a valid 10-digit phone number.");
      document.getElementById("customerPhone").focus();
      return;
    }

    if (!address) {
      alert("Please enter your delivery address.");
      document.getElementById("customerAddress").focus();
      return;
    }

    let total = 0;

    const orderItems = cart.map(item => {
      const price = Number(item.price || 0);
      const itemTotal = price * item.quantity;

      total += itemTotal;

      const sizeText =
        item.size
          ? ` | Size: ${item.size}`
          : "";

      return `${item.name} x ${item.quantity}${sizeText} - ${
        price
          ? "₹" + itemTotal.toLocaleString("en-IN")
          : "Ask for Price"
      }`;
    });

    const message = [
      "🛍️ *New Order - Charley Collection*",
      "",
      `👤 Name: ${name}`,
      `📱 Phone: ${phone}`,
      `📍 Address: ${address}`,
      "",
      "🛒 *Order Details:*",
      ...orderItems,
      "",
      `💰 *Total: ${
        total
          ? "₹" + total.toLocaleString("en-IN")
          : "Price to be confirmed"
      }*`,
      "",
      "Please confirm my order."
    ].join("\n");

    const whatsappNumber = "917018721886";

    const whatsappURL =
      "https://wa.me/" +
      whatsappNumber +
      "?text=" +
      encodeURIComponent(message);

    try {
      window.open(whatsappURL, "_blank");
    } catch (e) {
      window.location.href = whatsappURL;
    }

    cart = [];
    updateCart();

    document.getElementById("customerName").value = "";
    document.getElementById("customerPhone").value = "";
    document.getElementById("customerAddress").value = "";

    // Show success feedback
    if (typeof window.showOrderSuccess === "function") {
      window.showOrderSuccess();
    }

    // Close cart panel after 1.2s
    setTimeout(function(){
      var panel = document.getElementById("cartPanel");
      if (panel) panel.classList.remove("open");
    }, 1200);
  }

  setupSocialLinks();
  loadProducts();
  updateCart();
