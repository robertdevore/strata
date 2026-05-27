# Strata AI Providers

Strata supports multiple AI providers through a clean abstraction layer. The system is provider-agnostic by design.

## Supported Providers

### OpenAI (Responses API)
- **Preset ID**: `openai`
- **API mode**: OpenAI Responses API (`/v1/responses`)
- **Default model**: `gpt-4o`
- **Role**: Premium
- **API key**: Set in Settings → `OpenAI API Key`

This is the original Strata AI backend. It uses the OpenAI Responses API with function calling, tool choice auto, and `store: false`.

### DeepSeek V4 Flash
- **Preset ID**: `deepseek-flash`
- **API mode**: OpenAI-compatible Chat Completions
- **Base URL**: `https://api.deepseek.com`
- **Default model**: `deepseek-v4-flash`
- **Role**: Cheap provider
- **API key**: Set in Settings → `DeepSeek API Key`

DeepSeek V4 Flash is the first cheap provider. It uses the standard Chat Completions API. Recommended for simple note creation, tagging, and search.

### DeepSeek V4 Pro
- **Preset ID**: `deepseek-pro`
- **API mode**: OpenAI-compatible Chat Completions
- **Base URL**: `https://api.deepseek.com`
- **Default model**: `deepseek-v4-pro`
- **Role**: Premium
- **API key**: Same as DeepSeek Flash

### Kimi / Moonshot
- **Preset ID**: `kimi`
- **API mode**: OpenAI-compatible Chat Completions
- **Base URL**: `https://api.moonshot.ai/v1`
- **Default model**: `kimi-k2.6`
- **Role**: Cheap
- **API key**: Set in Settings → `Kimi API Key`

### OpenRouter
- **Preset ID**: `openrouter`
- **API mode**: OpenAI-compatible Chat Completions
- **Base URL**: `https://openrouter.ai/api/v1`
- **Default model**: `openai/gpt-4o` (configurable)
- **Role**: Configurable (cheap or premium)
- **API key**: Set in Settings → `OpenRouter API Key`

OpenRouter provides access to hundreds of models. Configure the model slug in Settings.

### Custom OpenAI-compatible
- **Preset ID**: `custom`
- **API mode**: OpenAI-compatible Chat Completions
- **Base URL**: User-configurable
- **Model**: User-configurable
- **Role**: Configurable
- **API key**: Set in Settings → `Custom Provider API Key`

Use this for any service that exposes an OpenAI-compatible `/chat/completions` endpoint.

### Local llama.cpp (Future)
- **Preset ID**: `local-llama-cpp`
- **Status**: Disabled (future phase)
- **Base URL**: `http://127.0.0.1:8080/v1`
- **Model**: `local-qwen-coder`

Not yet implemented. This preset exists as a placeholder for future local inference support.

## Provider Architecture

```
app/main/ai/
  types.ts                    — Normalized provider interface
  tools.ts                    — Tool definitions & execution
  routing.ts                  — Intent-based routing engine
  aiRunner.ts                 — Orchestrator (route → provider → tool loop)
  providers/
    OpenAiResponsesProvider.ts    — OpenAI /v1/responses
    ChatCompletionsProvider.ts    — Generic /chat/completions
    providerRegistry.ts           — Preset definitions & factory
  evals/
    routing-examples.json         — 50+ routing eval examples
```

## Normalized Interface

All providers implement the same `AiProvider` interface:

```ts
interface AiProvider {
  readonly providerId: string
  readonly kind: AiProviderKind
  sendTurn(input: AiProviderTurnInput): Promise<AiProviderTurnOutput>
}
```

The AI runner never knows which provider it's talking to — it just calls `sendTurn()`.

## API Keys

API keys can be set:
1. In Settings (persisted to SQLite)
2. Via environment variable `STRATA_OPENAI_API_KEY` (OpenAI only, takes precedence)

Keys for other providers must be set in Settings.

## Adding a New Provider

1. Add the preset to `providerRegistry.ts`
2. If it uses the standard Chat Completions API, no code changes needed — just configure the preset
3. If it uses a non-standard API, create a new provider class implementing `AiProvider`

## Settings

All provider settings are in the Settings modal:

- **AI Mode**: Premium only / Cheap only / Auto / Ask each time
- **Cheap Provider**: Dropdown (DeepSeek, Kimi, OpenRouter, Custom)
- **Cheap Model**: Editable text field
- **Premium Provider**: Dropdown (OpenAI, OpenRouter, Custom)
- **Premium Model**: Editable text field
- **API Keys**: Individual fields for OpenAI, DeepSeek, Kimi, OpenRouter, Custom
- **Advanced**: Base URL, show routing decisions, enable route logs, thresholds
