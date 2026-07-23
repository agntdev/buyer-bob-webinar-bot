import { buildBot } from "./bot.js";
import { setDefaultCommands } from "./toolkit/index.js";

async function main() {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    console.error("BOT_TOKEN is required");
    process.exit(1);
  }
  const bot = await buildBot(token);
  // Publish the "/" command list (discoverability). Keep the surface small —
  // features are button-first; a few power shortcuts are fine for admins.
  await setDefaultCommands(bot, [
    { command: "my_registration", description: "View or update your signup" },
    { command: "export_csv", description: "Admin: export registrations CSV" },
    { command: "cancel", description: "Cancel the current step" },
  ]);
  bot.start();
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
