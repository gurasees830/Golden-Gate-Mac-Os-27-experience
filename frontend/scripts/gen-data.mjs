// Build-time data extraction: major world cities (GeoNames via all-the-cities, CC-BY)
// and Natural Earth country shapes (world-atlas, public domain).
import { createRequire } from 'node:module';
import { writeFileSync, copyFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const cities = require('all-the-cities');
const out = cities
  .filter((c) => c.population >= 150000 || ['SF'].includes(c.name))
  .sort((a, b) => b.population - a.population)
  .map((c) => [c.name, c.country, +c.loc.coordinates[1].toFixed(4), +c.loc.coordinates[0].toFixed(4), c.population]);
writeFileSync('public/data/cities.json', JSON.stringify(out));
copyFileSync('node_modules/world-atlas/countries-50m.json', 'public/data/countries-50m.json');
console.log('cities:', out.length);
