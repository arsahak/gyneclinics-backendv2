import { createServer } from "http";
import app from "./app";
import { env } from "./config/env";
import { connectDB } from "./config/db";
import { dispatchDueAnnouncements } from "./controllers/announcement.controller";
import { runWeeklyPayoutsIfDue } from "./utils/payoutRun";
import { initializeMessagesRealtime } from "./realtime/messagesRealtime";

const start = async () => {
  try {
    const dbHost = await connectDB();
    const server = createServer(app);
    // Live updates (dashboard notifications, chat) over socket.io at /socket.io.
    initializeMessagesRealtime(server);

    server.listen(env.port, () => {
      const baseUrl = `http://localhost:${env.port}`;
      const divider = "-".repeat(50);

      console.log(divider);
      console.log(`  Gyneclinics API`);
      console.log(`  Environment    ${env.nodeEnv}`);
      console.log(`  Database       ${env.dbName} (${dbHost})`);
      console.log(`  Local          ${baseUrl}`);
      console.log(`  API Base       ${baseUrl}/api/v1`);
      console.log(`  API Docs       ${baseUrl}/api-docs`);
      console.log(`  Health Check   ${baseUrl}/api/v1/health`);
      console.log(divider);
    });

    // Scheduled announcements go out on time. (On Vercel there's no long-running
    // process; they're sent when inboxes or the staff list are next read.)
    setInterval(() => {
      dispatchDueAnnouncements().catch((err: Error) => console.error(`Announcements: ${err.message}`));
    }, 20_000);

    // Weekly payouts (Fridays 9:00 UK time, when the schedule is weekly). Checked every 10 minutes.
    setInterval(() => {
      runWeeklyPayoutsIfDue().catch((err: Error) => console.error(`Weekly payouts: ${err.message}`));
    }, 10 * 60_000);

    process.on("unhandledRejection", (err: Error) => {
      console.error(`Unhandled Rejection: ${err.message}`);
      server.close(() => process.exit(1));
    });
  } catch (err) {
    console.error(`Failed to start server: ${(err as Error).message}`);
    process.exit(1);
  }
};

start();
