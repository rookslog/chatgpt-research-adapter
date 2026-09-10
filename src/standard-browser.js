import { randomUUID } from 'node:crypto';
import { executeStandardCommand, recordStandardControl } from './standard-runtime.js';
import { canonicalJson } from './canonical-json.js';

export function buildStandardSendExpression({ operation, target } = {}) {
  const expectedOrigin = target?.origin || 'https://chatgpt.com';
  const expectedBaseHref = target?.baseHref || '';
  const expectedDraft = target?.requestedDraft ?? operation?.intent?.prompt ?? '';
  const selection = target?.selection ?? null;
  const expectedUserIds = Array.isArray(target?.userMessageIds) ? target.userMessageIds : [];
  const expectedAssistantIds = Array.isArray(target?.assistantMessageIds) ? target.assistantMessageIds : [];

  return `(() => {
  const expectedOrigin = ${JSON.stringify(expectedOrigin)};
  const expectedBaseHref = ${JSON.stringify(expectedBaseHref)};
  const expectedDraft = ${JSON.stringify(expectedDraft)};
  const selection = ${JSON.stringify(selection)};
  const expectedUserIds = ${JSON.stringify(expectedUserIds)};
  const expectedAssistantIds = ${JSON.stringify(expectedAssistantIds)};

  const loc = typeof location !== 'undefined' ? location : (typeof window !== 'undefined' ? window.location : null);
  const doc = typeof document !== 'undefined' ? document : (typeof window !== 'undefined' ? window.document : null);
  const getStyle = typeof getComputedStyle !== 'undefined' ? getComputedStyle : (typeof window !== 'undefined' ? window.getComputedStyle : null);

  if (!loc || !doc) {
    throw new Error('ERR_GUARD_NO_DOM');
  }

  if (expectedOrigin && loc.origin !== expectedOrigin) {
    throw new Error('ERR_GUARD_ORIGIN_MISMATCH');
  }

  if (expectedBaseHref) {
    const fullHref = loc.href || '';
    const baseWithoutHash = expectedBaseHref.split('#')[0];
    const originPath = (loc.origin || '') + (loc.pathname || '');
    const hrefMatches = fullHref === expectedBaseHref || fullHref === baseWithoutHash || originPath === expectedBaseHref || originPath === baseWithoutHash || (originPath + '/') === expectedBaseHref;
    if (!hrefMatches) {
      throw new Error('ERR_GUARD_HREF_MISMATCH');
    }
  }

  if (!selection || typeof selection !== 'object' || !selection.modelSelector || !selection.effortSelector) {
    throw new Error('ERR_GUARD_MISSING_SELECTION_EVIDENCE');
  }

  const modelEls = doc.querySelectorAll(selection.modelSelector);
  if (modelEls.length !== 1) {
    throw new Error('ERR_GUARD_SELECTION_MODEL_COUNT');
  }
  const modelEl = modelEls[0];
  const mStyle = typeof getStyle === 'function' ? getStyle(modelEl) : null;
  if (mStyle && (mStyle.display === 'none' || mStyle.visibility === 'hidden')) {
    throw new Error('ERR_GUARD_SELECTION_MODEL_HIDDEN');
  }
  const modelText = (modelEl.innerText !== undefined ? modelEl.innerText : (modelEl.textContent || '')).trim();
  if (selection.modelText && modelText !== selection.modelText.trim()) {
    throw new Error('ERR_GUARD_SELECTION_MODEL_TEXT');
  }

  const effortEls = doc.querySelectorAll(selection.effortSelector);
  if (effortEls.length !== 1) {
    throw new Error('ERR_GUARD_SELECTION_EFFORT_COUNT');
  }
  const effortEl = effortEls[0];
  const eStyle = typeof getStyle === 'function' ? getStyle(effortEl) : null;
  if (eStyle && (eStyle.display === 'none' || eStyle.visibility === 'hidden')) {
    throw new Error('ERR_GUARD_SELECTION_EFFORT_HIDDEN');
  }
  const effortText = (effortEl.innerText !== undefined ? effortEl.innerText : (effortEl.textContent || '')).trim();
  if (selection.effortText && effortText !== selection.effortText.trim()) {
    throw new Error('ERR_GUARD_SELECTION_EFFORT_TEXT');
  }

  const turnEls = doc.querySelectorAll('[data-message-author-role]');
  const domUserIds = [];
  const domAssistantIds = [];
  for (let i = 0; i < turnEls.length; i++) {
    const el = turnEls[i];
    const role = el.getAttribute('data-message-author-role') || (el.dataset ? el.dataset.messageAuthorRole : null);
    const id = el.getAttribute('data-message-id') || (el.dataset ? el.dataset.messageId : null);
    if (role === 'assistant') {
      if (id) domAssistantIds.push(id);
    } else {
      if (id) domUserIds.push(id);
    }
  }

  if (domUserIds.length !== expectedUserIds.length) {
    throw new Error('ERR_GUARD_USER_MESSAGES_COUNT');
  }
  for (let i = 0; i < expectedUserIds.length; i++) {
    if (domUserIds[i] !== expectedUserIds[i]) {
      throw new Error('ERR_GUARD_USER_MESSAGES_MISMATCH');
    }
  }
  if (domAssistantIds.length !== expectedAssistantIds.length) {
    throw new Error('ERR_GUARD_ASSISTANT_MESSAGES_COUNT');
  }
  for (let i = 0; i < expectedAssistantIds.length; i++) {
    if (domAssistantIds[i] !== expectedAssistantIds[i]) {
      throw new Error('ERR_GUARD_ASSISTANT_MESSAGES_MISMATCH');
    }
  }

  const composers = doc.querySelectorAll('#prompt-textarea');
  if (composers.length !== 1) {
    throw new Error('ERR_GUARD_COMPOSER_COUNT');
  }
  const composer = composers[0];
  const cStyle = typeof getStyle === 'function' ? getStyle(composer) : null;
  if (cStyle && (cStyle.display === 'none' || cStyle.visibility === 'hidden')) {
    throw new Error('ERR_GUARD_COMPOSER_HIDDEN');
  }
  const composerContent = composer.innerText !== undefined ? composer.innerText : (composer.textContent !== undefined ? composer.textContent : (composer.value || ''));
  if (composerContent !== expectedDraft) {
    throw new Error('ERR_GUARD_DRAFT_MISMATCH');
  }

  const sendButtons = doc.querySelectorAll('button[data-testid="send-button"]');
  if (sendButtons.length !== 1) {
    throw new Error('ERR_GUARD_SEND_BUTTON_COUNT');
  }
  const sendButton = sendButtons[0];
  if (sendButton.disabled === true || sendButton.getAttribute('disabled') !== null) {
    throw new Error('ERR_GUARD_SEND_BUTTON_DISABLED');
  }
  const sStyle = typeof getStyle === 'function' ? getStyle(sendButton) : null;
  if (sStyle && (sStyle.display === 'none' || sStyle.visibility === 'hidden')) {
    throw new Error('ERR_GUARD_SEND_BUTTON_HIDDEN');
  }
  if (sendButton.getBoundingClientRect) {
    const rect = sendButton.getBoundingClientRect();
    if (rect && rect.width === 0 && rect.height === 0) {
      throw new Error('ERR_GUARD_SEND_BUTTON_ZERO_SIZE');
    }
  }

  sendButton.click();
  return true;
})()`;
}

