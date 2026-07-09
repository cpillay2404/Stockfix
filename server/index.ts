import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";
import { startWeeklyEmailScheduler } from "./scheduled-emails";
import { startPilotBackupScheduler } from "./pilot-backup";
import cors from "cors";

const app = express();

// Allow PerfectStorePro and StockFix itself to call this API
app.use(cors({
  origin: [
    'https://perfectstorepro.replit.app',
    'https://stockfixapp.online',
  ],
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Serve uploaded images from public/images
app.use('/images', express.static(path.join(process.cwd(), 'public/images')));
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: '200mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: '200mb' }));

// Increase timeout for large file uploads (5 minutes)
app.use((req, res, next) => {
  req.setTimeout(300000);
  res.setTimeout(300000);
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  if (req.path.includes('qr')) {
    console.log(`[QR-DEBUG] Request received: ${req.method} ${req.url} path=${req.path}`);
  }
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    async () => {
      log(`serving on port ${port}`);
      startWeeklyEmailScheduler();
      startPilotBackupScheduler();

      // ONE-TIME STARTUP SCRIPT: Fix mis-parsed week ending dates (2026-03-12 → 2026-03-11)
      // Excel serial numbers were off by one day during import
      // Remove this block after one successful production deploy
      try {
        const { db } = await import("./db");
        const { tasks } = await import("@shared/schema");
        const { eq, sql } = await import("drizzle-orm");
        
        // Fix weekEndingDate
        const dateResult = await db.update(tasks)
          .set({ weekEndingDate: '2026-03-11' })
          .where(eq(tasks.weekEndingDate, '2026-03-12'));
        console.log('[STARTUP SCRIPT] Fixed weekEndingDate: 2026-03-12 → 2026-03-11');
        
        // Fix uniqueIds that contain the wrong date
        await db.execute(sql`
          UPDATE tasks 
          SET unique_id = REPLACE(unique_id, '2026-03-12', '2026-03-11')
          WHERE unique_id LIKE '%2026-03-12%'
        `);
        console.log('[STARTUP SCRIPT] Fixed uniqueIds: 2026-03-12 → 2026-03-11');
      } catch (err) {
        console.error('[STARTUP SCRIPT] Date fix error:', err);
      }
    },
  );
})();
