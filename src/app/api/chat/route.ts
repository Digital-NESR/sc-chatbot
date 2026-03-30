import { NextResponse } from 'next/server';
import https from 'https';
import http from 'http';

// Custom HTTPS agent that skips certificate verification.
// Required for internal n8n servers with self-signed certificates.
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

/**
 * Makes an HTTP/HTTPS POST request using Node's native modules,
 * bypassing the Next.js fetch wrapper which can't use a custom SSL agent.
 */
function makeRequest(url: string, body: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';

        const options = {
            hostname: parsed.hostname,
            port: parsed.port || (isHttps ? 443 : 80),
            path: parsed.pathname + parsed.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
            agent: isHttps ? insecureAgent : undefined,
        };

        const req = (isHttps ? https : http).request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { webhookUrl, message, agent, sessionId } = body;

        // Log received URL so we can verify env vars are loaded correctly
        console.log('[/api/chat] webhookUrl received:', webhookUrl);

        if (!webhookUrl || !message) {
            console.error('[/api/chat] Missing fields — webhookUrl:', webhookUrl, '| message:', message);
            return NextResponse.json(
                { error: 'Missing required fields: webhookUrl and message' },
                { status: 400 }
            );
        }

        // Validate the URL is parseable before attempting the request
        try {
            new URL(webhookUrl);
        } catch {
            console.error('[/api/chat] Invalid webhookUrl (could not parse):', webhookUrl);
            return NextResponse.json(
                { error: `Invalid webhook URL: ${webhookUrl}` },
                { status: 400 }
            );
        }

        const requestBody = JSON.stringify({ message, agent, sessionId });
        const responseText = await makeRequest(webhookUrl, requestBody);

        let data;
        try {
            data = JSON.parse(responseText);
        } catch {
            data = { output: responseText };
        }

        return NextResponse.json(data);
    } catch (error) {
        console.error('[/api/chat] Proxy Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', detail: String(error) },
            { status: 500 }
        );
    }
}
