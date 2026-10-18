#!/usr/bin/env node
/**
 * FinSight Python ML Dependency Installer
 * Ensures numpy and scikit-learn are installed for ML services during deployment.
 * Supports: Render, Linux/Unix, Windows, Docker, and CI environments.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.resolve(__dirname, '..');
const REQ_PATH = path.join(SERVER_DIR, 'ml', 'requirements.txt');
const VENV_DIR = path.join(SERVER_DIR, '.venv');

const VENV_BIN = process.platform === 'win32'
  ? path.join(VENV_DIR, 'Scripts', 'python.exe')
  : path.join(VENV_DIR, 'bin', 'python');

const VENV_PIP = process.platform === 'win32'
  ? path.join(VENV_DIR, 'Scripts', 'pip.exe')
  : path.join(VENV_DIR, 'bin', 'pip');

function testInterpreter(pythonPath) {
  if (!pythonPath || !fs.existsSync(pythonPath)) return false;
  try {
    const res = spawnSync(pythonPath, ['-c', 'import numpy, sklearn; print("OK")'], {
      encoding: 'utf8',
      timeout: 15000
    });
    return res.status === 0 && res.stdout.includes('OK');
  } catch (_) {
    return false;
  }
}

function findSystemPython() {
  const candidates = process.platform === 'win32'
    ? ['python', 'py', 'python3']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 5000 });
      if (res.status === 0) return cmd;
    } catch (_) {}
  }
  return null;
}

function findRequirementsPath() {
  const candidates = [
    path.join(SERVER_DIR, 'ml', 'requirements.txt'),
    path.join(SERVER_DIR, 'requirements.txt'),
    path.join(SERVER_DIR, '..', 'requirements.txt')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(SERVER_DIR, 'ml', 'requirements.txt');
}

function main() {
  console.log('[FinSight ML Setup] Checking Python ML runtime environment...');

  const reqPath = findRequirementsPath();

  // 1. Check if an environment already has numpy and scikit-learn
  const candidates = [
    process.env.ML_PYTHON_PATH,
    process.env.PYTHON_PATH,
    VENV_BIN,
    path.join(SERVER_DIR, '..', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    path.join(SERVER_DIR, '..', 'backend', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'),
    '/opt/venv/bin/python'
  ].filter(Boolean);

  for (const p of candidates) {
    if (testInterpreter(p)) {
      console.log(`[FinSight ML Setup] ML packages (numpy, scikit-learn) already verified in: ${p}`);
      return;
    }
  }

  // 2. Identify system Python
  const sysPython = findSystemPython();
  if (!sysPython) {
    console.warn('[FinSight ML Setup] Warning: Python 3 was not detected in PATH. Skipping Python package installation.');
    return;
  }

  // Check if system python itself already has the packages
  try {
    const res = spawnSync(sysPython, ['-c', 'import numpy, sklearn; print("OK")'], { encoding: 'utf8', timeout: 10000 });
    if (res.status === 0 && res.stdout.includes('OK')) {
      console.log(`[FinSight ML Setup] ML packages (numpy, scikit-learn) verified in system Python: ${sysPython}`);
      return;
    }
  } catch (_) {}

  console.log(`[FinSight ML Setup] Setting up isolated Python virtual environment at ${VENV_DIR}...`);

  // 3. Create virtual environment
  let venvCreated = false;
  try {
    const venvRes = spawnSync(sysPython, ['-m', 'venv', VENV_DIR], {
      stdio: 'inherit',
      timeout: 60000
    });
    if (venvRes.status === 0 && fs.existsSync(VENV_BIN)) {
      venvCreated = true;
    }
  } catch (err) {
    console.warn('[FinSight ML Setup] venv creation error:', err.message);
  }

  if (venvCreated) {
    // Ensure pip exists in the virtual environment
    if (!fs.existsSync(VENV_PIP)) {
      try {
        spawnSync(VENV_BIN, ['-m', 'ensurepip', '--upgrade'], { stdio: 'inherit', timeout: 30000 });
      } catch (_) {}
    }

    console.log(`[FinSight ML Setup] Installing ML packages from ${reqPath} into .venv...`);
    const pipCmd = fs.existsSync(VENV_PIP) ? VENV_PIP : VENV_BIN;
    const pipArgs = fs.existsSync(VENV_PIP)
      ? ['install', '--no-cache-dir', '-r', reqPath]
      : ['-m', 'pip', 'install', '--no-cache-dir', '-r', reqPath];

    const pipRes = spawnSync(pipCmd, pipArgs, {
      stdio: 'inherit',
      timeout: 300000
    });

    if (pipRes.status === 0 && testInterpreter(VENV_BIN)) {
      console.log('[FinSight ML Setup] Virtual environment successfully configured and verified.');
      return;
    }
  }

  // 4. Fallback: Try installing via system Python's pip
  console.log('[FinSight ML Setup] Attempting direct pip installation into environment...');
  try {
    let installRes = spawnSync(sysPython, ['-m', 'pip', 'install', '--no-cache-dir', '-r', reqPath], {
      stdio: 'inherit',
      timeout: 300000
    });

    if (installRes.status !== 0) {
      installRes = spawnSync(sysPython, ['-m', 'pip', 'install', '--no-cache-dir', '--break-system-packages', '-r', reqPath], {
        stdio: 'inherit',
        timeout: 300000
      });
    }

    const testRes = spawnSync(sysPython, ['-c', 'import numpy, sklearn; print("OK")'], { encoding: 'utf8', timeout: 10000 });
    if (testRes.status === 0 && testRes.stdout.includes('OK')) {
      console.log('[FinSight ML Setup] ML dependencies successfully installed in system Python.');
      return;
    }
  } catch (pipErr) {
    console.error('[FinSight ML Setup] Pip install fallback encountered an error:', pipErr.message);
  }

  console.warn('[FinSight ML Setup] Note: Could not auto-install ML dependencies. Ensure numpy and scikit-learn are installed via requirements.txt in your deployment environment.');
}

main();
