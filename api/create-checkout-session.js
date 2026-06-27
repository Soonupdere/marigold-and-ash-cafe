// /server/create-checkout-session.js
//
// WHAT THIS IS
// A serverless function that creates a real Stripe Checkout Session in GBP.
// Stripe's hosted Checkout page automatically offers Apple Pay, Google Pay,
// and standard debit/credit cards — you do not need to configure those
// separately. This file is the ONLY place your secret Stripe key should
// ever live. Never put a secret key in the front-end HTML/JS.
//
// WHERE TO PUT THIS
// - Vercel: save as /api/create-checkout-session.js in your project root
// - Netlify: save as /netlify/functions/create-checkout-session.js
//   (Netlify functions use `exports.handler` instead — see note at bottom)
//
// SETUP STEPS
// 1. Create a free Stripe account: https://dashboard.stripe.com/register
// 2. Get your SECRET key (starts with sk_test_... for testing,
//    sk_live_... for real payments) from Developers > API keys
// 3. Set it as an environment variable called STRIPE_SECRET_KEY in your
//    hosting dashboard (Vercel/Netlify project settings) — never commit
//    it to code or git
// 4. Run: npm install stripe
// 5. Update CHECKOUT_ENDPOINT in the front-end index.html to match
//    wherever this function ends up deployed (e.g. /api/create-checkout-session)
//
// TESTING
// Use Stripe's test card 4242 4242 4242 4242, any future expiry, any CVC.
// Apple Pay will show automatically on supported Safari/iOS devices once
// you're on a real https:// domain (it will NOT show on localhost or
// plain http — Stripe requires a verified domain for Apple Pay).

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { items, currency = 'gbp', customer = {} } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    // Basic server-side validation of customer details. The browser already
    // checks these, but never trust client-side validation alone — anyone
    // can call this endpoint directly and skip the form.
    const name = (customer.name || '').trim();
    const phone = (customer.phone || '').trim();
    const phoneDigits = phone.replace(/[\s-]/g, '');
    const isValidUKPhone = /^(\+44\d{9,10}|0\d{9,10})$/.test(phoneDigits);

    if (name.length < 2) {
      return res.status(400).json({ error: 'A valid customer name is required' });
    }
    if (!isValidUKPhone) {
      return res.status(400).json({ error: 'A valid UK phone number is required' });
    }

    // Build Stripe line items server-side from the cart sent by the browser.
    // In production, look up real prices from your own database here
    // instead of trusting unit_amount sent by the client — this demo
    // trusts the client for simplicity only.
    const line_items = items.map((item) => ({
      price_data: {
        currency,
        product_data: { name: item.name },
        unit_amount: item.unit_amount, // pence, e.g. 340 = £3.40
      },
      quantity: item.quantity || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'], // Apple Pay / Google Pay appear
                                       // automatically within "card" on
                                       // supported browsers/devices
      line_items,
      success_url: `${process.env.SITE_URL}/order-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SITE_URL}/?cancelled=true`,
      // UK-specific touches:
      locale: 'en-GB',
      billing_address_collection: 'auto',
      // Customer pickup details: stored as metadata so they show up
      // against the payment in your Stripe dashboard (Payments > click
      // the payment > Metadata), and pre-filled as Stripe's own
      // "phone number" collection field for confirmation purposes.
      phone_number_collection: { enabled: true },
      metadata: {
        customer_name: name,
        customer_phone: phone,
        order_type: 'pickup',
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe session error:', err);
    return res.status(500).json({ error: 'Could not create checkout session' });
  }
};

// ---------------------------------------------------------------------
// NETLIFY VERSION — if deploying to Netlify Functions instead of Vercel,
// replace the export above with this format:
//
// exports.handler = async function (event) {
//   const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
//   const { items, currency = 'gbp' } = JSON.parse(event.body);
//   const line_items = items.map((item) => ({
//     price_data: {
//       currency,
//       product_data: { name: item.name },
//       unit_amount: item.unit_amount,
//     },
//     quantity: item.quantity || 1,
//   }));
//   const session = await stripe.checkout.sessions.create({
//     mode: 'payment',
//     payment_method_types: ['card'],
//     line_items,
//     success_url: `${process.env.SITE_URL}/order-success`,
//     cancel_url: `${process.env.SITE_URL}/`,
//     locale: 'en-GB',
//   });
//   return { statusCode: 200, body: JSON.stringify({ url: session.url }) };
// };
// ---------------------------------------------------------------------