export function classifyStandardCapture({ operation, capture } = {}) {
  if (!capture || typeof capture !== 'object') {
    return { status: 'invalid', reason: 'capture_missing' };
  }
  if (capture.complete !== true) {
    return { status: 'running', reason: 'capture_not_complete' };
  }
  if (capture.stable !== true) {
    return { status: 'running', reason: 'capture_not_stable' };
  }
  if (capture.completionEvidence !== 'qualified-turn-complete') {
    return { status: 'attention', reason: 'unqualified_completion_evidence' };
  }
  if (operation?.binding) {
    if (capture.conversationId !== operation.binding.conversationId) {
      return { status: 'attention', reason: 'conversation_mismatch' };
    }
    if (capture.userMessageId !== operation.binding.userMessageId) {
      return { status: 'attention', reason: 'user_message_mismatch' };
    }
  }
  if (!capture.assistantMessageId || typeof capture.assistantMessageId !== 'string' || capture.assistantMessageId.trim().length === 0) {
    return { status: 'attention', reason: 'missing_assistant_message_id' };
  }
  if (Array.isArray(capture.laterUserMessageIds) && capture.laterUserMessageIds.length > 0) {
    return { status: 'attention', reason: 'later_user_messages_detected' };
  }
  if (typeof capture.text !== 'string' || capture.text.length === 0) {
    return { status: 'attention', reason: 'empty_text' };
  }
  if (Buffer.byteLength(capture.text, 'utf8') > 1024 * 1024) {
    return { status: 'attention', reason: 'text_too_large' };
  }
  if (!Array.isArray(capture.citations)) {
    return { status: 'attention', reason: 'citations_invalid' };
  }
  return { status: 'completed' };
}

