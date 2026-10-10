(function () {
  var WA = "https://wa.me/233593371480";
  var CEDI = "GH₵ ";
  var $ = function (id) { return document.getElementById(id); };
  var products = [].slice.call(document.querySelectorAll(".product"));

  // Prefilled WhatsApp messages
  [].forEach.call(document.querySelectorAll("[data-wa]"), function (a) {
    a.href = WA + "?text=" + encodeURIComponent(a.getAttribute("data-wa"));
  });
  $("year").textContent = new Date().getFullYear();

  // Search and category filter
  var searchBar = $("searchBar"), searchInput = $("searchInput"), searchToggle = $("searchToggle");
  function filter(test) {
    var shown = 0;
    products.forEach(function (p) {
      var ok = test(p);
      p.hidden = !ok;
      if (ok) shown++;
    });
    $("noResults").hidden = shown > 0;
  }
  searchToggle.addEventListener("click", function () {
    var open = searchBar.hidden;
    searchBar.hidden = !open;
    searchToggle.setAttribute("aria-expanded", String(open));
    if (open) searchInput.focus();
    else { searchInput.value = ""; filter(function () { return true; }); }
  });
  searchInput.addEventListener("input", function () {
    var q = searchInput.value.trim().toLowerCase();
    filter(function (p) {
      return (p.dataset.name + " " + p.dataset.cat).toLowerCase().indexOf(q) > -1;
    });
    if (q) $("featured").scrollIntoView();
  });
  [].forEach.call(document.querySelectorAll("[data-filter]"), function (a) {
    a.addEventListener("click", function () {
      var cat = a.dataset.filter;
      filter(function (p) { return p.dataset.cat === cat; });
    });
  });
  [].forEach.call(document.querySelectorAll('a[href="#featured"]:not([data-filter])'), function (a) {
    a.addEventListener("click", function () { filter(function () { return true; }); });
  });

  // Category scroller
  var cats = $("cats"), catNext = $("catNext");
  catNext.addEventListener("click", function () {
    var atEnd = cats.scrollLeft + cats.clientWidth >= cats.scrollWidth - 4;
    cats.scrollTo({ left: atEnd ? 0 : cats.scrollLeft + 300, behavior: "smooth" });
  });

  // Cart, kept in this browser only and sent as a WhatsApp message
  var cart = {};
  try { cart = JSON.parse(localStorage.getItem("ethel-cart")) || {}; } catch (e) {}
  var drawer = $("cart"), scrim = $("scrim"), lastFocus = null;

  function save() {
    try { localStorage.setItem("ethel-cart", JSON.stringify(cart)); } catch (e) {}
  }
  function render() {
    var list = $("cartItems"), names = Object.keys(cart), count = 0, total = 0;
    var lines = ["Hello Ethel Home Care & More, I would like to order:"];
    list.textContent = "";
    names.forEach(function (name) {
      var it = cart[name];
      count += it.qty;
      total += it.qty * it.price;
      lines.push("- " + it.qty + " x " + name + " (" + CEDI + it.price + " each)");

      var li = document.createElement("li");
      var img = document.createElement("img");
      img.src = it.img; img.alt = "";
      var info = document.createElement("div");
      var n = document.createElement("p"); n.className = "name"; n.textContent = name;
      var pr = document.createElement("p"); pr.className = "price"; pr.textContent = CEDI + it.price;
      info.appendChild(n); info.appendChild(pr);
      var qty = document.createElement("div"); qty.className = "qty";
      var minus = document.createElement("button"); minus.type = "button"; minus.textContent = "−";
      minus.setAttribute("aria-label", "Remove one " + name);
      minus.addEventListener("click", function () { change(name, -1); });
      var num = document.createElement("span"); num.textContent = it.qty;
      var plus = document.createElement("button"); plus.type = "button"; plus.textContent = "+";
      plus.setAttribute("aria-label", "Add one more " + name);
      plus.addEventListener("click", function () { change(name, 1); });
      qty.appendChild(minus); qty.appendChild(num); qty.appendChild(plus);
      li.appendChild(img); li.appendChild(info); li.appendChild(qty);
      list.appendChild(li);
    });
    lines.push("Total: " + CEDI + total);
    $("cartCount").textContent = count;
    $("cartTotal").textContent = CEDI + total;
    $("cartEmpty").hidden = count > 0;
    $("cartSend").classList.toggle("is-disabled", count === 0);
    $("cartSend").href = WA + "?text=" + encodeURIComponent(lines.join("\n"));
  }
  function change(name, by) {
    cart[name].qty += by;
    if (cart[name].qty < 1) delete cart[name];
    save(); render();
  }
  function openCart() {
    lastFocus = document.activeElement;
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    scrim.hidden = false;
    drawer.focus();
  }
  function closeCart() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    scrim.hidden = true;
    if (lastFocus) lastFocus.focus();
  }
  products.forEach(function (p) {
    p.querySelector(".add").addEventListener("click", function () {
      var name = p.dataset.name;
      if (!cart[name]) cart[name] = { qty: 0, price: Number(p.dataset.price), img: p.querySelector("img").getAttribute("src") };
      cart[name].qty++;
      save(); render(); openCart();
    });
  });
  $("cartToggle").addEventListener("click", openCart);
  $("cartClose").addEventListener("click", closeCart);
  scrim.addEventListener("click", closeCart);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && drawer.classList.contains("is-open")) closeCart();
  });
  render();
})();
