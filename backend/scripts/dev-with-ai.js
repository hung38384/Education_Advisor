const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn, spawnSync } = require('child_process');

function parseModeArg(argv) {
    const modeIndex = argv.indexOf('--mode');
    if (modeIndex >= 0 && argv[modeIndex + 1]) {
        return String(argv[modeIndex + 1]).trim().toLowerCase();
    }
    return '';
}

function resolveRunMode() {
    const argMode = parseModeArg(process.argv.slice(2));
    const envMode = String(process.env.AI_DEV_MODE || '').trim().toLowerCase();
    const mode = argMode || envMode || 'full';
    if (mode === 'full' || mode === 'lite' || mode === 'auto') {
        return mode;
    }

    return 'full';
}

const RUN_MODE = resolveRunMode();

const expressDir = path.resolve(__dirname, '..');
try {
    require('dotenv').config({ path: path.join(expressDir, '.env') });
} catch {
    // Ignore dotenv load failure; runtime env vars still work.
}
const aiBackendDir = path.resolve(expressDir, '..', 'EducationAdvisor', 'backend');
try {
    require('dotenv').config({ path: path.join(aiBackendDir, '.env') });
} catch {
    // Ignore dotenv load failure; runtime env vars still work.
}
const aiRunScriptPath = path.join(aiBackendDir, 'scripts', 'run_server.py');
const aiLiteRequirementsPath = path.join(aiBackendDir, 'requirements.dev-lite.txt');
const nodemonBinPath = path.join(expressDir, 'node_modules', 'nodemon', 'bin', 'nodemon.js');

const AI_BASE_URL = process.env.AI_SERVICE_BASE_URL || 'http://127.0.0.1:8000';
const AI_HEALTH_PATH = process.env.AI_SERVICE_HEALTH_PATH || '/health';
const AI_HEALTH_URLS = [
    `${AI_BASE_URL.replace(/\/+$/, '')}${AI_HEALTH_PATH.startsWith('/') ? '' : '/'}${AI_HEALTH_PATH}`,
    `${AI_BASE_URL.replace(/\/+$/, '')}/api/health`,
].filter((value, index, arr) => arr.indexOf(value) === index);
const AI_ENDPOINT_PATH = process.env.AI_SERVICE_QA_ENDPOINT_PATH || '/api/ai/qa/ask';
const AI_TIMEOUT_MS = process.env.AI_SERVICE_TIMEOUT_MS || '20000';

let shuttingDown = false;
let aiProcess = null;
let apiProcess = null;
let pythonCommand = 'python';
let pythonPrefixArgs = [];

function log(message) {
    process.stdout.write(`[dev-with-ai] ${message}\n`);
}

function logError(message) {
    process.stderr.write(`[dev-with-ai] ${message}\n`);
}

function fileExists(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
}

function ensurePathExists(targetPath, label) {
    if (!fileExists(targetPath)) {
        throw new Error(`${label} not found at: ${targetPath}`);
    }
}

function commandAvailable(command, args = ['--version']) {
    const result = spawnSync(command, args, {
        stdio: 'ignore',
        shell: false,
    });
    return result.status === 0;
}

function buildPythonFromVirtualEnv(venvPath) {
    if (!venvPath) {
        return null;
    }

    const windowsPython = path.join(venvPath, 'Scripts', 'python.exe');
    if (fileExists(windowsPython)) {
        return windowsPython;
    }

    const unixPython = path.join(venvPath, 'bin', 'python');
    if (fileExists(unixPython)) {
        return unixPython;
    }

    return null;
}

