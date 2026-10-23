import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

export async function promptText(message: string): Promise<string> {
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    return await prompt.question(message);
  } finally {
    prompt.close();
  }
}

export function promptHiddenPassword(message: string): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    return Promise.reject(new Error("An interactive terminal is required."));
  }

  emitKeypressEvents(stdin);
  stdin.setRawMode(true);
  stdin.resume();
  stdout.write(message);

  return new Promise((resolve, reject) => {
    let password = "";
    let finished = false;
    const finish = (error?: Error): void => {
      if (finished) return;
      finished = true;
      stdin.off("keypress", onKeypress);
      stdin.setRawMode(false);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(password);
    };
    const onKeypress = (character: string, key: { name?: string; ctrl?: boolean }): void => {
      if (key.ctrl && key.name === "c") {
        finish(new Error("Prompt cancelled."));
        return;
      }
      if (key.name === "return" || key.name === "enter") {
        finish();
        return;
      }
      if (key.name === "backspace") {
        password = Array.from(password).slice(0, -1).join("");
        stdout.write("\b \b");
        return;
      }
      if (character && !key.ctrl && character >= " ") {
        password += character;
        stdout.write("*");
      }
    };
    stdin.on("keypress", onKeypress);
  });
}
