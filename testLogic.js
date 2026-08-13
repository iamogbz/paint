const regionExpectedColors = {
  "1": "#FF0000", // Red
  "2": "#00FF00", // Green
  "3": "#0000FF", // Blue
};

const paintedRegionsState = {
  "1": "#FF0000", // Correctly painted Red
  "2": "#FF0000", // Incorrectly painted Red (should be Green)
  "3": "#0000FF", // Correctly painted Blue
};

const expectedColorStatus = new Map();

for (const [regionIdStr, expectedHex] of Object.entries(regionExpectedColors)) {
  if (!expectedColorStatus.has(expectedHex)) {
    expectedColorStatus.set(expectedHex, { total: 0, painted: 0 });
  }
  const status = expectedColorStatus.get(expectedHex);
  status.total += 1;
  
  const regionId = parseInt(regionIdStr, 10);
  if (paintedRegionsState[regionId] === expectedHex) {
    status.painted += 1;
  }
}

console.log("Red expected (total 1):", expectedColorStatus.get("#FF0000"));
console.log("Green expected (total 1):", expectedColorStatus.get("#00FF00"));
console.log("Blue expected (total 1):", expectedColorStatus.get("#0000FF"));
