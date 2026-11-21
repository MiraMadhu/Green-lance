require('dotenv').config();
const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

module.exports = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ''),
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  siteName: 'GreenLance',
  freeContacts: 2,
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || ''
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || ''
  },
  demoPayments: !isProd || process.env.DEMO_PAYMENTS === 'true',
  admin: {
    email: process.env.ADMIN_EMAIL || '',
    password: process.env.ADMIN_PASSWORD || ''
  },
  // Prices are in paise (INR x 100). Change here to change pricing everywhere.
  plans: {
    unlock: { label: 'One-time Unlock', amount: 49900, credits: 10, desc: 'Lifetime access + 10 starter credits' },
    pack_10: { label: '10 Credits', amount: 19900, credits: 10, desc: '10 contact credits' },
    pack_30: { label: '30 Credits', amount: 49900, credits: 30, desc: '30 contact credits' },
    pack_100: { label: '100 Credits', amount: 129900, credits: 100, desc: '100 contact credits' }
  },
  categories: [
    'Web Development', 'Mobile Apps', 'Design & Creative', 'Writing & Content',
    'Digital Marketing', 'Video & Animation', 'Data & AI', 'Business & Consulting', 'Other'
  ]
};
