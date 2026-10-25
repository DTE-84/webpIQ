// Common recommended sizes. Marketplaces change guidelines; users can adjust any value after picking one.
// fit: 'inside' = shrink to fit within w x h, never upscale
//      'pad'    = exact w x h canvas, image centered, never upscaled
//      'crop'   = exact aspect ratio, centered crop
export const MARKETPLACE_PRESETS = [
  { id: 'etsy', label: 'Etsy listing (4:3)', w: 2000, h: 1500, fit: 'crop', fill: 'white' },
  { id: 'shopify', label: 'Shopify product (square)', w: 2048, h: 2048, fit: 'pad', fill: 'white' },
  { id: 'ebay', label: 'eBay (1600px longest side)', w: 1600, h: 1600, fit: 'inside', fill: 'white' },
  { id: 'poshmark', label: 'Poshmark (square)', w: 1080, h: 1080, fit: 'pad', fill: 'white' },
  { id: 'vinted', label: 'Vinted (3:4 portrait)', w: 1200, h: 1600, fit: 'pad', fill: 'white' },
  { id: 'mercari', label: 'Mercari (square)', w: 1080, h: 1080, fit: 'pad', fill: 'white' },
  { id: 'amazon', label: 'Amazon main image (white)', w: 2000, h: 2000, fit: 'pad', fill: 'white' },
  { id: 'fbmarketplace', label: 'Facebook Marketplace (square)', w: 1200, h: 1200, fit: 'pad', fill: 'white' },
];
