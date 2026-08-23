# Portable agent integration

This directory is portable instruction content: an agent host needs to load `SKILL.md` when a task concerns Infograph graph investigation, and allow the agent to run the `infograph` CLI (or the checkout command) against the target corpus.

- **Codex:** install with `infograph skill install --agent codex`, which copies this directory to Codex's configured skills directory.
- **Other local agents:** copy this directory into the host's documented skills/instructions location, or register its absolute path if the host supports path-based skills.
- **Hosted agents:** upload the directory as the host's versioned skill/instruction bundle and expose the Infograph CLI or an equivalent shell/function tool. The host must provide access to the corpus file.

The skill is instructions, not a tool server. An agent still needs an execution capability for the CLI and filesystem access for the corpus.
