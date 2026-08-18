
import { observeAndApply, onDocumentReady } from "../../shared/dom";
import { drainChatRenameQueue, ensureAiRenameButtons, ensureChatJumpInput } from "./chat-tools";
import { activationAttribute } from "./config";
import { ensureBuildBadge, startLiveReload } from "./live-reload";
import { ensurePinOnlyButtons, ensurePinRecentButton, ensurePinSetControls, installPinSetStyles } from "./pin-ui";
import { filterRecentWorkspaces } from "./repo-prefs";
import { sortPinnedConversationsByRecentUse } from "./pins";
import {
  applyStoredSidebarWidth,
  installSidebarResizeHandlers,
  installSidebarResizeStyles,
} from "./sidebar-resize";
import {
  applyPendingProjectRepoSelection,
  constrainWorkspacePickers,
  ensureProjectRepoSessionButtons,
  installWorkspacePickerStyles,
  installWorkspaceSelectionHandlers,
} from "./workspace-picker";

(function () {
  "use strict";

  window.localStorage.removeItem("omnigent:manual-pinned-order");

  function applyAll(): void {
    ensurePinRecentButton();
    ensurePinSetControls();
    ensurePinOnlyButtons();
    ensureAiRenameButtons();
    ensureChatJumpInput();
    constrainWorkspacePickers();
    ensureProjectRepoSessionButtons();
    applyPendingProjectRepoSelection();
    ensureBuildBadge();
  }

  function start(): void {
    document.documentElement.setAttribute(activationAttribute, "active");
    void sortPinnedConversationsByRecentUse()
      .then(() => {
        ensurePinRecentButton();
        ensurePinSetControls();
      })
      .catch(() => {});
    void drainChatRenameQueue();
    installPinSetStyles();
    installWorkspacePickerStyles();
    installSidebarResizeStyles();
    applyStoredSidebarWidth();
    installWorkspaceSelectionHandlers();
    installSidebarResizeHandlers();
    startLiveReload();
    observeAndApply(applyAll);
  }

  filterRecentWorkspaces();
  onDocumentReady(start);
})();