function resolvePythonRuntime() {
    const explicitPython = (process.env.AI_PYTHON_EXECUTABLE || '').trim();
    if (explicitPython && fileExists(explicitPython)) {
        pythonCommand = explicitPython;
        pythonPrefixArgs = [];
        log(`Using explicit AI python: ${pythonCommand}`);
        return;
    }

    const activeVenv = (process.env.VIRTUAL_ENV || '').trim();
    const activeVenvPython = buildPythonFromVirtualEnv(activeVenv);
    if (activeVenvPython && commandAvailable(activeVenvPython, ['--version'])) {
        pythonCommand = activeVenvPython;
        pythonPrefixArgs = [];
        log(`Using active virtualenv python: ${pythonCommand}`);
        return;
    }

    const repoVenvCandidates = [
        path.join(aiBackendDir, '.venv'),
        path.join(aiBackendDir, 'venv'),
        path.join(aiBackendDir, '.env'),
    ];

    for (const venvPath of repoVenvCandidates) {
        const venvPython = buildPythonFromVirtualEnv(venvPath);
        if (venvPython && commandAvailable(venvPython, ['--version'])) {
            pythonCommand = venvPython;
            pythonPrefixArgs = [];
            log(`Using EducationAdvisor venv python: ${pythonCommand}`);
            return;
        }
    }

    if (commandAvailable('py', ['-3.11', '--version'])) {
        pythonCommand = 'py';
        pythonPrefixArgs = ['-3.11'];
        log('Using py launcher with Python 3.11.');
        return;
    }

    pythonCommand = 'python';
    pythonPrefixArgs = [];
    log('Using system python from PATH.');
}

function runPythonSync(args, options = {}) {
    return spawnSync(
        pythonCommand,
        [...pythonPrefixArgs, ...args],
        {
            shell: false,
            ...options,
        }
    );
}

function spawnPython(args, options = {}) {
    return spawn(
        pythonCommand,
        [...pythonPrefixArgs, ...args],
        {
            shell: false,
            ...options,
        }
    );
}

function installRequirements(requirementsFile) {
    log(`Installing Python dependencies from ${requirementsFile} ...`);
    const result = runPythonSync(
        ['-m', 'pip', 'install', '-r', requirementsFile],
        {
            cwd: aiBackendDir,
            stdio: 'inherit',
        }
    );

    return result.status === 0;
}

function ensurePythonReady(mode) {
    resolvePythonRuntime();

    if (!commandAvailable(pythonCommand, [...pythonPrefixArgs, '--version'])) {
        throw new Error(
            'Python is not available in PATH. Install Python 3.10+ and retry.'
        );
    }

    const versionResult = runPythonSync(['--version'], {
        cwd: aiBackendDir,
        stdio: 'pipe',
    });
    const versionText = String(versionResult.stdout || versionResult.stderr || '').trim();
    if (versionText) {
        log(`Selected python version: ${versionText}`);
    }

    const checkCoreDeps = runPythonSync(
        ['-c', 'import fastapi, uvicorn, langgraph, langchain_google_genai, pymongo, dotenv'],
        {
            cwd: aiBackendDir,
            stdio: 'ignore',
        }
    );

    const checkFullDeps = runPythonSync(
        ['-c', 'import chromadb, chroma_hnswlib, langchain_chroma'],
        {
            cwd: aiBackendDir,
            stdio: 'ignore',
        }
    );

    const coreDepsReady = checkCoreDeps.status === 0;
    const fullDepsReady = checkFullDeps.status === 0;

    if (mode === 'lite') {
        if (!coreDepsReady) {
            const liteInstallOk = installRequirements('requirements.dev-lite.txt');
            if (!liteInstallOk) {
                throw new Error('Failed to install lite AI dependencies.');
            }
        }

        return { liteMode: true };
    }

    if (coreDepsReady && fullDepsReady) {
        log('Full Python dependencies already available.');
        return { liteMode: false };
    }

    const fullInstallOk = installRequirements('requirements.txt');
    if (fullInstallOk) {
        return { liteMode: false };
    }

    if (mode === 'auto' && fileExists(aiLiteRequirementsPath)) {
        log('Full install failed. Trying lite AI dependencies (without chromadb/chroma-hnswlib) ...');
        const liteInstallOk = installRequirements('requirements.dev-lite.txt');
        if (liteInstallOk) {
            log('Lite dependencies installed. AI will run with local markdown fallback for admission rules.');
            return { liteMode: true };
        }
    }

    throw new Error(
        'FULL AI mode failed because chroma-hnswlib/chromadb dependencies could not be installed. '
        + 'Install Microsoft C++ Build Tools (Desktop development with C++), or use Python 3.11, '
        + 'then rerun "npm run dev". If you only need temporary fallback mode, run "npm run dev:lite".'
    );
}

function checkSingleAIHealth(url) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 300;
            res.resume();
            resolve(Boolean(ok));
        });

        req.setTimeout(5000, () => {
            req.destroy();
            resolve(false);
        });

        req.on('error', () => resolve(false));
    });
}

