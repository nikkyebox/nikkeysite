import fs from 'fs';

// Read the KimiClawAssistant source to verify features are present
const source = fs.readFileSync('src/components/KimiClawAssistant.tsx', 'utf8');

const checks = {
  'searchProducts function': source.includes('const searchProducts'),
  'calculateShipping function': source.includes('const calculateShipping'),
  'shipping state machine': source.includes("type ShippingStep = 'idle'"),
  'search command': source.includes("'buscar'") && source.includes("query.includes('buscar')"),
  'shipping command': source.includes("'calcular'") && source.includes("query.includes('calcular')"),
  'product rendering': source.includes('msg.products &&'),
  'shipping rendering': source.includes('msg.shippingResults &&'),
  'selectedCountry import': source.includes('selectedCountry'),
  'ShoppingCart icon': source.includes('ShoppingCart')
};

console.log('\n📋 Feature Verification:\n');
let allPassed = true;
for (const [feature, present] of Object.entries(checks)) {
  const status = present ? '✅' : '❌';
  console.log(`${status} ${feature}`);
  if (!present) allPassed = false;
}

console.log('\n' + (allPassed ? '✨ All features verified!' : '⚠️ Some features missing'));
