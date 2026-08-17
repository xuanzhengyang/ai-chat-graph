(function () {
  "use strict";

  const vscode = acquireVsCodeApi();
  const workspace = document.getElementById("workspace");
  const selector = document.getElementById("tree-selector");
  const refresh = document.getElementById("refresh");
  const status = document.getElementById("status");
  const content = document.getElementById("content");
  const paneResizer = document.getElementById("pane-resizer");
  const graphNote = document.getElementById("graph-note");
  const graphStage = document.getElementById("graph-stage");
  const detail = document.getElementById("detail");
  let selectedNodeId;
  let currentTree;
  let activeResizePointer;
  const initialWebviewState = vscode.getState() || {};
  let graphPaneRatio = clampRatio(initialWebviewState.graphPaneRatio);

  applyGraphPaneRatio();
  window.addEventListener("resize", applyGraphPaneRatio);

  paneResizer.addEventListener("pointerdown", function (event) {
    if (event.button !== 0) {
      return;
    }
    activeResizePointer = event.pointerId;
    paneResizer.setPointerCapture(event.pointerId);
    paneResizer.classList.add("dragging");
    document.body.classList.add("resizing");
    resizeGraphPane(event.clientX, false);
    event.preventDefault();
  });
  paneResizer.addEventListener("pointermove", function (event) {
    if (event.pointerId === activeResizePointer) {
      resizeGraphPane(event.clientX, false);
    }
  });
  paneResizer.addEventListener("pointerup", finishResize);
  paneResizer.addEventListener("pointercancel", finishResize);
  paneResizer.addEventListener("dblclick", function () {
    graphPaneRatio = 0.58;
    applyGraphPaneRatio();
    persistGraphPaneRatio();
  });
  paneResizer.addEventListener("keydown", function (event) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    const usableWidth = getUsablePaneWidth();
    if (usableWidth <= 0) {
      return;
    }
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    graphPaneRatio = clampRatio(graphPaneRatio + direction * (event.shiftKey ? 80 : 24) / usableWidth);
    applyGraphPaneRatio();
    persistGraphPaneRatio();
    event.preventDefault();
  });

  refresh.addEventListener("click", function () {
    vscode.postMessage({ type: "refresh" });
  });
  selector.addEventListener("change", function () {
    vscode.postMessage({ type: "selectTree", sessionId: selector.value });
  });

  window.addEventListener("message", function (event) {
    const message = event.data;
    if (!message || typeof message.type !== "string") {
      return;
    }
    if (message.type === "loading") {
      setStatus(message.message, "loading");
    } else if (message.type === "error") {
      setStatus([message.message, message.detail].filter(Boolean).join("\n"), "error");
    } else if (message.type === "state") {
      renderState(message);
    } else if (message.type === "turnDetail") {
      if (message.nodeId === selectedNodeId) {
        renderDetail(message.detail);
      }
    }
  });

  function renderState(message) {
    workspace.textContent = "Workspace: " + message.workspacePath;
    selector.replaceChildren();
    message.trees.forEach(function (tree) {
      const option = document.createElement("option");
      option.value = tree.sessionId;
      option.textContent = tree.title + (tree.createdAt ? " — " + formatTime(tree.createdAt) : "")
        + " — " + tree.branchCount + " branches — " + tree.turnCount + " prompts"
        + (tree.failedBranchCount ? " — " + tree.failedBranchCount + " failed" : "");
      option.selected = Boolean(message.selectedTree && message.selectedTree.sessionId === tree.sessionId);
      selector.appendChild(option);
    });
    selector.disabled = message.trees.length === 0;
    currentTree = message.selectedTree;
    selectedNodeId = message.selectedNodeId;
    setStatus(
      message.trees.length === 0
        ? "No Codex conversations found for this workspace.\n\ncwd:\n" + message.workspacePath
        : "",
      "",
    );
    renderGraph();
  }

  function renderGraph() {
    graphStage.replaceChildren();
    graphNote.textContent = "";
    detail.replaceChildren();
    detail.className = "detail empty";
    detail.textContent = currentTree ? "Select a prompt to inspect the complete turn." : "No conversation selected.";
    if (!currentTree) {
      graphStage.style.height = "56px";
      return;
    }

    const notes = [];
    if (currentTree.createdAt) {
      notes.push("Created " + formatTime(currentTree.createdAt));
    }
    if (currentTree.updatedAt) {
      notes.push("Updated " + formatTime(currentTree.updatedAt));
    }
    if (!currentTree.lineageMetadataAvailable) {
      notes.push("Lineage metadata unavailable for one or more branches.");
    }
    if (currentTree.failedBranchCount) {
      notes.push(currentTree.failedBranchCount + " branch failed to load.");
    }
    graphNote.textContent = notes.join(" ");

    const railWidth = Math.max(64, currentTree.width);
    const rowHeight = currentTree.rowHeight || 56;
    graphStage.style.height = currentTree.height + "px";
    graphStage.style.minWidth = railWidth + 360 + "px";
    graphStage.style.setProperty("--graph-row-height", rowHeight + "px");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "graph-svg");
    svg.setAttribute("width", String(railWidth));
    svg.setAttribute("height", String(currentTree.height));
    svg.setAttribute("aria-hidden", "true");
    graphStage.appendChild(svg);

    const byId = new Map(currentTree.nodes.map(function (node) { return [node.id, node]; }));
    currentTree.nodes.forEach(function (node) {
      if (!node.parentId) {
        return;
      }
      const parent = byId.get(node.parentId);
      if (!parent) {
        return;
      }
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      const middleY = parent.y + (node.y - parent.y) / 2;
      path.setAttribute("d", parent.x === node.x
        ? "M " + parent.x + " " + parent.y + " L " + node.x + " " + node.y
        : "M " + parent.x + " " + parent.y + " C " + parent.x + " " + middleY + ", " + node.x + " " + middleY + ", " + node.x + " " + node.y);
      path.setAttribute("class", "edge");
      svg.appendChild(path);
    });

    currentTree.nodes.forEach(function (node) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(node.x));
      circle.setAttribute("cy", String(node.y));
      circle.setAttribute("r", node.id === selectedNodeId ? "6" : "5");
      circle.setAttribute("class", node.id === selectedNodeId ? "node selected" : "node");
      svg.appendChild(circle);

      const row = document.createElement("div");
      row.className = "graph-row" + (node.id === selectedNodeId ? " selected" : "");
      row.style.top = node.row * rowHeight + "px";
      row.style.left = railWidth + 8 + "px";
      row.style.width = "calc(100% - " + (railWidth + 16) + "px)";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "prompt";
      button.textContent = node.promptPreview;
      button.title = node.promptPreview;
      button.addEventListener("click", function () {
        selectedNodeId = node.id;
        renderGraph();
        vscode.postMessage({ type: "selectNode", nodeId: node.id });
      });
      const promptStack = document.createElement("div");
      promptStack.className = "prompt-stack";
      promptStack.appendChild(button);
      if (node.startedAt) {
        const time = document.createElement("time");
        time.className = "turn-time";
        time.dateTime = new Date(node.startedAt * 1000).toISOString();
        time.textContent = formatTime(node.startedAt);
        time.title = "Turn started: " + formatTime(node.startedAt);
        promptStack.appendChild(time);
      }
      row.appendChild(promptStack);

      node.headLabels.forEach(function (label) {
        const badge = document.createElement("span");
        badge.className = "head-label";
        badge.textContent = "HEAD " + label;
        badge.title = "Thread head: " + label;
        row.appendChild(badge);
      });
      graphStage.appendChild(row);
    });
  }

  function renderDetail(turn) {
    detail.replaceChildren();
    detail.className = "detail";
    appendMessage("USER PROMPT", turn.userText || "[No text content]");
    turn.assistantMessages.forEach(function (message) {
      appendMessage("ASSISTANT" + (message.phase ? " · " + formatPhase(message.phase) : ""), message.text);
    });
    if (turn.assistantMessages.length === 0) {
      appendMessage("ASSISTANT", "[No assistant text recorded]");
    }
    if (turn.startedAt || turn.completedAt) {
      const timing = document.createElement("div");
      timing.className = "detail-time";
      const values = [];
      if (turn.startedAt) {
        values.push("Started " + formatTime(turn.startedAt));
      }
      if (turn.completedAt) {
        values.push("Completed " + formatTime(turn.completedAt));
      }
      timing.textContent = values.join(" · ");
      detail.appendChild(timing);
    }
    if (turn.sharedBranchCount > 1) {
      const footer = document.createElement("div");
      footer.className = "detail-footer";
      footer.textContent = "Shared by " + turn.sharedBranchCount + " branches";
      detail.appendChild(footer);
    }
  }

  function appendMessage(labelText, bodyText) {
    const section = document.createElement("section");
    section.className = "message-block";
    const label = document.createElement("h3");
    label.textContent = labelText;
    const body = document.createElement("pre");
    body.textContent = bodyText;
    section.append(label, body);
    detail.appendChild(section);
  }

  function formatPhase(phase) {
    return phase.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toUpperCase();
  }

  function formatTime(unixSeconds) {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(new Date(unixSeconds * 1000));
  }

  function resizeGraphPane(clientX, persist) {
    const bounds = content.getBoundingClientRect();
    const usableWidth = getUsablePaneWidth();
    if (usableWidth <= 0) {
      return;
    }
    graphPaneRatio = clampRatio((clientX - bounds.left) / usableWidth);
    applyGraphPaneRatio();
    if (persist) {
      persistGraphPaneRatio();
    }
  }

  function finishResize(event) {
    if (event.pointerId !== activeResizePointer) {
      return;
    }
    activeResizePointer = undefined;
    paneResizer.classList.remove("dragging");
    document.body.classList.remove("resizing");
    persistGraphPaneRatio();
  }

  function applyGraphPaneRatio() {
    const usableWidth = getUsablePaneWidth();
    if (usableWidth <= 0) {
      return;
    }
    const graphWidth = Math.round(usableWidth * graphPaneRatio);
    content.style.setProperty("--graph-pane-width", graphWidth + "px");
    paneResizer.setAttribute("aria-valuenow", String(Math.round(graphPaneRatio * 100)));
  }

  function getUsablePaneWidth() {
    return content.clientWidth - paneResizer.offsetWidth;
  }

  function clampRatio(value) {
    const fallback = typeof value === "number" && Number.isFinite(value) ? value : 0.58;
    const usableWidth = getUsablePaneWidth();
    if (usableWidth < 560) {
      return Math.min(0.8, Math.max(0.2, fallback));
    }
    const minimumRatio = 280 / usableWidth;
    return Math.min(1 - minimumRatio, Math.max(minimumRatio, fallback));
  }

  function persistGraphPaneRatio() {
    vscode.setState(Object.assign({}, vscode.getState() || {}, { graphPaneRatio: graphPaneRatio }));
  }

  function setStatus(message, kind) {
    status.textContent = message || "";
    status.className = "status" + (kind ? " " + kind : "");
    status.hidden = !message;
  }

  vscode.postMessage({ type: "ready" });
}());
