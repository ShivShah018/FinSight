const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Candidate paths for virtual environments in order of priority:
const SERVER_VENV_WIN = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
const SERVER_VENV_UNIX = path.join(__dirname, '..', '.venv', 'bin', 'python');
const ROOT_VENV_WIN = path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe');
const ROOT_VENV_UNIX = path.join(__dirname, '..', '..', '.venv', 'bin', 'python');
const BACKEND_VENV_WIN = path.join(__dirname, '..', '..', 'backend', '.venv', 'Scripts', 'python.exe');
const BACKEND_VENV_UNIX = path.join(__dirname, '..', '..', 'backend', '.venv', 'bin', 'python');
const DOCKER_VENV = '/opt/venv/bin/python';
const ML_SCRIPT_PATH = path.join(__dirname, '..', 'ml', 'ml_service.py');

function resolvePythonPath() {
  if (process.env.ML_PYTHON_PATH) {
    return process.env.ML_PYTHON_PATH;
  }
  if (process.env.PYTHON_PATH) {
    return process.env.PYTHON_PATH;
  }
  if (fs.existsSync(SERVER_VENV_WIN)) {
    return SERVER_VENV_WIN;
  }
  if (fs.existsSync(SERVER_VENV_UNIX)) {
    return SERVER_VENV_UNIX;
  }
  if (fs.existsSync(ROOT_VENV_WIN)) {
    return ROOT_VENV_WIN;
  }
  if (fs.existsSync(ROOT_VENV_UNIX)) {
    return ROOT_VENV_UNIX;
  }
  if (fs.existsSync(BACKEND_VENV_WIN)) {
    return BACKEND_VENV_WIN;
  }
  if (fs.existsSync(BACKEND_VENV_UNIX)) {
    return BACKEND_VENV_UNIX;
  }
  if (fs.existsSync(DOCKER_VENV)) {
    return DOCKER_VENV;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

function runMl(mode, transactions, options = {}) {
  return new Promise((resolve, reject) => {
    if (!mode || typeof mode !== 'string') {
      return reject(new Error('Invalid mode: mode must be a non-empty string'));
    }
    if (!Array.isArray(transactions)) {
      return reject(new Error('Invalid transactions: must be an array'));
    }

    const timeoutMs = options.timeoutMs || parseInt(process.env.ML_TIMEOUT_MS, 10) || 20000;
    const pythonPath = resolvePythonPath();

    let py;
    try {
      py = spawn(pythonPath, [ML_SCRIPT_PATH]);
    } catch (spawnErr) {
      return reject(new Error(`Failed to spawn Python process at ${pythonPath}: ${spawnErr.message}`));
    }

    let stdoutData = '';
    let stderrData = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try { py.kill('SIGKILL'); } catch (_) {}
        reject(new Error(`ML subprocess timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    py.on('error', (err) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Python process spawn error: ${err.message}`));
      }
    });

    py.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    py.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    py.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        console.error(`Python process exited with code ${code}. Stderr: ${stderrData}`);
        return reject(new Error(stderrData || `Python script exited with code ${code}`));
      }

      try {
        const parsed = JSON.parse(stdoutData.trim());
        if (parsed.error) {
          return reject(new Error(parsed.error));
        }
        resolve(parsed);
      } catch (err) {
        console.error('Failed to parse Python stdout JSON:', stdoutData);
        reject(err);
      }
    });

    // Write input data as JSON to stdin and end the stream
    try {
      const inputPayload = JSON.stringify({ mode, transactions });
      py.stdin.write(inputPayload);
      py.stdin.end();
    } catch (writeErr) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to write to Python stdin: ${writeErr.message}`));
      }
    }
  });
}

module.exports = {
  runMl,
  resolvePythonPath
};
