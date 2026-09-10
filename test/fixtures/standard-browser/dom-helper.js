// Node discovers files below test/; this fixture acts as a helper module only.
if (process.argv[1] && process.argv[1].endsWith('dom-helper.js') && !process.argv.includes('--browser-fixture')) {
  process.exit(0);
}



/**
 * Creates a minimal standalone DOM context suitable for running
 * serialized browser expressions inside `node:vm`.
 */
export function createMinimalDomContext({
  origin = 'https://chatgpt.com',
  pathname = '/c/conv-target-1',
  composerText = '',
  sendButtonEnabled = true,
  sendButtonExists = true,
  duplicateSendButton = false,
  duplicateComposer = false
} = {}) {
  let clickCount = 0;
  const sendButtons = [];

  const makeSendButton = (id) => ({
    tagName: 'BUTTON',
    id,
    attributes: {
      'data-testid': 'send-button',
      'aria-label': 'Send prompt'
    },
    disabled: !sendButtonEnabled,
    click() {
      if (!this.disabled) {
        clickCount++;
        this.__clicks = (this.__clicks || 0) + 1;
      }
    },
    getAttribute(k) { return this.attributes[k] ?? null; },
    matches(sel) {
      if (sel === 'button') return true;
      if (sel === '[data-testid="send-button"]') return this.attributes['data-testid'] === 'send-button';
      if (sel === 'button[data-testid="send-button"]') return this.attributes['data-testid'] === 'send-button';
      return false;
    },
    closest() { return null; },
    getBoundingClientRect() { return { width: 32, height: 32 }; }
  });

  if (sendButtonExists) {
    sendButtons.push(makeSendButton('send-btn-1'));
    if (duplicateSendButton) {
      sendButtons.push(makeSendButton('send-btn-2'));
    }
  }

  const composers = [];
  const makeComposer = (id) => ({
    tagName: 'DIV',
    id,
    attributes: {
      'contenteditable': 'true',
      'role': 'textbox',
      'data-testid': 'prompt-textarea'
    },
    textContent: composerText,
    innerText: composerText,
    value: composerText,
    getAttribute(k) { return this.attributes[k] ?? null; },
    matches(sel) {
      if (sel === '#prompt-textarea' && id === 'prompt-textarea') return true;
      if (sel === '[contenteditable="true"]') return true;
      if (sel === '[data-testid="prompt-textarea"]') return true;
      return false;
    },
    closest() { return null; },
    getBoundingClientRect() { return { width: 400, height: 100 }; }
  });

  composers.push(makeComposer('prompt-textarea'));
  if (duplicateComposer) {
    composers.push(makeComposer('prompt-textarea-2'));
  }

  const selection = {textContent:'GPT-5.6 Pro',innerText:'GPT-5.6 Pro',getBoundingClientRect:()=>({width:100,height:20}),getAttribute:()=>null};
  const effort = {...selection,textContent:'Standard',innerText:'Standard'};
  const document = {
    querySelector(selector) {
      if(selector === '[data-fixture-model]') return selection;
      if(selector === '[data-fixture-effort]') return effort;
      if (selector === '#prompt-textarea' || selector === '[contenteditable="true"]' || selector === '[data-testid="prompt-textarea"]') {
        return composers[0] || null;
      }
      if (selector === 'button[data-testid="send-button"]' || selector === '[data-testid="send-button"]' || selector === 'button') {
        return sendButtons[0] || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if(selector === '[data-fixture-model]') return [selection];
      if(selector === '[data-fixture-effort]') return [effort];
      if (selector === '#prompt-textarea' || selector === '[contenteditable="true"]' || selector === '[data-testid="prompt-textarea"]') {
        return composers;
      }
      if (selector.includes('send-button') || selector === 'button') {
        return sendButtons;
      }
      return [];
    }
  };

  const window = {
    document,
    location: {
      href: `${origin}${pathname}`,
      origin,
      pathname
    },
    getComputedStyle(el) {
      return {
        display: 'block',
        visibility: 'visible'
      };
    }
  };

  return {
    window,
    document,
    location: window.location,
    getSendClickCount: () => clickCount,
    sendButtons,
    selection, effort,
    composers
  };
}
