# Change Log

## 0.1.5

- Add the `aiChatGraph.codexExecutable` setting with home, environment-variable, workspace, relative-path, and command-name expansion.
- Resolve Codex from the user setting, Extension Host `PATH`, or the `openai.chatgpt` extension's bundled executable, in that order.
- Validate executable candidates and report each failed resolution stage with Remote SSH configuration guidance.
- Restart the Codex app-server on the next refresh after the executable setting changes.

## 0.1.4

- Add GitHub repository, homepage, and issue links to the extension package.
- Release the extension source under the MIT License with `xuanzhengyang` authorship.
- Add an AI Chat Graph interface preview to the README and extension package.

## 0.1.3

- Add a draggable, keyboard-accessible divider between Prompt Graph and Turn Detail.
- Remember the selected pane width and restore it when the Webview reopens.
- Move each Prompt timestamp below its text to reduce horizontal space usage.

## 0.1.2

- Rename the user-facing extension from AgentGraph to AI Chat Graph.
- Add the AI Chat Graph extension icon.
- Display Turn Detail messages from oldest to newest.
- Put the User Prompt before all Assistant messages.
- Keep Conversation and Prompt lists ordered from newest to oldest.

## 0.1.1

- Reconstruct fork lineage across independent Codex session IDs.
- Include required archived ancestors without showing unrelated archived threads.
- Display real conversation and prompt timestamps.
- Order conversations and prompts from newest to oldest.
