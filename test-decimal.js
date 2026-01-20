const tokens = [ 'TAB', '1X10', '2314.20', '30' ];

console.log("Tokens:", tokens);

// Test the decimal pattern
tokens.forEach((t, i) => {
  const isDecimal = /^\d+\.\d{2}$/.test(t);
  console.log(`Token ${i}: "${t}" -> isDecimal: ${isDecimal}`);
});

const amountIdx = tokens.findIndex(t => /^\d+\.\d{2}$/.test(t));
console.log("\nDecimal amount index:", amountIdx);
console.log("Decimal amount:", tokens[amountIdx]);
