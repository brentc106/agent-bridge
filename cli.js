#!/usr/bin/env node
// cli.js — Agent Bridge CLI entry point

import { program } from "commander";
import chalk from "chalk";
import ora from "ora";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import dotenv from "dotenv";

import { runBridge } from "./src/bridge.js";
import { getPreset, listPresets } from "./src/presets.js";
import { listProviders } from "./src/providers/index.js";

dotenv.config();

// ── Helpers ────────────────────────────────────────────────────────────────

const AGENT_COLORS = {
  A: chalk.hex("#00ff88"),
  B: chalk.hex("#ff6b35"),
};

const PROVIDER_COLORS = {
  anthropic: chalk.hex("#cc785c"),
  openai:    chalk.hex("#74aa9c"),
  minimax:   chalk.hex("#a78bfa"),
  ollama:    chalk.hex("#60a5fa"),
  gemini:    chalk.hex("#f59e0b"),
};

function colorProvider(name) {
  return (PROVIDER_COLORS[name] || chalk.white)(name);
}

function printHeader() {
  console.log();
  console.log(chalk.hex("#00ff88").bold("  ┌─────────────────────────────────┐"));
  console.log(chalk.hex("#00ff88").bold("  │       AGENT BRIDGE v0.1.0       │"));
  console.log(chalk.hex("#00ff88").bold("  │  vendor-agnostic LLM relay CLI  │"));
  console.log(chalk.hex("#00ff88").bold("  └─────────────────────────────────┘"));
  console.log();
}

function printSeparator() {
  console.log(chalk.gray("  ─────────────────────────────────────────"));
}

function loadConfig(configPath) {
  if (!configPath) return {};
  const p = resolve(configPath);
  if (!existsSync(p)) throw new Error(`Config file not found: ${p}`);
  return JSON.parse(readFileSync(p, "utf8"));
}

// ── Commands ───────────────────────────────────────────────────────────────

program
  .name("agent-bridge")
  .description("Let any two AI agents collaborate without copy-pasting")
  .version("0.1.0");

// ── run ───────────────────────────────────────────────────────────────────
program
  .command("run")
  .alias("r")
  .description("Start a relay loop between two agents")
  .requiredOption("-t, --task <text>", "The task or topic for the agents to work on")
  .option("--agent-a <provider>", "Provider for Agent A", "anthropic")
  .option("--agent-b <provider>", "Provider for Agent B", "openai")
  .option("--model-a <model>", "Model override for Agent A")
  .option("--model-b <model>", "Model override for Agent B")
  .option("--preset <name>", "Agent role preset (builder-reviewer, debater, planner-critic, teacher-student, cto-engineer)", "builder-reviewer")
  .option("--turns <n>", "Max number of total messages", "8")
  .option("--stop-tokens <tokens>", "Comma-separated stop tokens", "DONE,FINAL,HUMAN_NEEDED")
  .option("--config <path>", "Path to config.json for credentials / overrides")
  .option("--output <path>", "Save full conversation log to a JSON file")
  .action(async (opts) => {
    printHeader();

    const config = loadConfig(opts.config);
    const preset = getPreset(opts.preset);
    const maxTurns = parseInt(opts.turns, 10);
    const stopTokens = opts.stopTokens.split(",").map((s) => s.trim());

    // Merge preset + config overrides
    const agentA = {
      provider: opts.agentA,
      model: opts.modelA || config.agentA?.model,
      name: config.agentA?.name || preset.agentA.name,
      systemPrompt: config.agentA?.systemPrompt || preset.agentA.systemPrompt,
      config: config.agentA?.providerConfig || {},
    };

    const agentB = {
      provider: opts.agentB,
      model: opts.modelB || config.agentB?.model,
      name: config.agentB?.name || preset.agentB.name,
      systemPrompt: config.agentB?.systemPrompt || preset.agentB.systemPrompt,
      config: config.agentB?.providerConfig || {},
    };

    // Print run summary
    console.log(chalk.gray("  Preset  ") + chalk.white(preset.label));
    console.log(
      chalk.gray("  Agent A ") +
      AGENT_COLORS.A(agentA.name) +
      chalk.gray(" via ") +
      colorProvider(agentA.provider) +
      (agentA.model ? chalk.gray(` (${agentA.model})`) : "")
    );
    console.log(
      chalk.gray("  Agent B ") +
      AGENT_COLORS.B(agentB.name) +
      chalk.gray(" via ") +
      colorProvider(agentB.provider) +
      (agentB.model ? chalk.gray(` (${agentB.model})`) : "")
    );
    console.log(chalk.gray("  Turns   ") + chalk.white(`max ${maxTurns}`));
    console.log(chalk.gray("  Stop    ") + chalk.yellow(stopTokens.join(", ")));
    printSeparator();
    console.log();
    console.log(chalk.bold.white("  Task: ") + chalk.white(opts.task));
    console.log();
    printSeparator();
    console.log();

    const spinner = ora({ text: `${agentA.name} thinking...`, color: "green" }).start();

    const abortController = new AbortController();
    process.on("SIGINT", () => {
      abortController.abort();
      spinner.stop();
      console.log(chalk.yellow("\n\n  Stopped by user."));
    });

    let currentAgent = "A";

    const result = await runBridge({
      agentA,
      agentB,
      task: opts.task,
      maxTurns,
      stopTokens,
      signal: abortController.signal,
      onMessage({ agent, name, provider, text, turn }) {
        spinner.stop();

        const color = AGENT_COLORS[agent];
        const isDone = stopTokens.some((t) => text.toUpperCase().includes(t));
        const cleanText = text
          .split("\n")
          .filter((l) => !stopTokens.includes(l.trim().toUpperCase()))
          .join("\n")
          .trim();

        console.log(
          color(`  [${name}]`) +
          chalk.gray(` via ${colorProvider(provider)}`) +
          chalk.gray(` — turn ${turn}`) +
          (isDone ? chalk.hex("#00ff88")(" ✓ DONE") : "")
        );
        console.log();

        // Indent each line
        cleanText.split("\n").forEach((line) => {
          console.log("    " + chalk.white(line));
        });

        console.log();
        printSeparator();
        console.log();

        currentAgent = agent === "A" ? "B" : "A";
        const nextName = agent === "A" ? agentB.name : agentA.name;
        if (!isDone) {
          spinner.text = `${nextName} thinking...`;
          spinner.color = agent === "A" ? "yellow" : "green";
          spinner.start();
        }
      },
      onDone({ reason, turns }) {
        spinner.stop();
        console.log(chalk.hex("#4ecdc4")(`  ✓ Bridge complete — ${reason}`));
        console.log(chalk.gray(`  Total turns: ${turns}`));
        console.log();
      },
    });

    if (opts.output) {
      const outputPath = resolve(opts.output);
      writeFileSync(
        outputPath,
        JSON.stringify({ task: opts.task, ...result }, null, 2)
      );
      console.log(chalk.gray(`  Log saved to ${outputPath}`));
    }
  });

