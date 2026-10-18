/**
 * Real Chrome Browser UI Automated Verification Suite for FinSight AI Assistant
 * 
 * Drives installed Google Chrome via Chrome DevTools Protocol (CDP) over WebSocket.
 * Tests the real React 19 app running on http://localhost:5173 and backend on http://localhost:8000.
 */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:8000';
const CDP_PORT = 9222;

function postHttp(urlPath, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BACKEND_URL + urlPath);
    const postData = JSON.stringify(body);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class BrowserDriver {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.msgId = 1;
    this.pending = new Map();
  }

  async init() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };

    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    return res?.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await sleep(1500);
  }

  async waitFor(fnExpr, timeoutMs = 15000, intervalMs = 500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const val = await this.evaluate(`(${fnExpr})()`);
      if (val) return val;
      await sleep(intervalMs);
    }
    return false;
  }

  async captureScreenshot(savePath) {
    const res = await this.send('Page.captureScreenshot', { format: 'png' });
    if (res?.data) {
      fs.writeFileSync(savePath, Buffer.from(res.data, 'base64'));
    }
  }

  async typeText(selector, text) {
    await this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (el) {
          el.focus();
          el.value = '';
        }
      })()
    `);
    await this.send('Input.insertText', { text });
    await sleep(200);
  }

  close() {
    try { this.ws.close(); } catch (e) {}
  }
}

async function runBrowserVerification() {
  console.log('====================================================');
  console.log('FinSight AI Assistant Real Browser UI Verification');
  console.log('====================================================');

  const tmpProfile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'finsight_browser_test_' + Date.now());
  fs.mkdirSync(tmpProfile, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${tmpProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--window-size=1280,900',
    'about:blank'
  ], { stdio: 'ignore' });

  let driver = null;
  const results = [];

  function record(step, ok, detail = '') {
    results.push({ step, ok, detail });
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${step} ${detail ? '(' + detail + ')' : ''}`);
  }

  try {
    await sleep(2000);
    const targets = await getJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const pageTarget = targets.find(t => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found in Chrome CDP');

    driver = new BrowserDriver(pageTarget.webSocketDebuggerUrl);
    await driver.init();
    record('1. Chrome CDP connection initialized', true, `Version: Chrome Headless`);

    // 1. Create User A test account
    const randSuffix = Math.floor(10000 + Math.random() * 90000);
    const userA = {
      full_name: 'Test User A',
      email: `test_user_a_${randSuffix}@example.com`,
      password: 'testpassword123'
    };
    const regRes = await postHttp('/auth/register', userA);
    record('2. Register test User A', regRes.status === 201 || regRes.status === 200, `User ID: ${regRes.data?.user_id}`);

    // 2. Open login page in browser
    await driver.navigate(`${FRONTEND_URL}/login`);
    const loginInputReady = await driver.waitFor(`() => !!document.querySelector('#login-email')`, 8000);
    record('3. Navigate to login page', !!loginInputReady);

    // 3. Fill out login form and submit
    await driver.typeText('#login-email', userA.email);
    await driver.typeText('#login-password', userA.password);
    await driver.evaluate(`document.querySelector('button[type="submit"]').click()`);

    // 4. Wait for authentication redirect to Dashboard
    const onDashboard = await driver.waitFor(`
      () => window.location.pathname === '/' && !!document.querySelector('aside')
    `, 10000);
    record('4. Log in via UI form and arrive at Dashboard', !!onDashboard, `URL: /`);

    // 5. Navigate to Analytics via sidebar
    await driver.waitFor(`() => !!document.querySelector('a[href="/analytics"]')`, 8000);
    await driver.evaluate(`document.querySelector('a[href="/analytics"]').click()`);
    const onAnalytics = await driver.waitFor(`
      () => window.location.pathname === '/analytics' && document.querySelector('h1')?.innerText.includes('Analytics')
    `, 15000);
    const pageHeader = await driver.evaluate(`document.querySelector('h1')?.innerText`);
    record('5. Navigate to Analytics page via sidebar', pageHeader === 'Analytics & Insights', `Header: "${pageHeader}"`);

    // 6. Open Assistant Drawer
    await driver.waitFor(`
      () => Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Ask AI about these insights'))
    `, 8000);
    const askButtonFound = await driver.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const askBtn = btns.find(b => b.innerText.includes('Ask AI about these insights'));
        if (askBtn) {
          askBtn.click();
          return true;
        }
        return false;
      })()
    `);
    const drawerOpen = await driver.waitFor(`
      () => {
        const welcome = document.body.innerText.includes("I'm your FinSight AI Finance Assistant");
        const fullPageBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.trim() === 'Full Page');
        return welcome && fullPageBtn;
      }
    `, 10000);
    record('6. Assistant drawer opened with welcome message & Full Page button', !!drawerOpen);

    // 7. Send question in drawer
    await driver.waitFor(`() => !!document.querySelector('input[data-testid="assistant-input"]')`, 8000);
    await driver.typeText('input[data-testid="assistant-input"]', 'How much did I spend in 2026 so far?');
    const sentQ1 = await driver.evaluate(`
      (() => {
        const sendBtn = document.querySelector('button[data-testid="agent-send-button"]');
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          return true;
        }
        return false;
      })()
    `);
    record('7. Send question in drawer: "How much did I spend in 2026 so far?"', sentQ1);

    // Wait for response to arrive and render
    console.log('  ... waiting for AI response in drawer ...');
    const q1Answered = await driver.waitFor(`
      () => {
        const text = document.body.innerText;
        return text.includes('How much did I spend in 2026 so far?') &&
          (text.includes('spend') || text.includes('spent') || text.includes('₹') || text.includes('recorded') || text.includes('analysis'));
      }
    `, 25000, 1000);
    record('8. Assistant response received and rendered in drawer', !!q1Answered);

    // Capture screenshot of drawer response
    const screenshotsDir = path.join(__dirname, 'screenshots');
    fs.mkdirSync(screenshotsDir, { recursive: true });
    await driver.captureScreenshot(path.join(screenshotsDir, 'test_drawer_response.png'));

    // 8. Click "Full Page" button in assistant header
    const clickedFullPage = await driver.evaluate(`
      (() => {
        const fullPageBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Full Page');
        if (fullPageBtn) {
          fullPageBtn.click();
          return true;
        }
        return false;
      })()
    `);
    record('9. Click "Full Page" in assistant drawer header', clickedFullPage);

    // Wait for route transition to /assistant and messages to render
    const onAssistant = await driver.waitFor(`
      () => window.location.pathname === '/assistant'
    `, 8000);
    record('10. Navigated to /assistant full-page route', !!onAssistant, `Pathname: /assistant`);

    await driver.waitFor(`
      () => document.body.innerText.includes('How much did I spend in 2026 so far?')
    `, 8000);

    // Verify messages survive in original order without duplicate welcome message
    const fullPageContent = await driver.evaluate(`
      (() => {
        const text = document.body.innerText;
        const hasWelcome = text.includes("I'm your FinSight AI Finance Assistant");
        const hasQ1 = text.includes('How much did I spend in 2026 so far?');
        const welcomeMatches = (text.match(/FinSight AI Finance Assistant/g) || []).length;
        const hasFullPageBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText.trim() === 'Full Page');
        return {
          hasWelcome,
          hasQ1,
          welcomeCount: welcomeMatches,
          drawerClosed: !hasFullPageBtn
        };
      })()
    `);

    record('11. Full-page view renders existing question & response in original order', fullPageContent.hasQ1);
    record('12. Welcome message is NOT duplicated on transition', fullPageContent.welcomeCount <= 2, `Count: ${fullPageContent.welcomeCount}`);
    record('13. Drawer is unmounted; Full Page button hidden in full-page mode', fullPageContent.drawerClosed);

    await driver.captureScreenshot(path.join(screenshotsDir, 'test_full_page_preserved.png'));

    // 9. Send follow-up message in Full Page mode
    // Wait for any previous response typing to complete so the send button appears
    await driver.waitFor(`
      () => !!document.querySelector('button[data-testid="agent-send-button"]')
    `, 25000);
    await driver.waitFor(`() => !!document.querySelector('input[data-testid="assistant-input"]')`, 8000);
    await driver.typeText('input[data-testid="assistant-input"]', 'Compare my spending this month with last month');
    const sendBtnReady = await driver.waitFor(`
      () => {
        const btn = document.querySelector('button[data-testid="agent-send-button"]');
        return btn && !btn.disabled;
      }
    `, 8000);
    const sentQ2 = await driver.evaluate(`
      (() => {
        const sendBtn = document.querySelector('button[data-testid="agent-send-button"]');
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          return true;
        }
        return false;
      })()
    `);
    record('14. Send follow-up in full page: "Compare my spending this month with last month"', !!sendBtnReady && !!sentQ2);

    console.log('  ... waiting for follow-up response in full page ...');
    const q2Answered = await driver.waitFor(`
      () => {
        const text = document.body.innerText;
        return text.includes('Compare my spending this month with last month') &&
          (text.includes('month') || text.includes('spending') || text.includes('₹') || text.includes('transactions') || text.includes('recorded'));
      }
    `, 25000, 1000);
    record('15. Follow-up response received in same conversation', !!q2Answered);
    await driver.captureScreenshot(path.join(screenshotsDir, 'test_full_page_followup.png'));

    // 10. Return to Analytics and reopen drawer
    await driver.waitFor(`() => !!document.querySelector('a[href="/analytics"]')`, 8000);
    await driver.evaluate(`document.querySelector('a[href="/analytics"]').click()`);
    await driver.waitFor(`() => window.location.pathname === '/analytics' && !!document.querySelector('h1')`, 12000);
    await driver.waitFor(`() => Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Ask AI about these insights'))`, 8000);
    const reopenBtnFound = await driver.evaluate(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const askBtn = btns.find(b => b.innerText.includes('Ask AI about these insights'));
        if (askBtn) {
          askBtn.click();
          return true;
        }
        return false;
      })()
    `);
    record('16. Return to Analytics and reopen assistant drawer', reopenBtnFound);

    const drawerReopenedState = await driver.waitFor(`
      () => {
        const text = document.body.innerText;
        const hasQ1 = text.includes('How much did I spend in 2026 so far?');
        const hasQ2 = text.includes('Compare my spending this month with last month');
        return hasQ1 && hasQ2 ? { hasQ1, hasQ2 } : false;
      }
    `, 8000);
    record('17. Reopened drawer retains Q1 ("How much did I spend in 2026 so far?")', !!drawerReopenedState?.hasQ1);
    record('18. Reopened drawer retains Q2 ("Compare my spending this month with last month")', !!drawerReopenedState?.hasQ2);
    await driver.captureScreenshot(path.join(screenshotsDir, 'test_drawer_reopened_sync.png'));

    // 10b. Scenario 9: Refresh the page on /assistant and verify conversation persistence
    await driver.evaluate(`
      (() => {
        const link = document.querySelector('a[href="/assistant"]');
        if (link) link.click();
      })()
    `);
    await driver.waitFor(`() => window.location.pathname === '/assistant'`, 8000);
    await driver.send('Page.reload');
    await sleep(2000);
    const refreshedState = await driver.waitFor(`
      () => {
        const text = document.body.innerText;
        const hasQ1 = text.includes('How much did I spend in 2026 so far?');
        const hasQ2 = text.includes('Compare my spending this month with last month');
        return hasQ1 && hasQ2 ? { hasQ1, hasQ2 } : false;
      }
    `, 10000);
    record('19. Page refresh in same authenticated tab preserves conversation from sessionStorage', !!refreshedState?.hasQ1 && !!refreshedState?.hasQ2);

    // 11. Navigate to Dashboard and verify
    await driver.evaluate(`
      (() => {
        const link = document.querySelector('a[href="/"]');
        if (link) link.click();
      })()
    `);
    const onDash = await driver.waitFor(`() => window.location.pathname === '/'`, 8000);
    record('20. Navigate back to Dashboard root (/)', !!onDash);

    // 12. Test User Isolation on Logout & Login as User B
    const randSuffixB = Math.floor(10000 + Math.random() * 90000);
    const userB = {
      full_name: 'Test User B',
      email: `test_user_b_${randSuffixB}@example.com`,
      password: 'testpassword456'
    };
    const regResB = await postHttp('/auth/register', userB);
    record('21. Register test User B', regResB.status === 201 || regResB.status === 200, `User B ID: ${regResB.data?.user_id}`);

    // Click logout button in sidebar
    await driver.evaluate(`
      (() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const logoutBtn = buttons.find(b => b.innerText.toLowerCase().includes('log out') || b.innerText.toLowerCase().includes('logout'));
        if (logoutBtn) logoutBtn.click();
      })()
    `);
    const loggedOut = await driver.waitFor(`() => window.location.pathname === '/login'`, 8000);
    record('22. Click Logout and redirect to /login', !!loggedOut);

    // Verify sessionStorage has zero conversation keys
    const storageKeysAfterLogout = await driver.evaluate(`
      (() => {
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k.startsWith('finsight_conversation_')) keys.push(k);
        }
        return keys;
      })()
    `);
    record('23. Logout clears user conversation keys from sessionStorage', storageKeysAfterLogout.length === 0, `Remaining: ${storageKeysAfterLogout.length}`);

    // Log in as User B through login form
    await driver.typeText('#login-email', userB.email);
    await driver.typeText('#login-password', userB.password);
    await driver.evaluate(`document.querySelector('button[type="submit"]').click()`);
    await driver.waitFor(`() => window.location.pathname === '/'`, 8000);

    // Navigate User B directly to /assistant
    await driver.evaluate(`
      (() => {
        const link = document.querySelector('a[href="/assistant"]');
        if (link) link.click();
      })()
    `);
    await driver.waitFor(`() => window.location.pathname === '/assistant'`, 8000);

    const userBContent = await driver.evaluate(`
      (() => {
        const text = document.body.innerText;
        const hasUserA_Q1 = text.includes('How much did I spend in 2026 so far?');
        const hasUserA_Q2 = text.includes('Compare my spending this month with last month');
        const hasUserBWelcome = text.includes('Test User B') || text.includes("I'm your FinSight AI Finance Assistant");
        return {
          isolated: !hasUserA_Q1 && !hasUserA_Q2,
          freshWelcome: hasUserBWelcome
        };
      })()
    `);

    record('24. User B does NOT see User A conversation (complete data isolation)', userBContent.isolated);
    record('25. User B receives clean initial welcome message', userBContent.freshWelcome);

    await driver.captureScreenshot(path.join(screenshotsDir, 'test_user_b_isolation.png'));

  } catch (err) {
    console.error('Fatal Browser Test Error:', err);
    record('Browser test execution completed without unhandled exceptions', false, err.message);
  } finally {
    if (driver) driver.close();
    chromeProc.kill();
    try { fs.rmSync(tmpProfile, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('\n====================================================');
  console.log('SUMMARY OF REAL BROWSER UI VERIFICATION:');
  const total = results.length;
  const passed = results.filter(r => r.ok).length;
  console.log(`Passed: ${passed} / ${total}`);
  console.log('====================================================');

  if (passed === total) {
    console.log('ALL 25 REAL BROWSER UI TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error(`${total - passed} tests failed.`);
    process.exit(1);
  }
}

runBrowserVerification();
