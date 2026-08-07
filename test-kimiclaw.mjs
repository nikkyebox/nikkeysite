import http from 'http';

const testHTML = (html) => {
  const hasKimiClaw = html.includes('KimiClaw');
  const hasSearchBtn = html.includes('search') && html.includes('Buscar');
  const hasShippingBtn = html.includes('Frete') || html.includes('Shipping');
  
  console.log('✓ KimiClaw component loaded:', hasKimiClaw);
  console.log('✓ Search/Shipping features present:', hasSearchBtn || hasShippingBtn);
  
  if (hasKimiClaw) {
    console.log('\n✅ KimiClaw is rendering!');
  }
};

http.get('http://localhost:8080/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => testHTML(data));
}).on('error', (e) => {
  console.error('⚠️ Connection error:', e.message);
});
