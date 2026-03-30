# NihongoGPT MCP Server

A Model Context Protocol (MCP) server that enables AI agents (like Claude) to interact with the NihongoGPT Japanese flashcard learning platform.

## Features

- **Flashcard Management**: Create, read, update, and delete flashcards
- **Deck Organization**: Manage decks to organize your flashcards
- **Source Management**: Upload and manage learning sources (text content)
- **LLM Analysis**: Analyze Japanese text for translation, grammar, and vocabulary
- **TTS Generation**: Generate text-to-speech audio for pronunciation practice

## Installation

### From Source

```bash
cd mcp-server
npm install
npm run build
```

### Global Installation (after build)

```bash
npm install -g .
```

## Configuration

The MCP server requires two environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `NIHONGOGPT_API_URL` | Base URL of your NihongoGPT instance | `https://nihongogpt.com` |
| `NIHONGOGPT_API_KEY` | Your API key (starts with `nkg_`) | `nkg_abc123...` |

### Getting an API Key

1. Log in to your NihongoGPT account
2. Go to Settings > API Keys
3. Click "Create New API Key"
4. Copy the key (it's only shown once!)

## Usage with Claude Desktop

Add the following to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nihongogpt": {
      "command": "node",
      "args": ["/path/to/nihongogpt/mcp-server/dist/index.js"],
      "env": {
        "NIHONGOGPT_API_URL": "https://your-nihongogpt-instance.com",
        "NIHONGOGPT_API_KEY": "nkg_your_api_key_here"
      }
    }
  }
}
```

Or if installed globally:

```json
{
  "mcpServers": {
    "nihongogpt": {
      "command": "nihongogpt-mcp",
      "env": {
        "NIHONGOGPT_API_URL": "https://your-nihongogpt-instance.com",
        "NIHONGOGPT_API_KEY": "nkg_your_api_key_here"
      }
    }
  }
}
```

## Available Tools

### Card Tools

| Tool | Description |
|------|-------------|
| `create_card` | Create a flashcard from Japanese text with AI analysis and TTS |
| `list_cards` | List flashcards with filtering and pagination |
| `get_card` | Get details of a specific card |
| `update_card` | Update card content |
| `delete_card` | Delete a card |

### Deck Tools

| Tool | Description |
|------|-------------|
| `create_deck` | Create a new deck |
| `list_decks` | List all decks |
| `get_deck` | Get deck details with optional cards |
| `update_deck` | Update deck properties |
| `delete_deck` | Delete a deck |

### Source Tools

| Tool | Description |
|------|-------------|
| `upload_source` | Upload text as a learning source |
| `list_sources` | List all sources |
| `get_source` | Get source details |
| `update_source` | Update source name/folder |
| `delete_source` | Delete a source |

### LLM Tools

| Tool | Description |
|------|-------------|
| `analyze_text` | Analyze Japanese text (translation, grammar, vocabulary) |

### TTS Tools

| Tool | Description |
|------|-------------|
| `generate_tts` | Generate TTS audio (returns base64) |
| `generate_tts_enhanced` | Generate TTS with word timestamps |

## Example Prompts for Claude

Once configured, you can ask Claude things like:

- "Create a flashcard for the sentence: 今日は天気がいいですね"
- "List all my Japanese decks"
- "Analyze the grammar in: 彼女に本をあげました"
- "Create a deck called 'JLPT N3 Vocabulary'"
- "Generate pronunciation audio for: おはようございます"

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run watch

# Run directly (development)
npm run dev
```

## Troubleshooting

### "Cannot find module" errors
Make sure you've run `npm install` in the mcp-server directory.

### "API key invalid" errors
1. Verify your API key starts with `nkg_`
2. Check if the key has expired
3. Generate a new key if needed

### Connection issues
1. Verify the `NIHONGOGPT_API_URL` is correct
2. Check that the URL is accessible
3. Ensure there's no trailing slash in the URL

## License

MIT
