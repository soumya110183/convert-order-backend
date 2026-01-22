import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import ProductMaster from '../models/productMaster.js';

dotenv.config();

await mongoose.connect(process.env.MONGO_URI);

console.log('\n🔍 Searching for VILDAPRIDE products...\n');

const products = await ProductMaster.find({
  productName: /VILDAPRIDE/i
}).lean();

let output = `Found ${products.length} VILDAPRIDE products:\n\n`;

products.forEach((p, i) => {
  output += `${i + 1}. ${p.productCode}: "${p.productName}"\n`;
  output += `   Base: "${p.baseName}", Strength: "${p.dosage}", Variant: "${p.variant || 'none'}"\n`;
  output += `   Pack: ${p.pack}, Box Pack: ${p.boxPack}, Division: ${p.division}\n`;
  output += `   cleanedProductName: "${p.cleanedProductName}"\n\n`;
});

console.log(output);
fs.writeFileSync('vildapride-products.txt', output);
console.log('\n✅ Saved to vildapride-products.txt\n');

await mongoose.connection.close();