// ── providers ─────────────────────────────────────────────────────────────
program
  .command("providers")
  .description("List all available providers and required env keys")
  .action(() => {
    printHeader();
    console.log(chalk.bold("  Available Providers\n"));
    for (const p of listProviders()) {
      console.log(colorProvider(p.name) + chalk.gray(` — ${p.label}`));
      console.log(chalk.gray(`    default model : ${p.defaultModel}`));
      if (p.envKeys.length) {
        console.log(chalk.gray(`    env required  : ${p.envKeys.join(", ")}`));
      } else {
        console.log(chalk.gray("    env required  : none (local)"));
      }
      console.log();
    }
  });

// ── presets ───────────────────────────────────────────────────────────────
program
  .command("presets")
  .description("List all built-in agent role presets")
  .action(() => {
    printHeader();
    console.log(chalk.bold("  Built-in Presets\n"));
    for (const p of listPresets()) {
      console.log(chalk.white(`  ${p.key}`) + chalk.gray(` — ${p.label}`));
    }
    console.log();
  });

// ── init ──────────────────────────────────────────────────────────────────
program
  .command("init")
  .description("Create a starter .env and config.example.json in the current directory")
  .action(() => {
    const envContent = `# Agent Bridge — Environment Variables
# Copy this to .env and fill in your keys

ANTHROPIC_API_KEY=
OPENAI_API_KEY=
MINIMAX_API_KEY=
MINIMAX_GROUP_ID=
GEMINI_API_KEY=
OLLAMA_HOST=http://localhost:11434
`;

    const configContent = JSON.stringify(
      {
        agentA: {
          name: "Builder",
          model: null,
          systemPrompt: null,
          providerConfig: {}
        },
        agentB: {
          name: "Reviewer",
          model: null,
          systemPrompt: null,
          providerConfig: {}
        }
      },
      null,
      2
    );

    writeFileSync(".env.example", envContent);
    writeFileSync("config.example.json", configContent);
    console.log(chalk.hex("#00ff88")("✓ Created .env.example and config.example.json"));
    console.log(chalk.gray("  Copy .env.example to .env and fill in your API keys."));
  });

program.parse();
