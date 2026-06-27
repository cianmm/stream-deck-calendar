import { exec } from "node:child_process";
import commonjs from "@rollup/plugin-commonjs";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";

const PLUGIN_UUID = "com.cianmm.calendar";

// In watch mode, restart the plugin in Stream Deck after each rebuild so changes
// are picked up automatically. No-op for one-shot builds.
function reloadOnWatch() {
  return {
    name: "reload-streamdeck",
    writeBundle() {
      if (!process.env.ROLLUP_WATCH) return;
      exec(`streamdeck restart ${PLUGIN_UUID}`, (err) => {
        if (err) console.error(`[reload] restart failed: ${err.message}`);
        else console.log(`[reload] restarted ${PLUGIN_UUID}`);
      });
    },
  };
}

export default {
  input: "src/plugin.ts",
  output: {
    file: "com.cianmm.calendar.sdPlugin/bin/plugin.js",
    format: "es",
    sourcemap: true,
  },
  plugins: [
    typescript(),
    nodeResolve({ browser: false, preferBuiltins: true }),
    commonjs(),
    reloadOnWatch(),
  ],
};
