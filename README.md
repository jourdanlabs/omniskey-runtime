# OMNIS KEY Runtime

OMNIS KEY Runtime is a verified agent runtime with CLI and Telegram surfaces. It uses a silent BIFROST/CLARION verification pass so normal users see only the final natural answer, not gate artifacts.

## License

This project is source-available under the PolyForm Noncommercial License 1.0.0. Individual, educational, research, hobby, and other noncommercial uses are free. Commercial use, resale, paid hosting, managed-service access, or selling renamed forks requires a separate commercial license from Jourdan Labs.

The names OMNIS KEY Runtime, OMNIS, OMNIS KEY, OMNISCLAW, Hermes + BIFROST, BIFROST, CLARION, and Jourdan Labs are reserved brand identifiers. See `TRADEMARKS.md`.

## Install

```sh
npm install
npm run build
omniskey-runtime init .
```

Or use the local macOS launcher:

```sh
open installers/omniskey-runtime-install.command
```

## Configure

Copy `installers/omniskey-runtime.env.example` into the runtime directory created by `omniskey-runtime init .`, then fill one provider key.

```sh
OMNISKEY_RUNTIME_PROVIDER=openai
OMNISKEY_RUNTIME_MODEL=gpt-5.4-mini
OMNIS_OPENAI_API_KEY=

OMNISKEY_RUNTIME_TELEGRAM_BOT_TOKEN=
OMNISKEY_RUNTIME_TELEGRAM_ALLOWED_CHAT_IDS=
```

## CLI

```sh
omniskey-runtime status .
omniskey-runtime ask "what can you verify?"
omniskey-runtime log . --markdown
```

## Telegram

```sh
omniskey-runtime telegram-config .
omniskey-runtime telegram-dispatch <chat-id> "what can you verify?" --send
omniskey-runtime telegram-poll . --json
```

## Verification

```sh
npm run lint
npm run build
```
