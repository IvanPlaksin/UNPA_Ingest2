const path = require('path');
// Disable SSL verification for on-premise ADO
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// Load env vars from api/.env
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const http = require('http');
const fs = require('fs');

const { connectToAdo } = require('./src/services/ado.service');
const chatRoutes = require('./src/routes/chat.route');
const knowledgeRoutes = require('./src/routes/knowledge.route');
const healthRoutes = require('./src/routes/health.route');
const rabbitholeRoutes = require('./src/routes/rabbithole.route');
const tfvcRoutes = require('./src/routes/tfvc.route');

const app = express();
console.log("DEBUG: App created, type:", typeof app);
fs.appendFileSync('debug.log', `App created at ${new Date().toISOString()}\n`);

const port = process.env.PORT || 3000;

app.use((req, res, next) => {
    const msg = `[API] ${req.method} ${req.url}\n`;
    process.stdout.write(msg);
    fs.appendFileSync('debug.log', msg);
    next();
});

app.get('/test', (req, res) => {
    console.log("DEBUG: /test handler hit");
    res.send('TEST OK');
});

app.use(cors());
app.use(express.json());

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use('/api/v1/health', healthRoutes);
app.get('/api/v1/health-test', (req, res) => res.json({ status: 'inline-ok' }));
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/knowledge', knowledgeRoutes);
app.use('/api/v1/rabbithole', rabbitholeRoutes);
app.use('/api/v1/tfvc', tfvcRoutes);

app.get('/health', (req, res) => res.json({ status: 'OK' }));

async function startServer() {
    try {
        console.log("🚀 Starting UN ProjectAdvisor API...");
        await connectToAdo();
        console.log("✅ Connected to Azure DevOps.");

        if (app._router) {
            console.log("DEBUG: Router Stack Length:", app._router.stack.length);
            app._router.stack.forEach((r, i) => {
                if (r.route && r.route.path) {
                    console.log(`DEBUG: Route [${i}]: ${r.route.path}`);
                } else if (r.name) {
                    console.log(`DEBUG: Middleware [${i}]: ${r.name}`);
                }
            });
        } else {
            console.log("DEBUG: app._router is undefined");
        }

        const server = http.createServer(app);
        server.listen(port, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://0.0.0.0:${port}`);
        });
    } catch (error) {
        console.error("❌ Critical Error during startup:", error);
        process.exit(1);
    }
}

startServer();
