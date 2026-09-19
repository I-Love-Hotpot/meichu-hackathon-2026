import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const maxOutputBytes = 256 * 1024;

export class MedicineRecognitionError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function recognizerConfig(env) {
  const bundledScript = fileURLToPath(
    new URL("../../pill_inference_package/inference.py", import.meta.url),
  );
  const script = env.MEDICINE_RECOGNIZER_SCRIPT?.trim() || bundledScript;
  const python = env.MEDICINE_RECOGNIZER_PYTHON?.trim() || "python3";
  const timeoutMs = Number(env.MEDICINE_RECOGNIZER_TIMEOUT_MS || 30000);

  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) {
    throw new MedicineRecognitionError(
      503,
      "The medicine image recognition timeout setting is invalid. Please contact the administrator.",
    );
  }
  return { script, python, timeoutMs };
}

function parseRecognizerResult(output) {
  let payload;
  try {
    payload = JSON.parse(output);
  } catch {
    throw new MedicineRecognitionError(502, "The medicine recognizer returned invalid JSON.");
  }

  if (!Array.isArray(payload?.predictions) || payload.predictions.length > 3) {
    throw new MedicineRecognitionError(502, "The medicine recognizer returned invalid predictions.");
  }
  const ids = payload.predictions.map((prediction) => prediction?.license_number || prediction?.pill_id);
  if (ids.some((id) => typeof id !== "string" || !id.trim() || id.trim().length > 255)) {
    throw new MedicineRecognitionError(502, "The medicine recognizer returned an invalid medicine ID.");
  }

  return {
    ids: ids.map((id) => id.trim()),
    status: payload.status,
    detected_features: payload.detected_features || {},
    detection_source: payload.detection_source,
    predictions: payload.predictions,
  };
}

/**
 * Runs the bundled inference CLI and parses its JSON stdout.
 */
export async function recognizeMedicineImage(imagePath, { env = process.env } = {}) {
  const { script, python, timeoutMs } = recognizerConfig(env);
  const outputPath = join(dirname(imagePath), "prediction.json");

  return new Promise((resolve, reject) => {
    const child = spawn(
      python,
      [script, "--image", imagePath, "--output", outputPath],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(new MedicineRecognitionError(504, "Medicine image recognition timed out. Please try again."));
    }, timeoutMs);

    function finish(error, result) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(result);
    }

    child.on("error", () => {
      finish(new MedicineRecognitionError(503, "Medicine image recognition is unavailable. Please contact the administrator."));
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (Buffer.byteLength(stdout) > maxOutputBytes) {
        child.kill("SIGTERM");
        finish(new MedicineRecognitionError(502, "The medicine recognizer returned too much data."));
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (Buffer.byteLength(stderr) > maxOutputBytes) stderr = stderr.slice(0, maxOutputBytes);
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        const statusCode = code === 2 ? 400 : code === 3 || code === 4 ? 503 : 502;
        const message = code === 2
          ? "The uploaded file could not be read as an image."
          : code === 3 || code === 4
            ? "Medicine image recognition is unavailable. Please contact the administrator."
            : "Medicine image recognition failed. Please try again.";
        const error = new MedicineRecognitionError(statusCode, message);
        if (stderr.trim()) error.cause = new Error(stderr.trim());
        finish(error);
        return;
      }
      try {
        finish(null, parseRecognizerResult(stdout));
      } catch (error) {
        finish(error);
      }
    });
  });
}
