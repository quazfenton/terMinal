---
description: Repository Information Overview
alwaysApply: true
---

# AI Terminal Information

## Summary
AI Terminal is a futuristic AI-powered terminal application built with Electron that integrates with Claude AI to provide intelligent command generation and execution. It features a modern UI with a command queue panel, terminal area, and natural language input processing.

## Structure
- **Main Files**: Core application files including main.js, preload.js, renderer.html
- **Configuration**: Package configuration in ai_terminal_package.json
- **Documentation**: Project documentation in ai_terminal_readme.md

## Language & Runtime
**Language**: JavaScript
**Runtime**: Node.js
**Framework**: Electron v28.0.0
**Build System**: electron-builder v24.9.1
**Package Manager**: npm

## Dependencies
**Main Dependencies**:
- electron (^28.0.0)

**Development Dependencies**:
- electron-builder (^24.9.1)

## Build & Installation
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Create distribution packages
npm run dist

# Create unpacked directory
npm run pack
```

## Main Components

### Main Process (main.js)
- Creates and manages the application window
- Handles IPC communication with the renderer process
- Provides system-level functionality:
  - Command execution
  - Directory management
  - File operations
  - Background image selection
  - Window controls

### Preload Script (preload.js)
- Establishes secure bridge between renderer and main processes
- Exposes API for renderer to access main process functionality
- Implements context isolation for security

### Renderer (renderer.html)
- Implements the user interface with HTML/CSS
- Features a modern dark theme with glassmorphism effects
- Includes components:
  - Command queue panel
  - Terminal area with syntax highlighting
  - Natural language input field
  - Control panel with mode toggles

## Features
- **AI-Powered Command Generation**: Uses Claude AI to analyze natural language requests
- **Auto-Accept Mode**: Automatically executes top-ranked commands
- **Bi-Modal Operation**: Toggles between simple command and complex task modes
- **Real-time Command Queue**: Visual display of ranked command suggestions
- **Bash Integration**: Full bash command execution with directory management
- **Custom Background Images**: Support for custom background images with blur effects

## Platform Support
- **macOS**: DMG packages for x64 and arm64 architectures
- **Windows**: NSIS installer for x64 architecture
- **Linux**: AppImage for x64 architecture