import { applyScheme } from "../services/schemeMatcher.js";

async function testProportionalSchemes() {
  console.log("🚀 Testing Proportional Scheme Logic...");

  const schemes = [
    {
      productCode: "123",
      productName: "TEST ITEM",
      isActive: true,
      slabs: [
        { minQty: 100, freeQty: 20, schemePercent: 20 }
      ]
    }
  ];

  // Case 1: Order 100
  const result100 = applyScheme({
    productCode: "123",
    orderQty: 100,
    itemDesc: "TEST ITEM",
    schemes
  });
  console.log(`\n📦 Order 100:`);
  console.log(`  Expected: 20 free, Format 100+20`);
  console.log(`  Actual:   ${result100.freeQty} free, Format ${100}+${result100.freeQty}`);

  // Case 2: Order 200
  const result200 = applyScheme({
    productCode: "123",
    orderQty: 200,
    itemDesc: "TEST ITEM",
    schemes
  });
  console.log(`\n📦 Order 200:`);
  console.log(`  Expected: 40 free, Format 200+40`);
  console.log(`  Actual:   ${result200.freeQty} free, Format ${200}+${result200.freeQty}`);

  // Case 3: Order 250 (Should still be 40 free, based on 100 slab)
  const result250 = applyScheme({
    productCode: "123",
    orderQty: 250,
    itemDesc: "TEST ITEM",
    schemes
  });
  console.log(`\n📦 Order 250:`);
  console.log(`  Expected: 40 free, Format 250+40`);
  console.log(`  Actual:   ${result250.freeQty} free, Format ${250}+${result250.freeQty}`);

  if (result100.freeQty === 20 && result200.freeQty === 40 && result250.freeQty === 40) {
    console.log("\n✅ SUCCESS: Proportional scaling works correctly!");
  } else {
    console.error("\n❌ FAILED: Logic mismatch.");
  }
}

testProportionalSchemes();