async function checkAIHealth() {
    for (const url of AI_HEALTH_URLS) {
        const ok = await checkSingleAIHealth(url);
        if (ok) {
            return { ok: true, url };
        }
    }

    return { ok: false, url: null };
}

async function waitForAIReady(timeoutMs = 60000) {
    const startedAt = Date.now();
    log(`Waiting for AI service to become healthy at ${AI_HEALTH_URLS.join(' or ')} ...`);

    while (Date.now() - startedAt < timeoutMs) {
        if (shuttingDown) {
            return false;
        }

        const healthResult = await checkAIHealth();
        if (healthResult.ok) {
            log(`AI service is healthy (${healthResult.url}).`);
            return true;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return false;
}

function attachChildLifecycle(name, child, onUnexpectedExit) {
    child.on('exit', (code, signal) => {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        log(`${name} exited (${reason}).`);

        if (!shuttingDown) {
            onUnexpectedExit(code || 1);
        }
    });
}

function startAIProcess(liteMode) {
    const requestedDisableChroma = (process.env.AI_DISABLE_CHROMA || '').trim().toLowerCase();
    const shouldDisableChroma = liteMode || ['1', 'true', 'yes', 'on'].includes(requestedDisableChroma);

    const aiEnv = {
        ...process.env,
        INTERNAL_API_KEY: process.env.INTERNAL_API_KEY || process.env.AI_SERVICE_API_KEY || '',
        AI_DISABLE_CHROMA: shouldDisableChroma ? '1' : (process.env.AI_DISABLE_CHROMA || ''),
        AI_REQUIRE_CHROMA: shouldDisableChroma ? '0' : '1',
    };

    aiProcess = spawnPython(['scripts/run_server.py'], {
        cwd: aiBackendDir,
        stdio: 'inherit',
        env: aiEnv,
    });

    attachChildLifecycle('AI service', aiProcess, () => {
        aiProcess = null;
        logError(
            'AI service exited unexpectedly. Express API stays up, but Q&A may fallback until AI is restarted.'
        );
    });
}

function startApiProcess() {
    const apiEnv = {
        ...process.env,
        AI_SERVICE_BASE_URL: AI_BASE_URL,
        AI_SERVICE_QA_ENDPOINT_PATH: AI_ENDPOINT_PATH,
        AI_SERVICE_TIMEOUT_MS: AI_TIMEOUT_MS,
    };

    apiProcess = spawn(process.execPath, [nodemonBinPath, 'src/server.ts'], {
        cwd: expressDir,
        stdio: 'inherit',
        env: apiEnv,
        shell: false,
    });

    attachChildLifecycle('Express API', apiProcess, shutdown);
}

function killChild(child) {
    if (!child || child.killed) {
        return;
    }

    try {
        if (process.platform === 'win32' && child.pid) {
            spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
                stdio: 'ignore',
                shell: false,
            });
            return;
        }

        child.kill('SIGTERM');
    } catch {
        // Ignore kill errors during shutdown.
    }
}

function shutdown(exitCode = 0) {
    if (shuttingDown) {
        return;
    }

    shuttingDown = true;
    log('Shutting down dev processes ...');
    killChild(apiProcess);
    killChild(aiProcess);

    setTimeout(() => {
        process.exit(exitCode);
    }, 400);
}

async function main() {
    ensurePathExists(aiBackendDir, 'AI backend directory');
    ensurePathExists(aiRunScriptPath, 'AI run script');
    ensurePathExists(aiLiteRequirementsPath, 'AI lite requirements');
    ensurePathExists(nodemonBinPath, 'nodemon binary');

    log(`Run mode: ${RUN_MODE}`);

    const pythonSetup = ensurePythonReady(RUN_MODE);
    startAIProcess(Boolean(pythonSetup && pythonSetup.liteMode));

    const aiReady = await waitForAIReady(60000);
    if (!aiReady) {
        throw new Error(
            `AI service did not become healthy within 60s (${AI_HEALTH_URLS.join(' or ')}).`
        );
    }

    startApiProcess();
    log('Development stack is ready: AI + Express.');
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (error) => {
    logError(`Unhandled error: ${error instanceof Error ? error.stack || error.message : String(error)}`);
    shutdown(1);
});
process.on('unhandledRejection', (reason) => {
    logError(`Unhandled rejection: ${String(reason)}`);
    shutdown(1);
});

main().catch((error) => {
    logError(error instanceof Error ? error.message : String(error));
    shutdown(1);
});