export function createStandardBrowserDriver({ runtime, transport, clock } = {}) {
  async function runOwnedCommand(operation, expectedRevision, command) {
    if (!runtime) {
      const error = new Error('runtime command journal is unavailable');
      error.code = 'ERR_RUNTIME_CONTROL';
      throw error;
    }
    return await executeStandardCommand({
      runtime,
      operationRef: operation?.operation_ref,
      expectedRevision,
      command: {
        ...command,
        ...(transport?.contextId !== undefined ? { contextId: transport.contextId } : {})
      },
      execute: async () => await transport.command(command)
    });
  }

  function pageFromResponse(response) {
    return typeof response?.page === 'string' && response.page.trim().length > 0 ? response.page : null;
  }

  function exactConversationId(path) {
    if (typeof path !== 'string') return null;
    const match = path.match(/^\/c\/([^/?#]+)\/?$/);
    return match ? match[1] : null;
  }

  function comparableObservation(data, operation) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.turns)) return null;
    if (exactConversationId(data.path) !== operation?.binding?.conversationId) return null;
    const expectedUserId = operation?.binding?.userMessageId;
    const userIndexes = [];
    data.turns.forEach((turn, index) => {
      if (turn?.role === 'user' && turn.id === expectedUserId) userIndexes.push(index);
    });
    if (userIndexes.length !== 1) return null;
    const userIndex = userIndexes[0];
    const laterUsers = data.turns.slice(userIndex + 1).filter((turn) => turn?.role === 'user');
    if (laterUsers.length > 0) return { attention: 'later_user_turns_detected' };
    const assistants = data.turns.slice(userIndex + 1).filter((turn) => turn?.role === 'assistant');
    if (assistants.length !== 1 || typeof assistants[0].id !== 'string' || assistants[0].id.trim().length === 0) return null;
    const assistant = assistants[0];
    if (typeof assistant.text !== 'string' || assistant.text.length === 0) return null;
    return {
      generating: data.generating === true,
      completionEvidence: data.completionEvidence ?? null,
      assistantMessageId: assistant.id,
      text: assistant.text,
      citations: Array.isArray(assistant.links) ? assistant.links : [],
      completeMarker: assistant.completeMarker === true
    };
  }

  return {
    async prepare(operation) {
      if (!transport || typeof transport.command !== 'function') {
        throw new Error('driver transport is unavailable');
      }
      let revision = operation?.revision;
      let pageId = operation?.control?.target?.pageId;
      if (!pageId) {
        if (typeof transport.contextId !== 'string' || transport.contextId.trim().length === 0) {
          return { status: 'held', reason: 'configured_context_unavailable' };
        }
        const tabCmdId = 'cmd_tab_' + randomUUID().replace(/-/g, '').slice(0, 12);
        const targetIntent = await recordStandardControl({
          runtime,
          operationRef: operation.operation_ref,
          expectedRevision: revision,
          control: { kind: 'target_creation_intent', commandId: tabCmdId, contextId: transport.contextId }
        });
        revision = targetIntent.revision;
        const tabs = await runOwnedCommand(operation, revision, {
          id: tabCmdId,
          action: 'tabs',
          op: 'new',
          url: 'https://chatgpt.com/',
          session: operation.operation_ref,
          contextId: transport.contextId,
          windowMode: 'background'
        });
        revision = tabs.revision;
        pageId = pageFromResponse(tabs.response);
        if (!pageId) return { status: 'held', reason: 'owned_target_not_observed' };
        const bound = await recordStandardControl({
          runtime,
          operationRef: operation.operation_ref,
          expectedRevision: revision,
          control: { kind: 'target_bound', commandId: tabCmdId, pageId, contextId: transport.contextId }
        });
        revision = bound.revision;
      }

      const inspectCode = `(() => {
        const loc = window.location;
        const visible = (element) => {
          if (!element) return false;
          const style = typeof getComputedStyle === 'function' ? getComputedStyle(element) : null;
          const rect = typeof element.getBoundingClientRect === 'function' ? element.getBoundingClientRect() : null;
          return (!style || (style.display !== 'none' && style.visibility !== 'hidden')) &&
            (!rect || rect.width > 0 || rect.height > 0);
        };
        const composers = [...document.querySelectorAll('#prompt-textarea')];
        const login = [...document.querySelectorAll('a,button')].find(element =>
          /^(log in|sign in)$/i.test((element.innerText || element.textContent || '').trim())
        );
        const account = document.querySelector('[data-testid="accounts-profile-button"]');
        const challenge = document.querySelector('iframe[src*="challenge"], [data-testid*="challenge"], #challenge-form');
        const composerMenu = document.querySelector('form[data-type="unified-composer"] button[aria-haspopup="menu"]:not([data-testid])');
        const powerSlider = document.querySelector('[role="slider"]');
        return {
          origin: loc ? loc.origin : null,
          pathname: loc ? loc.pathname : null,
          composerCount: composers.length,
          composerVisible: composers.length === 1 && visible(composers[0]),
          loginVisible: visible(login),
          accountVisible: visible(account),
          challengeVisible: visible(challenge),
          composerMenu: visible(composerMenu),
          powerSlider: visible(powerSlider)
        };
      })()`;
      const inspCmdId = 'cmd_insp_' + randomUUID().replace(/-/g, '').slice(0, 12);
      const inspected = await runOwnedCommand(operation, revision, {
        id: inspCmdId,
        action: 'exec',
        page: pageId,
        session: operation?.operation_ref,
        code: inspectCode
      });
      const surface = inspected.response?.data;
      if (!surface || typeof surface !== 'object') return { status: 'held', reason: 'surface_not_inspected' };
      let reason = 'ERR_STANDARD_EFFORT_UNQUALIFIED';
      if (surface.origin !== 'https://chatgpt.com') reason = 'wrong_origin';
      else if (surface.challengeVisible === true) reason = 'challenge';
      else if (surface.loginVisible === true) reason = 'signed_out';
      else if (surface.composerCount !== 1 || surface.composerVisible !== true) reason = 'composer_unavailable';
      else if (surface.accountVisible !== true) reason = 'authentication_unconfirmed';
      return {
        status: 'held',
        reason,
        evidenceRef: `ev_prep_${inspCmdId}`,
        surface: structuredClone(surface),
        target: {
          pageId,
          contextId: transport.contextId,
          origin: surface.origin ?? null,
          baseHref: surface.origin && surface.pathname ? `${surface.origin}${surface.pathname}` : null,
          requestedDraft: operation?.intent?.prompt,
          selection: null,
          userMessageIds: Array.isArray(surface.userMessageIds) ? surface.userMessageIds : [],
          assistantMessageIds: Array.isArray(surface.assistantMessageIds) ? surface.assistantMessageIds : []
        }
      };
    },

    async send(operation, target) {
      if (!transport || typeof transport.command !== 'function') {
        throw new Error('driver transport is unavailable');
      }
      const ownedTarget = operation?.control?.target;
      if (!ownedTarget || ownedTarget.pageId !== target?.pageId || ownedTarget.contextId !== target?.contextId) {
        const error = new Error('send target is not bound to the operation');
        error.code = 'ERR_RUNTIME_CONTROL';
        throw error;
      }
      const writtenDraft = operation?.control?.draft_written;
      if (
        !writtenDraft ||
        writtenDraft.pageId !== target.pageId ||
        writtenDraft.prompt_sha256 !== operation?.intent?.prompt_sha256
      ) {
        const error = new Error('send draft is not bound to the operation prompt and target');
        error.code = 'ERR_RUNTIME_CONTROL';
        throw error;
      }
      const code = buildStandardSendExpression({ operation, target });
      const cmdId = 'cmd_send_' + randomUUID().replace(/-/g, '').slice(0, 12);
      let revision = operation.revision;
      const sent = await runOwnedCommand(operation, revision, {
        id: cmdId, action: 'exec', page: target.pageId,
        session: operation.operation_ref, code
      });
      revision = sent.revision;

      const inspectTurnsCode = `(() => {
        const loc = window.location;
        const path = loc ? (loc.pathname || '') : '';
        const turns = [...document.querySelectorAll('[data-message-author-role]')].map(e => ({
          role: e.getAttribute('data-message-author-role'),
          id: e.getAttribute('data-message-id') || (e.dataset ? e.dataset.messageId : null),
          text: (e.parentElement?.innerText || e.innerText || e.textContent || '').trim()
        }));
        return { path, turns };
      })()`;
      const turnCmdId = 'cmd_turn_' + randomUUID().replace(/-/g, '').slice(0, 12);
      const turns = await runOwnedCommand(operation, revision, {
        id: turnCmdId, action: 'exec', page: target.pageId,
        session: operation.operation_ref, code: inspectTurnsCode
      });
      const turnsRes = turns.response;
      if (turnsRes?.data && typeof turnsRes.data === 'object') {
        const path = turnsRes.data.path || '';
        const convMatch = path.match(/^\/c\/([a-zA-Z0-9-]+)$/);
        const convId = convMatch ? convMatch[1] : null;
        const priorUserIds = new Set(target?.userMessageIds || []);
        const promptText = (target?.requestedDraft ?? operation?.intent?.prompt ?? '').trim();
        const turns = Array.isArray(turnsRes.data.turns) ? turnsRes.data.turns : [];
        const newUsers = turns.filter((t) => t.role === 'user' && t.id && !priorUserIds.has(t.id));
        if (convId && newUsers.length === 1 && newUsers[0].text === promptText && newUsers[0].id) {
          return {
            status: 'accepted',
            binding: {
              conversationId: convId,
              userMessageId: newUsers[0].id
            },
            evidenceRef: `ev_turn_${turnCmdId}`
          };
        }
      }

      return {
        status: 'unknown',
        reason: 'provider_acceptance_not_established',
        commandId: cmdId
      };
    },

    async observe(operation) {
      if (!transport || typeof transport.command !== 'function') {
        return { status: 'attention', reason: 'transport_unavailable' };
      }
      const observeCode = `(() => {
        const loc = window.location;
        const path = loc ? (loc.pathname || '') : '';
        const stopButton = document.querySelector('[data-testid="stop-button"]');
        const turns = [...document.querySelectorAll('[data-message-author-role]')].map(e => {
          const container = (typeof e.closest === 'function' && e.closest('[data-testid^="conversation-turn-"]')) || e.parentElement || e;
          const linkRoot = typeof container.querySelectorAll === 'function' ? container : e;
          const links = [...linkRoot.querySelectorAll('a[href]')].map(a => ({
            text: (a.innerText || a.textContent || '').trim(),
            url: a.href
          }));
          return {
            role: e.getAttribute('data-message-author-role'),
            id: e.getAttribute('data-message-id') || (e.dataset ? e.dataset.messageId : null),
            text: (container.innerText || e.innerText || e.textContent || '').trim(),
            links,
            completeMarker: Boolean(
              (typeof container.querySelector === 'function' && container.querySelector('[data-testid="copy-turn-action-button"]')) ||
              (typeof container.getAttribute === 'function' && container.getAttribute('data-turn-complete') === 'true')
            )
          };
        });
        return {
          path,
          generating: Boolean(stopButton),
          turns,
          completionEvidence: !stopButton && turns.length > 0 &&
            turns[turns.length - 1].role === 'assistant' &&
            turns[turns.length - 1].completeMarker === true
              ? 'qualified-turn-complete'
              : null
        };
      })()`;
      let revision = operation?.revision;
      const observations = [];
      try {
        for (let index = 0; index < 2; index++) {
          const obsCmdId = 'cmd_obs_' + randomUUID().replace(/-/g, '').slice(0, 12);
          const observed = await runOwnedCommand(operation, revision, {
            id: obsCmdId, action: 'exec', page: operation?.control?.target?.pageId,
            session: operation?.operation_ref, code: observeCode
          });
          revision = observed.revision;
          observations.push({ id: obsCmdId, data: observed.response?.data });
          if (index === 0) {
            if (typeof clock?.sleep === 'function') await clock.sleep(50);
            else await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
      } catch (error) {
        if (error?.executorUnresolved === true) throw error;
        return { status: 'attention', reason: 'observation_command_failed' };
      }
      const first = comparableObservation(observations[0].data, operation);
      const second = comparableObservation(observations[1].data, operation);
      if (!first || !second) return { status: 'running', reason: 'observation_not_exactly_bound' };
      if (first.attention || second.attention) return { status: 'attention', reason: first.attention ?? second.attention };
      if (canonicalJson(first) !== canonicalJson(second)) return { status: 'running', reason: 'observation_not_stable' };
      if (second.generating) return { status: 'running', phase: 'observing' };
      if (!second.completeMarker || second.completionEvidence !== 'qualified-turn-complete') {
        return { status: 'attention', reason: 'unqualified_completion' };
      }
      return {
        status: 'completed',
        capture: {
          conversationId: operation.binding.conversationId,
          userMessageId: operation.binding.userMessageId,
          assistantMessageId: second.assistantMessageId,
          text: second.text,
          citations: second.citations,
          evidenceRef: `ev_obs_${observations[1].id}`,
          complete: true,
          stable: true,
          completionEvidence: 'qualified-turn-complete',
          laterUserMessageIds: [],
          mediaType: 'text/markdown'
        }
      };
    }
  };
}
