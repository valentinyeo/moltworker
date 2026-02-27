#!/usr/bin/env node
/**
 * Hypertask MCP Client - speaks MCP protocol over streamable HTTP
 *
 * Usage:
 *   node hypertask-mcp.js <tool_name> [json_args]
 *   node hypertask-mcp.js list-tools
 *
 * Env vars:
 *   HYPERTASK_MCP_URL     - MCP endpoint (default: https://mcp.hypertask.ai/mcp)
 *   HYPERTASK_BEARER_TOKEN - Bearer token for authentication
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

const MCP_URL = process.env.HYPERTASK_MCP_URL || 'https://mcp.hypertask.ai/mcp';
const BEARER_TOKEN = process.env.HYPERTASK_BEARER_TOKEN;

if (!BEARER_TOKEN) {
  console.error('Error: HYPERTASK_BEARER_TOKEN environment variable is required');
  process.exit(1);
}

let requestId = 1;
let sessionId = null;

function mcpRequest(method, params = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(MCP_URL);
    const transport = parsed.protocol === 'https:' ? https : http;

    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: requestId++,
      method,
      params
    });

    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
      'Authorization': `Bearer ${BEARER_TOKEN}`,
      'Content-Length': Buffer.byteLength(body)
    };
    if (sessionId) {
      headers['Mcp-Session-Id'] = sessionId;
    }

    const req = transport.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers
    }, (res) => {
      // Capture session ID from response
      const sid = res.headers['mcp-session-id'];
      if (sid) sessionId = sid;

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // Parse SSE response - extract the data field
        if (data.includes('event: message')) {
          const dataLine = data.split('\n').find(l => l.startsWith('data: '));
          if (dataLine) {
            try {
              const parsed = JSON.parse(dataLine.slice(6));
              resolve(parsed);
              return;
            } catch (e) { /* fall through */ }
          }
        }
        // Try direct JSON parse
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data.slice(0, 500)}`));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error('Request timeout'));
    });
    req.write(body);
    req.end();
  });
}

async function initialize() {
  const result = await mcpRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'moltbot-hypertask', version: '1.0.0' }
  });
  if (result.error) {
    throw new Error(`MCP initialize failed: ${JSON.stringify(result.error)}`);
  }
  // Send initialized notification
  await mcpRequest('notifications/initialized', {});
  return result;
}

async function callTool(toolName, args = {}) {
  await initialize();
  const result = await mcpRequest('tools/call', {
    name: toolName,
    arguments: args
  });
  return result;
}

async function listTools() {
  await initialize();
  const result = await mcpRequest('tools/list', {});
  return result;
}

async function main() {
  const command = process.argv[2];

  if (!command) {
    console.error('Usage: node hypertask-mcp.js <tool_name> [json_args]');
    console.error('       node hypertask-mcp.js list-tools');
    process.exit(1);
  }

  try {
    if (command === 'list-tools') {
      const result = await listTools();
      if (result.result?.tools) {
        for (const tool of result.result.tools) {
          console.log(`- ${tool.name}: ${tool.description.slice(0, 100)}...`);
        }
      } else {
        console.log(JSON.stringify(result, null, 2));
      }
    } else {
      const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};
      const result = await callTool(command, args);

      if (result.error) {
        console.error(`Error: ${JSON.stringify(result.error)}`);
        process.exit(1);
      }

      // Extract content from MCP tool result
      if (result.result?.content) {
        for (const item of result.result.content) {
          if (item.type === 'text') {
            console.log(item.text);
          } else {
            console.log(JSON.stringify(item, null, 2));
          }
        }
      } else {
        console.log(JSON.stringify(result.result || result, null, 2));
      }
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
