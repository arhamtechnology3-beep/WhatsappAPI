# WhatsApp Template Setup Guide

This document lists the pre-configured templates that you need to submit for approval in Meta's **WhatsApp Manager** in order to activate automated notifications from your Shopify storefront.

---

## 🚀 How to Submit Templates

1. Go to **[WhatsApp Manager Template Section](https://business.facebook.com/wa/manage/message-templates/)**.
2. Click **Create Template**.
3. Choose the appropriate **Category** and **Language** (English) for each recipe below.
4. Set the template name **exactly** as shown (e.g. `wacrm_cart_abandoned_v1`).
5. Copy the **Body Text** and paste it into the template body editor.
6. When adding variables (e.g. `{{1}}`), add sample values matching the mapping fields listed below (Meta requires samples for variables before approval).
7. Submit the template.
8. Once Meta approves (usually within 1–5 minutes), go to **Settings** -> **Shopify Store** in **wacrm**, locate the template, and click **Mark Approved & Activate**!

---

## 📋 Template Recipes

### 1. Checkout Abandoned (cart_abandoned - Step 1)
- **Template Name**: `wacrm_cart_abandoned_v1`
- **Category**: `MARKETING`
- **Language**: `en`
- **Body Text**:
  ```text
  Hi {{1}}, you left {{2}} in your cart at {{3}}. Complete your order here: {{4}}
  ```
- **Variable Mappings**:
  - `{{1}}` &rarr; `Customer First Name` (e.g., `John`)
  - `{{2}}` &rarr; `Product Name` (e.g., `Organic Honey`)
  - `{{3}}` &rarr; `Store Name` (e.g., `Divyaprabha Foods`)
  - `{{4}}` &rarr; `Checkout Recovery URL` (e.g., `https://shopify.com/.../checkouts/...`)

---

### 2. Cart Recovery Drip (cart_abandoned - Step 2)
- **Template Name**: `wacrm_cart_reminder_step2_v1`
- **Category**: `MARKETING`
- **Language**: `en`
- **Body Text**:
  ```text
  Hi {{1}}, still thinking it over? {{2}} is waiting for you at ₹{{3}}. Reply STOP to stop these updates.
  ```
- **Variable Mappings**:
  - `{{1}}` &rarr; `Customer First Name` (e.g., `John`)
  - `{{2}}` &rarr; `Product Name` (e.g., `Organic Honey`)
  - `{{3}}` &rarr; `Total Price` (e.g., `450.00`)

---

### 3. Cart Recovery Drip (cart_abandoned - Step 3 - Final)
- **Template Name**: `wacrm_cart_reminder_step3_v1`
- **Category**: `MARKETING`
- **Language**: `en`
- **Body Text**:
  ```text
  Hi {{1}}, here's 10% off to help you decide: use code {{4}} on {{2}}, valid 24 hours. Complete your order: {{3}}. Reply STOP to stop these updates.
  ```
- **Variable Mappings**:
  - `{{1}}` &rarr; `Customer First Name` (e.g., `John`)
  - `{{2}}` &rarr; `Product Name` (e.g., `Organic Honey`)
  - `{{3}}` &rarr; `Checkout Recovery URL` (e.g., `https://shopify.com/.../checkouts/...`)
  - `{{4}}` &rarr; `Discount Code` (e.g., `WACRM10-ABC1`)

---

### 4. Browse Abandoned (browse_abandoned - Step 1)
- **Template Name**: `wacrm_browse_abandoned_v1`
- **Category**: `MARKETING`
- **Language**: `en`
- **Body Text**:
  ```text
  Hi {{1}}, still interested in {{2}}? It's ₹{{3}}. Check it out: {{4}}. Reply STOP to stop these updates.
  ```
- **Variable Mappings**:
  - `{{1}}` &rarr; `Customer First Name` (e.g., `John`)
  - `{{2}}` &rarr; `Product Name` (e.g., `Organic Honey`)
  - `{{3}}` &rarr; `Price` (e.g., `450.00`)
  - `{{4}}` &rarr; `Product URL` (e.g., `https://divyaprabhafoods.com/products/honey`)

---

### 5. Order Confirmed (order_created)
- **Template Name**: `wacrm_order_confirmed_v1`
- **Category**: `UTILITY`
- **Language**: `en`
- **Body Text**:
  ```text
  Hi {{1}}, your order #{{2}} of ₹{{3}} is confirmed! We'll notify you when it ships.
  ```
- **Variable Mappings**:
  - `{{1}}` &rarr; `Customer First Name` (e.g., `John`)
  - `{{2}}` &rarr; `Order Number` (e.g., `1001`)
  - `{{3}}` &rarr; `Total Price` (e.g., `450.00`)

---

### 6. Order Shipped (order_fulfilled)
- **Template Name**: `wacrm_order_shipped_v1`
- **Category**: `UTILITY`
- **Language**: `en`
- **Body Text**:
  ```text
  Hi {{1}}, your order #{{2}} has shipped! Track it here: {{3}}
  ```
- **Variable Mappings**:
  - `{{1}}` &rarr; `Customer First Name` (e.g., `John`)
  - `{{2}}` &rarr; `Order Number` (e.g., `1001`)
  - `{{3}}` &rarr; `Tracking URL` (e.g., `https://courier.com/track/...`)

---

### 7. Order Delivered (order_delivered)
- **Template Name**: `wacrm_order_delivered_v1`
- **Category**: `UTILITY`
- **Language**: `en`
- **Body Text**:
  ```text
  Hi {{1}}, your order #{{2}} was delivered. We hope you love it! Reply to this message if you need anything.
  ```
- **Variable Mappings**:
  - `{{1}}` &rarr; `Customer First Name` (e.g., `John`)
  - `{{2}}` &rarr; `Order Number` (e.g., `1001`)
