# AI Terminal User Guide

## Getting Started

### Installation

1. **Prerequisites**
   - Node.js 18+
   - Docker (optional)
   - SSH client for remote execution

2. **Quick Start**
   ```bash
   git clone <repository>
   cd ai-terminal
   npm install
   cp .env.example .env
   # Edit .env with your API keys
   npm start
   ```

3. **Docker Deployment**
   ```bash
   docker build -t ai-terminal .
   docker run -p 3000:3000 -v $(pwd)/.env:/app/.env ai-terminal
   ```

### First Login

1. Open http://localhost:3000
2. Login with default credentials:
   - Username: `admin`
   - Password: `admin123` (change immediately!)

## Core Features

### Direct Command Execution

Execute shell commands directly without AI processing:

```bash
ls -la
pwd
git status
npm install
```

**Benefits:**
- Instant execution (no AI delay)
- Full shell command support
- Command history and completion

### AI-Powered Commands

Use natural language for complex tasks:

```
create a new React component called UserProfile
help me debug this Python script
set up a Docker container for this Node.js app
find all files larger than 100MB
```

**AI Features:**
- Context-aware suggestions
- Multi-step command sequences
- Error explanation and fixes
- Best practice recommendations

### Workflow Automation

Create reusable workflows for common tasks:

1. **Create Workflow**
   ```json
   {
     "name": "deploy-frontend",
     "steps": [
       { "type": "command", "command": "npm run build" },
       { "type": "command", "command": "aws s3 sync dist/ s3://my-bucket" },
       { "type": "command", "command": "aws cloudfront create-invalidation --distribution-id ABCD --paths '/*'" }
     ]
   }
   ```

2. **Execute Workflow**
   ```
   run workflow deploy-frontend
   ```

### Plugin System

Extend functionality with plugins:

1. **Available Plugins**
   - Git operations
   - Docker management
   - File system utilities
   - System monitoring
   - Media downloader

2. **Using Plugins**
   ```
   git status
   docker ps
   download video https://youtube.com/watch?v=example
   monitor system
   ```

### Remote Execution

Execute commands on remote servers:

1. **Add Server**
   ```
   add server production --host prod.example.com --user deploy --key ~/.ssh/id_rsa
   ```

2. **Execute Commands**
   ```
   remote production "systemctl status nginx"
   remote production "tail -f /var/log/app.log"
   ```

### MCP Integration

Connect external tools via Model Context Protocol:

1. **Connect MCP Server**
   ```
   mcp connect filesystem --command "mcp-server-filesystem"
   ```

2. **Use MCP Tools**
   ```
   mcp tool filesystem:read_file --path "/config.json"
   mcp tool database:query --sql "SELECT * FROM users"
   ```

## Advanced Usage

### Command Recognition

The system automatically detects command types:

- **Direct Commands**: `ls`, `pwd`, `git status` → Execute immediately
- **AI Queries**: `"how do I..."`, `"create a..."` → Process with AI
- **Plugin Commands**: `git status`, `docker ps` → Route to plugins

### Caching

AI responses are cached for better performance:

- Cache duration: 1 hour
- Cache size: 500 entries
- Automatic cache invalidation

### Security Features

- **Command Validation**: All commands are security-checked
- **Sandboxing**: Plugins run in isolated environments  
- **Audit Logging**: All operations are logged
- **Access Control**: Role-based permissions

### Performance Optimization

- **Direct Execution**: Common commands bypass AI (99% faster)
- **Response Caching**: Repeated queries use cached responses
- **Connection Pooling**: Efficient remote server connections
- **Memory Management**: Automatic cleanup and optimization

## Configuration

### Environment Variables

```bash
# AI Service Configuration
CLAUDE_API_KEY=your_claude_key
OPENAI_API_KEY=your_openai_key
GEMINI_API_KEY=your_gemini_key

# Security Settings
ENCRYPTION_KEY=your_32_char_key
ADMIN_PASSWORD=secure_password
SANDBOX_MODE=true

# Performance Settings
API_RATE_LIMIT=60
CACHE_SIZE=500
MEMORY_THRESHOLD=200000000
```

### Production Configuration

Edit `config/production.json`:

```json
{
  "security": {
    "allowSudo": false,
    "restrictedPaths": ["/etc", "/sys", "/proc"]
  },
  "performance": {
    "maxHistoryLength": 100,
    "memoryThreshold": 200000000
  }
}
```

## Troubleshooting

### Common Issues

1. **AI Not Responding**
   - Check API keys in `.env`
   - Verify internet connection
   - Check rate limits

2. **Commands Not Executing**
   - Verify command syntax
   - Check security restrictions
   - Review audit logs

3. **Performance Issues**
   - Clear cache: `clear cache`
   - Restart application
   - Check memory usage

### Logs and Monitoring

- **Application Logs**: `logs/app.log`
- **Security Logs**: `logs/security/audit.log`
- **Health Status**: `GET /api/health`
- **Metrics**: `GET /api/metrics`

### Support

- Check logs for error details
- Review security audit for blocked commands
- Monitor system health and performance
- Consult API documentation for integration

## Best Practices

### Security
- Change default admin password
- Use strong API keys
- Enable audit logging
- Restrict sudo access
- Regular security updates

### Performance
- Use direct commands when possible
- Cache frequently used AI responses
- Monitor memory usage
- Clean up old logs regularly

### Workflows
- Break complex tasks into steps
- Add error handling
- Use descriptive names
- Test workflows before production

### Remote Execution
- Use SSH keys instead of passwords
- Limit connection timeouts
- Monitor remote server health
- Implement proper access controls
