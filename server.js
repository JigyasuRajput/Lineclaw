/**
 * Local development server for LINE Talent Assistant MVP
 * Run with: node server.js
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

// Load environment variables from .env file
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        let value = trimmed.slice(eqIndex + 1).trim();
        // Remove surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) {
            process.env[key] = value;
        }
    }
}

// Import API handlers
const lineWebhook = require("./api/line/webhook");
const draftSentences = require("./api/manager/draft-sentences");
const profilesSync = require("./api/admin/profiles/sync");
const retentionCleanup = require("./api/admin/retention-cleanup");
const linePush = require("./api/admin/line/push");

// MIME types for static files
const MIME_TYPES = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

// Route mapping
const routes = {
    "POST /api/line/webhook": lineWebhook,
    "POST /api/manager/draft-sentences": draftSentences,
    "POST /api/admin/profiles/sync": profilesSync,
    "POST /api/admin/retention-cleanup": retentionCleanup,
    "POST /api/admin/line/push": linePush,
};

// Create a mock response object compatible with Vercel handlers
function createMockResponse() {
    const res = {
        statusCode: 200,
        headers: {},
        body: null,
        _ended: false,
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(key, value) {
            this.headers[key.toLowerCase()] = value;
            return this;
        },
        getHeader(key) {
            return this.headers[key.toLowerCase()];
        },
        end(body) {
            this.body = body;
            this._ended = true;
            return this;
        },
        json(data) {
            this.setHeader("content-type", "application/json");
            this.body = JSON.stringify(data);
            this._ended = true;
            return this;
        },
    };
    return res;
}

// Serve static files
function serveStatic(filePath, res) {
    const ext = path.extname(filePath);
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not Found");
            return;
        }
        res.writeHead(200, { "Content-Type": mimeType });
        res.end(data);
    });
}

// Main server handler
async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const routeKey = `${req.method} ${url.pathname}`;

    console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}`);

    // Check if it's an API route
    const handler = routes[routeKey];
    if (handler) {
        // Collect body for POST requests
        let body = "";
        for await (const chunk of req) {
            body += chunk;
        }
        req.rawBody = body;
        if (body && req.headers["content-type"]?.includes("application/json")) {
            try {
                req.body = JSON.parse(body);
            } catch (e) {
                req.body = null;
            }
        }

        const mockRes = createMockResponse();
        try {
            await handler(req, mockRes);
        } catch (err) {
            console.error("Handler error:", err);
            mockRes.status(500).json({ error: "internal_error", message: err.message });
        }

        res.writeHead(mockRes.statusCode, mockRes.headers);
        res.end(mockRes.body);
        return;
    }

    // Serve static files
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    filePath = path.join(__dirname, filePath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        serveStatic(filePath, res);
    } else {
        res.writeHead(404);
        res.end("Not Found");
    }
}

const PORT = process.env.PORT || 3000;
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║   LINE Talent Assistant MVP - Local Development Server    ║
╠═══════════════════════════════════════════════════════════╣
║   Server running at: http://localhost:${PORT}               ║
║                                                           ║
║   Available endpoints:                                    ║
║   • POST /api/line/webhook                                ║
║   • POST /api/manager/draft-sentences                     ║
║   • POST /api/admin/profiles/sync                         ║
║   • POST /api/admin/retention-cleanup                     ║
║   • POST /api/admin/line/push                             ║
║                                                           ║
║   Press Ctrl+C to stop                                    ║
╚═══════════════════════════════════════════════════════════╝
`);
});
