#!/usr/bin/env node

/**
 * Test Resend Webhook Locally
 * 
 * This script tests the Resend webhook endpoint with mock payloads
 * Usage: node test-resend-webhook.js
 */

const http = require('http');
const crypto = require('crypto');

// Configuration
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:3000/api/webhook-resend';
const WEBHOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET || 'whsec_test_secret_key_for_testing_only';

console.log('🧪 Resend Webhook Test Suite');
console.log(`📍 Target: ${WEBHOOK_URL}`);
console.log(`🔐 Secret: ${WEBHOOK_SECRET.substring(0, 10)}...`);
console.log('---\n');

/**
 * Generate Resend webhook signature (HMAC-SHA256)
 * Format: base64(hmac-sha256(id.timestamp.body))
 */
function generateResendSignature(id, timestamp, body) {
  const message = `${id}.${timestamp}.${body}`;
  const signature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(message)
    .digest('base64');
  return signature;
}

/**
 * Send webhook payload to endpoint
 */
async function sendWebhook(payload, testName) {
  return new Promise((resolve, reject) => {
    const id = payload.id || crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = JSON.stringify(payload);
    
    // Generate Resend-style signature headers
    const signature = generateResendSignature(id, timestamp, body);
    
    const url = new URL(WEBHOOK_URL);
    
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
    };
    
    console.log(`📤 Sending: ${testName}`);
    console.log(`   Headers: svix-id=${id}`);
    
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        const success = res.statusCode >= 200 && res.statusCode < 300;
        console.log(`   Response: ${res.statusCode} ${success ? '✓' : '✗'}`);
        if (data) console.log(`   Body: ${data}`);
        console.log();
        resolve({ status: res.statusCode, success });
      });
    });
    
    req.on('error', (error) => {
      console.log(`   Error: ${error.message} ✗`);
      console.log();
      reject(error);
    });
    
    req.write(body);
    req.end();
  });
}

/**
 * Test payloads matching Resend webhook events
 */
const testCases = [
  {
    name: '1. Email Sent',
    payload: {
      id: 'evt_' + crypto.randomUUID(),
      type: 'email.sent',
      created_at: new Date().toISOString(),
      data: {
        email_id: crypto.randomUUID(),
        from: 'contato@nikkeybox.com',
        to: ['customer@example.com'],
        subject: 'Welcome to NikkeyBox',
        created_at: new Date().toISOString(),
      },
    },
  },
  {
    name: '2. Email Delivered',
    payload: {
      id: 'evt_' + crypto.randomUUID(),
      type: 'email.delivered',
      created_at: new Date().toISOString(),
      data: {
        email_id: crypto.randomUUID(),
        from: 'contato@nikkeybox.com',
        to: ['customer@example.com'],
        created_at: new Date().toISOString(),
      },
    },
  },
  {
    name: '3. Email Bounced',
    payload: {
      id: 'evt_' + crypto.randomUUID(),
      type: 'email.bounced',
      created_at: new Date().toISOString(),
      data: {
        email_id: crypto.randomUUID(),
        from: 'contato@nikkeybox.com',
        to: ['invalid@example.com'],
        bounce_type: 'permanent',
        created_at: new Date().toISOString(),
      },
    },
  },
  {
    name: '4. Email Opened',
    payload: {
      id: 'evt_' + crypto.randomUUID(),
      type: 'email.opened',
      created_at: new Date().toISOString(),
      data: {
        email_id: crypto.randomUUID(),
        from: 'contato@nikkeybox.com',
        to: ['customer@example.com'],
        opened_at: new Date().toISOString(),
      },
    },
  },
  {
    name: '5. Email Clicked',
    payload: {
      id: 'evt_' + crypto.randomUUID(),
      type: 'email.clicked',
      created_at: new Date().toISOString(),
      data: {
        email_id: crypto.randomUUID(),
        from: 'contato@nikkeybox.com',
        to: ['customer@example.com'],
        click_url: 'https://nikkeybox.com/products',
        clicked_at: new Date().toISOString(),
      },
    },
  },
];

/**
 * Run all tests
 */
async function runTests() {
  try {
    const results = [];
    
    for (const testCase of testCases) {
      try {
        const result = await sendWebhook(testCase.payload, testCase.name);
        results.push({ name: testCase.name, ...result });
      } catch (error) {
        results.push({ name: testCase.name, success: false, error: error.message });
      }
      
      // Delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Summary
    console.log('📊 Test Summary');
    console.log('---');
    const passed = results.filter(r => r.success).length;
    const total = results.length;
    console.log(`Passed: ${passed}/${total} ${passed === total ? '✓' : '✗'}`);
    
    results.forEach(r => {
      console.log(`  ${r.success ? '✓' : '✗'} ${r.name}`);
    });
    
    process.exit(passed === total ? 0 : 1);
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run tests
runTests();
