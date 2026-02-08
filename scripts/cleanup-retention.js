#!/usr/bin/env node
const { createContainer } = require("../lib/container");

function main() {
  const container = createContainer({ env: process.env });
  const result = container.retentionService.cleanup();
  console.log(JSON.stringify(result, null, 2));
}

main();
