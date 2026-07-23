// Default admin env for dialog specs + programmatic tests.
// Read at call time by config helpers — set before any handler runs.
if (!process.env.ADMIN_IDS) process.env.ADMIN_IDS = "1";
if (!process.env.ADMIN_CHAT_ID) process.env.ADMIN_CHAT_ID = "999";
