require('dotenv').config();
const dns = require('dns');
const net = require('net');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const ADO_ORG_URL = process.env.ADO_ORG_URL;

console.log('--- ADO Connectivity Diagnostic Tool ---\n');

if (!ADO_ORG_URL) {
    console.error('❌ Error: ADO_ORG_URL is not defined in .env file.');
    process.exit(1);
}

console.log(`Checking connectivity to: ${ADO_ORG_URL}`);

try {
    const parsedUrl = new URL(ADO_ORG_URL);
    const hostname = parsedUrl.hostname;
    const protocol = parsedUrl.protocol;
    const port = parsedUrl.port || (protocol === 'https:' ? 443 : 80);

    console.log(`Target: ${hostname}:${port} (${protocol})`);

    // 1. DNS Lookup
    console.log('\nStep 1: DNS Lookup...');
    dns.lookup(hostname, (err, address, family) => {
        if (err) {
            console.error(`❌ DNS Lookup Failed: ${err.message}`);
            console.log('Suggestion: Check your internet connection or VPN settings.');
            return;
        }
        console.log(`✅ DNS Resolved: ${hostname} -> ${address}`);

        // 2. TCP Connection
        console.log('\nStep 2: TCP Connectivity Check...');
        const socket = new net.Socket();
        socket.setTimeout(5000); // 5 second timeout

        socket.on('connect', () => {
            console.log('✅ TCP Connection Successful!');
            socket.destroy();

            // 3. HTTP Request
            console.log('\nStep 3: HTTP Request Check...');
            const requestModule = protocol === 'https:' ? https : http;

            const req = requestModule.get(ADO_ORG_URL, (res) => {
                console.log(`✅ HTTP Response received. Status Code: ${res.statusCode}`);
                if (res.statusCode === 401) {
                    console.log('⚠️ Status 401 (Unauthorized) is expected if no token is provided here, but confirms the server is reachable.');
                } else if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log('✅ Server is reachable and healthy.');
                } else if (res.statusCode === 404) {
                    console.log('⚠️ Status 404 (Not Found). connecting to the server worked, but the path might be wrong.');
                } else {
                    console.log(`ℹ️ Received status ${res.statusCode}. Server is reachable.`);
                }
            });

            req.on('error', (e) => {
                console.error(`❌ HTTP Request Failed: ${e.message}`);
                if (e.code === 'ETIMEDOUT') {
                    console.log('Suggestion: The server is not responding to HTTP requests. Check firewall rules.');
                }
            });

        });

        socket.on('timeout', () => {
            console.error('❌ TCP Connection Timed Out (ETIMEDOUT)');
            console.log('Suggestion: This usually means the server is not reachable on this port.');
            console.log('   - Are you connected to the VPN?');
            console.log('   - Is the IP address correct?');
            console.log('   - Is a firewall blocking the connection?');
            socket.destroy();
        });

        socket.on('error', (err) => {
            console.error(`❌ TCP Connection Error: ${err.message}`);
            if (err.code === 'ECONNREFUSED') {
                console.log('Suggestion: Connection refused. Server is likely down or not listening on this port.');
            }
            socket.destroy();
        });

        socket.connect(port, address);
    });

} catch (error) {
    console.error(`❌ Invalid URL format: ${error.message}`);
}
