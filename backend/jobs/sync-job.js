const cron       = require('node-cron');
const { syncAll } = require('../services/calendar-sync');

async function runSync(label) {
  console.log(`[sync] ${label}...`);
  try {
    const results = await syncAll();
    console.log(`[sync] done:`, JSON.stringify(results));
  } catch (err) {
    console.error(`[sync] error:`, err.message);
  }
}

function startSyncJob() {
  // Sync on startup (after a short delay to let DB settle)
  setTimeout(() => runSync('startup sync'), 3000);

  // Then every 5 minutes
  cron.schedule('*/5 * * * *', () => runSync('scheduled sync'));
}

module.exports = { startSyncJob };
