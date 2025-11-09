# AI Terminal API Documentation

## Overview

The AI Terminal provides a comprehensive API for command execution, AI integration, workflow automation, and system management.

## Authentication

All API endpoints require session-based authentication.

### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "uuid-session-id",
  "username": "admin",
  "roles": ["admin"]
}
```

## Core Endpoints

### Command Execution

#### Execute Direct Command
```http
POST /api/commands/execute
Authorization: Bearer session-id
Content-Type: application/json

{
  "command": "ls -la",
  "options": {
    "timeout": 30000
  }
}
```

#### Execute AI Query
```http
POST /api/ai/query
Authorization: Bearer session-id
Content-Type: application/json

{
  "query": "create a new React component",
  "context": {
    "currentDirectory": "/project"
  }
}
```

### Workflow Management

#### Create Workflow
```http
POST /api/workflows
Authorization: Bearer session-id
Content-Type: application/json

{
  "name": "deploy-app",
  "definition": {
    "steps": [
      {
        "type": "command",
        "command": "npm run build"
      },
      {
        "type": "command",
        "command": "docker build -t app ."
      }
    ]
  }
}
```

#### Execute Workflow
```http
POST /api/workflows/{name}/execute
Authorization: Bearer session-id
```

### Plugin Management

#### List Plugins
```http
GET /api/plugins
Authorization: Bearer session-id
```

#### Execute Plugin Command
```http
POST /api/plugins/{plugin}/commands/{command}
Authorization: Bearer session-id
Content-Type: application/json

{
  "args": {
    "param1": "value1"
  }
}
```

### Remote Execution

#### Create Connection
```http
POST /api/remote/connections
Authorization: Bearer session-id
Content-Type: application/json

{
  "name": "production-server",
  "host": "prod.example.com",
  "username": "deploy",
  "keyPath": "/path/to/key"
}
```

#### Execute Remote Command
```http
POST /api/remote/connections/{id}/execute
Authorization: Bearer session-id
Content-Type: application/json

{
  "command": "systemctl status nginx",
  "options": {
    "timeout": 30000
  }
}
```

### System Monitoring

#### Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": 1699123456789,
  "checks": {
    "memory": {
      "healthy": true,
      "value": 150000000,
      "threshold": 500000000
    }
  }
}
```

#### System Metrics
```http
GET /api/metrics
Authorization: Bearer session-id
```

### MCP Integration

#### List Available Tools
```http
GET /api/mcp/tools
Authorization: Bearer session-id
```

#### Execute MCP Tool
```http
POST /api/mcp/tools/{tool}/execute
Authorization: Bearer session-id
Content-Type: application/json

{
  "args": {
    "path": "/file.txt"
  }
}
```

## WebSocket Events

### Real-time Command Output
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');

ws.send(JSON.stringify({
  type: 'execute_command',
  sessionId: 'your-session-id',
  command: 'tail -f /var/log/app.log'
}));

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(data.output);
};
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

## Rate Limiting

- API calls: 100 requests per minute per session
- AI queries: 60 requests per hour per session
- Command execution: 1000 commands per hour per session

## Security

- All commands are validated and sanitized
- Dangerous commands are blocked
- Audit logging for all operations
- Session timeout: 1 hour
- HTTPS required in production
