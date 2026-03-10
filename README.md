# Project Pulse

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node Version](https://img.shields.io/badge/node-%3E%3D18.18.0-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)

> **IDE-like project awareness for AI agents and developers**

Project Pulse provides **intelligent codebase context** to AI agents via CLI/TUI and tool interfaces, delivering **maximum signal with minimal token injection**. It generates high-quality "context packs" for AI understanding and provides on-demand code exploration capabilities.

## 🎯 What is Project Pulse?

Project Pulse solves the fundamental problem of **giving AI agents rich codebase awareness without overwhelming their context windows**. It's designed for:

- **AI CLI Tools** (OpenCode, Codex, Gemini, Claude) - Provides codebase context and exploration
- **Developers** - Fast project navigation and code search
- **Teams** - Consistent codebase documentation and onboarding

### Key Features

- 🚀 **Context Packs** - Compressed, high-signal project summaries
- 🔍 **Smart Search** - Code search, symbol extraction, file navigation  
- 🤖 **AI Agent Delegation** - Background execution of specialized AI tasks
- ⚡ **Fast & Lightweight** - Minimal dependencies, fast startup
- 🔧 **Configurable** - Multiple profiles for different use cases

## 📦 Installation

### Prerequisites

- **Node.js** >= 18.18.0
- **npm** or **yarn**
- **Git** (for cloning the repository)

### Install from Source

```bash
# Clone the repository
git clone https://github.com/itstanner5216/Project-Pulse-.git
cd Project-Pulse-/ProjectPulse

# Install dependencies
npm install

# Build the TypeScript source
npm run build

# Run the installation script (optional - sets up symlinks)
./install.sh
```

### Quick Start

```bash
# Generate a project context pack
projectpulse inject

# Search your codebase
projectpulse search "authentication logic"

# View file contents
projectpulse file head src/main.ts --lines 50

# Start the background daemon for AI agent delegation
pulse-agents start
```

## 🏗️ Architecture

Project Pulse consists of three main components:

### 1. **Main CLI** (Bash)
- **Location:** `bin/projectpulse`
- **Purpose:** Fast, lightweight commands for context generation and file operations
- **Commands:**
  - `inject` - Generate and inject session briefing (once per session)
  - `file head/show/grep` - File operations with intelligent capping
  - `config print` - Display current configuration
  - `search/symbols` - Proxy to code exploration tools

### 2. **Delegation System** (TypeScript)
- **Location:** `ProjectPulse/src/`
- **Purpose:** Background execution of long-running AI agent tasks
- **Components:**
  - **Commands** - CLI entry points (`delegate`, `delegation-read`, `delegation-list`)
  - **Daemon** - Background process manager for watching and executing delegations
  - **Delegation Library** - Filesystem-based IPC for agent communication

### 3. **Agent Prompts**
- **Location:** `agentprompts/`
- **Purpose:** Specialized AI agent templates for different analysis tasks
- **Available Agents:**
  - **A.T.L.A.S.** (ExplorationAgent) - Codebase cartography and architecture mapping
  - **CodingAgenticReviewer** - Risk-driven code review
  - **AutonomousPerformance** - Static performance analysis
  - **AutonomousArchitect** - Cost/efficiency review
  - **PlanningAgent** - Task decomposition and planning

## 🚀 Usage

### Context Pack Generation

Generate a compressed summary of your project:

```bash
# In your project directory
cd /path/to/your/project
projectpulse inject

# Output: JSON context pack with file tree, recent changes, and key metrics
```

**What's included in a context pack:**
- Project structure and file tree
- Recent git changes (configurable time window)
- Key files based on edit frequency and importance
- File summaries and metadata
- Tech stack detection

### File Operations

```bash
# View first 50 lines of a file
projectpulse file head src/app.ts --lines 50

# Show specific line range
projectpulse file show src/app.ts --range 10-50

# Search within a file
projectpulse file grep "TODO" src/app.ts --fixed
projectpulse file grep "function.*async" src/app.ts --regex
```

### Code Search & Symbols

```bash
# Search code across the project
projectpulse search "authentication"

# Extract symbols from a file
projectpulse symbols src/app.ts
```

### Configuration

```bash
# View current configuration
projectpulse config print

# Output shows:
# - Project root and ID
# - Session information
# - Ignore patterns
# - Feature flags (Redis, Google Cloud integration)
```

### Background Agent Delegation

Delegate long-running analysis tasks to background AI agents:

```bash
# Start the daemon
pulse-agents start

# Delegate a task to an agent
projectpulse delegate "Review the authentication system for security issues" --agent reviewer

# Check status
pulse-agents status

# List delegations
projectpulse delegation-list

# Read results
projectpulse delegation-read <id>

# Stop the daemon
pulse-agents stop
```

## ⚙️ Configuration

### Environment Variables

- `PROJECTPULSE_ROOT` - Project root directory (default: `.`)
- `PROJECTPULSE_SESSION_ID` - Unique session identifier (auto-generated if not set)
- `PROJECTPULSE_DELEGATIONS_DIR` - Directory for delegation files (default: `~/.projectpulse/delegations/`)

### Configuration Profiles

Located in `ProjectPulse/config/profiles/`:

- **default.json** - Balanced settings (20 files, 65KB, 7-day window)
- **fast.json** - Lightweight profile (8 files, 32KB, 24-hour window)
- **deep.json** - Comprehensive analysis (more files, larger context)

### Customizing Profiles

Edit configuration files to adjust:
- Maximum files in context pack
- Maximum context size (bytes)
- Analysis time window
- Search result limits
- Ignore patterns

## 🧪 Development

### Building

```bash
cd ProjectPulse
npm run build        # Compile TypeScript
npm run dev          # Watch mode
npm run clean        # Remove build artifacts
```

### Testing

```bash
npm test             # Run Vitest test suite
npm run lint         # Run ESLint
```

### Project Structure

```
Project-Pulse-/
├── ProjectPulse/                # TypeScript delegation system
│   ├── src/
│   │   ├── commands/           # CLI command implementations
│   │   ├── daemon/             # Background daemon & watcher
│   │   └── lib/delegation/     # Core delegation library
│   ├── config/                 # Configuration profiles
│   ├── bin/                    # Bash CLI scripts
│   ├── tests/                  # Test suite
│   └── package.json
├── agentprompts/               # AI agent templates
├── conductor/                  # Project guidelines & workflows
├── wrappers/                   # CLI wrapper scripts
└── README.md
```

## 🔒 Security

**Security Best Practices:**
- Always validate and sanitize file paths
- Use atomic operations for concurrent access
- Implement proper resource cleanup
- Validate user input before processing

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with clear commit messages
4. Add or update tests as needed
5. Run linting and tests (`npm run lint && npm test`)
6. Submit a pull request

### Code Review Process

All pull requests undergo:
- Automated testing and linting
- Security review (CodeQL)
- Manual code review
- Documentation review

## 📋 Roadmap

### Current Focus (v0.1.x)
- ✅ Core CLI and delegation system
- ✅ Multi-agent support
- ⏳ Security hardening
- ⏳ Expanded test coverage

### Upcoming Features (v0.2.x)
- [ ] Web UI for delegation management
- [ ] Enhanced cloud integration
- [ ] Real-time collaboration features
- [ ] Plugin system for custom agents

### Future Vision (v1.0+)
- [ ] IDE extensions (VS Code, JetBrains)
- [ ] Team workspace features
- [ ] Advanced analytics and insights
- [ ] Enterprise features

## 📝 Documentation

- **[Conductor Guidelines](./conductor/)** - Project management and development guidelines
- **[Agent Prompts](./agentprompts/)** - AI agent templates and documentation

## 🛠️ Troubleshooting

### Daemon Won't Start
```bash
# Check if already running
pulse-agents status

# If stuck, force cleanup
rm ~/.projectpulse/delegations/daemon.pid
pulse-agents start
```

### Context Pack Empty
```bash
# Check project root is set correctly
echo $PROJECTPULSE_ROOT

# Verify git repository
git status

# Check ignore patterns
projectpulse config print
```

### Build Errors
```bash
# Clean and rebuild
cd ProjectPulse
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run build
```

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with TypeScript, Node.js, and Vitest
- Inspired by IDE features and AI coding assistants
- Thanks to all contributors and users

## 📬 Contact & Support

- **Issues:** [GitHub Issues](https://github.com/itstanner5216/Project-Pulse-/issues)
- **Discussions:** [GitHub Discussions](https://github.com/itstanner5216/Project-Pulse-/discussions)
- **Author:** itstanner5216

---

**Made with ❤️ for developers and AI agents**
