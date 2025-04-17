#!/usr/bin/env node

const si = require("systeminformation"); // System information library
const fs = require("fs").promises; // File system access (Promise-based)
const path = require("path"); // For handling file paths
const process = require("process"); // For arguments and exit handling

// --- Configuration ---
const DEFAULT_LOG_FILE = "system_performance_node.log";
const DEFAULT_INTERVAL_SECONDS = 5; // Log data every 5 seconds

// --- Argument Parsing (Basic) ---
// For more robust parsing, consider libraries like 'yargs' or 'commander'
let logFilePath = path.join(__dirname, DEFAULT_LOG_FILE);
let intervalSeconds = DEFAULT_INTERVAL_SECONDS;
let verbose = false;

// Very simple argument parsing
const args = process.argv.slice(2); // Skip 'node' and script path
for (let i = 0; i < args.length; i++) {
  if ((args[i] === "-i" || args[i] === "--interval") && args[i + 1]) {
    const interval = parseInt(args[i + 1], 10);
    if (!isNaN(interval) && interval > 0) {
      intervalSeconds = interval;
    }
    i++; // Skip next arg
  } else if ((args[i] === "-f" || args[i] === "--logfile") && args[i + 1]) {
    logFilePath = path.resolve(args[i + 1]); // Use absolute path or resolve relative
    i++; // Skip next arg
  } else if (args[i] === "-v" || args[i] === "--verbose") {
    verbose = true;
  }
}

// --- Logging Function ---
async function logMessage(message, isInitial = false) {
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  const logLine = `${timestamp} - INFO - ${message}\n`;
  try {
    // Append to the log file
    await fs.appendFile(logFilePath, logLine, "utf8");
    // Optionally print to console
    if (verbose || isInitial) {
      console.log(logLine.trim());
    }
  } catch (err) {
    // Log errors to console if file writing fails
    console.error(
      `${timestamp} - ERROR - Failed to write to log file ${logFilePath}:`,
      err
    );
    // Depending on severity, you might want to exit: process.exit(1);
  }
}

// --- Monitoring Function ---
async function getSystemUsage() {
  try {
    // Get CPU load and memory usage concurrently
    const [cpuData, memData] = await Promise.all([
      si.currentLoad(), // Gets overall CPU load percentage
      si.mem(), // Gets memory details (bytes)
    ]);

    const cpuPercent = cpuData.currentLoad; // Average load since boot
    const memoryUsed = memData.active; // Often 'active' is a better measure than 'used'
    const memoryTotal = memData.total;
    const memoryPercent = (memoryUsed / memoryTotal) * 100;
    const memoryUsedGb = memoryUsed / 1024 ** 3; // Convert bytes to GB
    const memoryTotalGb = memoryTotal / 1024 ** 3; // Convert bytes to GB

    return {
      cpu_percent: cpuPercent,
      memory_percent: memoryPercent,
      memory_used_gb: memoryUsedGb,
      memory_total_gb: memoryTotalGb,
    };
  } catch (e) {
    // Log errors if data fetching fails
    const timestamp = new Date()
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);
    console.error(`${timestamp} - ERROR - Failed to fetch system data:`, e);
    await logMessage(`ERROR - Failed to fetch system data: ${e.message || e}`);
    return null; // Return null to indicate failure
  }
}

// --- Main Execution ---
let intervalId = null; // To store the interval timer

async function main() {
  await logMessage(
    `Starting system monitor. Logging to '${logFilePath}' every ${intervalSeconds} seconds.`,
    true
  );
  if (verbose) {
    console.log("Press Ctrl+C to stop.");
  }

  // Run monitoring function immediately once, then set interval
  const initialUsage = await getSystemUsage();
  if (initialUsage) {
    const message =
      `CPU: ${initialUsage.cpu_percent.toFixed(2)}% | ` +
      `Memory: ${initialUsage.memory_percent.toFixed(2)}% ` +
      `(${initialUsage.memory_used_gb.toFixed(
        2
      )} GB / ${initialUsage.memory_total_gb.toFixed(2)} GB used)`;
    await logMessage(message);
  }

  intervalId = setInterval(async () => {
    const usage = await getSystemUsage();
    if (usage) {
      // Only log if data was fetched successfully
      const message =
        `CPU: ${usage.cpu_percent.toFixed(2)}% | ` +
        `Memory: ${usage.memory_percent.toFixed(2)}% ` +
        `(${usage.memory_used_gb.toFixed(
          2
        )} GB / ${usage.memory_total_gb.toFixed(2)} GB used)`;
      await logMessage(message);
    }
  }, intervalSeconds * 1000); // setInterval uses milliseconds
}

// --- Graceful Shutdown ---
async function shutdown() {
  console.log("\nReceived shutdown signal. Stopping monitor...");
  if (intervalId) {
    clearInterval(intervalId); // Stop the interval timer
  }
  await logMessage("Monitoring stopped.");
  await logMessage("System monitor script finished.");
  console.log("Monitor stopped. Log file saved.");
  process.exit(0);
}

// Handle Ctrl+C (SIGINT) and other termination signals
process.on("SIGINT", shutdown); // Interrupt from keyboard
process.on("SIGTERM", shutdown); // Termination signal

// Start the main monitoring function
main().catch(async (err) => {
  console.error("Monitoring failed to start:", err);
  await logMessage(`FATAL - Monitoring failed to start: ${err.message || err}`);
  process.exit(1);
});
