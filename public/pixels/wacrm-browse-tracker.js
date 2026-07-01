// Shopify Web Pixel integration for wacrm
// Listens to product views on the storefront and synchronizes them to the CRM.

analytics.subscribe('product_viewed', (event) => {
  const customer = event.data.customer;
  const productVariant = event.data.productVariant;
  const product = productVariant?.product;

  if (!customer || !productVariant || !product) {
    return; // Ignore fully anonymous or incomplete view events
  }

  const customerId = customer.id;
  const email = customer.email;
  const phone = customer.phone;

  if (!customerId && !email && !phone) {
    return; // Respect privacy constraints: only identify visitor if contact data is present
  }

  const payload = {
    customer_id: customerId ? String(customerId) : null,
    email: email || null,
    phone: phone || null,
    first_name: customer.firstName || null,
    last_name: customer.lastName || null,
    product_id: String(product.id),
    product_title: product.title,
    price: productVariant.price?.amount ? parseFloat(productVariant.price.amount) : 0,
    product_url: event.context.document?.location?.href || '',
  };

  // Dispatch to the wacrm pixel receiver endpoint
  fetch('/api/shopify/pixel/product-viewed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch((err) => console.warn('[wacrm-pixel] failed to send product view:', err));
});
