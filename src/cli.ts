#!/usr/bin/env node

import { main } from './index';

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
